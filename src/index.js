const express = require('express');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const base62 = require('./base62');
const EventEmitter = require('events');

const app = express();
app.use(express.json());

// --- In-Memory LRU Cache (Replaces Redis) ---
class LRUCache {
    constructor(maxSize = 1000) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }
    get(key) {
        if (!this.cache.has(key)) return null;
        const val = this.cache.get(key);
        // Refresh position
        this.cache.delete(key);
        this.cache.set(key, val);
        return val;
    }
    set(key, value) {
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
    clear() {
        this.cache.clear();
    }
}
const urlCache = new LRUCache(500);

// --- Asynchronous Analytics Worker (Replaces Kafka) ---
const analyticsEvents = new EventEmitter();
const CLICK_BATCH_SIZE = 10;
let clickBuffer = [];

async function flushClicks(db) {
    if (clickBuffer.length === 0 || !db) return;
    const batch = [...clickBuffer];
    clickBuffer = [];

    try {
        const placeholders = batch.map(() => '(?, ?, ?, ?)').join(',');
        const values = batch.flatMap(c => [c.shortCode, c.timestamp, c.ip, c.userAgent]);
        
        await db.run(
            `INSERT INTO clicks (short_code, timestamp, ip, user_agent) VALUES ${placeholders}`,
            values
        );
    } catch (e) {
        console.error('Failed to flush analytics:', e);
    }
}

analyticsEvents.on('click', (data) => {
    clickBuffer.push(data);
    if (clickBuffer.length >= CLICK_BATCH_SIZE) {
        // Asynchronously flush without blocking the event loop
        setTimeout(() => flushClicks(globalDb), 0);
    }
});

let flushInterval;
function startAnalyticsWorker(db) {
    // Flush remaining every 5 seconds
    flushInterval = setInterval(() => flushClicks(db), 5000);
}
function stopAnalyticsWorker() {
    if (flushInterval) clearInterval(flushInterval);
}

let globalDb;
async function initDb(dbPath = ':memory:') {
    globalDb = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    await globalDb.exec(`
        CREATE TABLE IF NOT EXISTS urls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            destination TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS clicks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            short_code TEXT NOT NULL,
            timestamp DATETIME NOT NULL,
            ip TEXT,
            user_agent TEXT
        );
    `);
    
    startAnalyticsWorker(globalDb);
}

// --- API Endpoints ---
app.post('/api/shorten', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing url' });

    try {
        const result = await globalDb.run('INSERT INTO urls (destination) VALUES (?)', [url]);
        const shortCode = base62.encode(result.lastID);
        urlCache.set(shortCode, url);
        res.status(201).json({ shortCode, url });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/:shortCode', async (req, res) => {
    const { shortCode } = req.params;
    
    // 1. Check Cache
    let url = urlCache.get(shortCode);
    
    // 2. Cache Miss - Query DB
    if (!url) {
        const id = base62.decode(shortCode);
        const result = await globalDb.get('SELECT destination FROM urls WHERE id = ?', [id]);
        if (!result) return res.status(404).send('Not found');
        url = result.destination;
        urlCache.set(shortCode, url);
    }
    
    // 3. Fire-and-forget Analytics Event
    analyticsEvents.emit('click', {
        shortCode,
        timestamp: new Date().toISOString(),
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // 4. Redirect immediately
    res.redirect(302, url);
});

// Analytics Dashboard Endpoint
app.get('/api/analytics/:shortCode', async (req, res) => {
    const { shortCode } = req.params;
    
    // Flush immediately for accurate stats
    await flushClicks(globalDb);
    
    const result = await globalDb.get(
        'SELECT COUNT(*) as clicks FROM clicks WHERE short_code = ?',
        [shortCode]
    );
    
    res.json({ shortCode, totalClicks: result.clicks });
});

if (require.main === module) {
    initDb('urls.db').then(() => {
        app.listen(3000, () => console.log('Shortener listening on port 3000'));
    });
}

module.exports = { app, initDb, getDb: () => globalDb, urlCache, flushClicks, stopAnalyticsWorker };
