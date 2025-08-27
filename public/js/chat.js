// Community Chat System
let chatSocket = null;
let chatMessages = [];
let unreadCount = 0;
let isChatOpen = false;
let onlineUsers = 0;
let selectedSuggestionIndex = -1;

// Initialize chat when DOM is loaded
document.addEventListener('DOMContentLoaded', initializeChat);

function initializeChat() {
    // Get elements
    const chatToggle = document.getElementById('chat-toggle');
    const chatContainer = document.getElementById('chat-container');
    const chatMinimize = document.getElementById('chat-minimize');
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');
    const chatMessagesContainer = document.getElementById('chat-messages');
    
    // Toggle chat window
    chatToggle.addEventListener('click', () => {
        if (!isChatOpen) {
            // Open chat
            isChatOpen = true;
            chatContainer.classList.add('active');
            unreadCount = 0;
            updateNotificationBadge();
            setTimeout(() => chatInput.focus(), 350);
            // Connect to chat if not connected
            if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
                connectToChat();
            }
        } else {
            // Close chat with animation
            closeChat();
        }
    });
    
    // Minimize chat
    chatMinimize.addEventListener('click', () => {
        closeChat();
    });
    
    // Function to close chat with animation
    function closeChat() {
        isChatOpen = false;
        chatContainer.classList.remove('active');
    }
    
    // Handle input for slash commands
    const suggestions = document.getElementById('chat-suggestions');
    const suggestionItems = suggestions.querySelectorAll('.suggestion-item');
    
    chatInput.addEventListener('input', (e) => {
        const value = e.target.value;
        
        if (value === '/') {
            // Show all suggestions
            suggestions.style.display = 'block';
            selectedSuggestionIndex = -1;
            // Reset all suggestions to visible
            suggestionItems.forEach(item => {
                item.style.display = 'flex';
            });
            updateSuggestionSelection();
        } else if (value.startsWith('/')) {
            // Filter suggestions
            const command = value.toLowerCase();
            let hasVisibleSuggestion = false;
            
            suggestionItems.forEach(item => {
                const cmd = item.dataset.command.toLowerCase();
                if (cmd.startsWith(command)) {
                    item.style.display = 'flex';
                    hasVisibleSuggestion = true;
                } else {
                    item.style.display = 'none';
                }
            });
            
            if (hasVisibleSuggestion) {
                suggestions.style.display = 'block';
            } else {
                suggestions.style.display = 'none';
            }
        } else {
            // Hide suggestions
            suggestions.style.display = 'none';
            selectedSuggestionIndex = -1;
            // Reset all suggestions for next time
            suggestionItems.forEach(item => {
                item.style.display = 'flex';
            });
        }
    });
    
    // Handle keyboard navigation for suggestions
    chatInput.addEventListener('keydown', (e) => {
        if (suggestions.style.display === 'block') {
            const visibleItems = Array.from(suggestionItems).filter(item => 
                item.style.display !== 'none'
            );
            
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedSuggestionIndex = Math.max(0, selectedSuggestionIndex - 1);
                updateSuggestionSelection();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedSuggestionIndex = Math.min(visibleItems.length - 1, selectedSuggestionIndex + 1);
                updateSuggestionSelection();
            } else if (e.key === 'Tab' || (e.key === 'Enter' && selectedSuggestionIndex >= 0)) {
                e.preventDefault();
                if (visibleItems[selectedSuggestionIndex]) {
                    const command = visibleItems[selectedSuggestionIndex].dataset.command;
                    chatInput.value = command + ' ';
                    suggestions.style.display = 'none';
                    selectedSuggestionIndex = -1;
                }
            } else if (e.key === 'Escape') {
                suggestions.style.display = 'none';
                selectedSuggestionIndex = -1;
            }
        }
        
        if (e.key === 'Enter' && !e.shiftKey && selectedSuggestionIndex === -1) {
            e.preventDefault();
            sendChatMessage();
        }
    });
    
    // Click on suggestion
    suggestionItems.forEach((item, index) => {
        item.addEventListener('click', () => {
            chatInput.value = item.dataset.command + ' ';
            suggestions.style.display = 'none';
            chatInput.focus();
        });
    });
    
    // Update visual selection
    function updateSuggestionSelection() {
        const visibleItems = Array.from(suggestionItems).filter(item => 
            item.style.display !== 'none'
        );
        
        visibleItems.forEach((item, index) => {
            if (index === selectedSuggestionIndex) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }
    
    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!chatContainer.contains(e.target)) {
            suggestions.style.display = 'none';
            selectedSuggestionIndex = -1;
        }
    });
    
    // Send message on button click
    chatSend.addEventListener('click', sendChatMessage);
    
    // Connect to chat WebSocket
    connectToChat();
}

