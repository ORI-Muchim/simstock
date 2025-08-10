const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

// Create database connection
const db = new sqlite3.Database(path.join(__dirname, 'trading.db'));

// Initialize database tables
db.serialize(() => {
    // Users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // User data table
    db.run(`
        CREATE TABLE IF NOT EXISTS user_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            usd_balance REAL DEFAULT 10000,
            btc_balance REAL DEFAULT 0,
            transactions TEXT DEFAULT '[]',
            leverage_positions TEXT DEFAULT '[]',
            timezone TEXT DEFAULT 'UTC',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    `);
    
    // Add timezone column to existing user_data table if it doesn't exist
    db.run(`ALTER TABLE user_data ADD COLUMN timezone TEXT DEFAULT 'UTC'`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding timezone column:', err);
        }
    });
});

// User functions
const createUser = (username, password) => {
    return new Promise((resolve, reject) => {
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return reject(err);
            
            db.run(
                'INSERT INTO users (username, password) VALUES (?, ?)',
                [username, hash],
                function(err) {
                    if (err) return reject(err);
                    
                    const userId = this.lastID;
                    // Create initial user data
                    db.run(
                        'INSERT INTO user_data (user_id) VALUES (?)',
                        [userId],
                        (err) => {
                            if (err) return reject(err);
                            resolve(userId);
                        }
                    );
                }
            );
        });
    });
};

const authenticateUser = (username, password) => {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM users WHERE username = ?',
            [username],
            (err, user) => {
                if (err) return reject(err);
                if (!user) return resolve(null);
                
                bcrypt.compare(password, user.password, (err, result) => {
                    if (err) return reject(err);
                    resolve(result ? user : null);
                });
            }
        );
    });
};

const getUserData = (userId) => {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM user_data WHERE user_id = ?',
            [userId],
            (err, data) => {
                if (err) return reject(err);
                if (data) {
                    data.transactions = JSON.parse(data.transactions);
                    data.leverage_positions = JSON.parse(data.leverage_positions);
                }
                resolve(data);
            }
        );
    });
};

const updateUserData = (userId, data) => {
    return new Promise((resolve, reject) => {
        const transactions = JSON.stringify(data.transactions || []);
        const leveragePositions = JSON.stringify(data.leveragePositions || []);
        
        db.run(
            `UPDATE user_data 
             SET usd_balance = ?, btc_balance = ?, transactions = ?, leverage_positions = ?, timezone = ?, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = ?`,
            [data.usdBalance, data.btcBalance, transactions, leveragePositions, data.timezone || 'UTC', userId],
            (err) => {
                if (err) return reject(err);
                resolve();
            }
        );
    });
};

module.exports = {
    db,
    createUser,
    authenticateUser,
    getUserData,
    updateUserData
};