const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel.js')
const { OAuth2Client } = require('google-auth-library');
const EmailUtils = require('../utils/emailUtils.js');
const bus = require('../events/eventBus.js');
const Events = require('../events/eventsNames.js');
const { uploadAvatarBuffer } = require('../utils/cloudinary.js');

class UserController {
    constructor() {
        this.userModel = new UserModel();
        this.salt_round = parseInt(process.env.PASSWORD_SALT_ROUNDS);
        this.max_login_attempts = parseInt(process.env.LOGIN_MAX_ATTEMPTS);
        this.account_lock_minutes = parseInt(process.env.ACCOUNT_LOCK_MINUTES);
        this.access_token_secret = process.env.JWT_ACCESS_SECRET;
        this.refresh_token_secret = process.env.JWT_REFRESH_SECRET;
        this.access_token_expiry = process.env.ACCESS_TOKEN_TTL;
        this.refresh_token_expiry = process.env.REFRESH_TOKEN_DAYS;
        this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
        this.requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION === 'true';
    }

    generateTokens = (user) => {
        const accessPayload = {
            sub: user.id,
            username: user.username,
            email: user.email
        };

        const accessToken = jwt.sign(accessPayload, this.access_token_secret, { expiresIn: this.access_token_expiry });
        const refreshToken = jwt.sign({ sub: user.id }, this.refresh_token_secret, { expiresIn: this.refresh_token_expiry });

        return { accessToken, refreshToken };
    };
    
    createTable = async(req, res)=>{
        try {
            await this.userModel.create_users_table();
            res.status(201).json({
                success: true,
                message: "users table created"
            });
        } catch (error) {
            console.error("Failed to create users table: " + error.message);
            throw error;
        }
    }

