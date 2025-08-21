// Settings Page JavaScript
let currentUser = null;
let isLoggedIn = false;
let transactions = [];
let leveragePositions = [];
let usdBalance = 10000;
let btcBalance = 0;
let userTimezone = 'UTC';

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Settings page loaded, initializing...');
    await checkLoginStatus();
    setupSettingsPage();
});

// Check if user is logged in
async function checkLoginStatus() {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    
    if (!token || !username) {
        window.location.href = '/login';
        return;
    }
    
    currentUser = username;
    isLoggedIn = true;
    document.getElementById('current-user').textContent = username;
    
    // Load user data
    await loadUserData();
    
    // If loadUserData succeeded, user is authenticated
    if (isLoggedIn) {
        updateUI();
        setupUserDropdown();
    }
}

// Setup user dropdown
function setupUserDropdown() {
    const userDropdown = document.querySelector('.user-dropdown');
    const dropdownMenu = document.querySelector('.dropdown-menu');
    const logoutBtn = document.getElementById('logout-btn');

    if (userDropdown && dropdownMenu) {
        userDropdown.addEventListener('click', (e) => {
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

    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    }
}

// Timezone conversion utility function
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

// Logout function
async function logout() {
    // Save data in background (non-blocking)
    saveUserData().catch(err => console.log('Save failed during logout:', err));
    
    currentUser = null;
    isLoggedIn = false;
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    
    showToast('Logging out...', 'info');
    
    // Immediate redirect
    window.location.href = '/login';
}

// Load user data
async function loadUserData() {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
        const response = await fetch('/api/user/data', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const userData = await response.json();
            usdBalance = userData.usdBalance;
            btcBalance = userData.btcBalance;
            transactions = userData.transactions || [];
            leveragePositions = userData.leveragePositions || [];
            userTimezone = userData.timezone || 'UTC';
            
            console.log('Loaded user timezone from server:', userData.timezone);
            console.log('Set userTimezone to:', userTimezone);
            
            // Update member since date
            if (userData.memberSince) {
                const memberDate = new Date(userData.memberSince);
                const today = new Date();
                const diffTime = Math.abs(today - memberDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                let memberSinceText;
                if (diffDays === 0) {
                    memberSinceText = 'Today';
                } else if (diffDays === 1) {
                    memberSinceText = 'Yesterday';
                } else if (diffDays < 30) {
                    memberSinceText = `${diffDays} days ago`;
                } else if (diffDays < 365) {
                    const months = Math.floor(diffDays / 30);
                    memberSinceText = `${months} month${months > 1 ? 's' : ''} ago`;
                } else {
                    const years = Math.floor(diffDays / 365);
                    memberSinceText = `${years} year${years > 1 ? 's' : ''} ago`;
                }
                
                const memberSinceElement = document.getElementById('member-since');
                if (memberSinceElement) {
                    memberSinceElement.textContent = memberSinceText;
                }
            }
            
        } else if (response.status === 401) {
            // Token expired or invalid
            isLoggedIn = false;
            logout();
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
        } else if (response.status === 401) {
            // Token expired or invalid
            logout();
        }
    } catch (error) {
        console.error('Error saving user data:', error);
    }
}

// Update UI with current data
function updateUI() {
    const currentPrice = getCurrentPrice();
    const portfolioValue = usdBalance + (btcBalance * currentPrice);
    const btcValue = btcBalance * currentPrice;
    const btcPercentage = portfolioValue > 0 ? (btcValue / portfolioValue) * 100 : 0;
    
    // Update navigation balance displays
    const usdBalanceElement = document.getElementById('krw-balance');
    if (usdBalanceElement) {
        usdBalanceElement.textContent = 
            `$${usdBalance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }
    
    // Update BTC balance with percentage in navigation
    const btcBalanceElement = document.getElementById('btc-balance');
    if (btcBalanceElement) {
        // Calculate profit/loss percentage based on initial value
        const initialValue = 10000; // Initial USD balance
        const currentTotalValue = portfolioValue;
        const profitLossAmount = currentTotalValue - initialValue;
        const profitLossPercentage = (profitLossAmount / initialValue) * 100;
        const isProfit = profitLossAmount >= 0;
        const percentageColor = isProfit ? 'var(--accent-green)' : 'var(--accent-red)';
        const sign = isProfit ? '+' : '';
        
        btcBalanceElement.innerHTML = `${btcBalance.toFixed(8)} <span class="${isProfit ? 'profit-text' : 'loss-text'}" data-percentage>(${sign}${profitLossPercentage.toFixed(1)}%)</span>`;
    }
    
    // Update settings page elements if they exist
    const portfolioValueElement = document.getElementById('portfolio-value');
    if (portfolioValueElement) {
        portfolioValueElement.textContent = 
            `$${portfolioValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    }
    
    const totalTradesElement = document.getElementById('total-trades');
    if (totalTradesElement) {
        totalTradesElement.textContent = transactions.length.toString();
    }
}

// Get current price (placeholder - in real app this would come from WebSocket)
function getCurrentPrice() {
    return 50000; // Placeholder price
}

// Setup settings page functionality
function setupSettingsPage() {
    const timezoneSelect = document.getElementById('timezone-select');
    const currentTimeDisplay = document.getElementById('current-time-display');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const resetAccountBtn = document.getElementById('reset-account-btn');
    const resetModal = document.getElementById('reset-confirmation-modal');
    const closeResetModal = document.getElementById('close-reset-modal');
    const cancelResetBtn = document.getElementById('cancel-reset-btn');
    const confirmResetBtn = document.getElementById('confirm-reset-btn');

    // Load current timezone setting first
    console.log('Loading timezone:', userTimezone);
    
    // Setup custom dropdown
    setupCustomDropdown();

    // Set timezone value after dropdown is setup
    setTimeout(() => {
        setTimezoneValue(userTimezone);
        updateCurrentTimeDisplay();
    }, 100);

    // Save settings
    saveSettingsBtn.addEventListener('click', async () => {
        const newTimezone = timezoneSelect.value;
        userTimezone = newTimezone;
        
        // Save to server (timezone already saved immediately via saveTimezoneChange)
        await saveUserData();
        
        // Update UI
        updateCurrentTimeDisplay();
        showToast('Settings saved successfully', 'success');
    });

    // Reset account data
    resetAccountBtn.addEventListener('click', () => {
        resetModal.style.display = 'block';
    });

    // Close reset modal
    closeResetModal.addEventListener('click', () => {
        resetModal.style.display = 'none';
    });

    cancelResetBtn.addEventListener('click', () => {
        resetModal.style.display = 'none';
    });

    // Confirm reset
    confirmResetBtn.addEventListener('click', async () => {
        // Reset data
        usdBalance = 10000;
        btcBalance = 0;
        transactions = [];
        leveragePositions = [];
        
        // Save to server
        await saveUserData();
        
        // Update UI
        updateUI();
        
        // Close modal
        resetModal.style.display = 'none';
        
        showToast('Account data has been reset', 'success');
    });

    // Close modal when clicking outside
    resetModal.addEventListener('click', (e) => {
        if (e.target === resetModal) {
            resetModal.style.display = 'none';
        }
    });

    function updateCurrentTimeDisplay() {
        const selectedTimezone = timezoneSelect.value;
        const now = new Date();
        const options = {
            timeZone: selectedTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };
        
        try {
            const formattedTime = now.toLocaleString('en-US', options);
            currentTimeDisplay.textContent = `${formattedTime} (${selectedTimezone})`;
        } catch (error) {
            currentTimeDisplay.textContent = `${now.toISOString()} (UTC)`;
        }
    }

    // Update time display every second
    setInterval(updateCurrentTimeDisplay, 1000);
    
    // Setup Trading Sounds toggle
    setupTradingSoundsToggle();
}

// Setup custom dropdown functionality
function setupCustomDropdown() {
    const trigger = document.getElementById('timezone-select-trigger');
    const options = document.getElementById('timezone-select-options');
    const customOptions = document.querySelectorAll('.custom-option');
    const hiddenSelect = document.getElementById('timezone-select');

    // Toggle dropdown
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        trigger.classList.toggle('active');
        
        if (options.classList.contains('show')) {
            options.classList.remove('show');
        } else {
            // Position the dropdown relative to the trigger
            const rect = trigger.getBoundingClientRect();
            options.style.top = `${rect.bottom + window.scrollY}px`;
            options.style.left = `${rect.left + window.scrollX}px`;
            options.style.width = `${rect.width}px`;
            options.classList.add('show');
        }
    });

    // Handle option selection
    customOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            
            // Remove selected class from all options
            customOptions.forEach(opt => opt.classList.remove('selected'));
            
            // Add selected class to clicked option
            option.classList.add('selected');
            
            // Update trigger text
            document.getElementById('timezone-selected-text').textContent = option.textContent;
            
            // Update hidden select value
            const value = option.getAttribute('data-value');
            hiddenSelect.value = value;
            userTimezone = value;
            
            // Close dropdown
            trigger.classList.remove('active');
            options.classList.remove('show');
            
            // Update time display
            updateCurrentTimeDisplay();
            
            // Auto-save timezone change to DB immediately
            saveTimezoneChange(value);
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!trigger.contains(e.target) && !options.contains(e.target)) {
            trigger.classList.remove('active');
            options.classList.remove('show');
        }
    });

    // Close dropdown on escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            trigger.classList.remove('active');
            options.classList.remove('show');
        }
    });
}

