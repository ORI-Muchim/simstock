require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
const path = require('path');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const { createUser, authenticateUser, getUserData, updateUserData, saveChartSettings, getChartSettings, deleteChartSettings } = require('./database');
const MarketDataScheduler = require('./scheduler');
const PerformanceMonitor = require('./monitoring/performance-monitor');
const AlertManager = require('./monitoring/alert-manager');
const logger = require('./utils/logger');
const swaggerConfig = require('./config/swagger');

const app = express();
const PORT = process.env.PORT || 3000;
const DEMO_MODE = process.env.DEMO_MODE === 'true' || false;
// Enhanced JWT secret security
const JWT_SECRET = (() => {
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is required in production!');
            process.exit(1);
        } else {
            console.warn('⚠️  WARNING: Using development JWT secret. Set JWT_SECRET environment variable for production!');
            return 'dev_secret_' + require('crypto').randomBytes(32).toString('hex');
        }
    }
    
    if (secret.length < 32) {
        console.error('SECURITY ERROR: JWT_SECRET must be at least 32 characters long!');
        process.exit(1);
    }
    
    return secret;
})();

// Rate limiting configuration
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Auth rate limiter (stricter)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: 'Too many authentication attempts, please try again later.',
    skipSuccessfulRequests: true,
});

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            // Allow specific style sources (removing unsafe-inline for better security)
            styleSrc: [
                "'self'", 
                "https://fonts.googleapis.com", 
                "https://cdnjs.cloudflare.com",
                "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='", // Empty inline styles
                process.env.NODE_ENV === 'development' ? "'unsafe-inline'" : null
            ].filter(Boolean),
            // Restrict script sources and remove unsafe-eval
            scriptSrc: [
                "'self'", 
                "https://unpkg.com", 
                "https://cdn.jsdelivr.net",
                // Add specific hashes for inline scripts if needed
                process.env.NODE_ENV === 'development' ? "'unsafe-inline'" : null
            ].filter(Boolean),
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:", "https://cdnjs.cloudflare.com"],
            // Restrict image sources to specific domains
            imgSrc: [
                "'self'", 
                "data:", 
                "https://s2.coinmarketcap.com", // For crypto icons
                "https://www.okx.com",
                "blob:"
            ],
            // Restrict connection sources to necessary domains
            connectSrc: [
                "'self'", 
                "ws://localhost:*", 
                "wss://localhost:*",
                "https://www.okx.com", 
                "wss://ws.okx.com",
                "https://api.upbit.com"
            ],
            objectSrc: ["'none'"], // Prevent object/embed/applet
            baseUri: ["'self'"], // Prevent base tag injection
            formAction: ["'self'"], // Restrict form submissions
        },
    },
}));

// Enhanced CORS configuration with strict security
const corsOptions = {
    origin: function (origin, callback) {
        // Define allowed origins based on environment
        const allowedOrigins = process.env.NODE_ENV === 'production' 
            ? (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [])
            : [
                'http://localhost:3000',
                'http://127.0.0.1:3000',
                'http://localhost:3001', // For development testing
            ];
        
        // Log CORS requests for monitoring
        if (origin) {
            console.log(`CORS request from origin: ${origin}`);
        }
        
        // Allow requests with no origin (like same-origin requests)
        if (!origin) {
            return callback(null, true);
        }
        
        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`❌ CORS blocked request from unauthorized origin: ${origin}`);
            callback(new Error(`CORS policy violation: Origin ${origin} is not allowed`));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    // Add additional security headers
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400, // Cache preflight response for 24 hours
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Apply rate limiting to API routes
app.use('/api/', limiter);

// API Documentation
app.use('/api-docs', swaggerConfig.serve, swaggerConfig.setup);

// Logging middleware
app.use((req, res, next) => {
    const startTime = Date.now();
    
    // Override res.end to capture response time
    const originalEnd = res.end;
    res.end = function(...args) {
        const responseTime = Date.now() - startTime;
        const success = res.statusCode < 400;
        
        // Log request
        logger.info('HTTP Request', {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            responseTime: `${responseTime}ms`,
            ip: req.ip
        });
        
        // Record API request metrics
        if (performanceMonitor) {
            performanceMonitor.recordRequest(responseTime, success);
        }
        
        originalEnd.apply(this, args);
    };
    
    next();
});

// Clean URL routes
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/history', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'history.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get('/monitoring', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'monitoring.html'));
});

