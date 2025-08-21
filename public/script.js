// Global variables
let ws = null;
let currentPrice = 0;
let usdBalance = 1000; // Starting balance $1000
let btcBalance = 0;
let ethBalance = 0;
let currentMarket = 'BTC/USDT';
let currentCryptoBalance = 0;
// Store prices for each market
let marketPrices = {
    'BTC/USDT': 0,
    'ETH/USDT': 0,
    'SOL/USDT': 0,
    'XRP/USDT': 0
};
let transactions = [];
let leveragePositions = [];
let userTimezone = 'UTC'; // Default timezone
let chart = null;
let candleSeries = null;
let lineSeries = null;
let volumeSeries = null;
let currentInterval = '1m';
let currentChartType = 'candlestick';
let orderbook = { bids: [], asks: [] };
let candleData = []; // Store candle data
let avgPriceLine = null; // Average price line
let leveragePositionLines = []; // Store leverage position lines on chart
let chartInitialized = false; // Track chart initialization state
let volumeDataLoaded = false; // 볼륨 데이터 초기 로딩 완료 플래그
let indicators = {
    ma: null,
    ema: null,
    bollinger: { upper: null, middle: null, lower: null },
    rsi: null,
    macd: { macd: null, signal: null, histogram: null }
};
let indicatorSettings = {
    ma: { period: 20 },
    ema: { period: 20 },
    bollinger: { period: 20, std: 2 },
    rsi: { period: 14 },
    macd: { fast: 12, slow: 26, signal: 9 }
};
let drawingMode = null;
let drawings = [];
let chartClickHandler = null;
let trendLinePoints = []; // Store points for trend line drawing
let isDrawingTrendLine = false;
let fibonacciPoints = []; // Store points for fibonacci drawing
let isDrawingFibonacci = false;
let maList = [{ id: 1, period: 20, type: 'sma', series: null }];
let nextMaId = 2;
const SPOT_TRADING_FEE = 0.0005; // 0.05% spot trading fee

// Trading fee structure (same for all leverage levels)
const TRADING_FEES = {
    maker: 0.0002,  // 0.020% - Maker fee (limit orders that add liquidity)
    taker: 0.0005   // 0.050% - Taker fee (market orders that remove liquidity)
};

// Get trading fee rate
function getTradingFee(orderType = 'taker') {
    // For this simulation, all orders are treated as taker orders (market orders)
    // In a real exchange, limit orders that don't immediately match would get maker fees
    return TRADING_FEES[orderType];
}

// Audio notification system
let audioContext = null;
let isAudioEnabled = true; // Can be toggled by user

// Initialize audio context (must be called after user interaction)
function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
}

// Generate and play trading sound
function playTradingSound(type = 'buy') {
    if (!isAudioEnabled) return;
    
    try {
        initAudioContext();
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Different sounds for buy/sell/leverage/loss
        if (type === 'buy') {
            // Buy sound: Higher pitch, gentle
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.1);
        } else if (type === 'sell') {
            // Sell sound: Lower pitch, gentle
            oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
        } else if (type === 'leverage') {
            // Leverage sound: More complex sound
            oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.05);
            oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.1);
        } else if (type === 'loss') {
            // Loss sound: Descending, warning-like tone
            oscillator.frequency.setValueAtTime(500, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(250, audioContext.currentTime + 0.15);
            oscillator.type = 'square'; // Different waveform for loss
        }
        
        // Sound envelope
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.2, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        
        // Set oscillator type (default is sine, but loss uses square)
        if (type !== 'loss') {
            oscillator.type = 'sine';
        }
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.15);
        
    } catch (error) {
        console.log('Audio playback failed:', error);
    }
}

// Toggle audio notifications
function toggleAudioNotifications() {
    isAudioEnabled = !isAudioEnabled;
    showToast(`Trading sounds ${isAudioEnabled ? 'enabled' : 'disabled'}`, 'info');
    localStorage.setItem('audioEnabled', isAudioEnabled);
    updateAudioToggleUI();
}

// Update audio toggle button UI
function updateAudioToggleUI() {
    const audioIcon = document.querySelector('#audio-toggle-btn i');
    const audioText = document.getElementById('audio-toggle-text');
    
    if (audioIcon && audioText) {
        if (isAudioEnabled) {
            audioIcon.className = 'fas fa-volume-up';
            audioText.textContent = 'Trading Sounds ON';
        } else {
            audioIcon.className = 'fas fa-volume-mute';
            audioText.textContent = 'Trading Sounds OFF';
        }
    }
}

// User authentication
let currentUser = null;
let isLoggedIn = false;

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing...');
    checkLoginStatus();
    setupPageNavigation();
    setupOrderTypeSelector();
    setupMarketDropdown();
    setupTimezoneListener();
    
    // Check URL parameters for page navigation
    const urlParams = new URLSearchParams(window.location.search);
    const page = urlParams.get('page');
    if (page === 'markets') {
        switchPage('markets');
    }
});

// Setup page navigation
function setupPageNavigation() {
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            switchPage(page);
        });
    });
}

// Switch between pages
function switchPage(page) {
    const tradePage = document.getElementById('trade-page');
    const marketsPage = document.getElementById('markets-page');
    const navItems = document.querySelectorAll('.nav-item[data-page]');
    
    navItems.forEach(item => item.classList.remove('active'));
    
    if (page === 'markets') {
        tradePage.style.display = 'none';
        marketsPage.style.display = 'block';
        document.querySelector('.nav-item[data-page="markets"]').classList.add('active');
        updateMarketsData();
        // Update URL to show markets page
        window.history.replaceState({}, '', '/?page=markets');
    } else if (page === 'history') {
        // Redirect to history page
        window.location.href = '/history';
    } else {
        tradePage.style.display = 'block';
        marketsPage.style.display = 'none';
        document.querySelector('.nav-item[data-page="trade"]').classList.add('active');
        // Remove page parameter from URL when switching to trade
        window.history.replaceState({}, '', '/');
    }
}

// Format volume helper
function formatVolume(volume) {
    if (volume >= 1e9) {
        return (volume / 1e9).toFixed(2) + 'B';
    } else if (volume >= 1e6) {
        return (volume / 1e6).toFixed(2) + 'M';
    } else if (volume >= 1e3) {
        return (volume / 1e3).toFixed(2) + 'K';
    } else {
        return volume.toFixed(2);
    }
}

// Update markets data
async function updateMarketsData() {
    try {
        const response = await fetch('/api/markets');
        const markets = await response.json();
        
        // Update BTC market card
        if (markets['BTC-USDT']) {
            const btc = markets['BTC-USDT'];
            document.getElementById('btc-market-price').textContent = `$${btc.price.toFixed(2)}`;
            const btcChange = document.getElementById('btc-market-change');
            btcChange.textContent = `${(btc.change * 100).toFixed(2)}%`;
            btcChange.className = btc.change >= 0 ? 'market-change positive' : 'market-change negative';
            document.getElementById('btc-market-volume').textContent = formatVolume(btc.volume);
            document.getElementById('btc-market-high').textContent = `$${btc.high.toFixed(2)}`;
            document.getElementById('btc-market-low').textContent = `$${btc.low.toFixed(2)}`;
            
        }
        
        // Update ETH market card
        if (markets['ETH-USDT']) {
            const eth = markets['ETH-USDT'];
            document.getElementById('eth-market-price').textContent = `$${eth.price.toFixed(2)}`;
            const ethChange = document.getElementById('eth-market-change');
            ethChange.textContent = `${(eth.change * 100).toFixed(2)}%`;
            ethChange.className = eth.change >= 0 ? 'market-change positive' : 'market-change negative';
            document.getElementById('eth-market-volume').textContent = formatVolume(eth.volume);
            document.getElementById('eth-market-high').textContent = `$${eth.high.toFixed(2)}`;
            document.getElementById('eth-market-low').textContent = `$${eth.low.toFixed(2)}`;
            
        }
    } catch (error) {
        console.error('Failed to update markets data:', error);
    }
}

// Setup market dropdown
function setupMarketDropdown() {
    const marketBtn = document.getElementById('market-select-btn');
    const dropdown = document.getElementById('market-dropdown');
    const dropdownItems = document.querySelectorAll('.market-dropdown-item');
    
    if (!marketBtn || !dropdown) return;
    
    // Toggle dropdown
    marketBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('show');
        marketBtn.classList.toggle('open');
    });
    
    // Handle dropdown item selection
    dropdownItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const selectedMarket = item.dataset.market;
            selectMarketFromDropdown(selectedMarket);
            dropdown.classList.remove('show');
            marketBtn.classList.remove('open');
        });
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!marketBtn.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('show');
            marketBtn.classList.remove('open');
        }
    });
    
    // Update selected state
    updateDropdownSelection();
}

// Select market from dropdown
function selectMarketFromDropdown(market) {
    selectMarket(market);
    updateDropdownSelection();
}

// Update dropdown selection state
function updateDropdownSelection() {
    const dropdownItems = document.querySelectorAll('.market-dropdown-item');
    dropdownItems.forEach(item => {
        if (item.dataset.market === currentMarket) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });
}