// Set timezone value in custom dropdown
function setTimezoneValue(timezone) {
    console.log('setTimezoneValue called with:', timezone);
    
    const hiddenSelect = document.getElementById('timezone-select');
    const customOptions = document.querySelectorAll('.custom-option');
    const selectedText = document.getElementById('timezone-selected-text');
    
    console.log('Elements found:', {
        hiddenSelect: !!hiddenSelect,
        customOptions: customOptions.length,
        selectedText: !!selectedText
    });
    
    if (!hiddenSelect || !selectedText || customOptions.length === 0) {
        console.error('Required elements not found for timezone setting');
        return;
    }
    
    // Update hidden select
    hiddenSelect.value = timezone;
    
    // Update custom dropdown display
    let found = false;
    customOptions.forEach(option => {
        option.classList.remove('selected');
        if (option.getAttribute('data-value') === timezone) {
            option.classList.add('selected');
            selectedText.textContent = option.textContent;
            found = true;
            console.log('Found and set timezone option:', timezone, option.textContent);
        }
    });
    
    if (!found) {
        console.warn('Timezone option not found:', timezone);
        // Fallback to UTC
        customOptions.forEach(option => {
            if (option.getAttribute('data-value') === 'UTC') {
                option.classList.add('selected');
                selectedText.textContent = option.textContent;
            }
        });
    }
    
    userTimezone = timezone;
}