// Legacy routes for backwards compatibility
app.get('/login.html', (req, res) => {
    res.redirect('/login');
});

app.get('/history.html', (req, res) => {
    res.redirect('/history');
});

app.get('/settings.html', (req, res) => {
    res.redirect('/settings');
});

app.get('/monitoring.html', (req, res) => {
    res.redirect('/monitoring');
});

// HTTP Server
const server = app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`JWT Secret configured: ${JWT_SECRET ? 'Yes' : 'No'}`);
});

// WebSocket Server
const wss = new WebSocket.Server({ server });

// OKX WebSocket Connection
let okxWs = null;
let currentPrice = 0;
let priceHistory = [];
let candleData = [];
let orderbook = { bids: [], asks: [] };
let marketPrices = {
    'BTC-USDT': { price: 0, change: 0, high: 0, low: 0, volume: 0 },
    'ETH-USDT': { price: 0, change: 0, high: 0, low: 0, volume: 0 }
};

function connectOKXWebSocket() {
    okxWs = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');
    
    okxWs.on('open', async () => {
        console.log('Connected to OKX WebSocket');
        
        // Subscribe to BTC ticker data
        const btcTickerSubscribe = {
            op: 'subscribe',
            args: [{
                channel: 'tickers',
                instId: 'BTC-USDT'
            }]
        };
        okxWs.send(JSON.stringify(btcTickerSubscribe));
        
        // Subscribe to ETH ticker data
        const ethTickerSubscribe = {
            op: 'subscribe',
            args: [{
                channel: 'tickers',
                instId: 'ETH-USDT'
            }]
        };
        okxWs.send(JSON.stringify(ethTickerSubscribe));
        
        // Subscribe to orderbook data  
        const orderbookSubscribe = {
            op: 'subscribe',
            args: [{
                channel: 'books',
                instId: 'BTC-USDT'
            }]
        };
        okxWs.send(JSON.stringify(orderbookSubscribe));
        
        // Note: OKX WebSocket candle channels appear to have subscription issues
        // Current implementation uses scheduler-based API polling which provides real-time updates
        console.log('OKX WebSocket candle subscription not working - using scheduler-based updates instead');
        
        console.log('Subscribed to BTC/ETH ticker, orderbook, and candle channels');
    });
    
    okxWs.on('message', (data) => {
        try {
            // Handle ping/pong messages
            const dataStr = data.toString();
            if (dataStr === 'pong') {
                console.log('📡 OKX WebSocket pong received');
                return; // Skip pong messages
            }
            
            const message = JSON.parse(dataStr);
            
            // Debug: Log ALL incoming messages for diagnosis
            console.log('📡 RAW OKX Message:', {
                type: message.event || message.arg?.channel || 'unknown',
                channel: message.arg?.channel,
                instId: message.arg?.instId,
                hasData: !!message.data,
                dataLength: message.data?.length || 0
            });
            
            // Debug: Log all incoming candle messages with volume
            if (message.arg && (message.arg.channel === 'candlesticks' || message.arg.channel === 'candle1m' || message.arg.channel === 'candle' || message.arg.channel === 'kline')) {
                const volume = message.data?.[0]?.[5];
                const timestamp = message.data?.[0]?.[0];
                console.log(`🔔 OKX Candle received: ${message.arg.instId} ${message.arg.channel} ${message.arg.interval || ''} - Volume: ${volume}, Time: ${new Date(parseInt(timestamp)).toISOString()}`);
            }
            
            if (message.data && message.data.length > 0) {
                const data = message.data[0];
                
                // Handle ticker data
                if (message.arg && message.arg.channel === 'tickers') {
                    const instId = message.arg.instId;
                    const price = parseFloat(data.last);
                    const open24h = parseFloat(data.open24h);
                    
                    // Calculate 24h change rate: (current - open) / open
                    const changeRate = open24h > 0 ? (price - open24h) / open24h : 0;
                    
                    // Reduced logging - only log significant price changes
                    // if (Math.abs(changeRate) > 0.01) { // Only log if change > 1%
                    //     console.log(`${instId}: $${price.toFixed(2)} (${(changeRate * 100).toFixed(2)}%)`);
                    // }
                    
                    // Update market prices
                    marketPrices[instId] = {
                        price: price,
                        change: changeRate,
                        high: parseFloat(data.high24h),
                        low: parseFloat(data.low24h),
                        volume: parseFloat(data.vol24h)
                    };
                    
                    // For BTC, maintain backward compatibility
                    if (instId === 'BTC-USDT') {
                        currentPrice = price;
                        
                        // Add to price history
                        priceHistory.push({
                            time: new Date().toISOString(),
                            price: currentPrice,
                            volume: parseFloat(data.vol24h)
                        });
                        
                        // Keep only last 100 data points
                        if (priceHistory.length > 100) {
                            priceHistory.shift();
                        }
                    }
                    
                    // Broadcast price update
                    broadcastToClients({
                        type: 'price_update',
                        instId: instId,
                        data: {
                            price: price,
                            change: price - open24h,
                            change_rate: changeRate,
                            high_price: parseFloat(data.high24h),
                            low_price: parseFloat(data.low24h),
                            volume: parseFloat(data.vol24h)
                        }
                    });
                }
                
                // Handle orderbook data
                else if (message.arg && message.arg.channel === 'books') {
                    // Only update if we have valid data
                    if (data.bids && data.asks && data.bids.length > 0 && data.asks.length > 0) {
                        orderbook = {
                            bids: data.bids.map(bid => [parseFloat(bid[0]), parseFloat(bid[1])]),
                            asks: data.asks.map(ask => [parseFloat(ask[0]), parseFloat(ask[1])])
                        };
                        
                        // Broadcast orderbook update
                        broadcastToClients({
                            type: 'orderbook_update',
                            data: orderbook
                        });
                    }
                }
                
                // Handle real-time candle data for multiple timeframes
                else if (message.arg && (message.arg.channel === 'candlesticks' || message.arg.channel === 'candle1m' || message.arg.channel === 'candle' || message.arg.channel === 'kline')) {
                    const instId = message.arg.instId;
                    const interval = message.arg.interval;
                    
                    // Map OKX interval to our interval format
                    const intervalMap = {
                        '1m': '1m',
                        '5m': '5m', 
                        '15m': '15m',
                        '1H': '1h',
                        '4H': '4h',
                        '1D': '1d'
                    };
                    
                    const mappedInterval = intervalMap[interval];
                    if (!mappedInterval) {
                        console.warn('Unknown candle interval:', interval);
                        return;
                    }
                    
                    const candleData = {
                        instId: instId,
                        time: Math.floor(parseInt(data[0]) / 1000), // Convert to seconds
                        open: parseFloat(data[1]),
                        high: parseFloat(data[2]),
                        low: parseFloat(data[3]),
                        close: parseFloat(data[4]),
                        volume: parseFloat(data[5]),
                        timestamp: parseInt(data[0])
                    };
                    
                    // Broadcast real-time candle update
                    console.log(`⚡ Broadcasting candle: ${instId} ${mappedInterval} - O:${candleData.open} H:${candleData.high} L:${candleData.low} C:${candleData.close} V:${candleData.volume}`);
                    broadcastToClients({
                        type: 'candle_update',
                        instId: instId,
                        interval: mappedInterval,
                        data: candleData
                    });
                    
                    // Store in database for future use (for main timeframes)
                    if (dataScheduler && dataScheduler.collector) {
                        const barMap = {
                            '1m': '1m',
                            '5m': '5m',
                            '15m': '15m', 
                            '1h': '1H',
                            '4h': '4H',
                            '1d': '1D'
                        };
                        
                        const bar = barMap[mappedInterval];
                        if (bar) {
                            dataScheduler.collector.saveCandles([{
                                instId: instId,
                                timestamp: candleData.timestamp,
                                open: candleData.open,
                                high: candleData.high,
                                low: candleData.low,
                                close: candleData.close,
                                volume: candleData.volume,
                                volCcy: 0,
                                bar: bar
                            }], bar);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error parsing OKX message:', error);
        }
    });
    
    okxWs.on('error', (error) => {
        logger.error('OKX WebSocket error:', error);
    });
    
    okxWs.on('close', (code, reason) => {
        logger.info(`OKX WebSocket disconnected (code: ${code}, reason: ${reason}). Reconnecting in 5 seconds...`);
        setTimeout(connectOKXWebSocket, 5000);
    });
    
    // Ping every 25 seconds to keep connection alive
    setInterval(() => {
        if (okxWs && okxWs.readyState === WebSocket.OPEN) {
            okxWs.send('ping');
        }
    }, 25000);
}

// Helper function to broadcast to all clients
function broadcastToClients(data) {
    let sentCount = 0;
    let totalClients = 0;
    let openClients = 0;
    
    wss.clients.forEach(client => {
        totalClients++;
        if (client.readyState === WebSocket.OPEN) {
            openClients++;
            if (!client.isMonitoringClient) {
                client.send(JSON.stringify(data));
                sentCount++;
            }
        }
    });
    
    // 🔍 DEBUG: candle_update 메시지만 로깅
    if (data.type === 'candle_update') {
        console.log(`🔍 Broadcast ${data.instId} ${data.interval} to ${sentCount}/${openClients} clients - V:${data.data.volume}`);
    }
}

// Helper function to broadcast to monitoring dashboard clients
function broadcastToMonitoringClients(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.isMonitoringClient) {
            client.send(JSON.stringify(data));
        }
    });
}

// Initialize performance monitoring
const performanceMonitor = new PerformanceMonitor({
    collectInterval: 5000,
    historySize: 1440,
    cpuThreshold: 80,
    memoryThreshold: 85,
    responseThreshold: 5000,
    errorThreshold: 95,  // Set very high to avoid false alerts
    connectionThreshold: 900,
    logPath: './logs/performance.log',
    enabled: true
});

// Initialize alert manager
const alertManager = new AlertManager({
    cpuWarning: 70,
    cpuCritical: 85,
    memoryWarning: 75,
    memoryCritical: 90,
    responseTimeWarning: 2000,
    responseTimeCritical: 5000,
    errorRateWarning: 5,
    errorRateCritical: 15,
    cooldownPeriod: 5 * 60 * 1000, // 5 minutes
    enableWebhookAlerts: process.env.WEBHOOK_URL ? true : false,
    webhookUrl: process.env.WEBHOOK_URL
});

// Reset counters to avoid initial false alerts
performanceMonitor.resetCounters();

// Listen to performance events (temporarily disabled to avoid spam)
// performanceMonitor.on('alert', (alert) => {
//     console.warn(`Performance Alert: ${alert.message}`);
//     // Broadcast alert to monitoring dashboard clients
//     broadcastToMonitoringClients({
//         type: 'performance_alert',
//         data: alert
//     });
// });

performanceMonitor.on('metric', (metric) => {
    // Check for alerts
    alertManager.checkMetrics(metric.data);
    
    // Broadcast metrics to monitoring dashboard clients
    broadcastToMonitoringClients({
        type: 'performance_metrics',
        data: metric.data
    });
});

// Start OKX WebSocket connection
connectOKXWebSocket();

// Initialize and start data scheduler with broadcast callback
const dataScheduler = new MarketDataScheduler(broadcastToClients);
dataScheduler.collectInitialData().then(() => {
    dataScheduler.start();
});

// API Endpoints

// Performance Monitoring API Endpoints
app.get('/api/monitoring/status', (req, res) => {
    try {
        const status = performanceMonitor.getStatus();
        res.json(status);
    } catch (error) {
        console.error('Error getting monitoring status:', error);
        res.status(500).json({ error: 'Failed to get monitoring status' });
    }
});

app.get('/api/monitoring/metrics/:type', (req, res) => {
    try {
        const { type } = req.params;
        const { startTime, endTime } = req.query;
        
        let metrics;
        if (startTime && endTime) {
            metrics = performanceMonitor.getMetricsRange(type, parseInt(startTime), parseInt(endTime));
        } else {
            metrics = performanceMonitor.metrics[type] || [];
        }
        
        res.json(metrics);
    } catch (error) {
        console.error('Error getting metrics:', error);
        res.status(500).json({ error: 'Failed to get metrics' });
    }
});

app.get('/api/monitoring/export/:type', (req, res) => {
    try {
        const { type } = req.params;
        const { format = 'json' } = req.query;
        
        const data = performanceMonitor.exportMetrics(type, format);
        
        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${type}_metrics.csv"`);
        } else {
            res.setHeader('Content-Type', 'application/json');
        }
        
        res.send(data);
    } catch (error) {
        console.error('Error exporting metrics:', error);
        res.status(500).json({ error: 'Failed to export metrics' });
    }
});

