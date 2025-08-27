const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const Decimal = require('decimal.js');
const logger = require('./utils/logger');

// Configure Decimal.js for financial precision
Decimal.config({ precision: 28, rounding: 4 });

// Create PostgreSQL connection pool
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'cryptosim',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection with async/await
(async () => {
    try {
        const client = await pool.connect();
        logger.info('Connected to PostgreSQL database');
        client.release();
    } catch (err) {
        logger.error('Error acquiring database client', { 
            error: err.message, 
            stack: err.stack 
        });
    }
})();

/**
 * Create a new user in the database
 * @param {string} username - The username (3-20 characters, alphanumeric)
 * @param {string} password - The plain text password (min 6 characters)
 * @returns {Promise<number>} The created user ID
 * @throws {Error} If user creation fails or username exists
 */
const createUser = async (username, password) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const userResult = await client.query(
            'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id',
            [username, hashedPassword]
        );
        
        const userId = userResult.rows[0].id;
        
        // Create initial user data (default to 'real' account)
        await client.query(
            'INSERT INTO user_data (user_id, account_type) VALUES ($1, $2)',
            [userId, 'real']
        );
        
        await client.query('COMMIT');
        return userId;
        
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Authenticate a user with username and password
 * @param {string} username - The username to authenticate
 * @param {string} password - The plain text password
 * @returns {Promise<Object|null>} User object if authentication succeeds, null otherwise
 * @returns {Promise<Object>} returns.id - User ID
 * @returns {Promise<Object>} returns.username - Username
 * @returns {Promise<Object>} returns.created_at - Account creation timestamp
 */
const authenticateUser = async (username, password) => {
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const user = result.rows[0];
        const isValidPassword = await bcrypt.compare(password, user.password);
        
        return isValidPassword ? user : null;
    } catch (error) {
        throw error;
    }
};

/**
 * Get user data including balances and trading history
 * @param {number} userId - The user ID
 * @returns {Promise<Object|null>} User data object or null if not found
 * @returns {Promise<Object>} returns.usd_balance - USD balance as number
 * @returns {Promise<Object>} returns.btc_balance - BTC balance as number
 * @returns {Promise<Object>} returns.transactions - Array of transaction objects
 * @returns {Promise<Object>} returns.leverage_positions - Array of position objects
 * @returns {Promise<Object>} returns.timezone - User timezone string
 */
const getUserData = async (userId) => {
    try {
        const result = await pool.query(`
            SELECT ud.id, ud.user_id, ud.usd_balance, ud.btc_balance, 
                   ud.transactions, ud.leverage_positions, ud.timezone, 
                   ud.updated_at, ud.role, u.created_at as member_since 
            FROM user_data ud 
            JOIN users u ON ud.user_id = u.id 
            WHERE ud.user_id = $1
        `, [userId]);
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const userData = result.rows[0];
        return {
            ...userData,
            usd_balance: parseFloat(userData.usd_balance),
            btc_balance: parseFloat(userData.btc_balance)
        };
    } catch (error) {
        throw error;
    }
};

const updateUserData = async (userId, data) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Add row-level locking to prevent concurrent updates
        await client.query('SELECT * FROM user_data WHERE user_id = $1 FOR UPDATE', [userId]);
        
        await client.query(`
            UPDATE user_data 
            SET usd_balance = $1, btc_balance = $2, transactions = $3, 
                leverage_positions = $4, timezone = $5, role = $6, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $7
        `, [
            data.usdBalance, 
            data.btcBalance, 
            JSON.stringify(data.transactions || []), 
            JSON.stringify(data.leveragePositions || []), 
            data.timezone || 'UTC',
            data.role || 'user',
            userId
        ]);
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

