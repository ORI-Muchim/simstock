const { Pool } = require('pg');
const bcrypt = require('bcrypt');

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

// Test database connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error acquiring client:', err.stack);
        return;
    }
    console.log('Connected to PostgreSQL database');
    release();
});

// User functions
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
        
        // Create initial user data
        await client.query(
            'INSERT INTO user_data (user_id) VALUES ($1)',
            [userId]
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
    try {
        await pool.query(`
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
    } catch (error) {
        throw error;
    }
};

// Chart settings functions
const saveChartSettings = async (userId, market, settings) => {
    try {
        const { indicators, indicatorSettings, drawings, chartType } = settings;
        
        await pool.query(`
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
    } catch (error) {
        throw error;
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
        console.error('Error saving chat message:', error);
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
        console.error('Error getting chat history:', error);
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
        console.error('Error deleting chat message:', error);
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
        
        console.log('Chat messages table initialized');
    } catch (error) {
        console.error('Error initializing chat table:', error);
    }
};

// Call initialization on startup
initializeChatTable();

// Graceful shutdown
const closePool = async () => {
    await pool.end();
    console.log('PostgreSQL pool has ended');
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
    closePool
};