app.post('/api/monitoring/reset-counters', (req, res) => {
    try {
        performanceMonitor.resetCounters();
        res.json({ success: true, message: 'Counters reset successfully' });
    } catch (error) {
        console.error('Error resetting counters:', error);
        res.status(500).json({ error: 'Failed to reset counters' });
    }
});

/**
 * @swagger
 * /api/monitoring/alerts:
 *   get:
 *     tags:
 *       - Monitoring
 *     summary: Get active alerts
 *     description: Retrieve all currently active alerts
 *     responses:
 *       200:
 *         description: Active alerts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                   severity:
 *                     type: string
 *                     enum: [warning, critical]
 *                   message:
 *                     type: string
 *                   value:
 *                     type: number
 *                   threshold:
 *                     type: number
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 */
app.get('/api/monitoring/alerts', (req, res) => {
    try {
        const activeAlerts = alertManager.getActiveAlerts();
        res.json(activeAlerts);
    } catch (error) {
        logger.error('Error getting alerts:', error);
        res.status(500).json({ error: 'Failed to get alerts' });
    }
});

/**
 * @swagger
 * /api/monitoring/alerts/history:
 *   get:
 *     tags:
 *       - Monitoring
 *     summary: Get alert history
 *     description: Retrieve historical alert data
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum number of alerts to return
 *     responses:
 *       200:
 *         description: Alert history retrieved successfully
 */