// Update market card with real-time data
function updateMarketCard(instId, data) {
    const market = instId.toLowerCase().replace('-usdt', '');
    const prefix = market;
    
    const priceEl = document.getElementById(`${prefix}-market-price`);
    if (priceEl) priceEl.textContent = `$${data.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    const changeEl = document.getElementById(`${prefix}-market-change`);
    if (changeEl) {
        changeEl.textContent = `${(data.change_rate * 100).toFixed(2)}%`;
        changeEl.className = data.change_rate >= 0 ? 'market-change positive' : 'market-change negative';
    }
    
    const volumeEl = document.getElementById(`${prefix}-market-volume`);
    if (volumeEl) volumeEl.textContent = formatVolume(data.volume);
    
    const highEl = document.getElementById(`${prefix}-market-high`);
    if (highEl) highEl.textContent = `$${data.high_price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    const lowEl = document.getElementById(`${prefix}-market-low`);
    if (lowEl) lowEl.textContent = `$${data.low_price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

// Select market and switch to trade page
function selectMarket(market) {
    currentMarket = market;
    
    // Update UI for selected market
    const [crypto, base] = market.split('/');
    const marketBtn = document.querySelector('.market-select-btn');
    const symbolSpan = marketBtn.querySelector('.symbol');
    symbolSpan.textContent = market;
    
    // Update coin icon
    const coinIcon = marketBtn.querySelector('.coin-icon');
    if (crypto === 'ETH') {
        coinIcon.src = 'https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png';
        coinIcon.alt = 'ETH';
        currentCryptoBalance = ethBalance;
        
        // Update ETH balance with profit/loss
        const ethProfit = spotProfits['ETH'] || { profitPercent: 0 };
        const ethProfitText = ethProfit.profitPercent !== 0 ? 
            ` <span class="${ethProfit.profitPercent >= 0 ? 'profit-text' : 'loss-text'}">(${ethProfit.profitPercent >= 0 ? '+' : ''}${ethProfit.profitPercent.toFixed(1)}%)</span>` : '';
        document.getElementById('btc-balance').innerHTML = `${ethBalance.toFixed(8)}${ethProfitText}`;
        
        // Update crypto balance label
        const cryptoLabel = document.getElementById('crypto-balance-label');
        if (cryptoLabel) {
            cryptoLabel.textContent = 'ETH Balance';
        }
    } else {
        coinIcon.src = 'https://s2.coinmarketcap.com/static/img/coins/64x64/1.png';
        coinIcon.alt = 'BTC';
        currentCryptoBalance = btcBalance;
        
        // Update BTC balance with profit/loss
        const btcProfit = spotProfits['BTC'] || { profitPercent: 0 };
        const btcProfitText = btcProfit.profitPercent !== 0 ? 
            ` <span class="${btcProfit.profitPercent >= 0 ? 'profit-text' : 'loss-text'}">(${btcProfit.profitPercent >= 0 ? '+' : ''}${btcProfit.profitPercent.toFixed(1)}%)</span>` : '';
        document.getElementById('btc-balance').innerHTML = `${btcBalance.toFixed(8)}${btcProfitText}`;
        
        // Update crypto balance label
        const cryptoLabel = document.getElementById('crypto-balance-label');
        if (cryptoLabel) {
            cryptoLabel.textContent = 'BTC Balance';
        }
    }
    
    // Switch to trade page if not already there
    if (document.getElementById('markets-page').style.display !== 'none') {
        switchPage('trade');
    }
    
    // Reset indicator button states
    document.querySelectorAll('.indicator-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Reset chart initialization state and reload chart with new market data
    chartInitialized = false;
    
    // 🚨 마켓 변경 시 볼륨 데이터 플래그 리셋
    volumeDataLoaded = false;
    
    if (typeof loadCandles === 'function') {
        loadCandles(currentInterval);
    }
    
    // Subscribe to new market WebSocket updates
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'subscribe',
            market: market.replace('/', '-')
        }));
    }
    
    // Update UI including spot profit display for the new market
    updateUI();
    
    // Load chart settings for the new market
    if (chartInitialized) {
        setTimeout(() => {
            loadChartSettings();
        }, 500);
    }
}

// Check if user is logged in
async function checkLoginStatus() {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    
    if (token && username) {
        currentUser = username;
        isLoggedIn = true;
        document.getElementById('current-user').textContent = `${currentUser}`;
        document.getElementById('logout-btn').style.display = 'block';
        
        // Try to load user data
        await loadUserData();
        
        // If loadUserData succeeded, user is authenticated
        if (isLoggedIn) {
            initializeApp();
        }
    } else {
        // Redirect to login page
        window.location.href = '/login';
    }
}

// Initialize main application
function initializeApp() {
    initializeWebSocket();
    setupEventListeners();
    setupLogoutButton();
    updateUI();
    
    // Load audio settings
    const savedAudioEnabled = localStorage.getItem('audioEnabled');
    if (savedAudioEnabled !== null) {
        isAudioEnabled = savedAudioEnabled === 'true';
    }
    
    // Update audio toggle UI
    updateAudioToggleUI();
    
    // Load initial price data
    loadInitialPriceData();
    
    // Initialize chart after a short delay
    setTimeout(() => {
        initializeTradingViewChart();
    }, 100);
}

// Load initial price data for current market
async function loadInitialPriceData() {
    try {
        // Convert current market format for API call
        const apiMarket = currentMarket.replace('/', '-');
        const response = await fetch(`/api/price/${apiMarket}`);
        
        if (response.ok) {
            const priceData = await response.json();
            
            // Update current price and UI
            if (priceData && priceData.last) {
                const price = parseFloat(priceData.last);
                const open = parseFloat(priceData.open24h) || price;
                const changeRate = open > 0 ? (price - open) / open : 0;
                
                updatePrice({
                    price: price,
                    change_rate: changeRate,
                    high_price: parseFloat(priceData.high24h),
                    low_price: parseFloat(priceData.low24h),
                    volume: parseFloat(priceData.vol24h)
                });
                
                console.log('Initial price loaded:', price);
            }
        }
    } catch (error) {
        console.error('Failed to load initial price data:', error);
        showToast('Failed to load price data', 'error');
    }
}

// Setup logout button
function setupLogoutButton() {
    document.getElementById('logout-btn').addEventListener('click', logout);
}




// Logout function
async function logout() {
    // Save data in background (non-blocking)
    saveUserData().catch(err => console.log('Save failed during logout:', err));
    
    currentUser = null;
    isLoggedIn = false;
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    
    document.getElementById('current-user').textContent = 'Please Login';
    document.getElementById('logout-btn').style.display = 'none';
    
    // Reset data
    usdBalance = 10000;
    btcBalance = 0;
    transactions = [];
    leveragePositions = [];
    
    showToast('Logging out...', 'info');
    
    // Immediate redirect
    window.location.href = '/login';
}

// Setup timezone change listener
function setupTimezoneListener() {
    // Listen for storage changes (when timezone is updated in settings page)
    window.addEventListener('storage', (e) => {
        if (e.key === 'timezone' && e.newValue && e.newValue !== userTimezone) {
            console.log('Timezone changed from storage:', e.oldValue, '->', e.newValue);
            userTimezone = e.newValue;
            updateChartTimezone(userTimezone);
        }
    });
    
    // Check for timezone in localStorage on load
    const savedTimezone = localStorage.getItem('timezone');
    if (savedTimezone && savedTimezone !== userTimezone) {
        console.log('Loading timezone from localStorage:', savedTimezone);
        userTimezone = savedTimezone;
        updateChartTimezone(userTimezone);
    }
}

// Update chart timezone
function updateChartTimezone(timezone) {
    if (!chart) {
        console.log('Chart not initialized yet, timezone will be set on initialization');
        return;
    }
    
    try {
        console.log('Attempting to update chart timezone to:', timezone);
        
        // Test if the timezone is valid
        try {
            const testDate = new Date();
            testDate.toLocaleString('en-US', { timeZone: timezone });
            console.log('Timezone validation passed:', timezone);
        } catch (tzError) {
            console.error('Invalid timezone:', timezone, tzError);
            timezone = 'UTC'; // Fallback to UTC
        }
        
        // Update the timeScale timezone option
        chart.timeScale().applyOptions({
            timezone: timezone
        });
        
        // Force chart to refresh
        chart.timeScale().fitContent();
        
        console.log('Chart timezone successfully updated to:', timezone);
        console.log('Current time in timezone:', new Date().toLocaleString('en-US', { timeZone: timezone }));
    } catch (error) {
        console.error('Error updating chart timezone:', error);
        console.error('Failed timezone:', timezone);
    }
}

// Timezone conversion utility functions
function formatTimestampWithTimezone(timestamp, timezone = userTimezone) {
    const date = new Date(timestamp * 1000);
    
    try {
        const options = {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        };
        return date.toLocaleString('en-US', options);
    } catch (error) {
        // Fallback to UTC if timezone is invalid
        return date.toISOString().replace('T', ' ').substring(0, 16);
    }
}

function getTimezoneOffset(timezone = userTimezone) {
    try {
        const now = new Date();
        const utc = new Date(now.getTime() + (now.getTimezoneOffset() * 60000));
        const target = new Date(utc.toLocaleString("en-US", {timeZone: timezone}));
        return (target.getTime() - utc.getTime()) / (1000 * 60 * 60); // Return offset in hours
    } catch (error) {
        return 0; // Return UTC offset if timezone is invalid
    }
}

// Load user data
async function loadUserData() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('No token found, redirecting to login');
        window.location.href = '/login';
        return;
    }
    
    try {
        const response = await fetch('/api/user/data', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const userData = await response.json();
            usdBalance = userData.usdBalance;
            btcBalance = userData.btcBalance;
            transactions = userData.transactions || [];
            leveragePositions = userData.leveragePositions || [];
            userTimezone = userData.timezone || 'UTC';
            
            // Save timezone to localStorage
            localStorage.setItem('timezone', userTimezone);
            
            // Update chart timezone if chart is already initialized
            if (chart) {
                updateChartTimezone(userTimezone);
            }
            updateUI();
            updateLeveragePositionsDisplay();
            updateTransactionHistory();
        } else if (response.status === 401 || response.status === 403) {
            // Token expired or invalid
            console.log('Authentication failed, redirecting to login');
            isLoggedIn = false;
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            window.location.href = '/login';
            return;
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

// Save user data
async function saveUserData() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const response = await fetch('/api/user/data', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                usdBalance,
                btcBalance,
                transactions,
                leveragePositions,
                timezone: userTimezone
            })
        });
        
        if (response.ok) {
            console.log('User data saved successfully');
        } else if (response.status === 401 || response.status === 403) {
            // Token expired or invalid
            console.log('Authentication failed during save');
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            window.location.href = '/login';
            return;
        } else {
            console.error('Failed to save user data:', response.status);
        }
    } catch (error) {
        console.error('Error saving user data:', error);
    }
}

// 🚫 REMOVED: Force volume update - OKX API에서만 거래량 가져오기

// WebSocket connection
function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('🔗 WebSocket connected successfully');
        // showToast('Connected to server', 'success');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // 🚨 ENHANCED DEBUG: 모든 WebSocket 메시지 상세 로깅
        const timestamp = new Date().toISOString().slice(11, 19);
        if (data.type === 'candle_update') {
            console.log(`🎯🎯🎯 [${timestamp}] CANDLE_UPDATE RECEIVED!`, {
                instId: data.instId,
                interval: data.interval,
                volume: data.data?.volume,
                close: data.data?.close,
                time: data.data?.time,
                currentMarket,
                currentInterval,
                chartInitialized,
                candleSeriesExists: !!candleSeries,
                volumeSeriesExists: !!volumeSeries,
                candleDataLength: candleData?.length
            });
        } else {
            console.log(`📨 [${timestamp}] WS:`, data.type, data.instId || '');
        }
        
        switch(data.type) {
            case 'price_update':
                if (data.instId) {
                    // Handle market-specific price updates
                    const market = data.instId.replace('-', '/');
                    
                    // Always store the price for this market
                    marketPrices[market] = data.data.price;
                    
                    if (market === currentMarket) {
                        updatePrice(data.data);
                    }
                    // Update markets page if visible
                    if (document.getElementById('markets-page').style.display !== 'none') {
                        updateMarketCard(data.instId, data.data);
                    }
                } else {
                    // Legacy support for BTC-only updates
                    updatePrice(data.data);
                }
                break;
            case 'orderbook_update':
                updateOrderbook(data.data);
                break;
            case 'candle_update':
                if (data.instId) {
                    const market = data.instId.replace('-', '/');
                    console.log('📊 Received candle_update:', {
                        market,
                        currentMarket,
                        interval: data.interval,
                        currentInterval,
                        volume: data.data?.volume,
                        marketMatch: market === currentMarket,
                        intervalMatch: data.interval === currentInterval,
                        shouldUpdate: data.interval === '1m' || (market === currentMarket && data.interval === currentInterval),
                        data: data.data
                    });
                    
                    // Always update 1m candles for current market (for volume tracking)
                    if (market === currentMarket && data.interval === '1m' && data.data) {
                        console.log('🔥 Updating 1m candle for current market:', {
                            market,
                            volume: data.data.volume,
                            close: data.data.close
                        });
                        // Store 1m data for volume reference
                        if (currentInterval === '1m') {
                            updateRealtimeCandleData(data.data);
                        } else {
                            // Still update volume for other intervals based on 1m data
                            updateVolumeFromOneMinute(data.data);
                        }
                    }
                    // Also update if it exactly matches current market and interval (other timeframes)
                    else if (market === currentMarket && data.interval === currentInterval && data.data) {
                        console.log('📊 Updating candle for current interval:', data.interval);
                        updateRealtimeCandleData(data.data);
                    } else {
                        console.log('📊 Skipping candle_update (different market/interval)', {
                            receivedMarket: market,
                            currentMarket: currentMarket,
                            receivedInterval: data.interval,
                            currentInterval: currentInterval
                        });
                    }
                }
                break;
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        showToast('Connection error occurred', 'error');
    };
    
    ws.onclose = () => {
        console.log('❌ WebSocket disconnected');
        showToast('Server disconnected. Reconnecting...', 'info');
        setTimeout(initializeWebSocket, 5000);
    };
}

// Initialize TradingView Lightweight Chart
function initializeTradingViewChart() {
    const chartContainer = document.getElementById('tradingview-chart');
    
    console.log('Initializing chart...');
    console.log('LightweightCharts available:', typeof window.LightweightCharts !== 'undefined');
    
    if (typeof window.LightweightCharts === 'undefined') {
        console.error('LightweightCharts library not loaded!');
        setTimeout(initializeTradingViewChart, 500);
        return;
    }
    
    try {
        // Create the chart
        chart = window.LightweightCharts.createChart(chartContainer, {
            width: chartContainer.clientWidth,
            height: chartContainer.clientHeight || 450, // Use container height, fallback to 450px
            layout: {
                background: { color: '#121821' },
                textColor: '#ffffff',
            },
            grid: {
                vertLines: {
                    color: '#2a3441',
                },
                horzLines: {
                    color: '#2a3441',
                },
            },
            crosshair: {
                mode: 0, // Normal mode
            },
            rightPriceScale: {
                borderColor: '#2a3441',
            },
            timeScale: {
                borderColor: '#2a3441',
                timeVisible: true,
                secondsVisible: false,
                timezone: userTimezone || 'UTC',
                rightOffset: 0,
                barSpacing: 6,
                minBarSpacing: 0.5,
                fixLeftEdge: false,
                fixRightEdge: false,
            },
            localization: {
                timeFormatter: (time) => {
                    const date = new Date(time * 1000);
                    return date.toLocaleTimeString('en-US', { 
                        timeZone: userTimezone || 'UTC',
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                },
                dateFormat: 'dd/MM/yyyy',
            },
        });
        
        console.log('Chart created');
        console.log('Initial timezone set to:', userTimezone);
        
        // Ensure timezone is applied after chart creation
        setTimeout(() => {
            updateChartTimezone(userTimezone);
        }, 100);
        
        // Add candlestick series
        candleSeries = chart.addCandlestickSeries({
            upColor: '#00d68f',      // 상승 - 초록색
            downColor: '#ff5a5f',    // 하락 - 빨간색
            borderUpColor: '#00d68f',
            borderDownColor: '#ff5a5f',
            wickUpColor: '#00d68f',
            wickDownColor: '#ff5a5f',
        });
        
        console.log('Candlestick series created');
        
        // Add volume series
        volumeSeries = chart.addHistogramSeries({
            color: '#00c087',
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: 'volume',
        });
        
        console.log('📊 Volume series created:', !!volumeSeries);
        
        // Configure volume scale
        chart.priceScale('volume').applyOptions({
            scaleMargins: {
                top: 0.8,
                bottom: 0,
            },
        });
        
        // Configure price scale to show USD prices
        chart.priceScale('right').applyOptions({
            mode: 0, // Normal mode
            invertScale: false,
            alignLabels: true,
            borderVisible: true,
            borderColor: '#30363d',
            scaleMargins: {
                top: 0.1,
                bottom: 0.2,
            },
        });
        
        console.log('Volume series created');
        
        // Handle window resize
        window.addEventListener('resize', () => {
            if (chart) {
                chart.applyOptions({ 
                    width: chartContainer.clientWidth 
                });
            }
        });
        
        // Load initial data
        setTimeout(() => {
            loadCandles(currentInterval);
        }, 500);
        
        console.log('Chart initialization complete');
        
        // Add window resize listener to resize chart
        window.addEventListener('resize', () => {
            if (chart && chartContainer) {
                chart.applyOptions({
                    width: chartContainer.clientWidth,
                    height: chartContainer.clientHeight || 450
                });
            }
        });
        
    } catch (error) {
        console.error('Error creating chart:', error);
        console.error('Error details:', error.message, error.stack);
    }
}

// Setup event listeners
function setupEventListeners() {
    // Tab switching (updated for new UI)
    document.querySelectorAll('.order-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const type = e.target.dataset.type;
            switchTab(type);
        });
    });
    
    // Position type buttons
    document.querySelectorAll('.position-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.position-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });
    
    // Buy/Sell amount inputs
    document.getElementById('buy-amount').addEventListener('input', updateBuyTotal);
    document.getElementById('sell-amount').addEventListener('input', updateSellTotal);
    document.getElementById('leverage-amount').addEventListener('input', updatePositionSize);
    document.getElementById('leverage-select').addEventListener('change', updatePositionSize);
    
    // Trading buttons
    document.getElementById('buy-btn').addEventListener('click', executeBuy);
    document.getElementById('sell-btn').addEventListener('click', executeSell);
    document.getElementById('open-position-btn').addEventListener('click', openLeveragePosition);
    
    // Percentage buttons for selling
    document.querySelectorAll('.percentage-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const percentage = parseInt(e.target.dataset.percentage);
            setSellPercentage(percentage);
        });
    });
    
    // Market trade buttons
    document.querySelectorAll('.market-trade-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const market = e.target.dataset.market;
            selectMarket(market);
        });
    });
    
    // Audio toggle button
    const audioToggleBtn = document.getElementById('audio-toggle-btn');
    if (audioToggleBtn) {
        audioToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleAudioNotifications();
        });
    }
    
    // Delegate events for dynamic content
    document.addEventListener('click', (e) => {
        // MA/EMA remove buttons
        if (e.target.classList.contains('remove-ma-btn')) {
            const maId = parseInt(e.target.dataset.maId);
            removeMa(maId);
        }
        
        // Leverage position close buttons
        if (e.target.classList.contains('close-position-btn')) {
            const positionId = parseInt(e.target.dataset.positionId);
            toggleCloseDropdown(positionId);
        }
        
        // Leverage position close options
        if (e.target.classList.contains('close-option')) {
            const positionId = parseInt(e.target.dataset.positionId);
            const percentage = parseInt(e.target.dataset.percentage);
            closeLeveragePosition(positionId, percentage);
        }
    });
    
    // Timeframe buttons (updated for new UI)
    document.querySelectorAll('.tf-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const interval = e.target.dataset.interval;
            switchTimeframe(interval);
        });
    });
    
    // Chart type buttons
    document.querySelectorAll('.chart-type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const chartType = e.target.closest('.chart-type-btn').dataset.type;
            
            // Update active state
            document.querySelectorAll('.chart-type-btn').forEach(b => b.classList.remove('active'));
            e.target.closest('.chart-type-btn').classList.add('active');
            
            // Switch chart type
            switchChartType(chartType);
            showToast('Chart type changed to ' + chartType, 'info');
        });
    });
    
    // Chart bottom tabs for positions & trades
    document.querySelectorAll('.chart-bottom-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const targetTab = e.target.dataset.tab;
            switchChartBottomTab(targetTab);
        });
    });
    
    // Indicator buttons
    document.querySelectorAll('.indicator-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const indicator = e.target.closest('.indicator-btn').dataset.indicator;
            const button = e.target.closest('.indicator-btn');
            
            // Check current state
            const wasActive = button.classList.contains('active');
            const shouldActivate = !wasActive;
            
            console.log(`Toggling ${indicator}: ${wasActive} -> ${shouldActivate}`);
            
            // Toggle indicator
            toggleIndicator(indicator, shouldActivate);
            
            // Update button states and save settings
            setTimeout(() => {
                updateIndicatorButtonStates();
                debouncedSaveChartSettings();
            }, 100);
        });
    });
    
    // Chart settings modal
    document.getElementById('chart-settings-btn').addEventListener('click', () => {
        openSettingsModal();
    });
    
    document.getElementById('close-settings-modal').addEventListener('click', () => {
        closeSettingsModal();
    });
    
    document.getElementById('apply-settings').addEventListener('click', () => {
        applySettings();
    });
    
    document.getElementById('reset-settings').addEventListener('click', () => {
        resetSettings();
    });
    
    // Close modal when clicking outside
    document.getElementById('chart-settings-modal').addEventListener('click', (e) => {
        if (e.target.id === 'chart-settings-modal') {
            closeSettingsModal();
        }
    });
    
    // Drawing tools (moved to header)
    document.getElementById('horizontal-line-btn').addEventListener('click', (e) => {
        selectDrawingTool('horizontal', e.target.closest('button'));
    });
    
    document.getElementById('trend-line-btn').addEventListener('click', (e) => {
        selectDrawingTool('trend', e.target.closest('button'));
    });
    
    document.getElementById('fib-retracement-btn').addEventListener('click', (e) => {
        selectDrawingTool('fibonacci', e.target.closest('button'));
    });
    
    document.getElementById('clear-drawings-btn').addEventListener('click', () => {
        clearAllDrawings();
    });
    
    // MA/EMA management
    document.getElementById('add-ma-btn').addEventListener('click', () => {
        addMaItem();
    });
    
    // Dropdown menu handling
    const userMenuTrigger = document.querySelector('.user-menu-trigger');
    const userDropdown = document.querySelector('.user-dropdown');
    
    if (userMenuTrigger && userDropdown) {
        userMenuTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            userDropdown.classList.toggle('active');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!userDropdown.contains(e.target)) {
                userDropdown.classList.remove('active');
            }
        });
    }
}

// Switch trading tabs
function switchTab(type) {
    document.querySelectorAll('.order-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    document.querySelectorAll('.order-content').forEach(content => {
        content.classList.toggle('active', content.id === `${type}-trading`);
    });
}

// Update price display
function updatePrice(data) {
    // console.log('updatePrice received data:', data); // Debug log disabled
    
    // Validate data before processing
    if (!data || !data.price || isNaN(data.price) || data.price <= 0) {
        console.warn('Invalid price data received:', data);
        return;
    }
    
    currentPrice = data.price; // Now this is already USDT price
    
    // Store price for current market
    marketPrices[currentMarket] = currentPrice;
    
    // Update price display in USD (USDT ≈ USD)
    document.getElementById('btc-price').textContent = '$' + currentPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    
    // Update price change
    if (data.change_rate !== undefined && data.change_rate !== null) {
        const changeElement = document.getElementById('price-change');
        const changePercent = (data.change_rate * 100).toFixed(2);
        changeElement.textContent = (data.change_rate >= 0 ? '+' : '') + changePercent + '%';
        changeElement.className = 'change ' + (data.change_rate >= 0 ? 'positive' : 'negative');
        // console.log('Updated price change to:', changePercent + '%');
    } else {
        console.log('change_rate is missing or null in data:', data);
    }
    
    // Update stats in USD
    if (data.high_price) {
        document.getElementById('high-price').textContent = '$' + data.high_price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }
    if (data.low_price) {
        document.getElementById('low-price').textContent = '$' + data.low_price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }
    if (data.volume) {
        const volumeElement = document.getElementById('volume');
        if (volumeElement) {
            // Format volume with appropriate decimal places (24h USDT volume)
            let formattedVolume;
            if (data.volume >= 1000000) {
                formattedVolume = '$' + (data.volume / 1000000).toFixed(1) + 'M';
            } else if (data.volume >= 1000) {
                formattedVolume = '$' + (data.volume / 1000).toFixed(1) + 'K';
            } else {
                formattedVolume = '$' + data.volume.toFixed(0);
            }
            volumeElement.textContent = formattedVolume;
            console.log('📊 Updated 24h volume display:', formattedVolume, 'from raw:', data.volume);
        }
        
        // 24시간 거래량으로 1분봉 볼륨을 추정하는 것은 잘못된 접근
        // 실제 1분봉 캔들 데이터나 실시간 거래 데이터가 필요함
    }
    
    // Update real-time candle with price only
    // Volume updates come exclusively from candle_update WebSocket messages
    updateRealtimeCandle(currentPrice);
    
    // Update leverage positions P&L
    updateLeveragePositions();
    
    // Update total assets
    updateUI();
}

// Update orderbook display with smooth transitions
let lastOrderbookUpdate = 0;
const ORDERBOOK_UPDATE_THROTTLE = 500; // Update every 500ms maximum

function updateOrderbook(data) {
    // Skip update if data is invalid or empty
    if (!data || !data.bids || !data.asks || data.bids.length === 0 || data.asks.length === 0) {
        console.log('Skipping orderbook update - invalid data');
        return;
    }
    
    const now = Date.now();
    if (now - lastOrderbookUpdate < ORDERBOOK_UPDATE_THROTTLE) {
        return; // Skip update if too frequent
    }
    lastOrderbookUpdate = now;
    
    // Merge new data with existing orderbook to maintain continuity
    if (orderbook.bids && orderbook.asks) {
        // Update existing orderbook with new data, keeping old data as fallback
        orderbook.bids = data.bids.length > 5 ? data.bids : [...data.bids, ...orderbook.bids.slice(data.bids.length)];
        orderbook.asks = data.asks.length > 5 ? data.asks : [...data.asks, ...orderbook.asks.slice(data.asks.length)];
    } else {
        orderbook = data;
    }
    
    const ORDERBOOK_ROWS = 15; // Fixed number of rows
    
    // Update asks (reversed for display) in USD
    const asks = orderbook.asks.slice(0, ORDERBOOK_ROWS).reverse();
    const asksContainer = document.getElementById('asks');
    const existingAsksRows = asksContainer.querySelectorAll('.orderbook-row');
    
    // Update existing rows or create new ones for asks
    for (let i = 0; i < ORDERBOOK_ROWS; i++) {
        let row = existingAsksRows[i];
        if (!row) {
            row = document.createElement('div');
            row.className = 'orderbook-row';
            row.innerHTML = `
                <span class="orderbook-price">-</span>
                <span class="orderbook-size">-</span>
                <span class="orderbook-total">-</span>
            `;
            asksContainer.appendChild(row);
        }
        
        if (i < asks.length && asks[i]) {
            const [price, size] = asks[i];
            row.classList.remove('orderbook-empty');
            row.querySelector('.orderbook-price').textContent = `$${parseFloat(price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            row.querySelector('.orderbook-size').textContent = parseFloat(size).toFixed(8);
            row.querySelector('.orderbook-total').textContent = `$${(parseFloat(price) * parseFloat(size)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        } else {
            row.classList.add('orderbook-empty');
            row.querySelector('.orderbook-price').textContent = '-';
            row.querySelector('.orderbook-size').textContent = '-';
            row.querySelector('.orderbook-total').textContent = '-';
        }
    }
    
    // Update bids in USD
    const bids = orderbook.bids.slice(0, ORDERBOOK_ROWS);
    const bidsContainer = document.getElementById('bids');
    const existingBidsRows = bidsContainer.querySelectorAll('.orderbook-row');
    
    // Update existing rows or create new ones for bids
    for (let i = 0; i < ORDERBOOK_ROWS; i++) {
        let row = existingBidsRows[i];
        if (!row) {
            row = document.createElement('div');
            row.className = 'orderbook-row';
            row.innerHTML = `
                <span class="orderbook-price">-</span>
                <span class="orderbook-size">-</span>
                <span class="orderbook-total">-</span>
            `;
            bidsContainer.appendChild(row);
        }
        
        if (i < bids.length && bids[i]) {
            const [price, size] = bids[i];
            row.classList.remove('orderbook-empty');
            row.querySelector('.orderbook-price').textContent = `$${parseFloat(price).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
            row.querySelector('.orderbook-size').textContent = parseFloat(size).toFixed(8);
            row.querySelector('.orderbook-total').textContent = `$${(parseFloat(price) * parseFloat(size)).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        } else {
            row.classList.add('orderbook-empty');
            row.querySelector('.orderbook-price').textContent = '-';
            row.querySelector('.orderbook-size').textContent = '-';
            row.querySelector('.orderbook-total').textContent = '-';
        }
    }
    
    // Update spread
    if (orderbook.asks.length > 0 && orderbook.bids.length > 0) {
        const spread = orderbook.asks[0][0] - orderbook.bids[0][0];
        const spreadElement = document.getElementById('orderbook-spread');
        if (spreadElement) {
            spreadElement.textContent = `$${spread.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        }
    }
}

// Load candle data
async function loadCandles(interval) {
    if (!candleSeries || !chart) {
        console.log('Chart not ready, retrying...');
        setTimeout(() => loadCandles(interval), 500);
        return;
    }
    
    try {
        console.log(`📥 Loading historical candles from database - interval: ${interval}, market: ${currentMarket}`);
        const marketParam = currentMarket.replace('/', '-');
        
        // Determine count based on interval for optimal chart display
        let count = 1000; // Default
        switch(interval) {
            case '1m':
                count = 3000; // Request more 1min candles
                break;
            case '5m':
                count = 2500; // Request more 5min candles
                break;
            case '15m':
                count = 1000; // ~10+ days
                break;
            case '1h':
                count = 800; // ~1 month
                break;
            case '4h':
                count = 500; // ~3 months
                break;
            case '1d':
                count = 365; // ~1 year
                break;
            default:
                count = 1000;
        }
        
        const response = await fetch(`/api/candles/${interval}?market=${marketParam}&count=${count}`);
        const candles = await response.json();
        
        console.log(`Received ${candles.length} candles`);
        
        // Filter out invalid candles and validate all data
        const usdCandles = candles
            .filter(candle => {
                // Check if candle exists and has all required properties
                if (!candle || !candle.time || 
                    candle.open == null || candle.high == null || 
                    candle.low == null || candle.close == null) {
                    return false;
                }
                
                const open = parseFloat(candle.open);
                const high = parseFloat(candle.high);
                const low = parseFloat(candle.low);
                const close = parseFloat(candle.close);
                
                // Validate all OHLC values
                return open > 0 && high > 0 && low > 0 && close > 0 &&
                       !isNaN(open) && !isNaN(high) && !isNaN(low) && !isNaN(close) &&
                       high >= low && high >= open && high >= close &&
                       low <= open && low <= close;
            })
            .map(candle => {
                // 🚨 할머니 안전을 위한 강력한 타임스탬프 변환 (차트 로딩 시에도)
                let timeAsNumber;
                const rawTime = candle.time;
                
                if (typeof rawTime === 'number') {
                    timeAsNumber = rawTime;
                } else if (typeof rawTime === 'string') {
                    timeAsNumber = parseInt(rawTime, 10);
                } else if (rawTime && typeof rawTime === 'object') {
                    if (rawTime.valueOf && typeof rawTime.valueOf === 'function') {
                        timeAsNumber = parseInt(rawTime.valueOf(), 10);
                    } else if (rawTime.toString) {
                        const timeStr = rawTime.toString();
                        timeAsNumber = parseInt(timeStr.replace(/[^\d]/g, ''), 10);
                    } else {
                        timeAsNumber = Math.floor(Date.now() / 1000);
                    }
                } else {
                    timeAsNumber = Math.floor(Date.now() / 1000);
                }
                
                if (isNaN(timeAsNumber) || timeAsNumber <= 0) {
                    console.warn('🚨 Invalid timestamp in chart data, using current time:', rawTime);
                    timeAsNumber = Math.floor(Date.now() / 1000);
                }
                
                return {
                    time: timeAsNumber,
                    open: parseFloat(candle.open),
                    high: parseFloat(candle.high),
                    low: parseFloat(candle.low),
                    close: parseFloat(candle.close),
                    volume: (parseFloat(candle.volume) || 0) // 서버에서 이미 스케일링됨
                };
            });
        
        if (usdCandles.length === 0) {
            console.error('No valid candle data received after filtering');
            console.log('Original candles sample:', candles.slice(0, 3));
            return;
        }
        
        console.log(`Filtered ${usdCandles.length} valid candles from ${candles.length} total`);
        
        // Final validation - ensure no null values in the data
        let safeCandles = [];
        
        if (candleSeries && usdCandles && usdCandles.length > 0) {
            safeCandles = usdCandles
                .filter(candle => {
                    if (!candle || !candle.time) return false;
                    if (typeof candle.time !== 'number' || candle.time <= 0) return false;
                    if (candle.open == null || candle.high == null || 
                        candle.low == null || candle.close == null) return false;
                    if (!Number.isFinite(candle.open) || !Number.isFinite(candle.high) || 
                        !Number.isFinite(candle.low) || !Number.isFinite(candle.close)) return false;
                    if (candle.open <= 0 || candle.high <= 0 || 
                        candle.low <= 0 || candle.close <= 0) return false;
                    if (candle.high < candle.low) return false;
                    return true;
                })
                .map(candle => ({
                    time: Math.floor(candle.time),
                    open: Number(candle.open.toFixed(2)),
                    high: Number(candle.high.toFixed(2)),
                    low: Number(candle.low.toFixed(2)),
                    close: Number(candle.close.toFixed(2)),
                    volume: parseFloat(candle.volume) || 0
                }))
                .sort((a, b) => a.time - b.time);  // Sort in ascending order by time
            
            // Validate time sequence
            for (let i = 1; i < safeCandles.length; i++) {
                if (safeCandles[i].time <= safeCandles[i-1].time) {
                    console.error('Time sequence error at index', i, ':', 
                        safeCandles[i-1].time, '>=', safeCandles[i].time);
                    // Remove duplicate or out-of-order candles
                    safeCandles = safeCandles.filter((candle, idx) => {
                        if (idx === 0) return true;
                        return candle.time > safeCandles[idx - 1].time;
                    });
                    break;
                }
            }
            
            if (safeCandles.length > 0) {
                // Store the sorted and validated candle data
                candleData = safeCandles;
                
                console.log('📊 Historical data loaded from database, first candle:', safeCandles[0]);
                console.log('📊 Historical data loaded from database, last candle:', safeCandles[safeCandles.length - 1]);
                
                // Debug and fix timestamp conversion
                const firstCandle = safeCandles[0];
                if (firstCandle) {
                    const currentTimeUTC = Math.floor(Date.now() / 1000);
                    const utcDate = new Date(firstCandle.time * 1000);
                    const koreaDate = new Date(firstCandle.time * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
                    console.log('🕐 First candle timestamp debug:');
                    console.log('   Raw timestamp:', firstCandle.time);
                    console.log('   Current UTC timestamp:', currentTimeUTC);
                    console.log('   UTC Date:', utcDate.toISOString());
                    console.log('   Korea Date:', koreaDate);
                    console.log('   Current time:', new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }));
                    
                    // Verify if timezone is being applied correctly
                    const timeDiffHours = Math.abs(currentTimeUTC - firstCandle.time) / 3600;
                    console.log('   Time difference (hours):', timeDiffHours.toFixed(2));
                    
                    // The timestamps seem correct, the issue is TradingView timezone display
                    console.log('📋 Timestamps analysis:');
                    console.log('   Data appears to be valid UTC timestamps');
                    console.log('   TradingView should convert these to display timezone');
                    
                    // Force re-render chart with timezone
                    setTimeout(() => {
                        console.log('🔄 Forcing chart timezone refresh...');
                        chart.timeScale().applyOptions({
                            timezone: userTimezone,
                            timeVisible: true,
                            secondsVisible: false
                        });
                        chart.timeScale().resetTimeScale();
                    }, 500);
                }
                
                try {
                    candleSeries.setData(safeCandles);
                    // Reapply timezone after data is loaded
                    setTimeout(() => {
                        updateChartTimezone(userTimezone);
                    }, 100);
                } catch (error) {
                    console.error('Error in setData:', error);
                    console.error('First problematic candle:', safeCandles[0]);
                    console.error('Last problematic candle:', safeCandles[safeCandles.length - 1]);
                }
            } else {
                console.error('All candle data filtered out as invalid');
                return;
            }
        }
        
        // 🚀 전문 트레이딩 거래량 표시 로직
        // 1. 평균 거래량 계산 (최근 20개 캔들 기준)
        const recentVolumes = safeCandles.slice(-20).map(c => c.volume || 0);
        const avgVolume = recentVolumes.reduce((sum, vol) => sum + vol, 0) / recentVolumes.length;
        
        const volumeData = safeCandles
            .map((candle, index) => {
                const volumeValue = candle.volume || 0;
                const relativeVolume = avgVolume > 0 ? volumeValue / avgVolume : 1;
                
                // 전문 트레이딩 색상 로직:
                // - 상승 + 높은 거래량: 밝은 초록 (강한 매수)
                // - 상승 + 낮은 거래량: 어두운 초록 (약한 매수) 
                // - 하락 + 높은 거래량: 밝은 빨강 (강한 매도)
                // - 하락 + 낮은 거래량: 어두운 빨강 (약한 매도)
                const isUp = candle.close >= candle.open;
                const isHighVolume = relativeVolume > 1.5; // 평균 대비 150% 이상
                
                let color;
                if (isUp) {
                    color = isHighVolume ? '#00ff88' : '#00a05c'; // 밝은/어두운 초록
                } else {
                    color = isHighVolume ? '#ff4444' : '#cc2222'; // 밝은/어두운 빨강
                }
                
                return {
                    time: candle.time,
                    value: Number.isFinite(volumeValue) && volumeValue >= 0 ? volumeValue : 0,
                    color: color,
                    // 추가 메타데이터 (디버깅용)
                    relativeVolume: relativeVolume,
                    isHighVolume: isHighVolume
                };
            })
            .filter(vol => vol && vol.time && Number.isFinite(vol.value) && vol.value >= 0);
        
        console.log(`📊 Professional volume analysis: Avg=${avgVolume.toFixed(2)}, High volume bars=${volumeData.filter(v => v.isHighVolume).length}/${volumeData.length}`);
        
        if (volumeSeries && volumeData && volumeData.length > 0) {
            try {
                console.log('📊 Setting volume data:', volumeData.length, 'points');
                volumeSeries.setData(volumeData);
                volumeDataLoaded = true;
                console.log('✅ Volume data loaded');
            } catch (error) {
                console.error('Error setting volume data:', error);
            }
        } else {
            console.warn('⚠️ Volume data not set:', {
                volumeSeries: !!volumeSeries,
                volumeDataLength: volumeData ? volumeData.length : 0
            });
        }
        
        // Fit content
        chart.timeScale().fitContent();
        
        // Update position lines after loading chart
        updateAveragePriceLine();
        updateLeveragePositionLines();
        
        // Reset indicator button states before loading settings
        document.querySelectorAll('.indicator-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        // Mark chart as fully initialized
        chartInitialized = true;
        
        // Load saved chart settings
        setTimeout(() => {
            loadChartSettings();
        }, 300);
        
        console.log('✅ Historical candles loaded successfully from database');
    } catch (error) {
        console.error('Failed to load candles:', error);
        showToast('Failed to load chart data', 'error');
    }
}

// 🚨 차트 데이터 복구 함수 (할머니 안전 보장)
function repairChartData() {
    try {
        console.log('🔧 Starting chart data repair...');
        
        if (!candleData || candleData.length === 0) {
            console.log('🔧 No candleData to repair');
            return;
        }
        
        // 모든 캔들 데이터의 time을 강제로 숫자로 변환
        const repairedData = candleData.map((candle, index) => {
            let timeAsNumber;
            const rawTime = candle.time;
            
            if (typeof rawTime === 'number') {
                timeAsNumber = rawTime;
            } else if (typeof rawTime === 'string') {
                timeAsNumber = parseInt(rawTime, 10);
            } else if (rawTime && typeof rawTime === 'object') {
                if (rawTime.valueOf && typeof rawTime.valueOf === 'function') {
                    timeAsNumber = parseInt(rawTime.valueOf(), 10);
                } else {
                    timeAsNumber = Math.floor(Date.now() / 1000) - (candleData.length - index) * 60;
                }
            } else {
                timeAsNumber = Math.floor(Date.now() / 1000) - (candleData.length - index) * 60;
            }
            
            if (isNaN(timeAsNumber) || timeAsNumber <= 0) {
                timeAsNumber = Math.floor(Date.now() / 1000) - (candleData.length - index) * 60;
            }
            
            return {
                time: timeAsNumber,
                open: parseFloat(candle.open) || 0,
                high: parseFloat(candle.high) || 0,
                low: parseFloat(candle.low) || 0,
                close: parseFloat(candle.close) || 0,
                volume: parseFloat(candle.volume) || 0
            };
        });
        
        // 시간 순서대로 정렬
        repairedData.sort((a, b) => a.time - b.time);
        
        // 차트 데이터 교체
        candleData = repairedData;
        
        // 차트 시리즈 데이터 완전 재설정
        if (candleSeries && repairedData.length > 0) {
            candleSeries.setData(repairedData);
            console.log('🔧 Chart data repaired successfully');
        }
        
        // 볼륨 데이터도 재설정
        if (volumeSeries && repairedData.length > 0) {
            const volumeData = repairedData.map(candle => ({
                time: candle.time,
                value: candle.volume,
                color: candle.close >= candle.open ? '#00d68f' : '#ff5a5f'
            }));
            volumeSeries.setData(volumeData);
            console.log('🔧 Volume data repaired successfully');
        }
        
    } catch (error) {
        console.error('🔧 Chart repair failed:', error);
    }
}

// Update real-time candle data from WebSocket
function updateRealtimeCandleData(newCandleData) {
    const funcTimestamp = new Date().toISOString().slice(11, 19);
    console.log(`🚨 [${funcTimestamp}] updateRealtimeCandleData STARTED`, {
        hasNewData: !!newCandleData,
        volume: newCandleData?.volume,
        close: newCandleData?.close,
        time: newCandleData?.time
    });
    
    try {
        if (!chartInitialized || !candleSeries || !chart || !candleData || candleData.length === 0) {
            console.log(`❌ [${funcTimestamp}] Chart not ready for real-time updates:`, {
                chartInitialized,
                hasCandleSeries: !!candleSeries,
                hasChart: !!chart,
                candleDataLength: candleData?.length
            });
            return;
        }
        
        if (!newCandleData || !newCandleData.time) {
            console.warn('Invalid candle data:', newCandleData);
            return;
        }
        
        // 🚨 할머니 안전을 위한 강력한 타임스탬프 변환
        const rawTime = newCandleData.time;
        let timeAsNumber;
        
        if (typeof rawTime === 'number') {
            timeAsNumber = rawTime;
        } else if (typeof rawTime === 'string') {
            timeAsNumber = parseInt(rawTime, 10);
        } else if (rawTime && typeof rawTime === 'object') {
            // 객체인 경우 다양한 방법으로 숫자 추출 시도
            if (rawTime.valueOf && typeof rawTime.valueOf === 'function') {
                timeAsNumber = parseInt(rawTime.valueOf(), 10);
            } else if (rawTime.toString) {
                const timeStr = rawTime.toString();
                timeAsNumber = parseInt(timeStr.replace(/[^\d]/g, ''), 10);
            } else {
                timeAsNumber = Math.floor(Date.now() / 1000);
            }
        } else {
            timeAsNumber = Math.floor(Date.now() / 1000);
        }
        
        // 마지막 검증: NaN이거나 비정상적인 값이면 현재 시간 사용
        if (isNaN(timeAsNumber) || timeAsNumber <= 0) {
            console.warn('🚨 Invalid timestamp detected, using current time:', rawTime);
            timeAsNumber = Math.floor(Date.now() / 1000);
        }
        
        const newCandle = {
            time: timeAsNumber,
            open: parseFloat(newCandleData.open) || 0,
            high: parseFloat(newCandleData.high) || 0,
            low: parseFloat(newCandleData.low) || 0,
            close: parseFloat(newCandleData.close) || 0,
            volume: parseFloat(newCandleData.volume) || 0
        };
        
        console.log('⚡ Real-time candle update via WebSocket:', newCandle);
        console.log('📊 Volume value:', newCandle.volume, typeof newCandle.volume);
        console.log('🔍 volumeSeries status:', !!volumeSeries, typeof volumeSeries);
        console.log('🕐 Time values check:', {
            newTime: newCandle.time,
            newTimeType: typeof newCandle.time,
            rawTime: newCandleData.time,
            rawTimeType: typeof newCandleData.time
        });
        
        // Debug volume validation
        if (!newCandle.volume || newCandle.volume === 0) {
            console.warn('🚨 Volume is zero or undefined!', {
                volume: newCandle.volume,
                rawData: newCandleData
            });
        }
        
        // Get the last candle from our stored data
        const lastStoredCandle = candleData[candleData.length - 1];
        
        // 🚨 할머니 안전을 위한 중요한 시간 분석
        const intervalSeconds = getIntervalSeconds(currentInterval) || 60;
        
        // Align times to interval boundaries for accurate comparison
        const alignedNewTime = alignTimeToInterval(newCandle.time, currentInterval);
        const alignedLastTime = lastStoredCandle ? alignTimeToInterval(lastStoredCandle.time, currentInterval) : 0;
        
        // Check if this is a new candle based on aligned interval boundaries
        const isNewCandle = !lastStoredCandle || (alignedNewTime > alignedLastTime);
        
        // If new candle detected, use aligned time for consistency
        if (isNewCandle) {
            newCandle.time = alignedNewTime;
        }
        
        console.log('🔍 Candle comparison:', {
            newCandleTime: newCandle.time,
            alignedNewTime: alignedNewTime,
            lastStoredTime: lastStoredCandle?.time,
            alignedLastTime: alignedLastTime,
            timeDiff: lastStoredCandle ? newCandle.time - lastStoredCandle.time : 'no last candle',
            intervalSeconds: intervalSeconds,
            isNewCandle: isNewCandle,
            newVolume: newCandle.volume,
            lastVolume: lastStoredCandle?.volume
        });
        
        // 🚨 할머니 안전 보장: 새로운 캔들 vs 기존 캔들 업데이트 구분
        let candleToUpdate = null;
        let candleIndex = -1;
        
        if (isNewCandle) {
            // 새로운 1분봉 시작 - 새 캔들 추가
            console.log('🆕 NEW CANDLE detected - adding to chart with volume:', newCandle.volume);
            candleData.push(newCandle);
            candleIndex = candleData.length - 1;
            candleToUpdate = newCandle;
            
            // 새 캔들의 볼륨도 즉시 추가
            if (volumeSeries) {
                const isUp = newCandle.close >= newCandle.open;
                const volumeData = {
                    time: newCandle.time,
                    value: newCandle.volume || 0,
                    color: isUp ? '#00d68f' : '#ff5a5f'
                };
                console.log('🆕 Adding new volume bar:', volumeData);
                volumeSeries.update(volumeData);
            }
        } else {
            // 기존 1분봉 업데이트 - 기존 캔들 수정
            console.log('📝 UPDATE existing candle');
            // Use the last candle for updates within the same interval
            candleToUpdate = lastStoredCandle;
            candleIndex = candleData.length - 1;
            // Update with merged values
            newCandle.time = lastStoredCandle.time; // Keep original time
            newCandle.open = lastStoredCandle.open; // Keep original open
            newCandle.high = Math.max(lastStoredCandle.high, newCandle.high);
            newCandle.low = Math.min(lastStoredCandle.low, newCandle.low);
        }
        
        // If no exact match, check if this is an update for the current (latest) candle
        if (!candleToUpdate && lastStoredCandle) {
            const timeDiffSeconds = Math.abs(newCandle.time - lastStoredCandle.time);
            const intervalSeconds = getIntervalSeconds(currentInterval) || 60; // default 1 minute
            
            // For real-time updates: if the new data is within the current interval period, update the last candle
            // This ensures volume updates are applied to the current active candle
            if (timeDiffSeconds <= intervalSeconds) {
                candleToUpdate = lastStoredCandle;
                candleIndex = candleData.length - 1;
                // Preserve the existing candle time to maintain consistency
                newCandle.time = lastStoredCandle.time;
                // Merge OHLC values properly
                newCandle.open = lastStoredCandle.open; // Keep original open
                newCandle.high = Math.max(lastStoredCandle.high, newCandle.high);
                newCandle.low = Math.min(lastStoredCandle.low, newCandle.low);
                // Volume should be from the new data
                console.log(`📝 Updating current candle with new volume: ${newCandle.volume} (time diff: ${timeDiffSeconds}s)`);
            }
        }
        
        if (candleToUpdate) {
            // Update candle data array
            candleData[candleIndex] = newCandle;
            
            try {
                // 🚨 CRITICAL FIX: Create 100% safe object for TradingView
                const safeCandle = {
                    time: Number(newCandle.time),      // Force pure number conversion
                    open: Number(newCandle.open),      // Force pure number conversion
                    high: Number(newCandle.high),      // Force pure number conversion
                    low: Number(newCandle.low),        // Force pure number conversion
                    close: Number(newCandle.close)     // Force pure number conversion
                };
                
                // 🚨 Final validation - ensure all values are clean numbers
                if (!Number.isFinite(safeCandle.time) || safeCandle.time <= 0) {
                    throw new Error(`Invalid timestamp after conversion: ${safeCandle.time} (original: ${newCandle.time})`);
                }
                
                console.log('🛡️ Safe candle for TradingView:', {
                    time: safeCandle.time,
                    timeType: typeof safeCandle.time,
                    isFinite: Number.isFinite(safeCandle.time),
                    original: newCandle.time,
                    originalType: typeof newCandle.time
                });
                
                // 🚨 ULTIMATE FIX: Always use update() to avoid ALL time ordering issues
                console.log('🛡️ Using SAFE update method for TradingView chart');
                console.log('🛡️ Safe candle final check:', {
                    time: safeCandle.time,
                    type: typeof safeCandle.time,
                    isFinite: Number.isFinite(safeCandle.time),
                    toString: safeCandle.time.toString()
                });
                
                // 새 캔들인 경우와 기존 캔들 업데이트 구분
                if (isNewCandle) {
                    console.log('📊 Adding new candle to series');
                    candleSeries.update(safeCandle);
                } else {
                    console.log('📊 Updating existing candle in series');
                    candleSeries.update(safeCandle);
                    
                    // 기존 캔들 업데이트 시 볼륨도 함께 업데이트
                    if (volumeSeries) {
                        const isUp = newCandle.close >= newCandle.open;
                        const volumeData = {
                            time: safeCandle.time,
                            value: newCandle.volume || 0,
                            color: isUp ? '#00d68f' : '#ff5a5f'
                        };
                        console.log('📊 Updating volume for existing candle:', volumeData);
                        volumeSeries.update(volumeData);
                    }
                }
                console.log('✅ Candle series updated successfully with safe data');
            } catch (error) {
                console.warn('⚠️ Could not update candle series:', error.message);
                console.warn('⚠️ Problematic candle data:', newCandle);
                
                // 🚨 차트 데이터가 꼬였을 때 복구 시도
                if (error.message.includes('Cannot update oldest data') || 
                    error.message.includes('time') ||
                    error.message.includes('object Object')) {
                    console.log('🔧 CRITICAL: Attempting emergency chart data repair...');
                    console.log('🔧 Error details:', {
                        message: error.message,
                        candleTime: safeCandle.time,
                        candleTimeType: typeof safeCandle.time
                    });
                    
                    // Emergency: Try to convert to clean integer
                    try {
                        const emergencyCandle = {
                            time: Math.floor(Number(safeCandle.time)),
                            open: Number(safeCandle.open),
                            high: Number(safeCandle.high),
                            low: Number(safeCandle.low),
                            close: Number(safeCandle.close)
                        };
                        console.log('🚨 Emergency candle conversion:', emergencyCandle);
                        candleSeries.update(emergencyCandle);
                        console.log('✅ Emergency update successful!');
                    } catch (emergencyError) {
                        console.error('❌ Emergency update also failed:', emergencyError.message);
                        repairChartData();
                    }
                }
            }
            
            // Update volume if series exists OR recreate it
            if (!volumeSeries && chart) {
                console.warn('⚠️ Volume series missing, recreating...');
                try {
                    volumeSeries = chart.addHistogramSeries({
                        color: '#00c087',
                        priceFormat: {
                            type: 'volume',
                        },
                        priceScaleId: 'volume',
                        scaleMargins: {
                            top: 0.7,
                            bottom: 0,
                        },
                    });
                    console.log('✅ Volume series recreated');
                } catch (e) {
                    console.error('Failed to recreate volume series:', e);
                }
            }
            
            // 기존 캔들 업데이트 시에만 볼륨 업데이트 (새 캔들은 이미 위에서 처리함)
            if (volumeSeries && !isNewCandle) {
                // Use the exact candle time for volume update
                let volumeTime = newCandle.time;
                
                // 🚀 전문 트레이딩 실시간 볼륨 분석
                // 최근 20개 캔들의 평균 거래량 계산
                const recentCandles = candleData.slice(-20);
                const avgVolume = recentCandles.length > 0 ? 
                    recentCandles.reduce((sum, c) => sum + (c.volume || 0), 0) / recentCandles.length : 
                    newCandle.volume || 1;
                
                const relativeVolume = avgVolume > 0 ? (newCandle.volume || 0) / avgVolume : 1;
                const isUp = newCandle.close >= newCandle.open;
                const isHighVolume = relativeVolume > 1.5; // 평균 대비 150% 이상
                
                // 전문 트레이딩 색상 적용
                let color;
                if (isUp) {
                    color = isHighVolume ? '#00ff88' : '#00a05c'; // 강한/약한 매수
                } else {
                    color = isHighVolume ? '#ff4444' : '#cc2222'; // 강한/약한 매도
                }
                
                const volumeUpdate = {
                    time: Number(volumeTime), // 🚨 CRITICAL FIX: Force pure number conversion
                    value: Number(newCandle.volume) || 0,
                    color: color
                };
                
                console.log('🚀 Updating existing volume bar:', {
                    ...volumeUpdate,
                    relativeVolume: relativeVolume.toFixed(2),
                    isHighVolume,
                    trend: isUp ? 'UP' : 'DOWN'
                });
                
                try {
                    // 🚨 ULTIMATE FIX: Always use update() for volume to avoid time issues
                    console.log('🛡️ Using SAFE update method for volume chart');
                    console.log('🛡️ Volume update final check:', {
                        time: volumeUpdate.time,
                        type: typeof volumeUpdate.time,
                        isFinite: Number.isFinite(volumeUpdate.time),
                        value: volumeUpdate.value
                    });
                    
                    volumeSeries.update(volumeUpdate);
                    console.log('✅ Professional volume updated successfully');
                } catch (e) {
                    console.error('❌ Failed to update volume:', e);
                }
            } else {
                console.warn('⚠️ Volume series still not available');
            }
            
            // Update line chart if active
            if (currentChartType === 'line' && lineSeries) {
                const lineData = { 
                    time: Number(newCandle.time), // 🚨 CRITICAL FIX: Force pure number conversion
                    value: Number(newCandle.close) 
                };
                try {
                    // 🚨 ULTIMATE FIX: Always use update() for line chart
                    console.log('🛡️ Using SAFE update method for line chart');
                    lineSeries.update(lineData);
                    console.log('✅ Line chart updated successfully');
                } catch (e) {
                    console.error('❌ Failed to update line chart:', e);
                }
            }
        } else {
            // Log when candle is ignored (too old or doesn't match criteria)
            console.log(`🔍 Candle not processed - timestamp: ${newCandle.time}, lastStored: ${lastStoredCandle?.time}`);
            
            // Force update the most recent candle if volume is significantly different
            if (lastStoredCandle && Math.abs(newCandle.volume - lastStoredCandle.volume) > 0.01) {
                console.log(`🔄 Force updating volume due to significant change: ${lastStoredCandle.volume} → ${newCandle.volume}`);
                
                // Update the volume of the most recent candle with professional logic
                if (volumeSeries) {
                    // 전문 트레이딩 볼륨 분석 적용
                    const recentCandles = candleData.slice(-20);
                    const avgVolume = recentCandles.length > 0 ? 
                        recentCandles.reduce((sum, c) => sum + (c.volume || 0), 0) / recentCandles.length : 
                        newCandle.volume || 1;
                    
                    const relativeVolume = avgVolume > 0 ? (newCandle.volume || 0) / avgVolume : 1;
                    const isUp = newCandle.close >= newCandle.open;
                    const isHighVolume = relativeVolume > 1.5;
                    
                    let color;
                    if (isUp) {
                        color = isHighVolume ? '#00ff88' : '#00a05c';
                    } else {
                        color = isHighVolume ? '#ff4444' : '#cc2222';
                    }
                    
                    const volumeUpdate = {
                        time: parseInt(lastStoredCandle.time), // Ensure it's an integer
                        value: parseFloat(newCandle.volume) || 0,
                        color: color
                    };
                    
                    try {
                        volumeSeries.update(volumeUpdate);
                        console.log('✅ Professional force volume update successful:', volumeUpdate.value);
                    } catch (e) {
                        console.error('❌ Force volume update failed:', e);
                    }
                }
            }
            
            return; // Skip adding new candle for old timestamps
        }
        
        // Update current price
        currentPrice = newCandle.close;
        
        console.log(`✅ [${funcTimestamp}] updateRealtimeCandleData COMPLETED successfully`);
        
    } catch (error) {
        console.error(`❌ [${funcTimestamp}] Error updating real-time candle:`, error);
    }
}

// Update volume from 1-minute candle data
function updateVolumeFromOneMinute(oneMinuteData) {
    try {
        if (!volumeSeries || !candleData || candleData.length === 0) {
            return;
        }
        
        const lastCandle = candleData[candleData.length - 1];
        if (!lastCandle) return;
        
        // Update volume for the current candle
        const volumeValue = parseFloat(oneMinuteData.volume) || 0;
        const isUp = lastCandle.close >= lastCandle.open;
        
        const volumeUpdate = {
            time: lastCandle.time,
            value: volumeValue,
            color: isUp ? '#00d68f' : '#ff5a5f'
        };
        
        console.log('📊 Updating volume from 1m data:', {
            time: lastCandle.time,
            volume: volumeValue,
            currentInterval
        });
        
        volumeSeries.update(volumeUpdate);
        
    } catch (error) {
        console.error('Error updating volume from 1m data:', error);
    }
}

// Update real-time candle (for price updates only - volume comes from candle_update)
function updateRealtimeCandle(price) {
    try {
        if (!chartInitialized || !candleSeries || !chart || !candleData || candleData.length === 0) {
            console.log('Chart not fully initialized for real-time updates');
            return;
        }
        
        // Check for null or invalid price
        if (price === null || price === undefined || isNaN(price) || price <= 0) {
            console.warn('Invalid price for candle update:', price);
            return;
        }
        // Get the last candle
        const lastCandle = candleData[candleData.length - 1];
        
        if (!lastCandle) {
            console.warn('No candle data available for update');
            return;
        }
        
        // SAFER APPROACH: Use time-based threshold with buffer
        const intervalSeconds = getIntervalSeconds(currentInterval);
        const currentTimeUTC = Math.floor(Date.now() / 1000);
        
        // Calculate how much time has passed since last candle
        // lastCandle.time is in seconds (TradingView format), convert to match currentTimeUTC
        const timeSinceLastCandle = currentTimeUTC - lastCandle.time;
        const intervalProgress = timeSinceLastCandle / intervalSeconds;
        
        // Create new candle if we're past 80% of interval + some buffer time
        // This accounts for network delays and clock differences
        const THRESHOLD = 0.8; // 80% of interval
        const BUFFER_SECONDS = 10; // 10 second buffer
        const shouldCreateNewCandle = (intervalProgress >= THRESHOLD) || 
                                     (timeSinceLastCandle >= intervalSeconds + BUFFER_SECONDS);
        
        let candleTime;
        if (shouldCreateNewCandle) {
            // Next candle time = last candle time + interval
            candleTime = lastCandle.time + intervalSeconds;
        } else {
            // Continue updating existing candle
            candleTime = lastCandle.time;
        }
        
        // Debug: Convert timestamps to readable dates
        // lastCandle.time is already in seconds (TradingView format)
        const lastCandleDate = new Date(lastCandle.time * 1000).toISOString();
        const currentCandleDate = new Date(candleTime * 1000).toISOString();
        const nowDate = new Date().toISOString();
        
        // Only log debug info if there's an issue or when creating new candles
        if (shouldCreateNewCandle || timeSinceLastCandle < 0) {
            console.log('🕐 Candle time calculation debug:');
            console.log('   Current real time:', nowDate);
            console.log('   Last candle time:', lastCandle.time, '(seconds) →', lastCandleDate);
            console.log('   Time since last candle:', timeSinceLastCandle, 'seconds');
            console.log('   Interval progress:', (intervalProgress * 100).toFixed(1) + '%');
            console.log('   Should create new candle:', shouldCreateNewCandle);
        }
        
        // Check if we need to create a new candle or update existing one  
        if (shouldCreateNewCandle) {
            // Create new candle for new time period
            console.log('🆕 Creating new candle for time:', candleTime);
            const newCandle = {
                time: candleTime,
                open: price,
                high: price,
                low: price,
                close: price,
                volume: 0 // 🚫 거래량은 OKX API에서만 가져오기 - 0으로 초기화
            };
            
            candleData.push(newCandle);
            candleSeries.update(newCandle);
            
            // 🚫 거래량은 OKX API candle_update 메시지를 통해서만 업데이트
            
            // Update line chart if active
            if (currentChartType === 'line' && lineSeries) {
                lineSeries.update({
                    time: candleTime,
                    value: price
                });
            }
            
            return; // Exit early as we created a new candle
        }
        
        console.log('🔄 Updating existing candle with time:', lastCandle.time, 'Current price:', price);
        
        // Validate all required candle properties
        if (!lastCandle.time) {
            console.warn('Last candle missing time property:', lastCandle);
            return;
        }
        
        if (!lastCandle.open || !lastCandle.high || !lastCandle.low || 
            lastCandle.open <= 0 || lastCandle.high <= 0 || lastCandle.low <= 0) {
            console.warn('Invalid last candle data:', lastCandle);
            return;
        }
        
        // Additional validation for null values
        if (lastCandle.open == null || lastCandle.high == null || 
            lastCandle.low == null || lastCandle.close == null) {
            console.warn('Last candle has null values:', lastCandle);
            return;
        }
        
        // Update the last candle with new price
        const parsedOpen = parseFloat(lastCandle.open);
        const parsedHigh = parseFloat(lastCandle.high);
        const parsedLow = parseFloat(lastCandle.low);
        const parsedPrice = parseFloat(price);
        
        // Check for parsing failures
        if (isNaN(parsedOpen) || isNaN(parsedHigh) || isNaN(parsedLow) || isNaN(parsedPrice)) {
            console.warn('Failed to parse candle values:', {
                open: lastCandle.open,
                high: lastCandle.high,
                low: lastCandle.low,
                price: price
            });
            return;
        }
        
        // Create a safe copy of the updated candle data
        // Keep existing volume (don't accumulate from price updates)
        const updatedCandle = {
            time: Number(lastCandle.time),
            open: Number(parsedOpen),
            high: Number(Math.max(parsedHigh, parsedPrice)),
            low: Number(Math.min(parsedLow, parsedPrice)),
            close: Number(parsedPrice),
            volume: lastCandle.volume || 0 // Keep existing volume
        };
        
        // Verify all values are valid numbers
        const requiredKeys = ['time', 'open', 'high', 'low', 'close'];
        for (const key of requiredKeys) {
            if (!Number.isFinite(updatedCandle[key])) {
                console.error(`updatedCandle.${key} is not a finite number:`, updatedCandle[key]);
                return;
            }
        }
        
        // Update candleData array
        candleData[candleData.length - 1] = updatedCandle;
        
        // Update the chart
        candleSeries.update(updatedCandle);
        
        // Don't update volume here - volume comes from candle_update WebSocket events
        
        // Update line chart if active
        if (currentChartType === 'line' && lineSeries) {
            lineSeries.update({
                time: updatedCandle.time,
                value: updatedCandle.close
            });
        }
        
    } catch (error) {
        console.error('Error in updateRealtimeCandle:', error);
    }
}

// Helper function to get interval in seconds
function getIntervalSeconds(interval) {
    switch(interval) {
        case '1m': return 60;
        case '5m': return 300;
        case '15m': return 900;
        case '1h': return 3600;
        case '4h': return 14400;
        case '1d': return 86400;
        default: return 60; // Default to 1 minute
    }
}

// Helper function to align time to interval boundaries
function alignTimeToInterval(timestamp, interval) {
    const intervalSeconds = getIntervalSeconds(interval);
    return Math.floor(timestamp / intervalSeconds) * intervalSeconds;
}

// Switch timeframe
function switchTimeframe(interval) {
    try {
        console.log('🔄 Updating existing candle with time:', candleTime, 'Current price:', price);
        
        // Validate all required candle properties
        if (!lastCandle.time) {
            console.warn('Last candle missing time property:', lastCandle);
            return;
        }
        
        if (!lastCandle.open || !lastCandle.high || !lastCandle.low || 
            lastCandle.open <= 0 || lastCandle.high <= 0 || lastCandle.low <= 0) {
            console.warn('Invalid last candle data:', lastCandle);
            return;
        }
        
        // Additional validation for null values
        if (lastCandle.open == null || lastCandle.high == null || 
            lastCandle.low == null || lastCandle.close == null) {
            console.warn('Last candle has null values:', lastCandle);
            return;
        }
        
        // Update the last candle with new price
        const parsedOpen = parseFloat(lastCandle.open);
        const parsedHigh = parseFloat(lastCandle.high);
        const parsedLow = parseFloat(lastCandle.low);
        const parsedPrice = parseFloat(price);
        
        // Check for parsing failures
        if (isNaN(parsedOpen) || isNaN(parsedHigh) || isNaN(parsedLow) || isNaN(parsedPrice)) {
            console.warn('Failed to parse candle values:', {
                open: lastCandle.open,
                high: lastCandle.high,
                low: lastCandle.low,
                price: price
            });
            return;
        }
        
        // Create a safe copy of the updated candle data
        // Keep existing volume (don't accumulate from price updates)
        const updatedCandle = {
            time: Number(lastCandle.time),
            open: Number(parsedOpen),
            high: Number(Math.max(parsedHigh, parsedPrice)),
            low: Number(Math.min(parsedLow, parsedPrice)),
            close: Number(parsedPrice),
            volume: lastCandle.volume || 0 // Keep existing volume
        };
        
        // Verify all values are valid numbers
        const requiredKeys = ['time', 'open', 'high', 'low', 'close'];
        for (const key of requiredKeys) {
            if (!Number.isFinite(updatedCandle[key])) {
                console.error(`updatedCandle.${key} is not a finite number:`, updatedCandle[key]);
                return;
            }
        }
        
        // Detailed validation logging (temporarily disabled to reduce noise)
        // console.log('Validating candle update:', {
        //     candleSeries: !!candleSeries,
        //     updatedCandle: updatedCandle,
        //     time: updatedCandle?.time,
        //     open: updatedCandle?.open,
        //     high: updatedCandle?.high,
        //     low: updatedCandle?.low,
        //     close: updatedCandle?.close
        // });

        // Final validation before chart update
        if (!candleSeries) {
            console.error('candleSeries is null or undefined');
            return;
        }
        
        if (!updatedCandle) {
            console.error('updatedCandle is null or undefined');
            return;
        }
        
        if (!updatedCandle.time) {
            console.error('updatedCandle.time is null or undefined:', updatedCandle.time);
            return;
        }
        
        // Validate time format (should be a number for lightweight-charts)
        if (typeof updatedCandle.time !== 'number') {
            console.error('updatedCandle.time is not a number:', typeof updatedCandle.time, updatedCandle.time);
            return;
        }
        
        if (updatedCandle.time <= 0) {
            console.error('updatedCandle.time is not positive:', updatedCandle.time);
            return;
        }
        
        // Check for null/undefined values
        const values = ['open', 'high', 'low', 'close'];
        for (const key of values) {
            if (updatedCandle[key] == null) {
                console.error(`updatedCandle.${key} is null or undefined:`, updatedCandle[key]);
                return;
            }
            if (isNaN(updatedCandle[key])) {
                console.error(`updatedCandle.${key} is NaN:`, updatedCandle[key]);
                return;
            }
            if (updatedCandle[key] <= 0) {
                console.error(`updatedCandle.${key} is not positive:`, updatedCandle[key]);
                return;
            }
        }
        
        // Check high >= low
        if (updatedCandle.high < updatedCandle.low) {
            console.error('High is less than low:', updatedCandle.high, updatedCandle.low);
            return;
        }
        
        try {
            // Double check series is still valid before update
            if (!candleSeries || typeof candleSeries.update !== 'function') {
                console.error('candleSeries is invalid or update method missing');
                return;
            }
            
            // Create a clean object to prevent reference issues
            const cleanCandle = JSON.parse(JSON.stringify(updatedCandle));
            candleSeries.update(cleanCandle);
        } catch (error) {
            console.error('Error updating candle series:', error);
            console.error('Original candle data:', JSON.stringify(updatedCandle, null, 2));
            // Don't retry, just log and continue
            return;
        }
            
            // Update the stored data
            candleData[candleData.length - 1] = {
                ...lastCandle,
                high: Math.max(lastCandle.high, price),
                low: Math.min(lastCandle.low, price),
                close: price
            };
    } catch (error) {
        console.error('Error updating candle:', error);
    }
}

// Switch timeframe
function switchTimeframe(interval) {
    currentInterval = interval;
    
    // 🚨 시간프레임 변경 시 볼륨 데이터 플래그 리셋
    volumeDataLoaded = false;
    
    // Clean up any legacy global volume tracking variables
    cleanupVolumeTracking();
    
    // Update button states (updated for new UI)
    document.querySelectorAll('.tf-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.interval === interval);
    });
    
    // Reset chart initialization state and load new candle data
    chartInitialized = false;
    loadCandles(interval);
}

// Clean up legacy volume tracking variables
function cleanupVolumeTracking() {
    if (typeof window.lastVol24h !== 'undefined') {
        delete window.lastVol24h;
    }
    if (typeof window.currentCandleVolume !== 'undefined') {
        delete window.currentCandleVolume;
    }
    console.log('🧹 Cleaned up volume tracking variables');
}

// Switch chart bottom tabs
function switchChartBottomTab(tab) {
    // Update tab active state
    document.querySelectorAll('.chart-bottom-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.tab === tab);
    });
    
    // Update panel active state
    document.querySelectorAll('.chart-bottom-panel').forEach(p => {
        p.classList.toggle('active', p.id === `${tab}-panel`);
    });
}

// Switch chart type
function switchChartType(type) {
    currentChartType = type;
    
    // Update button states
    document.querySelectorAll('.chart-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    
    if (!chart) return;
    
    // Toggle between candle and line series
    if (type === 'line') {
        if (candleSeries) {
            candleSeries.applyOptions({ visible: false });
        }
        if (volumeSeries) {
            volumeSeries.applyOptions({ visible: false });
        }
        
        // Create line series if not exists
        if (!lineSeries) {
            lineSeries = chart.addLineSeries({
                color: '#58a6ff',
                lineWidth: 2,
            });
        }
        
        // Convert candle data to line data
        if (candleData && candleData.length > 0) {
            const lineData = candleData
                .filter(candle => candle && candle.time && candle.close != null && !isNaN(candle.close))
                .map(candle => ({
                    time: candle.time,
                    value: candle.close // Already in USDT
                }));
            
            if (lineSeries && lineData.length > 0) {
                lineSeries.setData(lineData);
            }
        }
        
        lineSeries.applyOptions({ visible: true });
    } else {
        if (lineSeries) {
            lineSeries.applyOptions({ visible: false });
        }
        if (candleSeries) {
            candleSeries.applyOptions({ visible: true });
        }
        if (volumeSeries) {
            volumeSeries.applyOptions({ visible: true });
        }
    }
}

// Calculate buy total
function updateBuyTotal() {
    const amount = parseFloat(document.getElementById('buy-amount').value) || 0;
    const total = amount * currentPrice; // currentPrice is already in USDT
    document.getElementById('buy-total').value = '$' + total.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    
    // Update fee info display based on order type
    const orderType = document.querySelector('.order-type-btn.active')?.dataset.type || 'market';
    const feeRate = orderType === 'limit' ? getTradingFee('maker') : getTradingFee('taker');
    const feeType = orderType === 'limit' ? 'Maker' : 'Taker';
    
    const feeInfoElement = document.getElementById('spot-buy-fee-info');
    if (feeInfoElement && total > 0) {
        const fee = total * feeRate;
        feeInfoElement.textContent = `Fee: $${fee.toFixed(4)} (${(feeRate * 100).toFixed(3)}% ${feeType})`;
    } else if (feeInfoElement) {
        feeInfoElement.textContent = `Fee: ${(feeRate * 100).toFixed(3)}% (${feeType})`;
    }
}

// Calculate sell total
function updateSellTotal() {
    const amount = parseFloat(document.getElementById('sell-amount').value) || 0;
    const total = amount * currentPrice; // currentPrice is already in USDT
    document.getElementById('sell-total').value = '$' + total.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    
    // Update fee info display based on order type
    const orderType = document.querySelector('.order-type-btn.active')?.dataset.type || 'market';
    const feeRate = orderType === 'limit' ? getTradingFee('maker') : getTradingFee('taker');
    const feeType = orderType === 'limit' ? 'Maker' : 'Taker';
    
    const feeInfoElement = document.getElementById('spot-sell-fee-info');
    if (feeInfoElement && total > 0) {
        const fee = total * feeRate;
        feeInfoElement.textContent = `Fee: $${fee.toFixed(4)} (${(feeRate * 100).toFixed(3)}% ${feeType})`;
    } else if (feeInfoElement) {
        feeInfoElement.textContent = `Fee: ${(feeRate * 100).toFixed(3)}% (${feeType})`;
    }
}

// Calculate position size for leverage
function updatePositionSize() {
    const amountInUSD = parseFloat(document.getElementById('leverage-amount').value) || 0;
    const leverage = parseInt(document.getElementById('leverage-select').value);
    const positionSize = amountInUSD * leverage;
    
    // Calculate and display fees
    const tradingFee = getTradingFee('taker');
    const openingFee = positionSize * tradingFee;
    const closingFee = positionSize * tradingFee;
    const totalFees = openingFee + closingFee;
    
    // Update position size display
    document.getElementById('position-size').value = '$' + positionSize.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    
    // Update fee info display if it exists
    const feeInfoElement = document.getElementById('leverage-fee-info');
    if (feeInfoElement) {
        feeInfoElement.textContent = `Fees: Open $${openingFee.toFixed(2)} + Close $${closingFee.toFixed(2)} = $${totalFees.toFixed(2)} (${(tradingFee * 100).toFixed(3)}% each way)`;
    }
}

// Execute buy order
function executeBuy() {
    const amount = parseFloat(document.getElementById('buy-amount').value);
    
    if (!amount || amount <= 0) {
        showToast('Please enter valid amount', 'error');
        return;
    }
    
    if (!currentPrice || currentPrice <= 0) {
        showToast('Price data not available. Please wait for connection...', 'error');
        return;
    }
    
    // Check order type (market or limit)
    const orderType = document.querySelector('.order-type-btn.active')?.dataset.type || 'market';
    const feeRate = orderType === 'limit' ? getTradingFee('maker') : getTradingFee('taker');
    
    const totalCost = amount * currentPrice;
    const fee = totalCost * feeRate;
    const totalWithFee = totalCost + fee;
    const [crypto] = currentMarket.split('/');
    
    if (totalWithFee > usdBalance) {
        showToast('Insufficient balance (including fees)', 'error');
        return;
    }
    
    // Execute trade
    usdBalance -= totalWithFee;
    if (crypto === 'ETH') {
        ethBalance += amount;
    } else {
        btcBalance += amount;
    }
    currentCryptoBalance = crypto === 'ETH' ? ethBalance : btcBalance;
    
    // Record transaction
    const transaction = {
        type: 'buy',
        market: currentMarket,
        amount: amount,
        price: currentPrice,
        total: totalCost,
        fee: fee,
        time: new Date().toISOString()
    };
    transactions.push(transaction);
    
    // Update average price line
    updateAveragePriceLine();
    
    // Update UI
    updateUI();
    addTransactionToHistory(transaction);
    
    // Save user data
    saveUserData();
    
    // Clear input
    document.getElementById('buy-amount').value = '';
    document.getElementById('buy-total').value = '';
    
    showToast(`✅ Bought ${amount.toFixed(8)} ${crypto} at $${currentPrice.toFixed(2)}`, 'success');
    
    // Play buy sound
    playTradingSound('buy');
}

// Execute sell order
function executeSell() {
    const amount = parseFloat(document.getElementById('sell-amount').value);
    const [crypto] = currentMarket.split('/');
    
    if (!amount || amount <= 0) {
        showToast('Please enter valid amount', 'error');
        return;
    }
    
    if (!currentPrice || currentPrice <= 0) {
        showToast('Price data not available. Please wait for connection...', 'error');
        return;
    }
    
    const cryptoBalance = crypto === 'ETH' ? ethBalance : btcBalance;
    if (amount > cryptoBalance) {
        showToast(`Insufficient ${crypto} balance`, 'error');
        return;
    }
    
    // Check order type (market or limit)
    const orderType = document.querySelector('.order-type-btn.active')?.dataset.type || 'market';
    const feeRate = orderType === 'limit' ? getTradingFee('maker') : getTradingFee('taker');
    
    const totalRevenue = amount * currentPrice;
    const fee = totalRevenue * feeRate;
    const totalAfterFee = totalRevenue - fee;
    
    // Execute trade
    if (crypto === 'ETH') {
        ethBalance -= amount;
    } else {
        btcBalance -= amount;
    }
    currentCryptoBalance = crypto === 'ETH' ? ethBalance : btcBalance;
    usdBalance += totalAfterFee;
    
    // Record transaction
    const transaction = {
        type: 'sell',
        market: currentMarket,
        amount: amount,
        price: currentPrice,
        total: totalRevenue,
        fee: fee,
        time: new Date().toISOString()
    };
    transactions.push(transaction);
    
    // Update average price line
    updateAveragePriceLine();
    
    // Update UI
    updateUI();
    addTransactionToHistory(transaction);
    
    // Save user data
    saveUserData();
    
    // Clear input
    document.getElementById('sell-amount').value = '';
    document.getElementById('sell-total').value = '';
    
    showToast(`✅ Sold ${amount.toFixed(8)} ${crypto} at $${currentPrice.toFixed(2)}`, 'success');
    
    // Play sell sound
    playTradingSound('sell');
}

// Open leverage position
function openLeveragePosition() {
    const amount = parseFloat(document.getElementById('leverage-amount').value);
    const leverage = parseInt(document.getElementById('leverage-select').value);
    const positionTypeElement = document.querySelector('.position-btn.active');
    
    if (!positionTypeElement) {
        showToast('Please select Long or Short position', 'error');
        return;
    }
    
    const positionType = positionTypeElement.dataset.position;
    
    if (!amount || amount <= 0) {
        showToast('Please enter valid amount', 'error');
        return;
    }
    
    if (!currentPrice || currentPrice <= 0) {
        showToast('Price data not available. Please wait for connection...', 'error');
        return;
    }
    
    if (isNaN(leverage) || leverage <= 0) {
        showToast('Please select valid leverage', 'error');
        return;
    }
    
    // Calculate trading fee (taker fee for market orders)
    const tradingFee = getTradingFee('taker');
    const positionSize = amount * leverage;
    const openingFee = positionSize * tradingFee;
    const totalRequired = amount + openingFee;
    
    if (totalRequired > usdBalance) {
        showToast(`Insufficient balance (Margin $${amount.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} + Fee $${openingFee.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})`, 'error');
        return;
    }
    
    // Deduct margin and opening fee from balance
    usdBalance -= totalRequired;
    
    // Check if there's an existing position with same type, leverage, and market
    const existingPositionIndex = leveragePositions.findIndex(p => 
        p.type === positionType && p.leverage === leverage && p.market === currentMarket
    );
    
    if (existingPositionIndex !== -1) {
        // Averaging existing position (DCA)
        const existingPosition = leveragePositions[existingPositionIndex];
        
        // Calculate weighted average entry price
        const totalSize = existingPosition.size + positionSize;
        const weightedEntryPrice = (
            (existingPosition.entryPrice * existingPosition.size) + 
            (currentPrice * positionSize)
        ) / totalSize;
        
        // Update existing position
        existingPosition.margin += amount;
        existingPosition.size = totalSize;
        existingPosition.entryPrice = weightedEntryPrice;
        existingPosition.openingFee += openingFee;
        
        // Recalculate P&L with new weighted entry price
        const priceChange = currentPrice - existingPosition.entryPrice;
        const pnlMultiplier = existingPosition.type === 'long' ? 1 : -1;
        const rawPnl = (priceChange / existingPosition.entryPrice) * existingPosition.size * pnlMultiplier;
        existingPosition.pnl = rawPnl - existingPosition.openingFee;
        existingPosition.pnlPercent = (existingPosition.pnl / existingPosition.margin) * 100;
        
        const actionType = existingPosition.pnl >= 0 ? 'Pyramid' : 'Average Down';
        showToast(`${actionType} complete! Average entry: $${weightedEntryPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, 'info');
        
        // Play leverage sound for DCA
        playTradingSound('leverage');
    } else {
        // Create new position
        const position = {
            id: Date.now(),
            type: positionType,
            margin: amount,
            leverage: leverage,
            size: positionSize,
            entryPrice: currentPrice,
            currentPrice: currentPrice,
            market: currentMarket, // Store which market this position is for
            openingFee: openingFee,
            tradingFeeRate: tradingFee,
            pnl: -openingFee, // Start with negative P&L due to opening fee
            pnlPercent: 0,
            time: new Date().toISOString()
        };
        
        leveragePositions.push(position);
        showToast(`🚀 ${positionType.toUpperCase()} position opened: $${positionSize.toFixed(2)} (${leverage}x)`, 'success');
        
        // Play leverage sound
        playTradingSound('leverage');
    }
    
    // Update UI
    updateUI();
    updateLeveragePositionsDisplay();
    updateLeveragePositionLines(); // Add position line to chart
    
    // Save user data
    saveUserData();
    
    // Clear input
    document.getElementById('leverage-amount').value = '';
    document.getElementById('position-size').value = '';
}

// Close leverage position
function closeLeveragePosition(positionId, percentage = 100) {
    const positionIndex = leveragePositions.findIndex(p => p.id === positionId);
    
    if (positionIndex === -1) return;
    
    const position = leveragePositions[positionIndex];
    const closeRatio = percentage / 100;
    
    // Get the correct price for this position's market
    const positionMarket = position.market || currentMarket;
    const positionPrice = marketPrices[positionMarket] || currentPrice;
    
    // Calculate P&L for the portion being closed
    const priceChange = positionPrice - position.entryPrice;
    const pnlMultiplier = position.type === 'long' ? 1 : -1;
    const rawPnl = (priceChange / position.entryPrice) * position.size * pnlMultiplier * closeRatio;
    
    // Calculate fees (proportional opening fee + closing fee)
    const proportionalOpeningFee = position.openingFee * closeRatio;
    const closingPositionSize = position.size * closeRatio;
    const closingFee = closingPositionSize * getTradingFee('taker');
    const totalFees = proportionalOpeningFee + closingFee;
    const finalPnl = rawPnl - totalFees;
    
    // Validation log for debugging
    console.log(`Partial close fee calculation:
        - Total position size: $${position.size.toLocaleString()}
        - Close ratio: ${percentage}%
        - Original opening fee: $${position.openingFee.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
        - Proportional opening fee: $${proportionalOpeningFee.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
        - Closing fee: $${closingFee.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
        - Total fees: $${totalFees.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
        - Raw P&L: $${rawPnl.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
        - Final P&L: $${finalPnl.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
    
    // Return proportional margin + final P&L
    const returnedMargin = position.margin * closeRatio;
    usdBalance += returnedMargin + finalPnl;
    
    // Record transaction
    const transaction = {
        type: `close_${position.type}`,
        leverage: position.leverage,
        pnl: finalPnl,
        rawPnl: rawPnl,
        openingFee: proportionalOpeningFee,
        closingFee: closingFee,
        totalFees: totalFees,
        entryPrice: position.entryPrice,
        exitPrice: currentPrice,
        percentage: percentage,
        time: new Date().toISOString()
    };
    transactions.push(transaction);
    
    if (percentage === 100) {
        // Close entire position
        leveragePositions.splice(positionIndex, 1);
    } else {
        // Partially close position - reduce size, margin, and opening fee
        position.size *= (1 - closeRatio);
        position.margin *= (1 - closeRatio);
        position.openingFee *= (1 - closeRatio);
    }
    
    // Close dropdown menu
    const dropdown = document.getElementById(`close-menu-${positionId}`);
    const dropdownContainer = dropdown?.closest('.position-close-dropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
        dropdownContainer?.classList.remove('active');
    }
    
    // Update UI
    updateUI();
    updateLeveragePositionsDisplay();
    updateLeveragePositionLines();
    addTransactionToHistory(transaction);
    
    // Save user data
    saveUserData();
    
    const statusText = percentage === 100 ? 'Full Close' : `${percentage}% Close`;
    showToast(`Position ${statusText} - P&L: $${finalPnl.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} (Fees: $${totalFees.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})})`, finalPnl >= 0 ? 'success' : 'error');
    
    // Play close position sound (profit = sell sound, loss = different sound)
    if (finalPnl >= 0) {
        playTradingSound('sell'); // Profit - use sell sound
    } else {
        playTradingSound('loss'); // Loss - use special loss sound
    }
}

// Toggle close dropdown menu
function toggleCloseDropdown(positionId) {
    const dropdown = document.getElementById(`close-menu-${positionId}`);
    const dropdownContainer = dropdown?.closest('.position-close-dropdown');
    if (!dropdown || !dropdownContainer) return;
    
    // Close all other dropdowns first
    document.querySelectorAll('.close-dropdown-menu').forEach(menu => {
        if (menu.id !== `close-menu-${positionId}`) {
            menu.style.display = 'none';
            menu.closest('.position-close-dropdown')?.classList.remove('active');
        }
    });
    
    // Toggle current dropdown
    const isOpen = dropdown.style.display === 'block';
    dropdown.style.display = isOpen ? 'none' : 'block';
    
    // Add/remove active class to maintain button style
    if (isOpen) {
        dropdownContainer.classList.remove('active');
    } else {
        dropdownContainer.classList.add('active');
    }
    
    // Close dropdown when clicking outside
    if (!isOpen) {
        setTimeout(() => {
            document.addEventListener('click', function closeOnOutsideClick(e) {
                if (!e.target.closest('.position-close-dropdown')) {
                    dropdown.style.display = 'none';
                    dropdownContainer.classList.remove('active');
                    document.removeEventListener('click', closeOnOutsideClick);
                }
            });
        }, 0);
    }
}

// Update leverage positions P&L and check for liquidations
function updateLeveragePositions() {
    // Create a copy to iterate safely (in case positions are removed during iteration)
    const positionsToCheck = [...leveragePositions];
    
    positionsToCheck.forEach((position, index) => {
        // Get the correct price for this position's market
        const positionMarket = position.market || currentMarket; // Fallback for old positions
        const positionPrice = marketPrices[positionMarket] || currentPrice; // Fallback to current price
        
        const priceChange = positionPrice - position.entryPrice;
        const pnlMultiplier = position.type === 'long' ? 1 : -1;
        const rawPnl = (priceChange / position.entryPrice) * position.size * pnlMultiplier;
        
        // Calculate unrealized P&L (only include opening fee, closing fee applied when actually closing)
        position.currentPrice = positionPrice;
        position.pnl = rawPnl - position.openingFee; // Only subtract opening fee for unrealized P&L
        position.pnlPercent = (position.pnl / position.margin) * 100;
        
        // Calculate liquidation price and margin ratio
        position.liquidationPrice = calculateLiquidationPrice(position);
        position.marginRatio = ((position.margin + position.pnl) / position.size) * position.leverage;
        
        // Check for liquidation
        if (checkShouldLiquidate(position)) {
            forceLiquidation(position);
            return; // Skip display update since position was removed
        }
        
        // Check for margin call warning
        if (position.marginRatio < 0.02) { // 2% margin ratio warning
            showMarginCallWarning(position);
        }
        
        // Update only P&L display without rebuilding entire DOM
        const remainingIndex = leveragePositions.findIndex(p => p.id === position.id);
        if (remainingIndex !== -1) {
            updatePositionPnlDisplay(position, remainingIndex);
        }
    });
}

// Calculate liquidation price for a position
function calculateLiquidationPrice(position) {
    const maintenanceMarginRate = 0.005; // 0.5% maintenance margin
    const feeRate = position.tradingFeeRate || getTradingFee('taker');
    
    if (position.type === 'long') {
        // For long positions: liquidation when price falls below this level
        return position.entryPrice * (1 - 1/position.leverage + maintenanceMarginRate + feeRate);
    } else {
        // For short positions: liquidation when price rises above this level
        return position.entryPrice * (1 + 1/position.leverage + maintenanceMarginRate + feeRate);
    }
}

// Check if position should be liquidated
function checkShouldLiquidate(position) {
    const liquidationPrice = position.liquidationPrice;
    
    // Get the correct price for this position's market
    const positionMarket = position.market || currentMarket;
    const positionPrice = marketPrices[positionMarket] || currentPrice;
    
    if (position.type === 'long') {
        return positionPrice <= liquidationPrice;
    } else {
        return positionPrice >= liquidationPrice;
    }
}

// Force liquidation of a position
function forceLiquidation(position) {
    // Get the correct price for this position's market
    const positionMarket = position.market || currentMarket;
    const positionPrice = marketPrices[positionMarket] || currentPrice;
    
    console.log(`🚨 LIQUIDATION: ${position.type} ${position.leverage}x position at $${positionPrice} (${positionMarket})`);
    
    // Calculate total loss (entire margin + any additional loss)
    const totalLoss = -position.margin;
    
    // Apply loss to balance
    usdBalance += totalLoss; // This will reduce balance
    
    // Remove position from array
    const index = leveragePositions.findIndex(p => p.id === position.id);
    if (index !== -1) {
        leveragePositions.splice(index, 1);
    }
    
    // Create liquidation transaction record
    const liquidationTransaction = {
        type: 'liquidation',
        market: currentMarket,
        leverage: position.leverage,
        positionType: position.type,
        entryPrice: position.entryPrice,
        liquidationPrice: currentPrice,
        size: position.size,
        margin: position.margin,
        loss: totalLoss,
        time: new Date().toISOString()
    };
    
    // Add to transaction history
    transactions.unshift(liquidationTransaction);
    updateTransactionHistory();
    
    // Show liquidation alert
    showToast(`LIQUIDATION! ${position.type.toUpperCase()} ${position.leverage}x position liquidated. Loss: $${Math.abs(totalLoss).toFixed(2)}`, 'error', 8000);
    
    // Update displays
    updateLeveragePositionsDisplay();
    updateLeveragePositionLines();
    updateUI();
    
    // Save user data
    saveUserData();
    
    // Log liquidation details for debugging
    console.log('Liquidation Details:', {
        position: position,
        currentPrice: currentPrice,
        liquidationPrice: position.liquidationPrice,
        totalLoss: totalLoss,
        newBalance: usdBalance
    });
}

// Show margin call warning
function showMarginCallWarning(position) {
    if (!position.marginCallWarned) {
        position.marginCallWarned = true;
        const marginRatioPercent = (position.marginRatio * 100).toFixed(2);
        showToast(`MARGIN CALL! ${position.type.toUpperCase()} ${position.leverage}x position margin ratio is ${marginRatioPercent}% - Risk level!`, 'warning', 6000);
        
        setTimeout(() => {
            position.marginCallWarned = false; // Reset warning flag after 30 seconds
        }, 30000);
    }
}

// Update only P&L display for a specific position without rebuilding DOM
function updatePositionPnlDisplay(position, index) {
    const positionItems = document.querySelectorAll('.position-item');
    if (positionItems[index]) {
        const pnlElement = positionItems[index].querySelector('.position-pnl');
        if (pnlElement) {
            pnlElement.textContent = `$${position.pnl.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${position.pnlPercent.toFixed(2)}%)`;
            pnlElement.className = `position-pnl ${position.pnl >= 0 ? 'positive' : 'negative'}`;
        }
        
        // Update liquidation price display if element exists
        const liquidationElement = positionItems[index].querySelector('.liquidation-price');
        if (liquidationElement && position.liquidationPrice) {
            liquidationElement.textContent = `Liq: $${position.liquidationPrice.toFixed(2)}`;
        }
        
        // Update margin ratio display if element exists
        const marginRatioElement = positionItems[index].querySelector('.margin-ratio');
        if (marginRatioElement && position.marginRatio) {
            const marginRatioPercent = (position.marginRatio * 100).toFixed(1);
            marginRatioElement.textContent = `${marginRatioPercent}%`;
            marginRatioElement.className = `margin-ratio ${position.marginRatio < 0.02 ? 'danger' : position.marginRatio < 0.05 ? 'warning' : 'safe'}`;
        }
    }
}

// Update leverage positions display
function updateLeveragePositionsDisplay() {
    const container = document.getElementById('active-positions');
    
    if (leveragePositions.length === 0) {
        container.innerHTML = '<p class="empty-message-inline">No positions</p>';
        return;
    }
    
    container.innerHTML = leveragePositions.map(position => {
        // Determine risk level for styling
        const riskClass = position.marginRatio < 0.02 ? 'danger' : position.marginRatio < 0.05 ? 'warning' : '';
        
        return `
        <div class="position-item ${riskClass}">
            <div class="position-left">
                <div class="position-type-info">
                    <span class="position-type-label ${position.type}">${position.type.toUpperCase()}</span>
                    <span class="position-leverage">${position.leverage}x</span>
                    <span class="position-market-label">${position.market || 'BTC/USDT'}</span>
                </div>
                <div class="position-prices">
                    <span class="entry-price">Entry: $${position.entryPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                    <span class="liquidation-price">Liq: $${position.liquidationPrice ? position.liquidationPrice.toFixed(2) : 'calculating...'}</span>
                </div>
            </div>
            
            <div class="position-center">
                <div class="position-pnl ${position.pnl >= 0 ? 'positive' : 'negative'}">
                    ${position.pnl >= 0 ? '+' : ''}$${position.pnl.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${position.pnlPercent.toFixed(2)}%)
                </div>
            </div>
            
            <div class="position-right">
                <div class="margin-info">
                    <div class="margin-amount">$${position.margin.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                    <div class="margin-ratio ${position.marginRatio < 0.02 ? 'danger' : position.marginRatio < 0.05 ? 'warning' : 'safe'}">
                        ${position.marginRatio ? (position.marginRatio * 100).toFixed(1) + '%' : '-%'}
                    </div>
                    <span class="margin-label">Margin</span>
                </div>
                <div class="position-close-dropdown">
                    <button class="close-position-btn" data-position-id="${position.id}">Close</button>
                    <div class="close-dropdown-menu" id="close-menu-${position.id}">
                        <button class="close-option" data-position-id="${position.id}" data-percentage="25">25%</button>
                        <button class="close-option" data-position-id="${position.id}" data-percentage="50">50%</button>
                        <button class="close-option" data-position-id="${position.id}" data-percentage="100">100%</button>
                    </div>
                </div>
            </div>
        </div>
        `;
    }).join('');
}

// Update transaction history display
function updateTransactionHistory() {
    const container = document.getElementById('transaction-history');
    
    if (!container) return;
    
    if (transactions.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-receipt"></i><p>No trading history</p></div>';
        return;
    }
    
    // Show last 10 transactions
    const recentTransactions = transactions.slice(-10).reverse();
    
    container.innerHTML = recentTransactions.map(transaction => {
        const time = formatTimestampWithTimezone(Math.floor(new Date(transaction.time).getTime() / 1000));
        
        // Handle different transaction types safely
        let typeClass, typeText, content;
        
        if (transaction.type === 'buy' || transaction.type === 'sell') {
            // Spot trading transactions
            typeClass = transaction.type === 'buy' ? 'buy' : 'sell';
            typeText = transaction.type === 'buy' ? 'BUY' : 'SELL';
            
            const amount = transaction.amount || 0;
            const price = transaction.price || 0;
            const total = transaction.total || 0;
            
            content = `
                <div class="transaction-info">
                    <span class="transaction-type ${typeClass}">${typeText}</span>
                    <span class="transaction-amount">${amount.toFixed(8)} BTC</span>
                    <span class="transaction-price">@$${price.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                </div>
                <div class="transaction-details">
                    <span class="transaction-total">$${total.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                    <span class="transaction-time">${time}</span>
                </div>
            `;
        } else if (transaction.type?.startsWith('close_')) {
            // Leverage position close transactions
            const positionType = transaction.type.replace('close_', '');
            typeClass = positionType === 'long' ? 'buy' : 'sell';
            typeText = `CLOSE ${positionType.toUpperCase()}`;
            
            const pnl = transaction.pnl || 0;
            const leverage = transaction.leverage || 1;
            const percentage = transaction.percentage || 100;
            
            content = `
                <div class="transaction-info">
                    <span class="transaction-type ${typeClass}">${typeText}</span>
                    <span class="transaction-amount">${leverage}x Leverage</span>
                    <span class="transaction-price">${percentage}% Close</span>
                </div>
                <div class="transaction-details">
                    <span class="transaction-total ${pnl >= 0 ? 'positive' : 'negative'}">
                        ${pnl >= 0 ? '+' : ''}$${pnl.toLocaleString('en-US', {minimumFractionDigits: 2})}
                    </span>
                    <span class="transaction-time">${time}</span>
                </div>
            `;
        } else if (transaction.type === 'liquidation') {
            // Liquidation transactions
            typeClass = 'liquidation';
            typeText = '🚨 LIQUIDATED';
            
            const positionType = transaction.positionType || 'unknown';
            const leverage = transaction.leverage || 1;
            const entryPrice = transaction.entryPrice || 0;
            const liquidationPrice = transaction.liquidationPrice || 0;
            const loss = transaction.loss || 0;
            
            content = `
                <div class="transaction-info">
                    <span class="transaction-type liquidation">${typeText}</span>
                    <span class="transaction-amount">${positionType.toUpperCase()} ${leverage}x</span>
                    <span class="transaction-price">Entry: $${entryPrice.toFixed(2)}</span>
                </div>
                <div class="transaction-details">
                    <span class="liquidation-details">
                        <span class="liquidation-price">Liq: $${liquidationPrice.toFixed(2)}</span>
                        <span class="transaction-total negative">$${loss.toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                    </span>
                    <span class="transaction-time">${time}</span>
                </div>
            `;
        } else {
            // Fallback for unknown transaction types
            typeClass = 'neutral';
            typeText = transaction.type?.toUpperCase() || 'UNKNOWN';
            
            content = `
                <div class="transaction-info">
                    <span class="transaction-type ${typeClass}">${typeText}</span>
                    <span class="transaction-amount">-</span>
                    <span class="transaction-price">-</span>
                </div>
                <div class="transaction-details">
                    <span class="transaction-total">-</span>
                    <span class="transaction-time">${time}</span>
                </div>
            `;
        }
        
        return `<div class="transaction-item">${content}</div>`;
    }).join('');
}

// Add transaction to history display
function addTransactionToHistory(transaction) {
    // Just refresh the entire history display
    updateTransactionHistory();
}

// Calculate spot profit/loss for each cryptocurrency
function calculateSpotProfitLoss() {
    const spotProfits = {};
    
    // Process each market
    ['BTC-USDT', 'ETH-USDT'].forEach(market => {
        const [crypto] = market.split('-');
        const currentBalance = crypto === 'ETH' ? ethBalance : btcBalance;
        
        
        if (currentBalance <= 0) {
            spotProfits[crypto] = {
                totalInvested: 0,
                currentValue: 0,
                profit: 0,
                profitPercent: 0,
                averageBuyPrice: 0
            };
            return;
        }
        
        // Calculate average buy price from transactions (time-ordered)
        const relevantTransactions = transactions.filter(tx => 
            (tx.market === market || tx.market === `${crypto}/USDT`) &&
            (tx.type === 'buy' || tx.type === 'sell')
        ).sort((a, b) => new Date(a.time) - new Date(b.time)); // Sort by time
        
        let runningBalance = 0;
        let averageBuyPrice = 0;
        
        // Process transactions in chronological order
        relevantTransactions.forEach((tx, i) => {
            if (tx.type === 'buy') {
                // Calculate new weighted average buy price
                const oldBalance = runningBalance;
                const oldAvgPrice = averageBuyPrice;
                const newBalance = runningBalance + tx.amount;
                if (newBalance > 0) {
                    averageBuyPrice = ((averageBuyPrice * runningBalance) + (tx.price * tx.amount)) / newBalance;
                }
                runningBalance = newBalance;
            } else if (tx.type === 'sell') {
                // Sell reduces balance but keeps average buy price unchanged
                const oldBalance = runningBalance;
                runningBalance -= tx.amount;
                if (runningBalance <= 0) {
                    runningBalance = 0;
                    averageBuyPrice = 0;
                }
            }
        });
        const currentMarketPrice = marketPrices[market]?.price || currentPrice;
        const currentValue = currentBalance * currentMarketPrice;
        const totalInvested = currentBalance * averageBuyPrice;
        const profit = currentValue - totalInvested;
        const profitPercent = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;
        
        spotProfits[crypto] = {
            totalInvested,
            currentValue,
            profit,
            profitPercent,
            averageBuyPrice
        };
    });
    
    return spotProfits;
}

// Update UI elements
function updateUI() {
    // Calculate total assets using marketPrices
    const btcValue = btcBalance * (marketPrices['BTC/USDT'] || 0);
    const ethValue = ethBalance * (marketPrices['ETH/USDT'] || 0);
    const totalAssets = usdBalance + btcValue + ethValue;
    
    // Calculate unrealized P&L from leverage positions
    const unrealizedPnL = leveragePositions.reduce((sum, position) => sum + position.pnl, 0);
    
    // Calculate spot profits
    const spotProfits = calculateSpotProfitLoss();
    
    // Update balance displays in USD (safely check if elements exist)
    const krwBalanceEl = document.getElementById('krw-balance');
    if (krwBalanceEl) {
        krwBalanceEl.textContent = '$' + usdBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }
    
    const btcBalanceEl = document.getElementById('btc-balance');
    if (btcBalanceEl) {
        // Get current crypto symbol and corresponding balance
        const currentCrypto = currentMarket.split(/[-\/]/)[0]; // BTC or ETH
        const currentBalance = currentCrypto === 'ETH' ? ethBalance : btcBalance;
        const currentProfit = spotProfits[currentCrypto] || { profitPercent: 0, averageBuyPrice: 0 };
        
        const profitText = currentProfit.profitPercent !== 0 ? 
            ` (${currentProfit.profitPercent >= 0 ? '+' : ''}${currentProfit.profitPercent.toFixed(2)}%)` : '';
        const profitColor = currentProfit.profitPercent > 0 ? 'var(--accent-green)' : 
                           currentProfit.profitPercent < 0 ? 'var(--accent-red)' : '';
        
        const profitClass = currentProfit.profitPercent > 0 ? 'profit-text-small' : 
                           currentProfit.profitPercent < 0 ? 'loss-text-small' : '';
        btcBalanceEl.innerHTML = `${currentBalance.toFixed(8)}<span class="${profitClass}">${profitText}</span>`;
    }
    
    // Update current market's spot profit display
    const currentCryptoTitleEl = document.getElementById('current-crypto-title');
    const currentProfitCombinedEl = document.getElementById('current-profit-combined');
    const currentAvgPriceEl = document.getElementById('current-avg-price');
    
    if (currentCryptoTitleEl && currentProfitCombinedEl && currentAvgPriceEl) {
        // Get the current crypto symbol from the current market
        const currentCrypto = currentMarket.split(/[-\/]/)[0]; // BTC or ETH (handle both formats)
        const currentProfit = spotProfits[currentCrypto] || { profitPercent: 0, averageBuyPrice: 0, profit: 0 };
        
        // Update title
        const cryptoNames = {
            'BTC': 'Bitcoin (BTC)',
            'ETH': 'Ethereum (ETH)'
        };
        currentCryptoTitleEl.textContent = cryptoNames[currentCrypto] || `${currentCrypto} Spot`;
        
        // Update combined profit display: $amount (percentage%)
        const dollarSign = currentProfit.profit >= 0 ? '+' : '';
        const percentSign = currentProfit.profitPercent >= 0 ? '+' : '';
        const profitCombinedText = `${dollarSign}$${currentProfit.profit.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})} (${percentSign}${currentProfit.profitPercent.toFixed(2)}%)`;
        
        currentProfitCombinedEl.textContent = profitCombinedText;
        currentProfitCombinedEl.className = 'profit-combined ' + 
            (currentProfit.profitPercent > 0 ? 'positive' : currentProfit.profitPercent < 0 ? 'negative' : '');
        
        // Update average buy price
        currentAvgPriceEl.textContent = currentProfit.averageBuyPrice > 0 ? 
            '$' + currentProfit.averageBuyPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}) : 
            '$0.00';
    }
    
    // Update price display in trading forms
    const buyPriceEl = document.getElementById('buy-price');
    const sellPriceEl = document.getElementById('sell-price');
    if (buyPriceEl && currentPrice > 0) {
        buyPriceEl.value = currentPrice.toFixed(2);
    }
    if (sellPriceEl && currentPrice > 0) {
        sellPriceEl.value = currentPrice.toFixed(2);
    }
    
    // Update available balances in trading forms
    const availableBalanceEl = document.querySelector('.available-balance');
    if (availableBalanceEl) {
        availableBalanceEl.textContent = '$' + usdBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }
    
    const availableBtcEl = document.querySelector('.available-btc');
    if (availableBtcEl) {
        availableBtcEl.textContent = btcBalance.toFixed(8) + ' BTC';
    }
    
    // Update current price display in trading form
    updateCurrentPriceDisplay();
    
    // Update average price and profit rate
    const avgPriceEl = document.getElementById('avg-price');
    const profitRateEl = document.getElementById('profit-rate');
    
    if (btcBalance > 0) {
        const avgPrice = calculateAveragePrice();
        if (avgPriceEl) {
            avgPriceEl.textContent = '$' + avgPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
        }
        
        // Calculate profit rate
        const profitRate = ((currentPrice - avgPrice) / avgPrice) * 100;
        if (profitRateEl) {
            profitRateEl.textContent = profitRate.toFixed(2) + '%';
            profitRateEl.className = 'value ' + (profitRate >= 0 ? 'positive' : 'negative');
        }
    } else {
        if (avgPriceEl) avgPriceEl.textContent = '-';
        if (profitRateEl) {
            profitRateEl.textContent = '0.00%';
            profitRateEl.className = 'value';
        }
    }
}

// Show toast notification
function showToast(message, type = 'info', duration = 5000) {
    const toastContainer = document.getElementById('toast-container') || createToastContainer();
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    // Add close button for manual dismiss
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.className = 'toast-close';
    closeBtn.onclick = () => removeToast(toast);
    toast.appendChild(closeBtn);
    
    // Add to container with animation
    toastContainer.appendChild(toast);
    
    // Trigger enter animation
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);
    
    // Auto remove after duration
    const autoRemoveTimeout = setTimeout(() => {
        removeToast(toast);
    }, duration);
    
    // Store timeout reference for manual dismiss
    toast._autoRemoveTimeout = autoRemoveTimeout;
}

// Create toast container if it doesn't exist
function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
}

// Remove toast with animation
function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    
    // Clear auto-remove timeout
    if (toast._autoRemoveTimeout) {
        clearTimeout(toast._autoRemoveTimeout);
    }
    
    // Add exit animation
    toast.classList.add('hide');
    
    // Remove after animation completes
    setTimeout(() => {
        if (toast.parentNode) {
            toast.remove();
        }
    }, 300);
}

// Format number with commas
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// Calculate average purchase price
function calculateAveragePrice() {
    if (btcBalance === 0) return 0;
    
    let totalCost = 0;
    let totalAmount = 0;
    
    // Calculate weighted average from buy transactions
    transactions.forEach(tx => {
        if (tx.type === 'buy') {
            totalCost += tx.total;
            totalAmount += tx.amount;
        } else if (tx.type === 'sell') {
            // Proportionally reduce the cost basis when selling
            if (totalAmount > 0) {
                const ratio = tx.amount / totalAmount;
                totalCost -= totalCost * ratio;
                totalAmount -= tx.amount;
            }
        }
    });
    
    return totalAmount > 0 ? totalCost / totalAmount : 0;
}

// Setup order type selector
function setupOrderTypeSelector() {
    const orderTypeBtns = document.querySelectorAll('.order-type-btn');
    
    orderTypeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all buttons
            orderTypeBtns.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            btn.classList.add('active');
            
            const orderType = btn.getAttribute('data-type');
            updatePriceInputs(orderType);
        });
    });
}

// Update price inputs based on order type
function updatePriceInputs(orderType) {
    const buyPriceInput = document.getElementById('buy-price');
    const sellPriceInput = document.getElementById('sell-price');
    
    if (orderType === 'market') {
        buyPriceInput.placeholder = 'Market';
        sellPriceInput.placeholder = 'Market';
        buyPriceInput.readOnly = true;
        sellPriceInput.readOnly = true;
        buyPriceInput.value = '';
        sellPriceInput.value = '';
    } else {
        buyPriceInput.placeholder = '0.00';
        sellPriceInput.placeholder = '0.00';
        buyPriceInput.readOnly = false;
        sellPriceInput.readOnly = false;
        buyPriceInput.value = currentPrice ? currentPrice.toFixed(2) : '';
        sellPriceInput.value = currentPrice ? currentPrice.toFixed(2) : '';
    }
    
    // Update fee displays when order type changes
    updateBuyTotal();
    updateSellTotal();
}

// Update current price display
function updateCurrentPriceDisplay() {
    const priceElement = document.getElementById('current-btc-price');
    if (priceElement && currentPrice) {
        priceElement.textContent = '$' + currentPrice.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }
}

// Update average price line on chart
function updateAveragePriceLine() {
    if (!chart || !candleSeries) return;
    
    const avgPrice = calculateAveragePrice();
    
    // Remove existing line if present
    if (avgPriceLine) {
        candleSeries.removePriceLine(avgPriceLine);
        avgPriceLine = null;
    }
    
    // Add new line if we have BTC balance
    if (btcBalance > 0 && avgPrice > 0) {
        avgPriceLine = candleSeries.createPriceLine({
            price: avgPrice, // Already in USDT
            color: '#ffb800',
            lineWidth: 2,
            lineStyle: 2, // Dashed line
            axisLabelVisible: true,
            title: 'Average Buy Price',
        });
    }
}

// Set sell percentage
function setSellPercentage(percentage) {
    const availableBtc = btcBalance;
    const sellAmount = (availableBtc * percentage) / 100;
    
    document.getElementById('sell-amount').value = sellAmount.toFixed(8);
    
    // Update total
    const total = sellAmount * currentPrice;
    document.getElementById('sell-total').value = total.toFixed(2);
    
    // Update button states
    document.querySelectorAll('.percentage-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
}

// Update leverage position lines on chart
function updateLeveragePositionLines() {
    if (!chart || !candleSeries) return;
    
    // Remove all existing position lines
    leveragePositionLines.forEach(line => {
        if (line) {
            candleSeries.removePriceLine(line);
        }
    });
    leveragePositionLines = [];
    
    // Add lines for each active position
    leveragePositions.forEach((position, index) => {
        const line = candleSeries.createPriceLine({
            price: position.entryPrice,
            color: position.type === 'long' ? '#00d68f' : '#ff5a5f',
            lineWidth: 2,
            lineStyle: 0, // Solid line
            axisLabelVisible: true,
            title: `${position.type.toUpperCase()} ${position.leverage}x`,
        });
        leveragePositionLines.push(line);
    });
}

// Toggle indicator function
function toggleIndicator(indicator, isActive) {
    if (!chart || !candleSeries || !candleData.length) return;
    
    switch (indicator) {
        case 'ma':
            if (isActive) {
                addMovingAverage();
            } else {
                removeIndicator('ma');
            }
            break;
        case 'ema':
            if (isActive) {
                addEMA();
            } else {
                removeIndicator('ema');
            }
            break;
        case 'bollinger':
            if (isActive) {
                addBollingerBands();
            } else {
                removeIndicator('bollinger');
            }
            break;
        case 'rsi':
            if (isActive) {
                addRSI();
            } else {
                removeIndicator('rsi');
            }
            break;
        case 'macd':
            if (isActive) {
                addMACD();
            } else {
                removeIndicator('macd');
            }
            break;
        case 'volume':
            if (isActive) {
                if (volumeSeries) {
                    volumeSeries.applyOptions({ visible: true });
                }
            } else {
                if (volumeSeries) {
                    volumeSeries.applyOptions({ visible: false });
                }
            }
            break;
    }
    
    // Update button states
    updateIndicatorButtonStates();
    // Note: Saving is handled at the button click level
}

// Remove indicator
function removeIndicator(indicator) {
    switch (indicator) {
        case 'ma':
            if (indicators.ma) {
                chart.removeSeries(indicators.ma);
                indicators.ma = null;
            }
            break;
        case 'ema':
            if (indicators.ema) {
                chart.removeSeries(indicators.ema);
                indicators.ema = null;
            }
            break;
        case 'bollinger':
            if (indicators.bollinger.upper) {
                chart.removeSeries(indicators.bollinger.upper);
                chart.removeSeries(indicators.bollinger.middle);
                chart.removeSeries(indicators.bollinger.lower);
                indicators.bollinger = { upper: null, middle: null, lower: null };
            }
            break;
        case 'rsi':
            if (indicators.rsi) {
                chart.removeSeries(indicators.rsi);
                indicators.rsi = null;
            }
            break;
        case 'macd':
            if (indicators.macd.macd) {
                chart.removeSeries(indicators.macd.macd);
                chart.removeSeries(indicators.macd.signal);
                chart.removeSeries(indicators.macd.histogram);
                indicators.macd = { macd: null, signal: null, histogram: null };
            }
            break;
    }
    
    // Update button states
    updateIndicatorButtonStates();
    // Note: Saving is handled at the button click level
}

// Calculate Simple Moving Average
function calculateSMA(data, period = 20) {
    const sma = [];
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
        }
        sma.push({
            time: data[i].time,
            value: sum / period
        });
    }
    return sma;
}

