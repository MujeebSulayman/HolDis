import { Router } from 'express';
import { userController } from '../controllers/user.controller';

const router = Router();

/**
 * User Management Routes
 */

// Register new user (creates child wallet)
router.post('/register', (req, res) => userController.register(req, res));

// Get user profile
router.get('/:userId/profile', (req, res) => userController.getProfile(req, res));

// Get user wallet
router.get('/:userId/wallet', (req, res) => userController.getWallet(req, res));

// Update KYC status (admin only)
router.post('/:userId/kyc', (req, res) => userController.updateKYC(req, res));

// Fund user wallet (admin only)
router.post('/:userId/wallet/fund', (req, res) => userController.fundWallet(req, res));

export default router;
