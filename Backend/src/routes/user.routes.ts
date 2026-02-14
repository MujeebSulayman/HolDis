import { Router } from 'express';
import { userController } from '../controllers/user.controller';

const router = Router();

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
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User profile
 *       404:
 *         description: User not found
 */
router.get('/:userId/profile', (req, res) => userController.getProfile(req, res));

/**
 * @swagger
 * /api/users/{userId}/wallet:
 *   get:
 *     summary: Get user wallet details and balance
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Wallet details
 */
router.get('/:userId/wallet', (req, res) => userController.getWallet(req, res));

/**
 * @swagger
 * /api/users/{userId}/kyc:
 *   post:
 *     summary: Update KYC status (admin only)
 *     tags: [Users]
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
 */
router.post('/:userId/kyc', (req, res) => userController.updateKYC(req, res));

/**
 * @swagger
 * /api/users/{userId}/wallet/fund:
 *   post:
 *     summary: Fund user wallet from master wallet (admin only)
 *     tags: [Users]
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
 */
router.post('/:userId/wallet/fund', (req, res) => userController.fundWallet(req, res));

export default router;