function connectToChat() {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    
    if (!token || !username) {
        console.log('Not logged in, skipping chat connection');
        return;
    }
    
    // Use the same WebSocket server but different endpoint for chat
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/chat?token=${encodeURIComponent(token)}`;
    
    try {
        chatSocket = new WebSocket(wsUrl);
        
        chatSocket.onopen = () => {
            console.log('Connected to chat server');
            // Send authentication
            chatSocket.send(JSON.stringify({
                type: 'auth',
                token: token,
                username: username
            }));
        };
        
        chatSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleChatMessage(data);
            } catch (error) {
                console.error('Error parsing chat message:', error);
            }
        };
        
        chatSocket.onerror = (error) => {
            console.error('Chat WebSocket error:', error);
        };
        
        chatSocket.onclose = () => {
            console.log('Disconnected from chat server');
            // Try to reconnect after 5 seconds
            setTimeout(() => {
                if (isChatOpen || document.getElementById('chat-container').classList.contains('active')) {
                    connectToChat();
                }
            }, 5000);
        };
    } catch (error) {
        console.error('Failed to connect to chat:', error);
    }
}

function handleChatMessage(data) {
    switch(data.type) {
        case 'message':
            displayChatMessage(data);
            // Update unread count if chat is closed
            if (!isChatOpen) {
                unreadCount++;
                updateNotificationBadge();
            }
            break;
            
        case 'online_count':
            updateOnlineCount(data.count);
            break;
            
        case 'history':
            displayChatHistory(data.messages);
            break;
            
        case 'system':
            displaySystemMessage(data.message);
            break;
            
        case 'trade_share':
            displayTradeShare(data);
            break;
    }
}

function displayChatMessage(data) {
    const messagesContainer = document.getElementById('chat-messages');
    const currentUser = localStorage.getItem('username');
    
    // Remove welcome message if it exists
    const welcomeMsg = messagesContainer.querySelector('.chat-welcome');
    if (welcomeMsg) {
        welcomeMsg.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${data.username === currentUser ? 'own' : ''}`;
    
    const timestamp = new Date(data.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    messageDiv.innerHTML = `
        <div class="chat-message-content">
            <div class="chat-message-header">
                <span class="chat-username">${data.username}</span>
                <span class="chat-timestamp">${timestamp}</span>
            </div>
            <div class="chat-message-text">${escapeHtml(data.message)}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function displaySystemMessage(message) {
    const messagesContainer = document.getElementById('chat-messages');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-system-message';
    messageDiv.textContent = message;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function displayTradeShare(data) {
    const messagesContainer = document.getElementById('chat-messages');
    const currentUser = localStorage.getItem('username');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${data.username === currentUser ? 'own' : ''}`;
    
    const timestamp = new Date(data.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const pnlClass = data.pnl >= 0 ? 'trade-profit' : 'trade-loss';
    const pnlPrefix = data.pnl >= 0 ? '+' : '';
    
    // For liquidations, ensure P&L is negative
    const pnlValue = data.tradeType && data.tradeType.includes('LIQUIDATED') ? 
        (data.pnl > 0 ? -data.pnl : data.pnl) : data.pnl;
    
    messageDiv.innerHTML = `
        <div class="chat-message-content">
            <div class="chat-message-header">
                <span class="chat-username">${data.username}</span>
                <span class="chat-timestamp">${timestamp}</span>
            </div>
            <div class="chat-message-text">${escapeHtml(data.message)}</div>
            <div class="chat-trade-share">
                <div class="trade-type">🎯 ${data.tradeType}</div>
                <div>Leverage: ${data.leverage}x</div>
                <div>Entry: $${data.entryPrice}</div>
                <div>Exit: $${data.exitPrice}</div>
                <div class="${pnlValue >= 0 ? 'trade-profit' : 'trade-loss'}">P&L: ${pnlValue >= 0 ? '+' : '-'}$${Math.abs(pnlValue).toFixed(2)}</div>
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function displayChatHistory(messages) {
    const messagesContainer = document.getElementById('chat-messages');
    
    // Clear existing messages except welcome
    messagesContainer.innerHTML = '';
    
    if (messages && messages.length > 0) {
        messages.forEach(msg => {
            // Check message_type from database
            if (msg.message_type === 'trade_share' && msg.metadata) {
                // Reconstruct trade share message with metadata
                const tradeShareData = {
                    type: 'trade_share',
                    username: msg.username,
                    message: msg.message,
                    timestamp: msg.timestamp || msg.created_at,
                    ...msg.metadata // Spread metadata fields
                };
                displayTradeShare(tradeShareData);
            } else {
                displayChatMessage(msg);
            }
        });
    } else {
        // Show welcome message if no history
        messagesContainer.innerHTML = `
            <div class="chat-welcome">
                Welcome to CryptoSim Community Chat!<br>
                Share your trades and strategies with other traders.
            </div>
        `;
    }
}

function sendChatMessage() {
    const chatInput = document.getElementById('chat-input');
    const message = chatInput.value.trim();
    
    if (!message) return;
    
    if (!chatSocket || chatSocket.readyState !== WebSocket.OPEN) {
        showToast('Chat is not connected. Please try again.', 'error');
        connectToChat();
        return;
    }
    
    // Check for slash commands
    if (message.startsWith('/')) {
        const command = message.split(' ')[0].toLowerCase();
        
        switch(command) {
            case '/share':
                shareLastTrade();
                break;
                
            case '/help':
                displaySystemMessage(`
                    Available commands:
                    /share - Share your last trade
                    /stats - Show your trading statistics  
                    /clear - Clear chat history (local only)
                    /help - Show this help message
                `);
                break;
                
            case '/stats':
                showTradingStats();
                break;
                
            case '/clear':
                const messagesContainer = document.getElementById('chat-messages');
                messagesContainer.innerHTML = `
                    <div class="chat-welcome">
                        Chat cleared. Welcome back to CryptoSim Community Chat!
                    </div>
                `;
                displaySystemMessage('Chat history cleared (local only)');
                break;
                
            default:
                displaySystemMessage(`Unknown command: ${command}. Type /help for available commands.`);
        }
    } else {
        // Send regular message
        chatSocket.send(JSON.stringify({
            type: 'message',
            message: message
        }));
    }
    
    chatInput.value = '';
    
    // Hide suggestions after sending
    const suggestions = document.getElementById('chat-suggestions');
    suggestions.style.display = 'none';
    selectedSuggestionIndex = -1;
}

function shareLastTrade() {
    // Get the last closed position from transactions
    const lastTrade = transactions.find(tx => 
        tx.type?.startsWith('close_') || tx.type === 'liquidation'
    );
    
    if (!lastTrade) {
        displaySystemMessage('No trades to share yet.');
        return;
    }
    
    let tradeData;
    if (lastTrade.type === 'liquidation') {
        tradeData = {
            type: 'trade_share',
            message: '💀 Got liquidated!',
            tradeType: `LIQUIDATED ${lastTrade.positionType?.toUpperCase() || 'POSITION'}`,
            leverage: lastTrade.leverage || 1,
            entryPrice: (lastTrade.entryPrice || 0).toFixed(2),
            exitPrice: (lastTrade.liquidationPrice || 0).toFixed(2),
            pnl: lastTrade.loss || 0  // loss is already negative in script.js
        };
    } else {
        const positionType = lastTrade.type.replace('close_', '').toUpperCase();
        tradeData = {
            type: 'trade_share',
            message: lastTrade.pnl >= 0 ? '🚀 Closed with profit!' : '📉 Closed with loss',
            tradeType: `CLOSE ${positionType}`,
            leverage: lastTrade.leverage || 1,
            entryPrice: (lastTrade.entryPrice || 0).toFixed(2),
            exitPrice: (lastTrade.exitPrice || 0).toFixed(2),
            pnl: lastTrade.pnl || 0
        };
    }
    
    chatSocket.send(JSON.stringify(tradeData));
}

function updateOnlineCount(count) {
    onlineUsers = count;
    const onlineCountElement = document.getElementById('online-count');
    if (onlineCountElement) {
        onlineCountElement.textContent = `(${count} online)`;
    }
}

function updateNotificationBadge() {
    const notificationElement = document.getElementById('chat-notification');
    if (notificationElement) {
        if (unreadCount > 0) {
            notificationElement.textContent = unreadCount > 99 ? '99+' : unreadCount.toString();
            notificationElement.style.display = 'flex';
        } else {
            notificationElement.style.display = 'none';
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showTradingStats() {
    // Calculate stats from transactions
    let totalTrades = 0;
    let winningTrades = 0;
    let totalPnl = 0;
    
    transactions.forEach(tx => {
        if (tx.type?.startsWith('close_') || tx.type === 'liquidation') {
            totalTrades++;
            const pnl = tx.type === 'liquidation' ? (tx.loss || 0) : (tx.pnl || 0);
            totalPnl += pnl;
            if (pnl > 0) winningTrades++;
        }
    });
    
    const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) : 0;
    const avgPnl = totalTrades > 0 ? (totalPnl / totalTrades).toFixed(2) : 0;
    
    displaySystemMessage(`
        📊 Your Trading Statistics:
        • Total Trades: ${totalTrades}
        • Win Rate: ${winRate}%
        • Total P&L: ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}
        • Average P&L: ${avgPnl >= 0 ? '+' : ''}$${avgPnl}
        • Current Balance: $${usdBalance.toFixed(2)} USDT
    `);
}

// Export functions for use in main script
window.shareTradeToChat = function(tradeInfo) {
    if (chatSocket && chatSocket.readyState === WebSocket.OPEN) {
        chatSocket.send(JSON.stringify({
            type: 'trade_share',
            ...tradeInfo
        }));
    }
};