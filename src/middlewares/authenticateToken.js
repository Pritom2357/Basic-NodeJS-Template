const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const path = require('path');
const UserModel = require('../models/userModel');

// dotenv.config({ path: path.resolve(__dirname, '../../.env') });

class AuthenticateToken{
    constructor(){
        this.userModel = new UserModel();
    }
    
    authenticateToken = async(req, res, next)=>{
        try {
            console.log("Authenticating users");
            
            const authHeader = req.headers['authorization'] || req.headers['Authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            
            if(!token){
                console.log("Access token not provided");
                return res.status(401).json({
                    success: false,
                    message: "Access token required"
                });
            }

            console.log("Verifying token");

            const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
            const userId = decoded.sub || decoded.id;
            const user = await this.userModel.getUserById(userId);

            if(!user){
                return res.status(401).json({
                    success: false,
                    message: "User not found"
                });
            }

            req.user = user;
            next();
        } catch (error) {
            console.error('Token verification error:', error.message);
        
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    success: false, 
                    message: 'Token expired' 
                });
            }
            return res.status(403).json({ 
                success: false, 
                message: 'Invalid token' 
            });
        }
    }
}

module.exports = AuthenticateToken;