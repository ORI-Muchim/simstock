/**
 * @fileoverview Rankings page functionality for CryptoSim
 * Displays investment rankings excluding demo accounts
 */

document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const rankingsTableBody = document.getElementById('rankings-table-body');
    const rankingLimitSelect = document.getElementById('ranking-limit');
    const refreshButton = document.getElementById('refresh-rankings');
    const loadingState = document.getElementById('loading-state');
    const emptyState = document.getElementById('empty-state');
    const lastUpdatedSpan = document.getElementById('last-updated');
    const logoutBtn = document.getElementById('logout-btn');
    
    // User ranking elements
    const userRankingSection = document.getElementById('user-ranking-section');
    const userRankSpan = document.getElementById('user-rank');
    const userTotalAssetsSpan = document.getElementById('user-total-assets');
    const userRoiSpan = document.getElementById('user-roi');
    const userWinRateSpan = document.getElementById('user-win-rate');
    const userTotalTradesSpan = document.getElementById('user-total-trades');

    let currentUser = null;
    let currentLimit = 50;

    /**
     * Initialize the rankings page
     */
    async function init() {
        try {
            await loadUserInfo();
            await loadRankings();
            await loadUserRanking();
            setupEventListeners();
        } catch (error) {
            console.error('Failed to initialize rankings page:', error);
            showError('Failed to load rankings data');
        }
    }

    /**
     * Load current user information
     */
    async function loadUserInfo() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                window.location.href = '/login';
                return;
            }

            const response = await fetch('/api/user/data', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                currentUser = result.data;
                document.getElementById('current-user').textContent = currentUser.username || 'User';
                
                // Update balance display
                const usdBalance = currentUser.usdBalance || 0;
                const btcBalance = currentUser.btcBalance || 0;
                document.getElementById('krw-balance').textContent = `$${usdBalance.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })}`;
                document.getElementById('btc-balance').textContent = btcBalance.toFixed(8);
            }
        } catch (error) {
            console.error('Error loading user info:', error);
        }
    }

    /**
     * Load rankings data from API
     */
    async function loadRankings() {
        showLoading();
        
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/rankings?limit=${currentLimit}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.success) {
                displayRankings(result.data.rankings);
                updateLastUpdated(result.data.lastUpdated);
            } else {
                throw new Error(result.error || 'Failed to load rankings');
            }
        } catch (error) {
            console.error('Error loading rankings:', error);
            showError('Failed to load rankings');
        } finally {
            hideLoading();
        }
    }

    /**
     * Load current user's ranking
     */
    async function loadUserRanking() {
        if (!currentUser || !currentUser.id) return;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/rankings/user/${currentUser.id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    displayUserRanking(result.data);
                }
            } else if (response.status === 404) {
                // User not found in rankings (demo account or no trades)
                userRankingSection.style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading user ranking:', error);
        }
    }

    /**
     * Display rankings in the table
     * @param {Array} rankings - Array of ranking objects
     */
    function displayRankings(rankings) {
        if (!rankings || rankings.length === 0) {
            showEmptyState();
            return;
        }

        hideEmptyState();
        
        const tbody = rankingsTableBody;
        tbody.innerHTML = '';

        rankings.forEach((ranking, index) => {
            const row = createRankingRow(ranking, index + 1);
            tbody.appendChild(row);
        });
    }

    /**
     * Create a table row for a ranking entry
     * @param {Object} ranking - Ranking data
     * @param {number} position - Position in rankings
     * @returns {HTMLTableRowElement}
     */
    function createRankingRow(ranking, position) {
        const row = document.createElement('tr');
        row.className = 'ranking-row';
        
        // Highlight current user's row
        if (currentUser && ranking.username === currentUser.username) {
            row.classList.add('current-user-row');
        }

        // Rank badge
        let rankBadge = `<span class="rank-badge">#${position}</span>`;
        if (position <= 3) {
            const medals = ['🥇', '🥈', '🥉'];
            rankBadge = `<span class="rank-badge medal">${medals[position - 1]} #${position}</span>`;
        }

        // ROI color class
        const roi = parseFloat(ranking.roi) || 0;
        const roiClass = roi >= 0 ? 'positive' : 'negative';
        const roiSign = roi >= 0 ? '+' : '';

        // Member since formatting
        const memberSince = new Date(ranking.member_since).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short'
        });

        row.innerHTML = `
            <td class="rank-col">${rankBadge}</td>
            <td class="username-col">
                <div class="username-container">
                    <span class="username">${escapeHtml(ranking.username)}</span>
                    ${ranking.username === (currentUser?.username) ? '<span class="you-badge">You</span>' : ''}
                </div>
            </td>
            <td class="assets-col">
                <span class="amount">$${formatNumber(ranking.total_assets)}</span>
            </td>
            <td class="roi-col">
                <span class="roi ${roiClass}">${roiSign}${roi.toFixed(2)}%</span>
            </td>
            <td class="winrate-col">
                <span class="winrate">${(ranking.win_rate || 0).toFixed(1)}%</span>
            </td>
            <td class="trades-col">
                <span class="trades-count">${ranking.total_trades || 0}</span>
            </td>
            <td class="member-col">
                <span class="member-date">${memberSince}</span>
            </td>
        `;

        return row;
    }

    /**
     * Display user's personal ranking
     * @param {Object} userRanking - User ranking data
     */
    function displayUserRanking(userRanking) {
        userRankSpan.textContent = userRanking.rank || '-';
        userTotalAssetsSpan.textContent = `$${formatNumber(userRanking.total_assets)}`;
        
        const roi = parseFloat(userRanking.roi) || 0;
        const roiSign = roi >= 0 ? '+' : '';
        userRoiSpan.textContent = `${roiSign}${roi.toFixed(2)}%`;
        userRoiSpan.className = `rank-value ${roi >= 0 ? 'positive' : 'negative'}`;
        
        userWinRateSpan.textContent = `${(userRanking.win_rate || 0).toFixed(1)}%`;
        userTotalTradesSpan.textContent = userRanking.total_trades || 0;
        
        userRankingSection.style.display = 'block';
    }

    /**
     * Setup event listeners
     */
    function setupEventListeners() {
        // Limit selector change
        rankingLimitSelect.addEventListener('change', function() {
            currentLimit = parseInt(this.value);
            loadRankings();
        });

        // Refresh button
        refreshButton.addEventListener('click', function() {
            loadRankings();
            loadUserRanking();
        });

        // Logout functionality
        if (logoutBtn) {
            logoutBtn.addEventListener('click', function(e) {
                e.preventDefault();
                localStorage.removeItem('token');
                window.location.href = '/login';
            });
        }

        // Auto-refresh every 30 seconds
        setInterval(() => {
            loadRankings();
            loadUserRanking();
        }, 30000);
    }

    /**
     * Show loading state
     */
    function showLoading() {
        loadingState.style.display = 'flex';
        emptyState.style.display = 'none';
    }

    /**
     * Hide loading state
     */
    function hideLoading() {
        loadingState.style.display = 'none';
    }

    /**
     * Show empty state
     */
    function showEmptyState() {
        emptyState.style.display = 'block';
        rankingsTableBody.innerHTML = '';
    }

    /**
     * Hide empty state
     */
    function hideEmptyState() {
        emptyState.style.display = 'none';
    }

    /**
     * Show error message
     * @param {string} message - Error message to display
     */
    function showError(message) {
        hideLoading();
        rankingsTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    ${message}
                </td>
            </tr>
        `;
    }

    /**
     * Update last updated time
     * @param {string} timestamp - ISO timestamp
     */
    function updateLastUpdated(timestamp) {
        if (!timestamp) return;
        
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffSeconds = Math.floor(diffMs / 1000);
        
        let timeAgo;
        if (diffSeconds < 60) {
            timeAgo = 'Just now';
        } else if (diffSeconds < 3600) {
            const minutes = Math.floor(diffSeconds / 60);
            timeAgo = `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else {
            timeAgo = date.toLocaleTimeString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        }
        
        lastUpdatedSpan.textContent = timeAgo;
    }

    /**
     * Format number with appropriate decimal places
     * @param {number} num - Number to format
     * @returns {string} Formatted number
     */
    function formatNumber(num) {
        if (!num || isNaN(num)) return '0.00';
        
        const absNum = Math.abs(num);
        
        if (absNum >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (absNum >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        } else {
            return num.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Initialize the page
    init();
});