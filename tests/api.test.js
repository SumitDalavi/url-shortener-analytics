const request = require('supertest');
const { app, initDb, getDb, urlCache, flushClicks, stopAnalyticsWorker } = require('../src/index');

describe('URL Shortener Analytics', () => {
    beforeAll(async () => {
        await initDb(':memory:');
    });

    afterAll(() => {
        stopAnalyticsWorker();
    });

    beforeEach(async () => {
        const db = getDb();
        await db.run('DELETE FROM urls');
        await db.run('DELETE FROM clicks');
        urlCache.clear();
    });

    it('should shorten a url and populate the cache', async () => {
        const res = await request(app)
            .post('/api/shorten')
            .send({ url: 'https://example.com' });
            
        expect(res.statusCode).toEqual(201);
        expect(res.body.url).toEqual('https://example.com');
        expect(res.body.shortCode).toBeDefined();

        // Ensure it's in the memory cache
        expect(urlCache.get(res.body.shortCode)).toEqual('https://example.com');
    });

    it('should redirect a short url and track analytics', async () => {
        // Create it first
        const createRes = await request(app).post('/api/shorten').send({ url: 'https://example.com' });
        const code = createRes.body.shortCode;

        // Hit it twice to simulate 2 clicks
        await request(app).get(`/${code}`);
        await request(app).get(`/${code}`);

        // Get Analytics
        const analyticsRes = await request(app).get(`/api/analytics/${code}`);
        expect(analyticsRes.statusCode).toEqual(200);
        expect(analyticsRes.body.totalClicks).toBe(2);
    });

    it('should handle cache miss and fetch from DB', async () => {
        // Create in DB directly and test cache miss behavior
        const db = getDb();
        const result = await db.run("INSERT INTO urls (destination) VALUES ('https://db-example.com')");
        const base62 = require('../src/base62');
        const code = base62.encode(result.lastID);

        // Ensure cache is empty
        expect(urlCache.get(code)).toBeNull();

        const res = await request(app).get(`/${code}`);
        expect(res.statusCode).toEqual(302);
        expect(res.header.location).toEqual('https://db-example.com');
        
        // Ensure it got cached
        expect(urlCache.get(code)).toEqual('https://db-example.com');
    });

    it('should return 404 if not found in DB', async () => {
        const res = await request(app).get('/404code');
        expect(res.statusCode).toEqual(404);
    });
});
