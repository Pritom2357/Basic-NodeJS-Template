const DB_Connection = require('../database/db.js')

class UserModel {
    constructor(){
        this.db_connection = new DB_Connection();
    }

    create_users_table = async()=>{
        try {
            const query = `
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(50) UNIQUE NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    full_name VARCHAR(255),
                    is_active BOOLEAN DEFAULT true,
                    email_verified BOOLEAN DEFAULT false,
                    verification_token VARCHAR(255),
                    password_reset_token VARCHAR(255),
                    password_reset_expires TIMESTAMP,
                    last_login TIMESTAMP,
                    login_attempts INTEGER DEFAULT 0,
                    locked_until TIMESTAMP,
                    refresh_token TEXT,
                    google_id VARCHAR(100) UNIQUE,
                    provider VARCHAR(50),
                    avatar_url TEXT,
                    subscription_type VARCHAR(20) NOT NULL DEFAULT 'free',
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                );

                CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
                CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
                CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
                CREATE INDEX IF NOT EXISTS idx_users_password_reset_token ON users(password_reset_token);
                CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
                CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
            `;

            await this.db_connection.query_executor(query);
            console.log("User table successfully created");
            return {success: true};
        } catch (error) {
            console.log(`Error creating table: ${error.message}`);
            throw error;            
        }
    }

    createUser = async(userData)=>{
        try {
            const {username, email, passwordHash} = userData;
            
            const query = `
                INSERT INTO users (username, email, password_hash)
                VALUES ($1, $2, $3)
                RETURNING id, username, email, full_name, is_active, email_verified, subscription_type, verification_token, created_at, updated_at;
            `;

            const params = [username, email, passwordHash];
            const result = await this.db_connection.query_executor(query, params);

            return result.rows[0];
        } catch (error) {
            console.log(`User insertion failed: ${error.message}`);
            return {success: false};
        }
    }

    linkGoogleIdToUser = async(userId, googleId)=>{
        try {
            const query = `
                UPDATE users 
                SET google_id = $1,
                    provider = 'google',
                    updated_at = NOW()
                WHERE id = $2
                RETURNING id, google_id, provider;
            `;
            const params = [googleId, userId];
            const result = await this.db_connection.query_executor(query, params);

            return result.rows[0] || null;
        } catch (error) {
            console.log(`Link google id failed: ${error.message}`);
            throw error;
        }
    }

    createUserFormGoogle = async({googleId, email, fullName, avatarUrl, emailVerified})=>{
        try {
            const passPlaceholder = 'google_auth_' + Math.random().toString(36).slice(2, 18);
            const usernameBase = email ? email.split('@')[0] : `g_${googleId.slice(0, 8)}`;

            let counter = 1;
            while(await this.getUserByUsername(usernameBase)){
                counter++;
            }

            const username = `${usernameBase}${counter}`;

            const query = `
                INSERT INTO users 
                (username, email, password_hash, full_name, google_id, provider, avatar_url, email_verified)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id, username, email, full_name, is_active, email_verified, google_id, provider, avatar_url, subscription_type, created_at, updated_at;
            `;
            const params = [username, email, passPlaceholder, fullName, googleId, "google", avatarUrl, !!emailVerified];
            const result = await this.db_connection.query_executor(query, params);

            return result.rows[0] || null;
        } catch (error) {
            console.log(`Google user creation failed: ${error.message}`);
            throw error;
        }
    } 

    getUserByGoogleId = async(googleId)=>{
        try {
            const query = `
                SELECT 
                id, username, email, full_name, is_active, email_verified, subscription_type, avatar_url, created_at, updated_at 
                FROM users WHERE google_id = $1 LIMIT 1
            `;
            const result = await this.db_connection.query_executor(query, [googleId]);

            return result.rows[0] || null;
        } catch (error) {
            console.log(`Finding user by google_id failed: ${error.message}`);
            throw error;
        }
    }

    getUserById = async(userId)=>{
        try {
            const query = `
                SELECT *
                FROM users
                WHERE id = $1
                LIMIT 1;
            `;
            const params = [userId];
            const result = await this.db_connection.query_executor(query, params);

            return result.rows[0];
        } catch (error) {
            console.log(`Finding user by userId failed: ${error.message}`);
            throw error;
        }
    }

    getUserByEmail = async(email)=>{
        try {
            const query = `
                SELECT *
                FROM users
                WHERE email = $1
                LIMIT 1;
            `;
            const result = await this.db_connection.query_executor(query, [email]);
            return result.rows[0];
        } catch (error) {
            console.log(`Finding user by email failed: ${error.message}`);
            throw error;
        }
    }

    getUserByUsername = async(username)=>{
        try {
            const query = `
                SELECT *
                FROM users
                WHERE username = $1
                LIMIT 1;
            `;
            const result = await this.db_connection.query_executor(query, [username]);
            return result.rows[0];
        } catch (error) {
            console.log(`Finding user by username failed: ${error.message}`);
            throw error;
        }
    }

