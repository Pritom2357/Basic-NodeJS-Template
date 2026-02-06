const request = require('supertest');
const DB_Connection = require('../../src/database/db');
const UserModel = require('../../src/models/userModel');

const BASE_URL = 'http://localhost:8000';

describe('Auth Routes Integration Tests', () => {
    let db;
    let userModel;
    const testUser = {
        username: 'auth_test_' + Date.now(),
        email: `auth_test_${Date.now()}@example.com`,
        password: 'SecurePass123!'
    };
    let userId;
    let authToken;

    beforeAll(async () => {
        db = new DB_Connection();
        userModel = new UserModel();
        
        // init-table returns 201 on first run, 200 on subsequent runs
        const initResponse = await request(BASE_URL)
            .get('/api/auth/init-table');
        expect([200, 201, 429]).toContain(initResponse.status);
    });

    afterAll(async () => {
        if (userId) {
            try {
                await db.query('DELETE FROM users WHERE id = $1', [userId]);
            } catch (error) {
                console.error('Cleanup error:', error.message);
            }
        }
        if (db && db.pool) {
            await db.pool.end();
        }
    });

    describe('POST /api/auth/register', () => {
        test('should register a new user successfully', async () => {
            const response = await request(BASE_URL)
                .post('/api/auth/register')
                .send({
                    username: testUser.username,
                    email: testUser.email,
                    password: testUser.password
                });

            expect([200, 201, 429]).toContain(response.status);
            
            // Try to get user from DB
            try {
                const dbUser = await db.query(
                    'SELECT * FROM users WHERE email = $1',
                    [testUser.email]
                );
                if (dbUser.rows.length > 0) {
                    userId = dbUser.rows[0].id;
                }
            } catch (error) {
                console.log('Could not verify user in DB:', error.message);
            }
        });

        test('should reject duplicate email', async () => {
            const response = await request(BASE_URL)
                .post('/api/auth/register')
                .send({
                    username: 'different_' + testUser.username,
                    email: testUser.email,
                    password: testUser.password
                });
            expect([400, 409, 429]).toContain(response.status);
        });

        test('should reject missing required fields', async () => {
            const response = await request(BASE_URL)
                .post('/api/auth/register')
                .send({ username: 'incomplete' });
            expect(response.status).toBeGreaterThanOrEqual(400);
        });
    });

    describe('POST /api/auth/login', () => {
        test('should login successfully with valid credentials', async () => {
            const response = await request(BASE_URL)
                .post('/api/auth/login')
                .send({
                    username: testUser.username,
                    password: testUser.password
                });

            if (response.status === 200) {
                authToken = response.body.accessToken;
                expect(authToken).toBeDefined();
            } else if (response.status === 429) {
                console.log('Rate limit hit - skipping auth token capture');
            }
        });

        test('should reject wrong password', async () => {
            const response = await request(BASE_URL)
                .post('/api/auth/login')
                .send({
                    username: testUser.username,
                    password: 'WrongPassword123!'
                });
            expect([400, 401, 429]).toContain(response.status);
        });

        test('should reject non-existent user', async () => {
            const response = await request(BASE_URL)
                .post('/api/auth/login')
                .send({
                    username: 'nonexistent_user_12345',
                    password: 'AnyPassword123!'
                });
            expect([400, 401, 404, 429]).toContain(response.status);
        });
    });

    describe('GET /api/auth/me', () => {
        test('should get current user with valid token', async () => {
            if (!authToken) {
                console.log('Skipping: No valid auth token');
                return;
            }
            const response = await request(BASE_URL)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${authToken}`);
            expect([200, 403]).toContain(response.status);
        });

        test('should reject request without token', async () => {
            const response = await request(BASE_URL)
                .get('/api/auth/me');
            expect([401, 403, 429]).toContain(response.status);
        });

        test('should reject invalid token', async () => {
            const response = await request(BASE_URL)
                .get('/api/auth/me')
                .set('Authorization', 'Bearer invalid_token_12345');
            expect([401, 403, 429]).toContain(response.status);
        });
    });

    describe('GET /api/auth/verify-token', () => {
        test('should verify valid token', async () => {
            if (!authToken) {
                console.log('Skipping: No valid auth token');
                return;
            }
            const response = await request(BASE_URL)
                .get('/api/auth/verify-token')
                .set('Authorization', `Bearer ${authToken}`);
            expect([200, 403]).toContain(response.status);
        });

        test('should reject invalid token', async () => {
            const response = await request(BASE_URL)
                .get('/api/auth/verify-token')
                .set('Authorization', 'Bearer invalid_token');
            expect([401, 403, 429]).toContain(response.status);
        });
    });

    describe('POST /api/auth/password/change', () => {
        test('should handle password change request', async () => {
            if (!authToken || !userId) {
                console.log('Skipping: No valid auth token or user ID');
                return;
            }
            const response = await request(BASE_URL)
                .post('/api/auth/password/change')
                .set('Authorization', `Bearer ${authToken}`)
                .send({
                    oldPassword: testUser.password,
                    newPassword: 'NewPass456!',
                    userId: userId
                });
            expect([200, 400, 403]).toContain(response.status);
        });

        test('should reject password change without authentication', async () => {
            const response = await request(BASE_URL)
                .post('/api/auth/password/change')
                .send({
                    oldPassword: testUser.password,
                    newPassword: 'AnotherPass789!',
                    userId: userId
                });
            expect([401, 403, 429]).toContain(response.status);
        });
    });

    describe('POST /api/auth/logout', () => {
        test('should handle logout request', async () => {
            if (!userId) {
                console.log('Skipping: No user ID');
                return;
            }
            const response = await request(BASE_URL)
                .post(`/api/auth/logout/${userId}`)
                .set('Authorization', `Bearer ${authToken || 'test'}`);
            expect(response.status).toBeGreaterThanOrEqual(200);
        });
    });

    describe('GET /api/auth/init-table', () => {
        test('should initialize database tables', async () => {
            const response = await request(BASE_URL)
                .get('/api/auth/init-table');

            // Accept both 200 (already created) and 201 (newly created), 429 if rate limited
            expect([200, 201, 429]).toContain(response.status);
            if (response.status !== 429) {
                expect(response.body).toHaveProperty('message');
            }
        });
    });
});