// Immediately save timezone change to database
async function saveTimezoneChange(timezone) {
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
                timezone: timezone
            })
        });
        
        if (response.ok) {
            console.log('Timezone saved to database immediately:', timezone);
            // Also update localStorage for other pages to sync
            localStorage.setItem('timezone', timezone);
        } else if (response.status === 401) {
            logout();
        }
    } catch (error) {
        console.error('Error saving timezone change:', error);
    }
}

// Toast notification functions - matching script.js implementation
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

// Setup Trading Sounds toggle functionality
function setupTradingSoundsToggle() {
    const toggle = document.getElementById('trading-sounds-toggle');
    const toggleText = document.getElementById('trading-sounds-text');
    
    if (!toggle || !toggleText) return;
    
    // Load current setting from localStorage
    const isEnabled = localStorage.getItem('trading-sounds-enabled') !== 'false';
    toggle.checked = isEnabled;
    toggleText.textContent = isEnabled ? 'Enabled' : 'Disabled';
    
    // Handle toggle change
    toggle.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        localStorage.setItem('trading-sounds-enabled', enabled);
        toggleText.textContent = enabled ? 'Enabled' : 'Disabled';
        
        showToast(
            `Trading sounds ${enabled ? 'enabled' : 'disabled'}`, 
            'success', 
            3000
        );
    });
}