// Calculate Exponential Moving Average
function calculateEMA(data, period = 20) {
    const ema = [];
    const multiplier = 2 / (period + 1);
    
    // Start with SMA for first value
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += data[i].close;
    }
    ema.push({
        time: data[period - 1].time,
        value: sum / period
    });
    
    // Calculate EMA for remaining values
    for (let i = period; i < data.length; i++) {
        const value = (data[i].close - ema[ema.length - 1].value) * multiplier + ema[ema.length - 1].value;
        ema.push({
            time: data[i].time,
            value: value
        });
    }
    return ema;
}

// Calculate Bollinger Bands
function calculateBollingerBands(data, period = 20, multiplier = 2) {
    const sma = calculateSMA(data, period);
    const bands = { upper: [], middle: [], lower: [] };
    
    for (let i = 0; i < sma.length; i++) {
        const dataIndex = i + period - 1;
        let sum = 0;
        
        // Calculate standard deviation
        for (let j = 0; j < period; j++) {
            sum += Math.pow(data[dataIndex - j].close - sma[i].value, 2);
        }
        const stdDev = Math.sqrt(sum / period);
        
        bands.upper.push({
            time: sma[i].time,
            value: sma[i].value + (stdDev * multiplier)
        });
        bands.middle.push(sma[i]);
        bands.lower.push({
            time: sma[i].time,
            value: sma[i].value - (stdDev * multiplier)
        });
    }
    return bands;
}

