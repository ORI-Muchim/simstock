# CryptoSim - Professional Cryptocurrency Trading Simulator

A sophisticated cryptocurrency trading simulator built with real-time OKX market data, advanced charting, and comprehensive performance monitoring. Experience professional trading with zero risk.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![License](https://img.shields.io/badge/license-ISC-blue)
![Status](https://img.shields.io/badge/status-active-success)

## ✨ Key Features

### 🔄 Real-time Trading
- **Multi-Market Support**: BTC/USDT, ETH/USDT with easy expansion
- **Live Price Feeds**: Real-time WebSocket connections to OKX
- **Instant Order Book**: Live bid/ask spreads and market depth
- **Zero Latency**: Sub-second price updates and trade execution

### 📊 Professional Charting
- **TradingView Integration**: Industry-standard Lightweight Charts
- **Multiple Timeframes**: 1m, 5m, 15m, 30m, 1h, 4h, 1d intervals
- **Chart Types**: Candlestick, Line, and Volume overlay
- **Interactive Tools**: Crosshair, zoom, pan, and price tracking
- **Historical Data**: Comprehensive candle data with SQLite caching

### 💼 Advanced Trading Features
- **Spot Trading**: Basic buy/sell operations with real-time P&L
- **Leverage Trading**: Up to 100x leverage with dynamic risk management
- **Position Management**: Real-time position tracking and partial closes
- **Fee Calculation**: Accurate trading fees based on leverage tiers
- **Transaction History**: Detailed trade logs and performance analytics

### 🔐 User Management
- **JWT Authentication**: Secure login/registration system
- **Personal Portfolios**: Individual user balances and trading history
- **Session Management**: Persistent login states and data recovery
- **Multi-timezone Support**: Customizable chart timezone preferences

### 📈 Performance Monitoring
- **Real-time Metrics**: CPU, Memory, Response Time, WebSocket connections
- **Monitoring Dashboard**: Professional performance analytics at `/monitoring.html`
- **Alert System**: Configurable thresholds for system health
- **Data Export**: JSON/CSV export for external analysis
- **Historical Tracking**: 12 hours of performance data retention

## 🚀 Quick Start

### Prerequisites
- Node.js 18 or higher
- npm or yarn package manager

### Installation

1. **Clone and Install**
```bash
git clone <repository-url>
cd simstock
npm install
```

2. **Start the Server**
```bash
# Production mode
npm start

# Development mode (auto-restart)
npm run dev
```

3. **Access the Application**
```
Main Application: http://localhost:3000
Login Page: http://localhost:3000/login.html
Performance Monitor: http://localhost:3000/monitoring.html
```

## 📱 User Interface

### Trading Dashboard
- **Market Selector**: Easy switching between BTC/USDT and ETH/USDT
- **Price Display**: Real-time price with 24h change indicators
- **Balance Overview**: USD and crypto balance tracking
- **Order Forms**: Intuitive buy/sell interfaces with amount calculators

### Chart Interface
- **Timeframe Selector**: Quick switching between intervals
- **Chart Controls**: Zoom, pan, crosshair for detailed analysis
- **Volume Bars**: Trading volume overlay with color coding
- **Real-time Updates**: Live candle updates every second

### Leverage Trading
- **Position Types**: Long and Short positions
- **Leverage Selector**: 1x to 100x multipliers
- **Risk Management**: Real-time P&L calculation and margin tracking
- **Position Controls**: Partial close options (25%, 50%, 75%, 100%)

## 🏗️ Architecture

### Backend Components
```
server.js                 - Main Express server and WebSocket handler
database.js               - SQLite user data management
scheduler.js               - Market data collection automation
data-collector.js          - OKX API data fetching
monitoring/
  └── performance-monitor.js - System performance tracking
config/
  └── server-config.js     - Server configuration management
```

### Frontend Components
```
public/
├── index.html            - Main trading interface
├── login.html           - User authentication
├── monitoring.html      - Performance dashboard
├── script.js           - Combined application logic
├── monitoring-dashboard.js - Real-time monitoring client
└── styles.css          - Responsive UI styling
```

### Database Schema
- **Users**: Authentication and profile data
- **Market Data**: Historical candle data with multiple timeframes
- **User Data**: Trading history, balances, and preferences

## 🛠️ API Endpoints

### Market Data
```
GET  /api/markets                    - All market price summary
GET  /api/price/:market             - Current price for specific market
GET  /api/candles/:interval         - Historical candle data
GET  /api/orderbook/:market         - Live order book depth
GET  /api/history                   - Price history data
```

### User Management
```
POST /api/register                  - Create new user account
POST /api/login                     - User authentication
GET  /api/user/data                 - User profile and trading data
POST /api/user/data                 - Update user data
```

### Performance Monitoring
```
GET  /api/monitoring/status         - Current system status
GET  /api/monitoring/metrics/:type  - Historical performance metrics
GET  /api/monitoring/export/:type   - Export metrics (JSON/CSV)
POST /api/monitoring/reset-counters - Reset performance counters
```

### WebSocket Events
```
price_update      - Real-time price changes
orderbook_update  - Order book depth updates
candle_update     - New candle data
performance_metrics - System performance data
performance_alert   - System health alerts
```

## ⚙️ Configuration

### Environment Variables
```bash
PORT=3000                    # Server port
NODE_ENV=development         # Environment mode
JWT_SECRET=your-secret-key   # JWT signing key
LOG_LEVEL=info              # Logging level
```

### Market Configuration
- **Supported Markets**: BTC/USDT, ETH/USDT
- **Price Precision**: 2 decimal places
- **Update Intervals**: Real-time WebSocket + 30-second fallback
- **Data Retention**: 10,000 candles per timeframe

### Trading Configuration
- **Starting Balance**: $10,000 USD
- **Spot Trading Fee**: 0.05%
- **Leverage Fees**: 0.05% - 0.40% based on leverage tier
- **Maximum Leverage**: 100x
- **Position Limits**: 50 concurrent positions

## 📊 Performance Monitoring

The integrated monitoring system provides comprehensive insights:

### System Metrics
- **CPU Usage**: Real-time processor utilization
- **Memory Usage**: RAM consumption and availability
- **Response Times**: API endpoint performance tracking
- **WebSocket Connections**: Active connection monitoring

### Application Metrics
- **Request Volume**: API calls per minute
- **Error Rates**: Failed request percentages
- **Trading Activity**: Position opens/closes per hour
- **User Sessions**: Active user tracking

### Alerts and Notifications
- **CPU > 80%**: High processor usage warning
- **Memory > 85%**: Memory pressure alert
- **Response Time > 5s**: API performance degradation
- **Error Rate > 10%**: Service reliability issues

## 🔒 Security Features

- **JWT Authentication**: Secure token-based user sessions
- **Password Hashing**: bcrypt with salt for secure storage
- **CORS Protection**: Configurable cross-origin request policies
- **Input Validation**: Comprehensive API input sanitization
- **Rate Limiting**: Built-in protection against API abuse

## 🎯 Trading Features

### Spot Trading
- Real-time price execution
- Automatic fee calculation
- Balance validation and updates
- Transaction history tracking

### Leverage Trading
- Dynamic leverage selection (1x-100x)
- Real-time P&L calculation
- Margin requirement validation
- Liquidation risk monitoring
- Partial position closing

### Risk Management
- Position size limits
- Leverage tier fee structure
- Real-time margin calculation
- Automatic liquidation alerts

## 🌐 Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 📈 Performance

- **WebSocket Latency**: < 50ms average
- **API Response Time**: < 200ms typical
- **Chart Rendering**: 60 FPS smooth animations
- **Memory Usage**: < 100MB browser footprint
- **Mobile Responsive**: Full feature parity on mobile devices

## 🚨 Important Disclaimers

⚠️ **This is a SIMULATION platform for educational purposes only**
- No real money or cryptocurrency is involved
- All trades are simulated using virtual balances
- Market data is real but trading is not executed on actual exchanges
- Use this platform to learn trading strategies risk-free

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow existing code style and structure
- Add comprehensive comments for complex logic
- Test all features before submitting PR
- Update documentation for new features

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **OKX**: Real-time market data provider
- **TradingView**: Professional charting library
- **Node.js Community**: Excellent runtime and ecosystem
- **Express.js**: Robust web framework
- **SQLite**: Reliable embedded database

## 📞 Support

For bug reports, feature requests, or general questions:
- Create an issue on GitHub
- Check existing issues for solutions
- Review the code documentation

---

**Happy Trading! 📈💰**

*Remember: This is a simulation. Real trading involves significant financial risk.*