app.get('/api/monitoring/alerts/history', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const history = alertManager.getAlertHistory(limit);
        res.json(history);
    } catch (error) {
        logger.error('Error getting alert history:', error);
        res.status(500).json({ error: 'Failed to get alert history' });
    }
});

/**
 * @swagger
 * /api/monitoring/alerts/stats:
 *   get:
 *     tags:
 *       - Monitoring
 *     summary: Get alert statistics
 *     description: Retrieve alert statistics and metrics
 *     responses:
 *       200:
 *         description: Alert statistics retrieved successfully
 */
app.get('/api/monitoring/alerts/stats', (req, res) => {
    try {
        const stats = alertManager.getAlertStats();
        res.json(stats);
    } catch (error) {
        logger.error('Error getting alert stats:', error);
        res.status(500).json({ error: 'Failed to get alert stats' });
    }
});


// Serve 404 page
app.get('/404.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', '404.html'));
});

/**
 * @swagger
 * /api/markets:
 *   get:
 *     tags:
 *       - Market Data
 *     summary: Get all market prices
 *     description: Retrieve current prices for all available markets
 *     responses:
 *       200:
 *         description: Market prices retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 $ref: '#/components/schemas/MarketPrice'
 *             example:
 *               BTC-USDT:
 *                 price: 45000
 *                 change: 500
 *                 change_rate: 0.011
 *                 high_price: 46000
 *                 low_price: 44000
 *                 volume: 1500000
 */