// Chart settings functions
const saveChartSettings = async (userId, market, settings) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { indicators, indicatorSettings, drawings, chartType } = settings;
        
        await client.query(`
            INSERT INTO chart_settings 
            (user_id, market, indicators, indicator_settings, drawings, chart_type)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (user_id, market) 
            DO UPDATE SET 
                indicators = $3,
                indicator_settings = $4,
                drawings = $5,
                chart_type = $6,
                updated_at = CURRENT_TIMESTAMP
        `, [
            userId,
            market,
            JSON.stringify(indicators || {}),
            JSON.stringify(indicatorSettings || {}),
            JSON.stringify(drawings || []),
            chartType || 'candlestick'
        ]);
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const getChartSettings = async (userId, market) => {
    try {
        const result = await pool.query(
            'SELECT * FROM chart_settings WHERE user_id = $1 AND market = $2',
            [userId, market]
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        return result.rows[0];
    } catch (error) {
        throw error;
    }
};

const deleteChartSettings = async (userId, market) => {
    try {
        await pool.query(
            'DELETE FROM chart_settings WHERE user_id = $1 AND market = $2',
            [userId, market]
        );
    } catch (error) {
        throw error;
    }
};

// Batch operations
const getUsersByIds = async (userIds) => {
    if (!userIds.length) return [];
    
    try {
        const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
        const result = await pool.query(
            `SELECT * FROM users WHERE id IN (${placeholders})`,
            userIds
        );
        return result.rows;
    } catch (error) {
        throw error;
    }
};

const getUserDataByIds = async (userIds) => {
    if (!userIds.length) return [];
    
    try {
        const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
        const result = await pool.query(`
            SELECT ud.*, u.created_at as member_since, u.username 
            FROM user_data ud 
            JOIN users u ON ud.user_id = u.id 
            WHERE ud.user_id IN (${placeholders})
        `, userIds);
        
        return result.rows.map(row => ({
            ...row,
            usd_balance: parseFloat(row.usd_balance),
            btc_balance: parseFloat(row.btc_balance)
        }));
    } catch (error) {
        throw error;
    }
};

// Candles functions for market data
const saveCandles = async (candles, bar) => {
    if (!candles.length) return;
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        for (const candle of candles) {
            await client.query(`
                INSERT INTO candles (inst_id, bar, timestamp, open, high, low, close, volume, vol_ccy)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (inst_id, bar, timestamp) DO UPDATE SET
                    open = EXCLUDED.open,
                    high = EXCLUDED.high,
                    low = EXCLUDED.low,
                    close = EXCLUDED.close,
                    volume = EXCLUDED.volume,
                    vol_ccy = EXCLUDED.vol_ccy
            `, [
                candle.instId,
                bar,
                candle.timestamp,
                candle.open,
                candle.high,
                candle.low,
                candle.close,
                candle.volume,
                candle.volCcy || 0
            ]);
        }
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const getCandles = async (instId, bar, limit = 1000) => {
    try {
        const result = await pool.query(`
            SELECT * FROM candles 
            WHERE inst_id = $1 AND bar = $2 
            ORDER BY timestamp DESC 
            LIMIT $3
        `, [instId, bar, limit]);
        
        return result.rows.reverse(); // Return in ascending order
    } catch (error) {
        throw error;
    }
};

const getAllStoredCandles = async (instId, bar) => {
    try {
        const result = await pool.query(`
            SELECT * FROM candles 
            WHERE inst_id = $1 AND bar = $2 
            ORDER BY timestamp ASC
        `, [instId, bar]);
        
        return result.rows;
    } catch (error) {
        throw error;
    }
};

// Chat functions
const saveChatMessage = async (userId, username, message, messageType = 'message', metadata = null) => {
    try {
        const result = await pool.query(`
            INSERT INTO chat_messages (user_id, username, message, message_type, metadata) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING id, user_id, username, message, message_type, metadata, created_at
        `, [userId, username, message, messageType, metadata]);
        
        return result.rows[0];
    } catch (error) {
        logger.error('Error saving chat message', { userId, username, error: error.message });
        throw error;
    }
};

const getChatHistory = async (limit = 50) => {
    try {
        const result = await pool.query(`
            SELECT id, user_id, username, message, message_type, metadata, created_at 
            FROM chat_messages 
            ORDER BY created_at DESC 
            LIMIT $1
        `, [limit]);
        
        return result.rows.reverse(); // Reverse to get chronological order
    } catch (error) {
        logger.error('Error getting chat history', { limit, error: error.message });
        throw error;
    }
};

const deleteChatMessage = async (messageId, userId) => {
    try {
        const result = await pool.query(`
            DELETE FROM chat_messages 
            WHERE id = $1 AND user_id = $2 
            RETURNING id
        `, [messageId, userId]);
        
        return result.rowCount > 0;
    } catch (error) {
        logger.error('Error deleting chat message', { messageId, userId, error: error.message });
        throw error;
    }
};

// Initialize chat messages table
const initializeChatTable = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                username VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                message_type VARCHAR(20) DEFAULT 'message',
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create index for faster queries
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at 
            ON chat_messages(created_at DESC)
        `);
        
        logger.info('Chat messages table initialized');
    } catch (error) {
        logger.error('Error initializing chat table', { error: error.message });
    }
};

// Call initialization on startup
initializeChatTable();

// Ranking system functions
/**
 * Get trading rankings (excluding demo accounts)
 * @param {number} [limit=50] - Number of top users to return
 * @returns {Promise<Array>} Array of user rankings with stats
 */
const getRankings = async (limit = 50) => {
    try {
        // First, check if account_type column exists
        const columnCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user_data' AND column_name = 'account_type'
        `);
        
        const hasAccountType = columnCheck.rows.length > 0;
        
        // Use simpler query that works without account_type column
        const result = await pool.query(`
            WITH user_stats AS (
                SELECT 
                    u.id,
                    u.username,
                    COALESCE(ud.usd_balance, 10000) as usd_balance,
                    COALESCE(ud.btc_balance, 0) as btc_balance,
                    COALESCE(ud.transactions, '[]'::jsonb) as transactions,
                    COALESCE(ud.leverage_positions, '[]'::jsonb) as leverage_positions,
                    u.created_at as member_since
                FROM users u
                LEFT JOIN user_data ud ON u.id = ud.user_id
                ${hasAccountType ? "WHERE COALESCE(ud.account_type, 'real') = 'real'" : ""}
            ),
            calculated_stats AS (
                SELECT 
                    us.id,
                    us.username,
                    us.usd_balance,
                    us.btc_balance,
                    us.member_since,
                    -- Calculate total asset value (use fixed BTC price for now)
                    (us.usd_balance + (us.btc_balance * 50000)) as total_assets,
                    -- Calculate ROI based on initial $10,000
                    ((us.usd_balance + (us.btc_balance * 50000) - 10000) / 10000 * 100) as roi,
                    -- Calculate trading statistics
                    jsonb_array_length(us.transactions) as total_trades,
                    -- Simple win rate calculation (placeholder)
                    CASE 
                        WHEN jsonb_array_length(us.transactions) > 0 
                        THEN (
                            SELECT COUNT(*)::float / jsonb_array_length(us.transactions) * 100
                            FROM jsonb_array_elements(us.transactions) as txn
                            WHERE COALESCE((txn->>'pnl')::float, 0) > 0
                        )
                        ELSE 0
                    END as win_rate
                FROM user_stats us
            )
            SELECT 
                id,
                username,
                total_assets,
                roi,
                total_trades,
                COALESCE(win_rate, 0) as win_rate,
                member_since,
                ROW_NUMBER() OVER (ORDER BY roi DESC, total_assets DESC) as rank
            FROM calculated_stats
            WHERE total_trades > 0 OR total_assets != 10000
            ORDER BY roi DESC, total_assets DESC
            LIMIT $1
        `, [limit]);
        
        return result.rows;
    } catch (error) {
        logger.error('Error fetching rankings', { error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * Get specific user ranking and stats
 * @param {number} userId - User ID to get ranking for
 * @returns {Promise<Object|null>} User ranking data or null
 */
const getUserRanking = async (userId) => {
    try {
        // Get all rankings first
        const allRankings = await getRankings(100);
        
        // Find the user in the rankings
        const userRanking = allRankings.find(ranking => ranking.id === userId);
        
        if (!userRanking) {
            return null;
        }
        
        return userRanking;
    } catch (error) {
        logger.error('Error fetching user ranking', { userId, error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * Update user account type
 * @param {number} userId - User ID
 * @param {'real'|'demo'} accountType - Account type
 * @returns {Promise<boolean>} Success status
 */
const updateAccountType = async (userId, accountType) => {
    try {
        const result = await pool.query(
            'UPDATE user_data SET account_type = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
            [accountType, userId]
        );
        
        return result.rowCount > 0;
    } catch (error) {
        logger.error('Error updating account type', { userId, accountType, error: error.message });
        throw error;
    }
};

/**
 * Initialize account_type column if it doesn't exist
 */
const initializeAccountTypeColumn = async () => {
    try {
        // Check if account_type column exists
        const columnExists = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user_data' AND column_name = 'account_type'
        `);
        
        if (columnExists.rows.length === 0) {
            // Add account_type column
            await pool.query(`
                ALTER TABLE user_data 
                ADD COLUMN account_type VARCHAR(10) DEFAULT 'real'
            `);
            
            logger.info('Added account_type column to user_data table');
        }
    } catch (error) {
        logger.error('Error initializing account_type column', { error: error.message });
    }
};

// Initialize account_type column on startup
initializeAccountTypeColumn();

// Graceful shutdown
const closePool = async () => {
    await pool.end();
    logger.info('PostgreSQL pool has ended');
};

process.on('SIGINT', closePool);
process.on('SIGTERM', closePool);

module.exports = {
    pool,
    createUser,
    authenticateUser,
    getUserData,
    updateUserData,
    saveChartSettings,
    getChartSettings,
    deleteChartSettings,
    getUsersByIds,
    getUserDataByIds,
    // Market data functions
    saveCandles,
    getCandles,
    getAllStoredCandles,
    // Chat functions
    saveChatMessage,
    getChatHistory,
    deleteChatMessage,
    // Ranking functions
    getRankings,
    getUserRanking,
    updateAccountType,
    closePool
};