    updateUser = async(userId, updates)=>{
        try {
            if(!updates || Object.keys(updates).length === 0){
                throw new Error("No updates were sent from frontend");
            }

            const allowed = new Set(["username", "email", "full_name", "is_active"]);
            const sets = [];
            const values = [];
            let idx = 1;

            for(const [key, value] of Object.entries(updates)){
                if(!allowed.has(key)) continue;

                sets.push(`${key} = $${idx++}`);
                values.push(value);
            }

            if(sets.length === 0){
                throw new Error("No valid value was sent");
            }

            sets.push(`updated_at = NOW()`);

            const query = `
                UPDATE users
                SET ${sets.join(', ')}
                WHERE id = $${idx}
                RETURNING id, username, email, full_name, is_active, email_verified, subscription_type, created_at, updated_at
            `;
            values.push(userId);
            
            const result = await this.db_connection.query_executor(query, values);

            return result.rows[0] || null;
        } catch (error) {
            console.log(`User updation failed: ${error.message}`);
            return {success: false};
        }
    }

    deleteUser = async(userId)=>{
        try {
            const query = `
                DELETE FROM users
                WHERE id = $1
                RETURNING id
            `;
            const params = [userId];
            const result = await this.db_connection.query_executor(query, params);

            return result.rows[0];
        } catch (error) {
            console.log(`User deletion failed: ${error.message}`);
            return {success: false}
        }
    }

    setLastLogin = async(userId)=>{
        try {
            const query = `
                UPDATE users
                SET last_login = NOW(),
                    updated_at = NOW()
                WHERE id = $1
                RETURNING id
            `;
            const params = [userId];
            const result = await this.db_connection.query_executor(query, params);

            return result.rows[0];
        } catch (error) {
            console.log(`Recording last login failed: ${error.message}`);
            return {success: false}
        }
    }

    incrementLoginAttempts = async(userId)=>{
        try {
            const query = `
                UPDATE users
                SET login_attempts = login_attempts + 1,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING id, login_attempts
            `;
            const params = [userId];
            const result = await this.db_connection.query_executor(query, params);

            return result.rows[0] || null;
        } catch (error) {
            console.log(`login increment failed: ${error.message}`);
            return {success: false};
        }
    }

    resetLoginAttempts = async(userId)=>{
        try {
            const query = `
                UPDATE users
                SET login_attempts = 0,
                    locked_until = NULL,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING id, login_attempts, locked_until;
            `;
            const params = [userId];
            const result = await this.db_connection.query_executor(query, params);

            return result.rows[0] || null;
        } catch (error) {
            console.log(`reset login attempt: ${error.message}`);
            return {success: false};
        }
    }

    lockAccount = async(userId, untilTimestamp)=>{
        try {
            const query = `
                UPDATE users
                SET locked_until = $1,
                    updated_at = NOW()
                WHERE id = $2
                RETURNING id, locked_until;
            `;
            const params = [untilTimestamp, userId];

            const result = await this.db_connection.query_executor(query, params);

            return result.rows[0] || null;
        } catch (error) {
            console.log(`account locking: ${error.message}`);
            return {success: false};
        }
    }

    setEmailVerified = async(userId)=>{
        try {
            const query = `
                UPDATE users
                SET email_verified = true,
                    verification_token = NULL,
                    updated_at = NOW()
                WHERE id = $1
                RETURNING id, email_verified
            `;
            const params = [userId];

            const result = await this.db_connection.query_executor(query, params);

            return result.rows[0];
        } catch (error) {
            console.log(`Email verificatin failed: ${error.message}`);
            return {success: false};
        }
    }

    setVerificationToken = async(userId, token)=>{
        try {
            const query = `
                UPDATE users
                SET verification_token = $1,
                    email_verified = false,
                    updated_at = NOW()
                WHERE id = $2
                RETURNING id, verification_token;
            `;
            const params = [token, userId];
            const result = await this.db_connection.query_executor(query, params);

            return result.rows[0];
        } catch (error) {
            console.log(`Verification token sending failed: ${error.message}`);
            return {success: false};
        }
    }

    getUserByVerificationToken = async(token)=>{
        try {
            const query = `
                SELECT * FROM users
                WHERE verification_token = $1
                LIMIT 1
            `;
            const params = [token];

            const result = await this.db_connection.query_executor(query, params);

            return result.rows[0] || null;
        } catch (error) {
            console.log(`User verification failed: ${error.message}`);
            return {success: false};
        }
    }