// Calculate RSI
function calculateRSI(data, period = 14) {
    const rsi = [];
    const gains = [];
    const losses = [];
    
    for (let i = 1; i < data.length; i++) {
        const change = data[i].close - data[i - 1].close;
        gains.push(change > 0 ? change : 0);
        losses.push(change < 0 ? -change : 0);
    }
    
    for (let i = period - 1; i < gains.length; i++) {
        let avgGain = 0;
        let avgLoss = 0;
        
        for (let j = 0; j < period; j++) {
            avgGain += gains[i - j];
            avgLoss += losses[i - j];
        }
        
        avgGain /= period;
        avgLoss /= period;
        
        const rs = avgGain / avgLoss;
        const rsiValue = 100 - (100 / (1 + rs));
        
        rsi.push({
            time: data[i + 1].time,
            value: rsiValue
        });
    }
    
    return rsi;
}

// Settings Modal Functions
function openSettingsModal() {
    // Load current settings into modal
    
    // Update MA/EMA items in the list
    updateMaListFromSettings();
    
    // Load other indicator settings
    document.getElementById('bb-period').value = indicatorSettings.bollinger.period;
    document.getElementById('bb-std').value = indicatorSettings.bollinger.std;
    document.getElementById('rsi-period').value = indicatorSettings.rsi.period;
    document.getElementById('macd-fast').value = indicatorSettings.macd.fast;
    document.getElementById('macd-slow').value = indicatorSettings.macd.slow;
    document.getElementById('macd-signal').value = indicatorSettings.macd.signal;
    
    document.getElementById('chart-settings-modal').style.display = 'block';
}

