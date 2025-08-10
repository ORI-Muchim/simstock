const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DataCollector {
    constructor() {
        this.dbPath = path.join(__dirname, 'market_data.db');
        this.initDatabase();
    }

    initDatabase() {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('Database connection error:', err);
            } else {
                console.log('Connected to market data database');
                this.createTables();
            }
        });
    }

    createTables() {
        // Create table only if it doesn't exist - preserves existing data
        const sql = `
            CREATE TABLE IF NOT EXISTS candles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                instId TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume REAL NOT NULL,
                volCcy REAL,
                bar TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(instId, timestamp, bar)
            );

            CREATE INDEX IF NOT EXISTS idx_instId_time ON candles(instId, timestamp);
            CREATE INDEX IF NOT EXISTS idx_bar ON candles(bar);
            CREATE INDEX IF NOT EXISTS idx_created_at ON candles(created_at);
        `;

        this.db.exec(sql, (err) => {
            if (err) {
                console.error('Error creating tables:', err);
            } else {
                console.log('Database tables initialized successfully');
                this.cleanOldData(); // Clean up old data periodically
            }
        });
    }

    // Data preservation - NO automatic deletion
    // All candle data is preserved permanently for historical analysis
    cleanOldData() {
        console.log('All candle data preserved permanently - no automatic cleanup');
        console.log('Historical data retention: ALL timeframes (1m, 3m, 5m, 10m, 15m, 30m, 1H, 4H, 1D) kept forever');
        
        // Optional: Add database optimization without deleting data
        this.optimizeDatabase();
    }
    
    // Optional database optimization (VACUUM, REINDEX) without data loss
    optimizeDatabase() {
        // Run VACUUM to reclaim disk space from deleted records (if any)
        this.db.run('VACUUM', (err) => {
            if (err) {
                console.error('Error running VACUUM:', err);
            } else {
                console.log('Database optimized successfully');
            }
        });
        
        // Rebuild indexes for better performance
        this.db.run('REINDEX', (err) => {
            if (err) {
                console.error('Error rebuilding indexes:', err);
            } else {
                console.log('Database indexes rebuilt successfully');
            }
        });
    }

    async fetchCandles(market = 'BTC-USDT', unit = 1, count = 300) {
        try {
            // Convert unit to OKX bar format
            let bar = '1m';
            switch(unit) {
                case 1: bar = '1m'; break;
                case 3: bar = '3m'; break;
                case 5: bar = '5m'; break;
                case 10: bar = '10m'; break;
                case 15: bar = '15m'; break;
                case 30: bar = '30m'; break;
                case 60: bar = '1H'; break;
                case 240: bar = '4H'; break;
                case 1440: bar = '1D'; break;
                default: bar = '1m';
            }
            
            const response = await axios.get(`https://www.okx.com/api/v5/market/history-candles`, {
                params: {
                    instId: market,
                    bar: bar,
                    limit: count
                }
            });
            
            // Return OKX native format
            return response.data.data.reverse().map(candle => ({
                instId: market,
                timestamp: parseInt(candle[0]),
                open: parseFloat(candle[1]),
                high: parseFloat(candle[2]),
                low: parseFloat(candle[3]),
                close: parseFloat(candle[4]),
                volume: parseFloat(candle[5]),
                volCcy: parseFloat(candle[6]) || 0,
                bar: bar
            }));
        } catch (error) {
            console.error(`Error fetching ${unit}-minute candles for ${market}:`, error.message);
            return [];
        }
    }

    saveCandles(candles, bar) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO candles (
                instId, timestamp, open, high, low, close, volume, volCcy, bar
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        candles.forEach(candle => {
            stmt.run(
                candle.instId,
                candle.timestamp,
                candle.open,
                candle.high,
                candle.low,
                candle.close,
                candle.volume,
                candle.volCcy,
                candle.bar
            );
        });

        stmt.finalize((err) => {
            if (err) {
                console.error('Error saving candles:', err);
            } else {
                // Reduced logging - only show important saves
                if (bar === '1m' || bar === '5m') {
                    console.log(`Saved ${candles.length} ${bar} candles`);
                }
            }
        });
    }

    async collectAllTimeframes(market = 'BTC-USDT') {
        const timeframes = [1, 3, 5, 10, 15, 30, 60, 240];
        
        for (const unit of timeframes) {
            const candles = await this.fetchCandles(market, unit, 300);
            if (candles.length > 0) {
                this.saveCandles(candles, candles[0].bar);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    getStoredCandles(instId, bar, limit = 5000) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM candles 
                WHERE instId = ? AND bar = ?
                ORDER BY timestamp DESC
                LIMIT ?
            `;
            
            this.db.all(sql, [instId, bar, limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    getLatestCandle(instId, bar) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM candles 
                WHERE instId = ? AND bar = ?
                ORDER BY timestamp DESC
                LIMIT 1
            `;
            
            this.db.get(sql, [instId, bar], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    close() {
        this.db.close();
    }
}

module.exports = DataCollector;