    setPasswordResetToken = async(userId, token, expiresAt)=>{
        try {
            const query = `
                UPDATE users
                SET password_reset_token = $1,
                    password_reset_expires = $2,
                    updated_at = NOW()
                WHERE id = $3
                RETURNING id, password_reset_token, password_reset_expires
            `;
            const params = [token, expiresAt, userId];
            const result = await this.db_connection.query_executor(query, params);

            return result.rows[0] || null;
        } catch (error) {
            console.log(`Password token insertion failed: ${error.message}`);
            return {success: false};
        }
    }

    getUserByPasswordResetToken = async (token)=>{
        try {
            const query = `
                SELECT * FROM users
                WHERE password_reset_token = $1
                    AND password_reset_expires IS NOT NULL
                    AND password_reset_expires > NOW()
                LIMIT 1
            `;
            const params = [token];

            const result = await this.db_connection.query_executor(query, params);

            return result.rows[0] || null;
        } catch (error) {
            console.log(`Findng user by password reset token failed: ${error.message}`);
            return {success: false};
        }
    }

    updatePassword = async(userId, newPasswordHash)=>{
        try {
            const query = `
                UPDATE users
                SET password_hash = $1,
                    password_reset_token = NULL,
                    password_reset_expires = NULL,
                    updated_at = NOW()
                WHERE id = $2
                RETURNING id
            `;
            const params = [newPasswordHash, userId]
            const result = await this.db_connection.query_executor(query, params);

            return result.rows[0] || null;
        } catch (error) {
            console.log(`Password updation failed: ${error.message}`);
            return {success: false};
        }
    }

    // token related parts

    updateRefreshToken = async(userId, refreshToken)=> {
        try {
            const query = `
                UPDATE users 
                SET refresh_token = $2, updated_at = NOW()
                WHERE id = $1
                `;
            const params = [userId, refreshToken];
            await this.db_connection.query_executor(query, params);
        } catch (error) {
            console.log("Updation of refresh token failed");
        }
    }

    findByRefreshToken = async(refreshToken)=> {
       try {
            const query = `
                SELECT id, username, email, full_name
                FROM users 
                WHERE refresh_token = $1 AND is_active = true
                `;

            const result = await this.db_connection.query_executor(query, [refreshToken]);
            return result.rows[0] || null;
       } catch (error) {
            console.log("finding by refresh token failed");
            throw error;
       }
    }

    clearRefreshToken = async(userId)=> {
        try {
            const query = `
                UPDATE users 
                SET refresh_token = NULL, updated_at = NOW()
                WHERE id = $1
                RETURNING id
                `;

            const result = await this.db_connection.query_executor(query, [userId]);
            return result.rows[0] || null;
        } catch (error) {
            console.log("Clearing of refresh token failed");
            throw error;
        }
    }

    // miscellaneous utility functions
    isAccountLocked = async(userId)=>{
        try {
            const query = `
                SELECT 1
                FROM users
                WHERE id = $1
                  AND locked_until IS NOT NULL
                  AND locked_until > NOW()
                LIMIT 1;
            `;
            const result = await this.db_connection.query_executor(query, [userId]);
            return result.rowCount === 1;
        } catch (error) {
            console.log(`account lock checking failed: ${error.message}`);
            throw error;
        }
    }

    isEmailTaken = async(email)=>{
        try {
            const query = `SELECT COUNT(id) as cnt FROM users WHERE email = $1;`;
            const result = await this.db_connection.query_executor(query, [email]);
            return result.rows[0].cnt > 0;
        } catch (error) {
            console.log(`is email taken checking failed: ${error.message}`);
            throw error;
        }
    }

    isUsernameTaken = async(username)=>{
        try {
            const query = `SELECT COUNT(id) as cnt FROM users WHERE username = $1;`;
            const result = await this.db_connection.query_executor(query, [username]);
            return result.rows[0].cnt > 0;
        } catch (error) {
            console.log(`is username taken checking failed: ${error.message}`);
            throw error;
        }
    }

    updateSubscriptionType = async(userId, subscriptionType)=>{
        try {
            const query = `
                UPDATE users
                SET subscription_type = $1,
                    updated_at = NOW()
                WHERE id = $2
                RETURNING id, subscription_type;
            `;
            const result = await this.db_connection.query_executor(query, [subscriptionType, userId]);
            return result.rows[0] || null;
        } catch (error) {
            console.log(`Subscription update failed: ${error.message}`);
            return { success: false };
        }
    }

    setAvatarUrl = async(userId, avatarUrl)=>{
        try {
            const query = `
                UPDATE users
                SET avatar_url = $1,
                    updated_at = NOW()
                WHERE id = $2
                RETURNING id, avatar_url
            `;
            const params = [avatarUrl.secure_url, userId];
            const result = await this.db_connection.query_executor(query, params);
            return result.rows[0] || null;
        } catch (error) {
            console.log(`Avatar url updation failed: ${error.message}`);
            return { success: false };
        }
    }
}

module.exports = UserModel;