function closeSettingsModal() {
    document.getElementById('chart-settings-modal').style.display = 'none';
}

function applySettings() {
    // Update MA/EMA settings from the list
    updateMaSettingsFromList();
    
    // Update other indicator settings from modal
    indicatorSettings.bollinger.period = parseInt(document.getElementById('bb-period').value);
    indicatorSettings.bollinger.std = parseFloat(document.getElementById('bb-std').value);
    indicatorSettings.rsi.period = parseInt(document.getElementById('rsi-period').value);
    indicatorSettings.macd.fast = parseInt(document.getElementById('macd-fast').value);
    indicatorSettings.macd.slow = parseInt(document.getElementById('macd-slow').value);
    indicatorSettings.macd.signal = parseInt(document.getElementById('macd-signal').value);
    
    // Re-apply active indicators with new settings
    refreshActiveIndicators();
    
    closeSettingsModal();
    showToast('Settings applied successfully', 'success');
}

function resetSettings() {
    indicatorSettings = {
        ma: { period: 20 },
        ema: { period: 20 },
        bollinger: { period: 20, std: 2 },
        rsi: { period: 14 },
        macd: { fast: 12, slow: 26, signal: 9 }
    };
    
    // Reset MA/EMA list to default
    maList = [{ id: 1, period: 20, type: 'sma', series: null }];
    nextMaId = 2;
    updateMaListFromSettings();
    
    // Update modal inputs
    document.getElementById('bb-period').value = 20;
    document.getElementById('bb-std').value = 2;
    document.getElementById('rsi-period').value = 14;
    document.getElementById('macd-fast').value = 12;
    document.getElementById('macd-slow').value = 26;
    document.getElementById('macd-signal').value = 9;
    
    showToast('Settings reset to default', 'info');
}

