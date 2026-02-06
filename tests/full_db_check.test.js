const path = require('path');
const dotenv = require('dotenv');
const DB_Connection = require('../src/database/db.js');
const UserModel = require('../src/models/userModel.js');
dotenv.config({ path: path.resolve(__dirname, '.env') });

console.log(process.env.DATABASE_URL);

describe('Full Database Verification Suite', () => {
    let db;
    let userModel;
    const testUser = {
        username: 'test_suit_user_' + Date.now(),
        email: `test_suit_${Date.now()}@example.com`,
        passwordHash: 'hashed_secret_password'
    };

    beforeAll(async () => {
        db = new DB_Connection();
        userModel = new UserModel();
        await userModel.create_users_table();
    });

    afterAll(async () => {
        if (testUser.username) {
            await db.query_executor('DELETE FROM users WHERE username = $1', [testUser.username]);
        }
        await db.pool.end();
    });

    // 1. HEALTH CHECK
    test('Health: Database connection is active', async () => {
        const start = performance.now();
        const result = await db.query_executor('SELECT 1 as health');
        const duration = performance.now() - start;
        
        expect(result.rows[0].health).toBe(1);
        console.log(`✓ Health Check passed in ${duration.toFixed(2)}ms`);
    });

    // 2. QUERY CORRECTNESS (CRUD)
    test('Correctness: Can create and retrieve a user', async () => {
        const createdUser = await userModel.createUser(testUser);
        expect(createdUser).toBeDefined();
        expect(createdUser.username).toBe(testUser.username);
        expect(createdUser.email).toBe(testUser.email);
        
        testUser.id = createdUser.id; 

        const fetchResult = await db.query_executor('SELECT * FROM users WHERE id = $1', [createdUser.id]);
        expect(fetchResult.rows[0].username).toBe(testUser.username);
    });

    // 3. INTEGRITY CHECK (Constraints)
    test('Integrity: Unique constraints prevent duplicate emails', async () => {
        const result = await userModel.createUser(testUser);
        
        expect(result.success).toBe(false); 
    });

    // 4. PERFORMANCE METRICS
    test('Performance: Query execution time is within limits', async () => {
        const ITERATIONS = 50;
        const start = performance.now();
        
        const promises = [];
        for(let i=0; i<ITERATIONS; i++) {
            promises.push(db.query_executor('SELECT * FROM users WHERE email = $1', [`nonexistent_${i}@example.com`]));
        }
        await Promise.all(promises);
        
        const totalDuration = performance.now() - start;
        const avgDuration = totalDuration / ITERATIONS;
        
        console.log(`✓ Performance: ${ITERATIONS} SELECTs took ${totalDuration.toFixed(2)}ms (Avg: ${avgDuration.toFixed(2)}ms/req)`);
        
        expect(avgDuration).toBeLessThan(50);
    });
});
