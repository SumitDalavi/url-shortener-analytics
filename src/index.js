const express = require('express');
const Redis = require('ioredis');
const { Kafka } = require('kafkajs');
const { Pool } = require('pg');
const base62 = require('./base62');

const app = express();
app.use(express.json());

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const kafka = new Kafka({ clientId: 'url-shortener', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] });
const producer = kafka.producer();
const pgPool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/urls' });

app.post('/api/shorten', async (req, res) => {
    const { url } = req.body;
    // Insert into PG to get auto-increment ID
    const result = await pgPool.query('INSERT INTO urls (destination) VALUES ($1) RETURNING id', [url]);
    const id = result.rows[0].id;
    const shortCode = base62.encode(id);
    await redis.set(`url:${shortCode}`, url, 'EX', 86400); // 24h cache
    res.json({ shortCode, url });
});

app.get('/:shortCode', async (req, res) => {
    const { shortCode } = req.params;
    let url = await redis.get(`url:${shortCode}`);
    
    if (!url) {
        const id = base62.decode(shortCode);
        const result = await pgPool.query('SELECT destination FROM urls WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).send('Not found');
        url = result.rows[0].destination;
        await redis.set(`url:${shortCode}`, url, 'EX', 86400);
    }
    
    // Async event push
    producer.send({
        topic: 'url_clicks',
        messages: [{ value: JSON.stringify({ shortCode, timestamp: new Date(), ip: req.ip, userAgent: req.get('User-Agent') }) }],
    }).catch(console.error);

    res.redirect(302, url);
});

async function start() {
    await producer.connect();
    app.listen(3000, () => console.log('Shortener API on port 3000'));
}
start();