function updateMaListFromSettings() {
    const maListContainer = document.getElementById('ma-list');
    maListContainer.innerHTML = '';
    
    maList.forEach(ma => {
        const maItem = document.createElement('div');
        maItem.className = 'ma-item';
        maItem.setAttribute('data-ma-id', ma.id);
        
        maItem.innerHTML = `
            <div class="setting-group">
                <label>MA Period:</label>
                <input type="number" class="ma-period" value="${ma.period}" min="1" max="200">
                <select class="ma-type">
                    <option value="sma" ${ma.type === 'sma' ? 'selected' : ''}>SMA</option>
                    <option value="ema" ${ma.type === 'ema' ? 'selected' : ''}>EMA</option>
                </select>
                <button class="remove-ma-btn" onclick="removeMa(${ma.id})">×</button>
            </div>
        `;
        
        maListContainer.appendChild(maItem);
    });
}

function updateMaSettingsFromList() {
    const maItems = document.querySelectorAll('.ma-item');
    maList = [];
    
    maItems.forEach(item => {
        const id = parseInt(item.getAttribute('data-ma-id'));
        const period = parseInt(item.querySelector('.ma-period').value);
        const type = item.querySelector('.ma-type').value;
        
        maList.push({
            id: id,
            period: period,
            type: type,
            series: null // Will be recreated when indicators refresh
        });
    });
}