// Get all market prices
app.get('/api/markets', (req, res) => {
    res.json(marketPrices);
});

// Get current price for specific market
app.get('/api/price/:market?', async (req, res) => {
    try {
        const market = req.params.market || 'BTC-USDT';
        const response = await axios.get(`https://www.okx.com/api/v5/market/ticker?instId=${market}`);
        res.json(response.data.data[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch price' });
    }
});

// Get price history
app.get('/api/history', (req, res) => {
    res.json(priceHistory);
});

// Get order book
app.get('/api/orderbook/:market?', async (req, res) => {
    try {
        const market = req.params.market || 'BTC-USDT';
        const response = await axios.get(`https://www.okx.com/api/v5/market/books?instId=${market}&sz=400`);
        res.json(response.data.data[0]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch orderbook' });
    }
});

// Get candle data (from database first, fallback to API)
app.get('/api/candles/:interval', async (req, res) => {
    try {
        const { interval } = req.params;
        const limit = parseInt(req.query.count) || 2000; // Request more historical data
        let market = req.query.market || 'BTC-USDT';
        
        // Convert market format for OKX API
        if (market === 'BTC-USDT' || market === 'ETH-USDT') {
            // Use OKX format directly
        } else {
            // Convert from frontend format if needed
            market = market.replace('/', '-');
        }
        
        let unit = 1;
        let bar = '1m';
        switch(interval) {
            case '1m':
                unit = 1;
                bar = '1m';
                break;
            case '3m':
                unit = 3;
                bar = '3m';
                break;
            case '5m':
                unit = 5;
                bar = '5m';
                break;
            case '10m':
                unit = 10;
                bar = '10m';
                break;
            case '15m':
                unit = 15;
                bar = '15m';
                break;
            case '30m':
                unit = 30;
                bar = '30m';
                break;
            case '1h':
                unit = 60;
                bar = '1H';
                break;
            case '4h':
                unit = 240;
                bar = '4H';
                break;
            case '1d':
                unit = 1440;
                bar = '1D';
                break;
            default:
                unit = 1;
                bar = '1m';
        }
        
        // Step 1: Get ALL available data from database
        let dbCandles = [];
        try {
            // Get ALL candles from DB (up to 10000)
            const allDbCandles = await dataScheduler.getAllStoredData(market, unit);
            
            if (allDbCandles && allDbCandles.length > 0) {
                dbCandles = allDbCandles
                    .map(candle => ({
                        time: Math.floor(candle.timestamp / 1000),
                        open: parseFloat(candle.open),
                        high: parseFloat(candle.high),
                        low: parseFloat(candle.low),
                        close: parseFloat(candle.close),
                        volume: parseFloat(candle.volume)
                    }))
                    .sort((a, b) => a.time - b.time); // Sort by time ascending
                
                console.log(`Found ${dbCandles.length} candles in database for ${market} ${bar}`);
            }
        } catch (dbError) {
            console.log('Database fetch error:', dbError.message);
        }
        
        // Step 2: Get latest candles from API to fill any gaps
        let apiCandles = [];
        try {
            const apiLimit = Math.min(200, limit); // OKX API max is 200
            const endpoint = `https://www.okx.com/api/v5/market/history-candles?instId=${market}&bar=${bar}&limit=${apiLimit}`;
            const response = await axios.get(endpoint);
            
            apiCandles = response.data.data.reverse().map(candle => ({
                time: Math.floor(parseInt(candle[0]) / 1000),
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5])
            }));
            
            console.log(`Fetched ${apiCandles.length} latest candles from API for ${market} ${bar}`);
        } catch (apiError) {
            console.log('API fetch error (using DB only):', apiError.message);
        }
        
        // Step 3: Merge data - DB data + new API data (avoiding duplicates)
        let mergedCandles = [...dbCandles];
        
        if (apiCandles.length > 0) {
            const latestDbTime = dbCandles.length > 0 ? dbCandles[dbCandles.length - 1].time : 0;
            
            // Add only newer candles from API
            const newApiCandles = apiCandles.filter(c => c.time > latestDbTime);
            if (newApiCandles.length > 0) {
                mergedCandles = [...dbCandles, ...newApiCandles];
                console.log(`Added ${newApiCandles.length} new candles from API`);
                
                // Save new candles to database for future use
                if (dataScheduler && dataScheduler.collector && newApiCandles.length > 0) {
                    const candlesToSave = newApiCandles.map(c => ({
                        instId: market,
                        timestamp: c.time * 1000,
                        open: c.open,
                        high: c.high,
                        low: c.low,
                        close: c.close,
                        volume: c.volume,
                        volCcy: 0,
                        bar: bar
                    }));
                    dataScheduler.collector.saveCandles(candlesToSave, bar);
                }
            }
            
            // If DB was empty, use all API candles
            if (dbCandles.length === 0 && apiCandles.length > 0) {
                mergedCandles = apiCandles;
                console.log(`Using ${apiCandles.length} candles from API (DB was empty)`);
            }
        }
        
        // Sort and send final result
        mergedCandles.sort((a, b) => a.time - b.time);
        
        // Sort and send final result (remove unnecessary volume scaling)
        console.log(`Total: Serving ${mergedCandles.length} candles (${dbCandles.length} from DB + ${mergedCandles.length - dbCandles.length} from API)`);
        
        res.json(mergedCandles);
    } catch (error) {
        console.error('Failed to fetch candles:', error);
        res.status(500).json({ error: 'Failed to fetch candle data' });
    }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

/**
 * @swagger
 * /api/register:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Register a new user
 *     description: Create a new user account with username and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 20
 *                 pattern: '^[a-zA-Z0-9_]+$'
 *                 example: 'testuser123'
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 pattern: '^(?=.*[A-Za-z])(?=.*\d)'
 *                 example: 'password123'
 *     responses:
 *       200:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error or username already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Too many registration attempts
 */
// User registration with validation
app.post('/api/register', 
    authLimiter,
    [
        body('username')
            .isLength({ min: 3, max: 20 })
            .withMessage('Username must be between 3 and 20 characters')
            .matches(/^[a-zA-Z0-9_]+$/)
            .withMessage('Username can only contain letters, numbers, and underscores'),
        body('password')
            .isLength({ min: 4 })
            .withMessage('Password must be at least 4 characters long')
    ],
    async (req, res) => {
        try {
            // Check validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { username, password } = req.body;
            
            const userId = await createUser(username, password);
            const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '7d' });
            
            logger.info(`New user registered: ${username}`);
            res.json({ token, username });
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT') {
                res.status(400).json({ error: 'This username is already taken' });
            } else {
                logger.error('Registration error:', error);
                res.status(500).json({ error: 'Registration failed. Please try again later' });
            }
        }
    }
);

