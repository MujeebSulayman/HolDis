import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticate, requireAdmin } from '../middlewares/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/users/login:
 *   post:
 *     summary: Login with email and password
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken:
 *                       type: string
 *                     refreshToken:
 *                       type: string
 *                     user:
 *                       type: object
 *       401:
 *         description: Invalid credentials
 */
router.post('/login', (req, res) => userController.login(req, res));

/**
 * @swagger
 * /api/users/register:
 *   post:
 *     summary: Register a new user and create child wallet
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UserRegistration'
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Bad request
 */
router.post('/register', (req, res) => userController.register(req, res));

/**
 * @swagger
 * /api/users/{userId}/profile:
 *   get:
 *     summary: Get user profile with wallet and stats
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get('/:userId/profile', authenticate, (req, res) => userController.getProfile(req, res));

/**
 * @swagger
 * /api/users/{userId}/wallet:
 *   get:
 *     summary: Get user wallet details and balance
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Wallet details
 *       401:
 *         description: Unauthorized
 */
router.get('/:userId/wallet', authenticate, (req, res) => userController.getWallet(req, res));

/**
 * @swagger
 * /api/users/{userId}/kyc:
 *   post:
 *     summary: Update KYC status (admin only)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, verified, rejected]
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: KYC status updated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/:userId/kyc', authenticate, requireAdmin, (req, res) => userController.updateKYC(req, res));

/**
 * @swagger
 * /api/users/{userId}/wallet/fund:
 *   post:
 *     summary: Fund user wallet from master wallet (admin only)
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: string
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Wallet funded
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post('/:userId/wallet/fund', authenticate, requireAdmin, (req, res) => userController.fundWallet(req, res));

export default router;