function refreshActiveIndicators() {
    // Get currently active indicators
    const activeIndicators = [];
    document.querySelectorAll('.indicator-btn.active').forEach(btn => {
        activeIndicators.push(btn.dataset.indicator);
    });
    
    // Remove all current indicators
    Object.keys(indicators).forEach(indicator => {
        if (indicator !== 'volume') {
            removeIndicator(indicator);
        }
    });
    
    // Remove all current MA/EMA series
    maList.forEach(ma => {
        if (ma.series) {
            try {
                chart.removeSeries(ma.series);
            } catch (error) {
                console.warn('Error removing MA series:', error);
            }
            ma.series = null;
        }
    });
    
    // Re-add MA/EMA series with updated settings
    maList.forEach(ma => {
        if (ma.type === 'sma') {
            const maData = calculateSMA(candleData, ma.period);
            ma.series = chart.addLineSeries({
                color: getRandomColor(),
                lineWidth: 2,
                title: `SMA(${ma.period})`
            });
            ma.series.setData(maData);
        } else if (ma.type === 'ema') {
            const emaData = calculateEMA(candleData, ma.period);
            ma.series = chart.addLineSeries({
                color: getRandomColor(),
                lineWidth: 2,
                title: `EMA(${ma.period})`
            });
            ma.series.setData(emaData);
        }
    });
    
    // Re-add active indicators with new settings
    activeIndicators.forEach(indicator => {
        if (indicator !== 'volume') {
            toggleIndicator(indicator, true);
        }
    });
}

// Add Moving Average
function addMovingAverage() {
    if (indicators.ma) return;
    
    const maData = calculateSMA(candleData, indicatorSettings.ma.period);
    indicators.ma = chart.addLineSeries({
        color: '#2196F3',
        lineWidth: 2,
        title: `MA(${indicatorSettings.ma.period})`
    });
    if (maData && maData.length > 0) {
        const safeMAData = maData.filter(item => 
            item && item.time && item.value != null && !isNaN(item.value)
        );
        if (safeMAData.length > 0) {
            indicators.ma.setData(safeMAData);
        }
    }
}

// Add EMA
function addEMA() {
    if (indicators.ema) return;
    
    const emaData = calculateEMA(candleData, indicatorSettings.ema.period);
    indicators.ema = chart.addLineSeries({
        color: '#FF9800',
        lineWidth: 2,
        title: `EMA(${indicatorSettings.ema.period})`
    });
    if (emaData && emaData.length > 0) {
        const safeEMAData = emaData.filter(item => 
            item && item.time && item.value != null && !isNaN(item.value)
        );
        if (safeEMAData.length > 0) {
            indicators.ema.setData(safeEMAData);
        }
    }
}

// Add Bollinger Bands
function addBollingerBands() {
    if (indicators.bollinger.upper) return;
    
    const bbData = calculateBollingerBands(candleData, indicatorSettings.bollinger.period, indicatorSettings.bollinger.std);
    
    indicators.bollinger.upper = chart.addLineSeries({
        color: '#9C27B0',
        lineWidth: 1,
        title: `BB Upper(${indicatorSettings.bollinger.period},${indicatorSettings.bollinger.std})`
    });
    indicators.bollinger.middle = chart.addLineSeries({
        color: '#9C27B0',
        lineWidth: 1,
        title: `BB Middle(${indicatorSettings.bollinger.period})`
    });
    indicators.bollinger.lower = chart.addLineSeries({
        color: '#9C27B0',
        lineWidth: 1,
        title: `BB Lower(${indicatorSettings.bollinger.period},${indicatorSettings.bollinger.std})`
    });
    
    indicators.bollinger.upper.setData(bbData.upper);
    indicators.bollinger.middle.setData(bbData.middle);
    indicators.bollinger.lower.setData(bbData.lower);
}

// Add RSI
function addRSI() {
    if (indicators.rsi) return;
    
    const rsiData = calculateRSI(candleData, indicatorSettings.rsi.period);
    indicators.rsi = chart.addLineSeries({
        color: '#4CAF50',
        lineWidth: 2,
        title: `RSI(${indicatorSettings.rsi.period})`,
        priceScaleId: 'rsi',
        scaleMargins: {
            top: 0.8,
            bottom: 0
        }
    });
    
    chart.priceScale('rsi').applyOptions({
        scaleMargins: {
            top: 0.8,
            bottom: 0
        },
        borderVisible: false,
    });
    
    indicators.rsi.setData(rsiData);
}

// Add MACD
function addMACD() {
    if (indicators.macd.macd) return;
    
    const emaFast = calculateEMA(candleData, indicatorSettings.macd.fast);
    const emaSlow = calculateEMA(candleData, indicatorSettings.macd.slow);
    const macdData = [];
    
    // Calculate MACD line
    const startIndex = Math.max(0, indicatorSettings.macd.slow - 1);
    for (let i = startIndex; i < Math.min(emaFast.length, emaSlow.length); i++) {
        if (emaFast[i] && emaSlow[i]) {
            macdData.push({
                time: emaFast[i].time,
                value: emaFast[i].value - emaSlow[i].value
            });
        }
    }
    
    // Calculate signal line (EMA of MACD)
    const signalData = calculateEMA(macdData, indicatorSettings.macd.signal);
    
    // Create MACD line
    indicators.macd.macd = chart.addLineSeries({
        color: '#F44336',
        lineWidth: 2,
        title: `MACD(${indicatorSettings.macd.fast},${indicatorSettings.macd.slow})`,
        priceScaleId: 'macd',
        scaleMargins: {
            top: 0.8,
            bottom: 0
        }
    });
    
    // Create signal line
    indicators.macd.signal = chart.addLineSeries({
        color: '#FF9800',
        lineWidth: 2,
        title: `Signal(${indicatorSettings.macd.signal})`,
        priceScaleId: 'macd'
    });
    
    // Create histogram (simplified as line for now)
    const histogramData = [];
    for (let i = 0; i < Math.min(macdData.length, signalData.length); i++) {
        if (macdData[i] && signalData[i] && macdData[i].time === signalData[i].time) {
            histogramData.push({
                time: macdData[i].time,
                value: macdData[i].value - signalData[i].value
            });
        }
    }
    
    indicators.macd.histogram = chart.addLineSeries({
        color: '#4CAF50',
        lineWidth: 1,
        title: 'Histogram',
        priceScaleId: 'macd'
    });
    
    // Configure price scale
    chart.priceScale('macd').applyOptions({
        scaleMargins: {
            top: 0.8,
            bottom: 0
        },
        borderVisible: false,
    });
    
    // Set data
    indicators.macd.macd.setData(macdData);
    indicators.macd.signal.setData(signalData);
    indicators.macd.histogram.setData(histogramData);
}

// MA/EMA Management Functions
function addMaItem() {
    const maListContainer = document.getElementById('ma-list');
    const newId = nextMaId++;
    
    const maItem = document.createElement('div');
    maItem.className = 'ma-item';
    maItem.setAttribute('data-ma-id', newId);
    
    maItem.innerHTML = `
        <div class="setting-group">
            <label>MA Period:</label>
            <input type="number" class="ma-period" value="50" min="1" max="200">
            <select class="ma-type">
                <option value="sma">SMA</option>
                <option value="ema">EMA</option>
            </select>
            <button class="remove-ma-btn" onclick="removeMa(${newId})">×</button>
        </div>
    `;
    
    maListContainer.appendChild(maItem);
    
    // Add to maList array
    maList.push({ id: newId, period: 50, type: 'sma', series: null });
    
    showToast('MA/EMA added', 'success');
}

