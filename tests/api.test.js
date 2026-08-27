const request = require('supertest');

jest.mock('kafkajs', () => ({
    Kafka: jest.fn().mockImplementation(() => ({
        producer: jest.fn().mockImplementation(() => ({
            connect: jest.fn(),
            send: jest.fn().mockResolvedValue(true)
        })),
        consumer: jest.fn().mockImplementation(() => ({}))
    }))
}));

jest.mock('pg', () => {
    const mPool = {
        query: jest.fn(),
    };
    return { Pool: jest.fn(() => mPool) };
});

jest.mock('ioredis', () => require('ioredis-mock'));

const { app, redis, producer, pgPool } = require('../src/index');

describe('URL Shortener API', () => {
    afterAll(async () => {
        await redis.quit();
    });

    it('should shorten a url', async () => {
        pgPool.query.mockResolvedValueOnce({ rows: [{ id: 12345 }] });
        const res = await request(app)
            .post('/api/shorten')
            .send({ url: 'https://example.com' });
            
        expect(res.statusCode).toEqual(200);
        expect(res.body.url).toEqual('https://example.com');
        expect(res.body.shortCode).toBeDefined();
    });

    it('should redirect a short url and emit kafka event', async () => {
        // Assume redis has it
        await redis.set('url:abc', 'https://example.com');

        const res = await request(app)
            .get('/abc');

        expect(res.statusCode).toEqual(302);
        expect(res.header.location).toEqual('https://example.com');
        expect(producer.send).toHaveBeenCalled();
    });

    it('should handle cache miss and fetch from DB', async () => {
        // Redis does not have it, DB does
        pgPool.query.mockResolvedValueOnce({ rows: [{ destination: 'https://db-example.com' }] });

        const res = await request(app).get('/dbcode');

        expect(res.statusCode).toEqual(302);
        expect(res.header.location).toEqual('https://db-example.com');
        expect(producer.send).toHaveBeenCalled();
        // Check if it got cached
        const cached = await redis.get('url:dbcode');
        expect(cached).toEqual('https://db-example.com');
    });

    it('should return 404 if not found in DB', async () => {
        pgPool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app).get('/404code');

        expect(res.statusCode).toEqual(404);
    });
});