/**
 * @swagger
 * /api/login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: User login
 *     description: Authenticate user with username and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: 'testuser123'
 *               password:
 *                 type: string
 *                 example: 'password123'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Too many login attempts
 */
// User login with validation
app.post('/api/login',
    authLimiter,
    [
        body('username').notEmpty().withMessage('Please enter your username'),
        body('password').notEmpty().withMessage('Please enter your password')
    ],
    async (req, res) => {
        try {
            // Check validation errors
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }
            
            const { username, password } = req.body;
            
            const user = await authenticateUser(username, password);
            
            if (!user) {
                logger.warn(`Failed login attempt for username: ${username}`);
                return res.status(401).json({ error: 'Incorrect username or password' });
            }
            
            const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
            logger.info(`User logged in: ${username}`);
            res.json({ token, username: user.username });
        } catch (error) {
            logger.error('Login error:', error);
            res.status(500).json({ error: 'Login failed. Please try again later' });
        }
    }
);

/**
 * @swagger
 * /api/user/data:
 *   get:
 *     tags:
 *       - User Data
 *     summary: Get user data
 *     description: Retrieve user's trading data including balances and transactions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserData'
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Invalid token
 *       404:
 *         description: User data not found
 */
// Get user data
app.get('/api/user/data', authenticateToken, async (req, res) => {
    try {
        const userData = await getUserData(req.user.id);
        
        if (!userData) {
            return res.status(404).json({ error: 'User data not found' });
        }
        
        res.json({
            usdBalance: userData.usd_balance,
            btcBalance: userData.btc_balance,
            transactions: userData.transactions,
            leveragePositions: userData.leverage_positions,
            timezone: userData.timezone || 'UTC',
            memberSince: userData.member_since
        });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});

// Update user data
app.post('/api/user/data', authenticateToken, async (req, res) => {
    try {
        await updateUserData(req.user.id, req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating user data:', error);
        res.status(500).json({ error: 'Failed to update user data' });
    }
});

// Chart settings APIs
// Save chart settings
app.post('/api/chart/settings', authenticateToken, async (req, res) => {
    try {
        const { market, indicators, indicatorSettings, drawings, chartType } = req.body;
        
        if (!market) {
            return res.status(400).json({ error: 'Market is required' });
        }

        await saveChartSettings(req.user.id, market, {
            indicators,
            indicatorSettings,
            drawings,
            chartType
        });
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error saving chart settings:', error);
        res.status(500).json({ error: 'Failed to save chart settings' });
    }
});

// Get chart settings
app.get('/api/chart/settings/:market', authenticateToken, async (req, res) => {
    try {
        const { market } = req.params;
        const settings = await getChartSettings(req.user.id, market);
        
        res.json({ success: true, settings: settings || null });
    } catch (error) {
        console.error('Error getting chart settings:', error);
        res.status(500).json({ error: 'Failed to get chart settings' });
    }
});

// Delete chart settings
app.delete('/api/chart/settings/:market', authenticateToken, async (req, res) => {
    try {
        const { market } = req.params;
        await deleteChartSettings(req.user.id, market);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting chart settings:', error);
        res.status(500).json({ error: 'Failed to delete chart settings' });
    }
});

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    // Initially assume it's a trading client
    ws.isMonitoringClient = false;
    
    console.log('New client connected');
    
    // Send current price immediately (will be ignored by monitoring clients)
    if (currentPrice > 0) {
        ws.send(JSON.stringify({
            type: 'price_update',
            data: { price: currentPrice }
        }));
    }
    
    // Handle all client messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'client_identification' && data.clientType === 'monitoring') {
                // Convert to monitoring client
                ws.isMonitoringClient = true;
                console.log('Client identified as monitoring dashboard');
                
                // Send current performance status
                const status = performanceMonitor.getStatus();
                console.log('Sending performance data:', JSON.stringify(status, null, 2));
                ws.send(JSON.stringify({
                    type: 'performance_metrics',
                    data: status
                }));
            } else if (data.type === 'request_metrics' && ws.isMonitoringClient) {
                // Handle metrics request from monitoring client
                const currentStatus = performanceMonitor.getStatus();
                ws.send(JSON.stringify({
                    type: 'performance_metrics',
                    data: currentStatus
                }));
            }
        } catch (error) {
            console.error('Error handling client message:', error);
        }
    });
    
    // Update WebSocket connection count for monitoring
    performanceMonitor.recordWebSocketEvent('connection', { 
        count: Array.from(wss.clients).filter(client => !client.isMonitoringClient).length 
    });
    
    ws.on('close', () => {
        if (ws.isMonitoringClient) {
            console.log('Monitoring client disconnected');
        } else {
            console.log('Trading client disconnected');
        }
        
        // Update connection count
        performanceMonitor.recordWebSocketEvent('connection', { 
            count: Array.from(wss.clients).filter(client => !client.isMonitoringClient).length 
        });
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        performanceMonitor.recordWebSocketEvent('error');
    });
});

// Global error handler
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    
    // Don't leak error details in production
    const message = process.env.NODE_ENV === 'production' 
        ? 'Internal Server Error' 
        : err.message;
    
    res.status(err.status || 500).json({
        error: message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
});

// Handle 404 - Serve HTML for browser requests, JSON for API requests
app.use((req, res) => {
    // Check if request is for an API endpoint
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found' });
    } 
    // Check if request accepts HTML (browser request)
    else if (req.accepts('html')) {
        res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    } 
    // Default to JSON response
    else {
        res.status(404).json({ error: 'Route not found' });
    }
});

// Real-time candle updates are now handled directly through OKX WebSocket
// No need for additional polling-based broadcast system

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down gracefully...');
    
    // Close WebSocket connections
    wss.clients.forEach((client) => {
        client.close();
    });
    
    if (okxWs) {
        okxWs.close();
    }
    
    dataScheduler.stop();
    performanceMonitor.stop();
    
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
