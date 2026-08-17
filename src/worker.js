const { Kafka } = require('kafkajs');
const { Pool } = require('pg');

const kafka = new Kafka({ clientId: 'analytics-worker', brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] });
const consumer = kafka.consumer({ groupId: 'analytics-group' });
const pgPool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/urls' });

async function start() {
    await consumer.connect();
    await consumer.subscribe({ topic: 'url_clicks', fromBeginning: false });
    await consumer.run({
        eachBatch: async ({ batch }) => {
            const values = batch.messages.map(m => {
                const data = JSON.parse(m.value.toString());
                return `('${data.shortCode}', '${data.timestamp}', '${data.ip}')`;
            }).join(',');
            await pgPool.query(`INSERT INTO clicks (short_code, clicked_at, ip_hash) VALUES ${values}`);
        }
    });
}
start();
