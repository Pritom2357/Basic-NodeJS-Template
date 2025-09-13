const express = require('express');
const UserController = require('../controllers/userController.js');
const AuthenticateToken = require('../middlewares/authenticateToken.js');
const multer = require('multer');
const upload = multer({storage: multer.memoryStorage()});

// essential modules
const userRouter = express.Router();
const userController = new UserController();
const authenticateToken = new AuthenticateToken();

/**
 * @openapi
 * /api/user/get-profile/{userId}:
 *   get:
 *     tags: [User]
 *     summary: Get a user profile by id
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: Not found
 */
userRouter.get('/get-profile/:userId', authenticateToken.authenticateToken, userController.getProfile);

/**
 * @openapi
 * /api/user/update-profile/{userId}:
 *   patch:
 *     tags: [User]
 *     summary: Update profile fields (self only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserUpdateRequest'
 *     responses:
 *       200:
 *         description: Updated profile
 *       400:
 *         description: Invalid updates
 *       403:
 *         description: Forbidden
 */
userRouter.patch('/update-profile/:userId', authenticateToken.authenticateToken, userController.updateProfile);

/**
 * @openapi
 * /api/user/subscription/{userId}:
 *   patch:
 *     tags: [User]
 *     summary: Change subscription type
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/SubscriptionUpdateRequest'
 *     responses:
 *       200:
 *         description: Subscription updated
 *       400:
 *         description: Bad request
 *       403:
 *         description: Forbidden
 */
userRouter.patch('/subscription/:userId', authenticateToken.authenticateToken, userController.changeSubscription);

/**
 * @openapi
 * /api/user/avatar/{userId}:
 *   post:
 *     tags: [User]
 *     summary: Upload / replace user avatar
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AvatarUploadResponse'
 *       400:
 *         description: Invalid file
 *       403:
 *         description: Forbidden
 */
userRouter.post('/avatar/:userId',
    authenticateToken.authenticateToken,
    upload.single('avatar'),
    userController.uploadAvatar
);

module.exports = {
    userRouter
};