    googleLogin = async(req, res)=>{
        try {
            const {idToken} = req.body || {};
            if(!idToken){
                return res.status(400).json({
                    success: false,
                    error: 'idToken requied'
                });
            }

            const ticket = await this.googleClient.verifyIdToken({
                idToken,
                audience: process.env.GOOGLE_CLIENT_ID
            });

            const payload = ticket.getPayload();
            if(!payload){
                return res.status(401).json({
                    success: false,
                    error: "Invalid Google token"
                });
            }

            const {
                sub: googleId,
                email,
                name,
                picture,
                email_verified,
                hd,
                iss,
                aud
            } = payload;

            if(!['accounts.google.com', 'https://accounts.google.com'].includes(iss)){
                return res.status(401).json({
                    success: false,
                    error: "Invalid token issuer"
                });
            }

            if(aud !== process.env.GOOGLE_CLIENT_ID){
                return res.status(401).json({
                    success: false,
                    error: "Invalid token audience"
                });
            }

            if (process.env.GOOGLE_ALLOWED_HOSTED_DOMAIN && 
                hd !== process.env.GOOGLE_ALLOWED_HOSTED_DOMAIN) {
                return res.status(403).json({ 
                    success: false, 
                    error: 'Domain not allowed for this application' 
                });
            }

            let user = await this.userModel.getUserByGoogleId(googleId);

            if (!user && email && process.env.GOOGLE_LINK_ACCOUNTS_BY_EMAIL === 'true') {
                const existingByEmail = await this.userModel.getUserByEmail(email);
                if (existingByEmail) {
                    await this.userModel.linkGoogleIdToUser(existingByEmail.id, googleId);
                    user = await this.userModel.getUserById(existingByEmail.id);
                }
            }

            if (!user) {
                user = await this.userModel.createUserFormGoogle({
                    googleId,
                    email: email || null,
                    fullName: name || null,
                    avatarUrl: picture || null,
                    emailVerified: email_verified
                });

                if (!user) {
                    return res.status(500).json({ 
                        success: false, 
                        error: 'Failed to create user account' 
                    });
                }
            }

            await this.userModel.setLastLogin(user.id);
            const { accessToken, refreshToken } = this.generateTokens(user);
            await this.userModel.updateRefreshToken(user.id, refreshToken);

            return res.status(200).json({
                success: true,
                message: 'Google login successful',
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    full_name: user.full_name,
                    google_id: user.google_id,
                    provider: user.provider,
                    avatar_url: user.avatar_url,
                    email_verified: user.email_verified,
                    is_active: user.is_active,
                    subscription_type: user.subscription_type
                },
                tokens: { accessToken, refreshToken }
            });

        } catch (error) {
            console.error('Google OAuth login error:', error);
            
            if (error.name === 'TokenError') {
                return res.status(401).json({ 
                    success: false, 
                    error: 'Invalid Google token' 
                });
            }
            
            return res.status(500).json({ 
                success: false, 
                error: 'Internal server error during Google authentication' 
            });
        }
    }

    register = async (req, res) => {
        try {
            console.log(req.body);
            
            const { username, email, password } = req.body || {};
            if (!username || !email || !password) {
                return res.status(400).json({ success: false, error: 'username, email, password required' });
            }

            const existingUserByUsername = await this.userModel.getUserByUsername(username);
            if (existingUserByUsername) {
                return res.status(409).json({ success: false, error: 'Username already taken' });
            }

            const existingUserByEmail = await this.userModel.getUserByEmail(email);
            if (existingUserByEmail) {
                return res.status(409).json({ success: false, error: 'Email already in use' });
            }

            const passwordHash = await bcrypt.hash(password, this.salt_round);
            const newUser = await this.userModel.createUser({ username, email, passwordHash });

            if(!newUser){
                return res.status(500).json({
                    success: false,
                    message: "failed to create new user"
                })
            }

            if(this.requireEmailVerification){
                const token = EmailUtils.generateToken();
                await this.userModel.setVerificationToken(newUser.id, token);
                await EmailUtils.sendVerificationEmail(username, email, token);

                const updatedUser = await this.userModel.getUserById(newUser.id);

                bus.emit(Events.USER_REGISTERED, {userId: newUser.id, email: newUser.email, username: newUser.username});

                return res.status(201).json({
                    success: true,
                    message: "User registered successfully. Please check your email for verification",
                    user: {
                        id: updatedUser.id,
                        username: updatedUser.username,
                        email: updatedUser.email,
                        email_verified: updatedUser.email_verified,
                        requires_verification: true,
                        verification_token: updatedUser.verification_token,
                        subscription_type: updatedUser.subscription_type
                    }
                })
            } else {
                await this.userModel.setEmailVerified(newUser.id);
                const { accessToken, refreshToken } = this.generateTokens({
                    ...newUser,
                    email_verified: true
                });

                await this.userModel.updateRefreshToken(newUser.id, refreshToken);
                bus.emit(Events.USER_REGISTERED, {userId: newUser.id, email: newUser.email, username: newUser.username});

                return res.status(201).json({
                    success: true,
                    message: 'User registered successfully',
                    user: {
                        id: newUser.id,
                        username: newUser.username,
                        email: newUser.email,
                        email_verified: true,
                        requires_verification: false,
                        subscription_type: newUser.subscription_type
                    },
                    tokens: {
                        accessToken,
                        refreshToken
                    }
                })
            }
        } catch (error) {
            console.error('Registration error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error during registration' });
        }
    };

    sendVerificationEmail = async(req, res)=>{
        try {
            if(this.requireEmailVerification !== true){
                return res.status(400).json({
                    success: false,
                    error: 'Email verification is disabled'
                })
            }

            const { email } = req.body;
            if (!email) {
                return res.status(400).json({
                    success: false,
                    error: 'Email is required'
                });
            }

            const user = await this.userModel.getUserByEmail(email);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            if (user.email_verified) {
                return res.status(400).json({
                    success: false,
                    error: 'Email is already verified'
                });
            }

            const token = EmailUtils.generateToken();
            await this.userModel.setVerificationToken(user.id, token);
            await EmailUtils.sendVerificationEmail(email, token);

            return res.status(200).json({
                success: true,
                message: 'Verification email sent successfully'
            });
        } catch (error) {
            console.error('Send verification email error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    verifyEmail = async(req, res)=>{
        try {
            if (this.requireEmailVerification !== true) { 
                return res.status(400).json({
                    success: false,
                    error: 'Email verification is disabled'
                });
            }

            const { token } = req.query;
            if (!token) {
                return res.status(400).json({
                    success: false,
                    error: 'Verification token is required'
                });
            }

            const user = await this.userModel.getUserByVerificationToken(token);
            if (!user) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid or expired verification token'
                });
            }

            await this.userModel.setEmailVerified(user.id);

            bus.emit(Events.USER_EMAIL_VERIFIED, {userId:user.id, email: user.email});

            return res.status(200).json({
                success: true,
                message: 'Email verified successfully',
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    email_verified: true
                }
            });
        } catch (error) {
            console.error('Email verification error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    login = async (req, res) => {
        try {
            const { identifier, password } = req.body || {};
            if (!identifier || !password) {
                return res.status(400).json({ success: false, error: 'identifier and password required' });
            }

            let user = await this.userModel.getUserByUsername(identifier);
            if (!user && identifier.includes('@')) {
                user = await this.userModel.getUserByEmail(identifier);
            }

            if (!user) {
                return res.status(401).json({ success: false, error: 'Invalid credentials' });
            }

            if (user.locked_until && new Date(user.locked_until) > new Date()) {
                return res.status(423).json({
                    success: false,
                    error: 'Account locked',
                    locked_until: user.locked_until
                });
            }

            const match = await bcrypt.compare(password, user.password_hash);
            if (!match) {
                const updated = await this.userModel.incrementLoginAttempts(user.id);
                const attempts = updated ? updated.login_attempts : (user.login_attempts + 1);

                if (attempts >= this.max_login_attempts) {
                    const lockUntil = new Date(Date.now() + this.account_lock_minutes*60*1000);
                    await this.userModel.lockAccount(user.id, lockUntil);
                    return res.status(423).json({
                        success: false,
                        error: 'Account locked due to repeated failures',
                        locked_until: lockUntil
                    });
                }

                return res.status(401).json({
                    success: false,
                    error: 'Invalid credentials',
                    attempts,
                    remaining: Math.max(this.max_login_attempts - attempts, 0)
                });
            }
            await this.userModel.resetLoginAttempts(user.id);
            await this.userModel.setLastLogin(user.id);

            const { accessToken, refreshToken } = this.generateTokens(user);
            await this.userModel.updateRefreshToken(user.id, refreshToken);

            bus.emit(Events.USER_LOGIN, { userId: user.id });

            return res.status(200).json({
                success: true,
                message: 'Login successful',
                user: {
                    id: user.id,
                    uuid: user.uuid,
                    username: user.username,
                    email: user.email,
                    full_name: user.full_name,
                    is_active: user.is_active,
                    avatar_url: user.avatar_url,
                    subscription_type: user.subscription_type
                },
                tokens: { accessToken, refreshToken }
            });
        } catch (error) {
            console.error('Login error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error during login' });
        }
    };

    logout = async (req, res) => {
        try {
            const { userId } = req.params;
            if (!userId) {
                return res.status(400).json({ success: false, error: 'userId param required' });
            }
            await this.userModel.clearRefreshToken(userId);
            return res.status(200).json({ success: true, message: 'Logged out successfully' });
        } catch (error) {
            console.error('Logout error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    };

    getProfile = async (req, res) => {
        try {
            const { userId } = req.params;
            if (!userId) {
                return res.status(400).json({ success: false, error: 'userId param required' });
            }
            const user = await this.userModel.getUserById(userId);
            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            return res.status(200).json({
                success: true,
                 user: {
                    id: user.id,
                    uuid: user.uuid,
                    username: user.username,
                    email: user.email,
                    full_name: user.full_name,
                    is_active: user.is_active,
                    subscription_type: user.subscription_type
                }
            });
        } catch (error) {
            console.error('Get profile error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    };

    updateProfile = async (req, res) => {
        try {
            const { userId } = req.params;
            if (!userId) {
                return res.status(400).json({ success: false, error: 'userId param required' });
            }
            const updatedUser = await this.userModel.updateUser(userId, req.body || {});
            if (!updatedUser || updatedUser.success === false) {
                return res.status(400).json({ success: false, error: 'Update failed' });
            }
            bus.emit(Events.USER_PROFILE_UPDATED, { userId, changed: Object.keys(req.body || {}) });
            return res.status(200).json({ 
                success: true, 
                user: {
                    ...updatedUser,
                    subscription_type: updatedUser.subscription_type
                }
            });
        } catch (error) {
            console.error('Update profile error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    };

    requestPassword = async(req, res)=>{
        try {
            const {email} = req.body;
            if(!email){
                return res.status(400).json({
                    success: false,
                    error: 'Email is required'
                });
            }

            const user = await this.userModel.getUserByEmail(email);
            if(!user){
                return res.status(404).json({
                    success: true,
                    message: 'user does not exist'
                })
            }

            const token = EmailUtils.generateToken();
            const expiresAt = new Date(Date.now() + 60*60*1000);

            await this.userModel.setPasswordResetToken(user.id, token, expiresAt);
            await EmailUtils.sendPasswordResetEmail(user.username, email, token);

            if(user) bus.emit(Events.PASSWORD_RESET_REQUESTED, { userId: user.id, email: user.email });

            return res.status(200).json({
                success: true,
                message: 'If the email exists, a password reset link has been sent'
            });
        } catch (error) {
            console.error('Password reset request error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    resetPassword = async(req, res)=>{
        try {
            const {token, newPassword} = req.body;
            if (!token || !newPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'Token and new password are required'
                });
            }

            if(newPassword.length < 6){
                return res.status(400).json({
                    success: false,
                    error: 'Password must be at least 6 characters long'
                });
            }

            const user = await this.userModel.getUserByPasswordResetToken(token);
            if (!user) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid or expired reset token'
                });
            }

            const hashedPassword = await bcrypt.hash(newPassword, this.salt_round);
            await this.userModel.updatePassword(user.id, hashedPassword);

            return res.status(200).json({
                success: true,
                message: 'Password reset successfully'
            });

        } catch (error) {
            console.error('Password reset error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    changePassword = async(req, res)=>{
        try {
            const { oldPassword, newPassword } = req.body;
            const userId = req.user.id;

            if (!oldPassword || !newPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'Old password and new password are required'
                });
            }

            if (newPassword.length < 6) {
                return res.status(400).json({
                    success: false,
                    error: 'New password must be at least 6 characters long'
                });
            }

            const user = await this.userModel.getUserById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password_hash);
            if (!isOldPasswordValid) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid old password'
                });
            }

            const isSameOldPassword = await bcrypt.compare(newPassword, user.password_hash);
            if(isSameOldPassword){
                return res.status(400).json({
                    success: false,
                    error: "Same as old password, give something new"
                });
            }

            const hashedNewPassword = await bcrypt.hash(newPassword, this.salt_round);
            await this.userModel.updatePassword(user.id, hashedNewPassword);

            bus.emit(Events.PASSWORD_CHANGED, { userId: user.id });

            return res.status(200).json({
                success: true,
                message: 'Password changed successfully'
            });
        } catch (error) {
            console.error('Change password error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    verifyToken = async(req, res)=>{
        try {
            return res.status(200).json({
                success: true,
                user: req.user
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                user: null
            })
        }
    }

    changeSubscription = async (req, res) => {
        try {
            const { userId } = req.params;
            const { subscription_type } = req.body || {};
            const allowed = ['free', 'plus', 'premium'];

            if (!userId) {
                return res.status(400).json({ success: false, error: 'userId param required' });
            }
            if (!subscription_type || !allowed.includes(subscription_type)) {
                return res.status(400).json({
                    success: false,
                    error: 'subscription_type must be one of: free, plus, premium'
                });
            }

            const updated = await this.userModel.updateSubscriptionType(userId, subscription_type);
            if (!updated || updated.success === false) {
                return res.status(400).json({ success: false, error: 'Failed to update subscription' });
            }

            return res.status(200).json({
                success: true,
                message: 'Subscription updated',
                subscription_type: updated.subscription_type
            });
        } catch (error) {
            console.error('Change subscription error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }

    uploadAvatar = async(req, res)=>{
        try {
            const {userId} = req.params;
            if(parseInt(userId) !== req.user.id){
                return res.status(403).json({
                    success: false, 
                    error:'Forbidden'
                });
            }

            if(!req.file){
                return res.status(400).json({
                    success: false,
                    error: 'No file was provided'
                });
            }

            const maxSize = parseInt(process.env.MAX_AVATAR_SIZE_BYTES || '2097152');
            if(req.file.size > maxSize){
                return res.status(400).json({
                    success:false, 
                    error:'File too large (max 2MB)' 
                });
            }

            if(!/^image\/(png|jpe?g|webp)$/i.test(req.file.mimetype)){
                return res.status(400).json({
                    success:false, 
                    error:'Only png, jpg, jpeg, webp allowed' 
                });
            }

            const result = await uploadAvatarBuffer(req.file.buffer, userId);
            const updated = await this.userModel.setAvatarUrl(userId, result);

            if(!updated || updated.success === false){
                return res.status(500).json({ success:false, error:'Failed to save avatar URL' });
            }

            bus.emit(Events.USER_PROFILE_UPDATED, {userId, changed: ['avatar_url']});

            return res.status(200).json({
                success: true,
                message: 'Avatar updated',
                avatar_url: result.secure_url
            })
        } catch (error) {
            console.error('Avatar upload error:', error);
            return res.status(500).json({ success:false, error:'Internal server error' });
        }
    }
}

module.exports = UserController;