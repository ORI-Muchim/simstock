# CryptoSim - Real-time Cryptocurrency Trading Simulator

A professional cryptocurrency trading simulation platform using real-time data from OKX exchange. Practice and develop trading strategies without any financial risk.

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![License](https://img.shields.io/badge/license-ISC-blue)
![Status](https://img.shields.io/badge/status-active-success)

## 📋 Table of Contents
- [Key Features](#-key-features)
- [Quick Start](#-quick-start)
- [System Architecture](#-system-architecture)
- [API Documentation](#-api-documentation)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)

## ✨ Key Features

### 🔄 Real-time Trading
- **Multi-Market Support**: BTC/USDT, ETH/USDT real-time trading
- **WebSocket Live Data**: Direct connection to OKX exchange
- **Real-time Order Book**: Bid/ask prices and market depth display
- **Instant Execution**: Market/limit order simulation

### 📊 Professional Charting System
- **TradingView Charts**: Lightweight Charts library integration
- **Multiple Timeframes**: 1m, 5m, 15m, 1h, 4h, 1d candles
- **Technical Indicators**: 
  - Moving Averages (MA/EMA)
  - Bollinger Bands (BB)
  - RSI (Relative Strength Index)
  - MACD
- **Chart Tools**: 
  - Horizontal lines, Trend lines
  - Fibonacci Retracement
  - Chart screenshots
- **Real-time Candle Updates**: Live updates via WebSocket

### 💼 Trading Features
- **Spot Trading**: Same fee structure as real exchanges (0.05%)
- **Futures Trading**: 1x ~ 100x leverage support
- **Position Management**: 
  - Real-time P&L calculation
  - Partial closing (25%, 50%, 75%, 100%)
  - Average entry price tracking
- **Auto Trading**: Automated trading features (requires separate implementation)
- **Trade History**: Detailed trade logs and performance analysis

### 🔐 User System
- **JWT Authentication**: Secure token-based login
- **Personal Portfolio**: Individual user balance management
- **Trade Record Storage**: Permanent storage in SQLite DB
- **Chart Settings Save**: Personalized chart configurations

### 📈 Performance Monitoring
- **Real-time System Monitoring**: CPU, memory, response time tracking
- **Monitoring Dashboard**: Dedicated `/monitoring` page
- **Alert System**: Automatic alerts on threshold breaches
- **Data Export**: JSON/CSV format support

## 🚀 Quick Start

### Prerequisites
- Node.js 18.0 or higher
- npm or yarn
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

1. **Clone Repository**
```bash
git clone <repository-url>
cd simstock
```

2. **Install Dependencies**
```bash
npm install
```

3. **Environment Variables** (Optional)
Create `.env` file:
```env
PORT=3000
NODE_ENV=production
JWT_SECRET=your-secure-secret-key-here
RATE_LIMIT_MAX_REQUESTS=100
DEMO_MODE=false
```

4. **Start Server**
```bash
# Production mode
npm start

# Development mode (auto-restart)
npm run dev

# Run tests
npm test
```

5. **Access in Browser**
```
Main Interface: http://localhost:3000
Login: http://localhost:3000/login
Trade History: http://localhost:3000/history
Settings: http://localhost:3000/settings
Monitoring: http://localhost:3000/monitoring
API Docs: http://localhost:3000/api-docs
```

## 🏗 System Architecture

### Backend Structure
```
simstock/
├── server.js                 # Express server & WebSocket handler
├── database.js              # SQLite database management
├── data-collector.js        # OKX API data collection
├── scheduler.js             # Periodic data collection scheduler
├── monitoring/
│   ├── alert-manager.js    # Alert management system
│   └── performance-monitor.js # Performance monitoring
├── utils/
│   ├── logger.js           # Winston logging system
│   └── websocket-manager.js # WebSocket connection management
└── config/
    ├── server-config.js    # Server configuration
    └── swagger.js          # API documentation config
```

### Frontend Structure
```
public/
├── index.html              # Main trading interface
├── login.html              # Login/signup page
├── history.html            # Trade history page
├── settings.html           # User settings page
├── monitoring.html         # System monitoring dashboard
├── 404.html               # 404 error page
├── css/
│   ├── styles.css         # Main stylesheet
│   ├── login.css          # Login page styles
│   └── monitoring.css     # Monitoring dashboard styles
└── js/
    ├── script.js          # Main trading logic
    ├── login.js           # Authentication handling
    ├── history.js         # Trade history management
    ├── settings.js        # Settings page logic
    └── monitoring-dashboard.js # Monitoring client
```

### Database Structure

#### trading.db (User Data)
- **users**: User authentication information
- **user_data**: Balances, trade history, settings
- **chart_settings**: Personalized chart settings

#### market_data.db (Market Data)
- **candles**: All timeframe candle data
  - 1m, 3m, 5m, 10m, 15m, 30m candles
  - 1h, 4h, 1d candles
  - Permanent storage (no automatic deletion)

## 📡 API Documentation

### Authentication Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/register` | New user registration |
| POST | `/api/login` | User login |
| GET | `/api/user/data` | Get user data |
| POST | `/api/user/data` | Update user data |

### Market Data Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/markets` | All market overview |
| GET | `/api/price/:market` | Current price for specific market |
| GET | `/api/candles/:interval` | Candle chart data |
| GET | `/api/orderbook/:market` | Order book data |
| GET | `/api/history` | Price history |

### Chart Settings Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chart/settings` | Save chart settings |
| GET | `/api/chart/settings/:market` | Get chart settings |
| DELETE | `/api/chart/settings/:market` | Delete chart settings |

### Monitoring Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/monitoring/status` | System status |
| GET | `/api/monitoring/metrics/:type` | Performance metrics |
| GET | `/api/monitoring/alerts` | Active alerts |
| GET | `/api/monitoring/export/:type` | Export data |

### WebSocket Events
```javascript
// Client → Server
{
  type: 'subscribe',
  market: 'BTC-USDT'
}

// Server → Client
{
  type: 'price_update',      // Real-time price
  type: 'orderbook_update',   // Order book update
  type: 'candle_update',      // Candle data
  type: 'performance_metrics' // Performance metrics
}
```

## 🛠 Tech Stack

### Backend
- **Node.js**: JavaScript runtime
- **Express.js**: Web framework
- **WebSocket (ws)**: Real-time communication
- **SQLite3**: Database
- **JWT**: User authentication
- **bcrypt**: Password encryption
- **Winston**: Logging system
- **node-cron**: Task scheduling
- **axios**: HTTP client

### Frontend
- **Lightweight Charts**: TradingView chart library
- **Vanilla JavaScript**: Pure JS without frameworks
- **CSS3**: Responsive design
- **Font Awesome**: Icons
- **WebSocket API**: Real-time data reception

### DevOps & Testing
- **Jest**: Unit testing
- **Supertest**: API testing
- **Nodemon**: Development server auto-restart
- **ESLint**: Code quality management
- **Swagger**: API documentation

## ⚙️ Configuration

### Trading Settings
- **Initial Balance**: $10,000 USD (database default)
- **Spot Trading Fee**: 0.05% (Taker)
- **Futures Trading Fee**: 0.05% (Taker) - same for all leverage
- **Maximum Leverage**: 100x
- **Concurrent Position Limit**: No limit (up to memory constraints)

### System Settings
- **WebSocket Ping Interval**: 25 seconds (keep-alive)
- **API Response Time**: Typically under 200ms
- **Chart Rendering**: Depends on TradingView Lightweight Charts performance
- **Data Collection Schedule**:
  - 1m candles: Every minute real-time (candle updates)
  - 5m data: Every 5 minutes
  - Full data: Every hour
  - Comprehensive collection: Every 12 hours and daily at 6 AM

### Security Settings
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Auth Attempt Limit**: 5 attempts per 15 minutes
- **CORS Policy**: Only configured domains allowed
- **CSP (Content Security Policy)**: XSS attack prevention
- **Helmet.js**: Automatic security headers

## 📊 Monitoring System

### Tracked Metrics
- **System Resources**
  - CPU usage (Warning: 70%, Critical: 85%)
  - Memory usage (Warning: 75%, Critical: 90%)
  - Disk I/O
  
- **Application Performance**
  - API response time (Warning: 2s, Critical: 5s)
  - WebSocket connections count
  - Requests per second (RPS)
  - Error rate (Warning: 5%, Critical: 15%)

- **Trading Activity**
  - Active users count
  - Trades per hour
  - Position open/close ratio

### Alert System
- Automatic alerts on threshold breach
- Cooldown period: 5 minutes (prevents duplicate alerts)
- Alert history storage
- Webhook support (when environment variable is set)

## 🔒 Security Features

- **Password Security**: bcrypt hashing (salt rounds: 10)
- **JWT Tokens**: 7-day expiry, signature verification
- **Input Validation**: express-validator usage
- **SQL Injection Prevention**: Prepared Statements
- **XSS Prevention**: CSP headers and input escaping
- **CSRF Prevention**: Token-based authentication

## 🎯 Feature Details

### Future Development Plans
- Custom trading bots
- Technical indicator-based auto buy/sell
- Stop-loss/take-profit automation
- Backtesting system

### Portfolio Management
- Real-time asset valuation
- ROI calculation (daily/weekly/monthly/total)
- Automatic fee deduction
- Detailed trade history CSV export

### Chart Analysis Tools
- Multiple moving averages display
- Volume profile
- Support/resistance line auto-detection (planned)
- Pattern recognition (planned)

## 🚨 Important Notice

⚠️ **This is a simulation for educational purposes**
- No real money or cryptocurrency is involved
- All trades are simulated with virtual balances
- Market data is real but trades are not executed on actual exchanges
- Use this platform to learn trading strategies risk-free

## 🐛 Known Issues

- WebSocket reconnection delay on mobile Safari
- Chart rendering delay with large datasets (5000+ candles)
- Some CSS animation bugs in Firefox

## 📈 Performance Optimization

- Permanent candle data caching in SQLite database
- Automatic WebSocket reconnection (5 seconds retry)
- Maximum 5000 candles response limit (memory protection)
- Broadcast failure log throttling (10 seconds)
- Automatic dead WebSocket connection cleanup

## 🔄 Update Log

### v1.0.0 (Latest)
- Initial release
- Spot/futures trading features
- Real-time charts and order book
- User authentication system
- Performance monitoring dashboard

## 🤝 Contributing

1. Fork this repository
2. Create a new branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Create a Pull Request

### Coding Standards
- Follow ESLint configuration
- Use camelCase for functions/variables
- Use PascalCase for class names
- Comments in English
- Clear commit messages

## 📄 License

This project is distributed under the ISC License.

## 🙏 Acknowledgments

- **OKX Exchange**: Real-time market data provider
- **TradingView**: Lightweight Charts library
- **Node.js Community**: Excellent ecosystem
- All open-source contributors

---

**Happy Trading! 📈💰**

*Real trading involves significant financial risk. Practice thoroughly with this simulator before trading with real money.*