function removeMa(id) {
    // Remove from DOM
    const maItem = document.querySelector(`[data-ma-id="${id}"]`);
    if (maItem) {
        maItem.remove();
    }
    
    // Remove series from chart
    const maIndex = maList.findIndex(ma => ma.id === id);
    if (maIndex !== -1) {
        const ma = maList[maIndex];
        if (ma.series && chart) {
            chart.removeSeries(ma.series);
        }
        maList.splice(maIndex, 1);
    }
    
    showToast('MA/EMA removed', 'success');
}

function applyMaSettings() {
    // Remove all existing MA series
    maList.forEach(ma => {
        if (ma.series && chart) {
            chart.removeSeries(ma.series);
            ma.series = null;
        }
    });
    
    // Update maList from DOM and create new series
    const maItems = document.querySelectorAll('.ma-item');
    maItems.forEach((item, index) => {
        const id = parseInt(item.getAttribute('data-ma-id'));
        const period = parseInt(item.querySelector('.ma-period').value);
        const type = item.querySelector('.ma-type').value;
        
        const maIndex = maList.findIndex(ma => ma.id === id);
        if (maIndex !== -1) {
            maList[maIndex].period = period;
            maList[maIndex].type = type;
            
            // Create series
            if (candleData.length > 0) {
                createMaSeries(maList[maIndex]);
            }
        }
    });
}

function createMaSeries(ma) {
    if (!chart || !candleData.length) return;
    
    let data;
    let color = getRandomColor();
    let title;
    
    if (ma.type === 'sma') {
        data = calculateSMA(candleData, ma.period);
        title = `SMA(${ma.period})`;
    } else {
        data = calculateEMA(candleData, ma.period);
        title = `EMA(${ma.period})`;
    }
    
    ma.series = chart.addLineSeries({
        color: color,
        lineWidth: 2,
        title: title
    });
    
    ma.series.setData(data);
}

function getRandomColor() {
    const colors = ['#2196F3', '#FF9800', '#4CAF50', '#9C27B0', '#F44336', '#00BCD4', '#FF5722', '#795548'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Drawing Tools Functions
function selectDrawingTool(tool, button) {
    // Reset all drawing tool buttons
    document.querySelectorAll('.drawing-tools-group .tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Toggle drawing mode
    if (drawingMode === tool) {
        drawingMode = null;
        // Remove click handler when disabling drawing mode
        if (chartClickHandler && chart) {
            chart.unsubscribeClick(chartClickHandler);
            chartClickHandler = null;
        }
        // Reset all drawing states
        isDrawingTrendLine = false;
        trendLinePoints = [];
        isDrawingFibonacci = false;
        fibonacciPoints = [];
        showToast('Drawing mode disabled', 'info');
    } else {
        drawingMode = tool;
        button.classList.add('active');
        showToast(`Drawing mode: ${tool}`, 'info');
        
        // Enable drawing mode on chart
        if (chart) {
            enableDrawingMode(tool);
        }
    }
}

function enableDrawingMode(tool) {
    if (!chart) return;
    
    // Remove previous click handler if exists
    if (chartClickHandler) {
        chart.unsubscribeClick(chartClickHandler);
        chartClickHandler = null;
    }
    
    // Create new click handler for drawing
    chartClickHandler = (param) => {
        if (!drawingMode || !param.point) return;
        
        // Get price from the main series (works for both candlestick and line)
        const mainSeries = currentChartType === 'candlestick' ? candleSeries : lineSeries;
        if (!mainSeries) return;
        
        const price = mainSeries.coordinateToPrice(param.point.y);
        const time = param.time;
        
        switch (drawingMode) {
            case 'horizontal':
                drawHorizontalLine(price, mainSeries);
                break;
            case 'vertical':
                drawVerticalLine(time);
                break;
            case 'trend':
                handleTrendLineClick(price, time, mainSeries);
                break;
            case 'fibonacci':
                handleFibonacciClick(price, time, mainSeries);
                break;
        }
    };
    
    // Subscribe new click handler
    chart.subscribeClick(chartClickHandler);
}

function handleTrendLineClick(price, time, series) {
    if (!isDrawingTrendLine) {
        // First click - start trend line
        isDrawingTrendLine = true;
        trendLinePoints = [{
            price: price,
            time: time
        }];
        showToast('Click second point to complete trend line', 'info');
    } else {
        // Second click - complete trend line
        trendLinePoints.push({
            price: price,
            time: time
        });
        
        drawTrendLine(trendLinePoints[0], trendLinePoints[1], series);
        
        // Reset trend line drawing state
        isDrawingTrendLine = false;
        trendLinePoints = [];
    }
}

function drawTrendLine(point1, point2, series) {
    const targetSeries = series || candleSeries;
    if (!targetSeries || !chart) return;
    
    console.log('Drawing trend line:', point1, point2);
    
    // Simple method retry - simulate diagonal with multiple horizontal lines
    const priceStart = point1.price;
    const priceEnd = point2.price;
    const priceStep = (priceEnd - priceStart) / 20; // 20 segments
    const lines = [];
    
    // Draw multiple horizontal lines to simulate diagonal
    for (let i = 0; i <= 20; i++) {
        const currentPrice = priceStart + (priceStep * i);
        
        const line = targetSeries.createPriceLine({
            price: currentPrice,
            color: '#FFD700',
            lineWidth: 1,
            lineStyle: 0, // Solid line
            axisLabelVisible: false,
            title: '',
        });
        
        lines.push(line);
    }
    
    // Add start and end point markers
    const startMarker = targetSeries.createPriceLine({
        price: point1.price,
        color: '#00FF00',
        lineWidth: 3,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `Start: ${point1.price.toFixed(2)}`,
    });
    
    const endMarker = targetSeries.createPriceLine({
        price: point2.price,
        color: '#FF0000',
        lineWidth: 3,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `End: ${point2.price.toFixed(2)}`,
    });
    
    lines.push(startMarker, endMarker);
    
    // Calculate trend direction and percentage
    const priceChange = point2.price - point1.price;
    const priceChangePercent = (priceChange / point1.price) * 100;
    const direction = priceChange > 0 ? 'Uptrend' : 'Downtrend';
    
    // Store trend line
    drawings.push({
        type: 'trend',
        lines: lines,
        point1: point1,
        point2: point2,
        series: targetSeries
    });
    
    // Auto-save chart settings after drawing
    debouncedSaveChartSettings();
    
    console.log('Trend line created with', lines.length, 'segments');
    showToast(`Trend Line: ${direction} ${Math.abs(priceChangePercent).toFixed(2)}% (${point1.price.toFixed(2)} → ${point2.price.toFixed(2)})`, 'success');
}

// Handle Fibonacci Retracement click
function handleFibonacciClick(price, time, series) {
    if (!isDrawingFibonacci) {
        // First click - start fibonacci retracement
        isDrawingFibonacci = true;
        fibonacciPoints = [{
            price: price,
            time: time
        }];
        showToast('Click second point to complete Fibonacci retracement', 'info');
    } else {
        // Second click - complete fibonacci retracement
        fibonacciPoints.push({
            price: price,
            time: time
        });
        
        drawFibonacciRetracement(fibonacciPoints[0], fibonacciPoints[1], series);
        
        // Reset fibonacci drawing state
        isDrawingFibonacci = false;
        fibonacciPoints = [];
    }
}

// Draw Fibonacci Retracement
function drawFibonacciRetracement(point1, point2, series) {
    const targetSeries = series || candleSeries;
    if (!targetSeries) return;
    
    console.log('Drawing Fibonacci retracement:', point1, point2);
    
    const priceHigh = Math.max(point1.price, point2.price);
    const priceLow = Math.min(point1.price, point2.price);
    const priceRange = priceHigh - priceLow;
    
    // Fibonacci levels
    const fibLevels = [
        { level: 0, color: '#787b86', name: '0%' },
        { level: 0.236, color: '#f23645', name: '23.6%' },
        { level: 0.382, color: '#ff9800', name: '38.2%' },
        { level: 0.5, color: '#2196f3', name: '50%' },
        { level: 0.618, color: '#4caf50', name: '61.8%' },
        { level: 0.786, color: '#9c27b0', name: '78.6%' },
        { level: 1, color: '#787b86', name: '100%' }
    ];
    
    const lines = [];
    
    // Draw fibonacci retracement lines
    fibLevels.forEach(fib => {
        const fibPrice = priceHigh - (priceRange * fib.level);
        
        const line = targetSeries.createPriceLine({
            price: fibPrice,
            color: fib.color,
            lineWidth: 1,
            lineStyle: 2, // Dashed line
            axisLabelVisible: true,
            title: `Fib ${fib.name}: ${fibPrice.toFixed(2)}`,
        });
        
        lines.push(line);
    });
    
    // Store fibonacci retracement
    drawings.push({
        type: 'fibonacci',
        lines: lines,
        point1: point1,
        point2: point2,
        series: targetSeries
    });
    
    // Auto-save chart settings after drawing
    debouncedSaveChartSettings();
    
    showToast(`Fibonacci Retracement: ${priceLow.toFixed(2)} - ${priceHigh.toFixed(2)}`, 'success');
}


function drawHorizontalLine(price, series) {
    const targetSeries = series || candleSeries;
    if (!targetSeries) return;
    
    const line = targetSeries.createPriceLine({
        price: price,
        color: '#FFD700',
        lineWidth: 2,
        lineStyle: 2, // Dashed line
        axisLabelVisible: true,
        title: `Drawing: ${price.toFixed(2)}`,
    });
    
    drawings.push({
        type: 'horizontal',
        line: line,
        price: price,
        series: targetSeries
    });
    
    // Auto-save chart settings after drawing
    debouncedSaveChartSettings();
    
    showToast(`Horizontal line drawn at $${price.toFixed(2)}`, 'success');
}

function drawVerticalLine(time) {
    // TradingView Lightweight Charts doesn't support vertical lines directly
    // This would require custom implementation or using shapes
    showToast('Vertical lines not supported in current version', 'info');
}

function clearAllDrawings() {
    drawings.forEach(drawing => {
        try {
            if ((drawing.type === 'trend' || drawing.type === 'fibonacci') && 
                drawing.lines && drawing.series) {
                // Remove multi-line drawings (trend, fibonacci)
                drawing.lines.forEach(line => {
                    drawing.series.removePriceLine(line);
                });
            } else if (drawing.line && drawing.series) {
                // Remove single line (horizontal, etc.)
                drawing.series.removePriceLine(drawing.line);
            }
        } catch (error) {
            console.warn('Error removing drawing:', error);
        }
    });
    
    drawings = [];
    drawingMode = null;
    
    // Reset all drawing states
    isDrawingTrendLine = false;
    trendLinePoints = [];
    isDrawingFibonacci = false;
    fibonacciPoints = [];
    
    // Reset drawing tool buttons
    document.querySelectorAll('.drawing-tools-group .tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    showToast('All drawings cleared', 'success');
}

// Switch Chart Type Function
function switchChartType(type) {
    if (!chart || !candleData.length) return;
    
    // Remove all indicators first (they'll be re-added after new series creation)
    const activeIndicators = [];
    document.querySelectorAll('.indicator-btn.active').forEach(btn => {
        if (btn.dataset.indicator !== 'volume') {
            activeIndicators.push(btn.dataset.indicator);
            removeIndicator(btn.dataset.indicator);
        }
    });
    
    // Remove existing series safely
    try {
        if (candleSeries && currentChartType === 'candlestick') {
            chart.removeSeries(candleSeries);
        }
        if (lineSeries && currentChartType === 'line') {
            chart.removeSeries(lineSeries);
        }
    } catch (error) {
        console.warn('Error removing series:', error);
    }
    
    // Reset series variables
    candleSeries = null;
    lineSeries = null;
    
    currentChartType = type;
    
    switch (type) {
        case 'candlestick':
            candleSeries = chart.addCandlestickSeries({
                upColor: '#ff5a5f',      // 상승 - 빨간색
                downColor: '#00d68f',    // 하락 - 초록색
                borderDownColor: '#00d68f',
                borderUpColor: '#ff5a5f',
                wickDownColor: '#00d68f',
                wickUpColor: '#ff5a5f',
            });
            if (candleData && candleData.length > 0) {
                const safeCandles = candleData.filter(candle => 
                    candle && candle.time && 
                    candle.open != null && candle.high != null && 
                    candle.low != null && candle.close != null &&
                    !isNaN(candle.open) && !isNaN(candle.high) && 
                    !isNaN(candle.low) && !isNaN(candle.close)
                );
                if (safeCandles.length > 0) {
                    candleSeries.setData(safeCandles);
                }
            }
            break;
            
        case 'line':
            lineSeries = chart.addLineSeries({
                color: '#2196F3',
                lineWidth: 2,
            });
            // Convert candle data to line data (using close prices)
            if (candleData && candleData.length > 0) {
                const lineData = candleData
                    .filter(candle => candle && candle.time && candle.close != null && !isNaN(candle.close))
                    .map(candle => ({
                        time: candle.time,
                        value: candle.close
                    }));
                if (lineData.length > 0) {
                    lineSeries.setData(lineData);
                }
            }
            // Keep candleSeries reference for indicator compatibility
            candleSeries = lineSeries;
            break;
            
    }
    
    // Re-add active indicators
    activeIndicators.forEach(indicator => {
        toggleIndicator(indicator, true);
    });
    
    // Update button states
    setTimeout(() => {
        updateIndicatorButtonStates();
    }, 200);
    
    // Re-add average price line if exists
    updateAveragePriceLine();
    
    // Re-add leverage position lines
    updateLeveragePositionLines();
    
    // Re-add drawings to new series
    redrawExistingDrawings();
    
    // Re-enable drawing mode if it was active
    if (drawingMode && chart) {
        enableDrawingMode(drawingMode);
    }
    
    console.log(`Chart type switched to: ${type}`);
}

function redrawExistingDrawings() {
    if (!drawings.length) return;
    
    const currentSeries = currentChartType === 'candlestick' ? candleSeries : lineSeries;
    if (!currentSeries) return;
    
    // Store existing drawing data
    const existingDrawings = drawings.map(drawing => {
        if (drawing.type === 'horizontal') {
            return {
                type: drawing.type,
                price: drawing.price
            };
        } else if (['trend', 'fibonacci'].includes(drawing.type)) {
            return {
                type: drawing.type,
                point1: drawing.point1,
                point2: drawing.point2
            };
        }
        return drawing;
    });
    
    // Clear existing drawings
    drawings.forEach(drawing => {
        if (drawing.type === 'horizontal' && drawing.line && drawing.series) {
            drawing.series.removePriceLine(drawing.line);
        } else if (['trend', 'fibonacci'].includes(drawing.type) && 
                   drawing.lines && drawing.series) {
            // Remove multi-line drawings
            drawing.lines.forEach(line => {
                drawing.series.removePriceLine(line);
            });
        }
    });
    
    // Clear drawings array
    drawings = [];
    
    // Recreate all drawings on the new series
    existingDrawings.forEach(drawing => {
        if (drawing.type === 'horizontal') {
            drawHorizontalLine(drawing.price, currentSeries);
        } else if (drawing.type === 'trend') {
            drawTrendLine(drawing.point1, drawing.point2, currentSeries);
        } else if (drawing.type === 'fibonacci') {
            drawFibonacciRetracement(drawing.point1, drawing.point2, currentSeries);
        }
    });
}

// Chart Settings Management
async function saveChartSettings() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('❌ No token found, skipping save');
        return;
    }
    console.log('💾 Saving chart settings for', currentMarket);

    try {
        // Get current indicator states (which ones are active)
        const activeIndicators = {};
        Object.keys(indicators).forEach(key => {
            if (key === 'bollinger' && indicators[key]) {
                // Bollinger bands - check if any of the lines exist
                activeIndicators[key] = (indicators[key].upper !== null || 
                                       indicators[key].middle !== null || 
                                       indicators[key].lower !== null);
            } else if (key === 'macd' && indicators[key]) {
                // MACD - check if any of the lines exist
                activeIndicators[key] = (indicators[key].macd !== null ||
                                       indicators[key].signal !== null ||
                                       indicators[key].histogram !== null);
            } else {
                // Simple indicators like MA, EMA, RSI
                activeIndicators[key] = indicators[key] !== null && indicators[key] !== undefined;
            }
        });
        
        console.log('💾 Saving active indicators:', activeIndicators);

        const response = await fetch('/api/chart/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                market: currentMarket,
                indicators: activeIndicators,
                indicatorSettings: indicatorSettings,
                drawings: drawings,
                chartType: currentChartType
            })
        });

        if (!response.ok) {
            console.warn('Failed to save chart settings');
        }
    } catch (error) {
        console.error('Error saving chart settings:', error);
    }
}

async function loadChartSettings() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('❌ No token found, skipping load');
        return;
    }
    console.log('📥 Loading chart settings for', currentMarket);

    try {
        const response = await fetch(`/api/chart/settings/${encodeURIComponent(currentMarket)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('Response status:', response.status);
        
        if (response.ok) {
            const data = await response.json();
            console.log('📊 Loaded data:', data);
            if (data.settings) {
                const settings = data.settings;
                console.log('Settings found:', settings);
                
                // Restore indicator settings
                if (settings.indicator_settings) {
                    Object.assign(indicatorSettings, settings.indicator_settings);
                }
                
                // Restore drawings
                if (settings.drawings && Array.isArray(settings.drawings)) {
                    drawings.length = 0; // Clear existing drawings
                    drawings.push(...settings.drawings);
                    
                    // Redraw all drawings on chart
                    setTimeout(() => {
                        if (typeof redrawAllDrawings === 'function') {
                            redrawAllDrawings();
                        }
                    }, 100);
                }
                
                // Restore chart type
                if (settings.chart_type) {
                    currentChartType = settings.chart_type;
                }
                
                // Restore active indicators
                if (settings.indicators) {
                    for (const [indicatorName, isActive] of Object.entries(settings.indicators)) {
                        if (isActive) {
                            // Reactivate the indicator
                            setTimeout(() => {
                                toggleIndicator(indicatorName, true);
                                // Update button states after indicator is applied
                                setTimeout(() => {
                                    updateIndicatorButtonStates();
                                }, 100);
                            }, 200);
                        }
                    }
                }
                
                console.log('✅ Chart settings loaded successfully');
            } else {
                console.log('📊 No settings found in response');
            }
        } else if (response.status === 404) {
            console.log('📊 No saved settings found for', currentMarket);
        } else {
            console.error('Failed to load chart settings:', response.status);
        }
    } catch (error) {
        console.error('Error loading chart settings:', error);
    }
}

// Debounced save function to prevent excessive API calls
let saveTimeout;
function debouncedSaveChartSettings() {
    console.log('⏱️ Debounced save triggered');
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveChartSettings();
    }, 500); // Save after 500ms of inactivity
}

// Update indicator button states to match actual indicator states
function updateIndicatorButtonStates() {
    document.querySelectorAll('.indicator-btn').forEach(btn => {
        const indicatorName = btn.dataset.indicator;
        const isActive = isIndicatorActive(indicatorName);
        btn.classList.toggle('active', isActive);
    });
}

// Check if an indicator is currently active
function isIndicatorActive(indicatorName) {
    if (!indicators[indicatorName]) return false;
    
    switch (indicatorName) {
        case 'bollinger':
            return indicators[indicatorName].upper !== null || 
                   indicators[indicatorName].middle !== null || 
                   indicators[indicatorName].lower !== null;
        case 'macd':
            return indicators[indicatorName].macd !== null ||
                   indicators[indicatorName].signal !== null ||
                   indicators[indicatorName].histogram !== null;
        default:
            return indicators[indicatorName] !== null && indicators[indicatorName] !== undefined;
    }
}