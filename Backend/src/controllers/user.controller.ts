import { Request, Response } from 'express';
import { userService } from '../services/user.service';
import { userWalletService } from '../services/user-wallet.service';
import { logger } from '../utils/logger';

export class UserController {
  
  async register(req: Request, res: Response): Promise<void> {
    try {
      const { email, name, password } = req.body;

            if (!email || !password) {
        res.status(400).json({
          error: 'Missing required fields',
          message: 'Email and password are required',
        });
        return;
      }

            const exists = await userService.userExists(email);
      if (exists) {
        res.status(409).json({
          error: 'User already exists',
          message: 'An account with this email already exists',
        });
        return;
      }

            const result = await userService.registerUser({
        email,
        name,
        password,
      });

      logger.info('User registered via API', {
        userId: result.user.id,
        email: result.user.email,
      });

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: result,
      });
    } catch (error) {
      logger.error('Registration API error', { error });
      res.status(500).json({
        error: 'Registration failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      const profile = await userService.getUserProfile(userId);

      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (error) {
      logger.error('Get profile API error', { error });
      res.status(500).json({
        error: 'Failed to get profile',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getWallet(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      const wallet = await userWalletService.getUserWallet(userId);
      if (!wallet) {
        res.status(404).json({
          error: 'Wallet not found',
          message: 'User does not have a wallet',
        });
        return;
      }

      const balance = await userWalletService.getChildAddressBalance(wallet.id);

      res.status(200).json({
        success: true,
        data: {
          addressId: wallet.id,
          address: wallet.address,
          balance,
          label: wallet.label,
          createdAt: wallet.createdAt,
        },
      });
    } catch (error) {
      logger.error('Get wallet API error', { error });
      res.status(500).json({
        error: 'Failed to get wallet',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async updateKYC(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { status, reason } = req.body;

      if (!['pending', 'verified', 'rejected'].includes(status)) {
        res.status(400).json({
          error: 'Invalid status',
          message: 'Status must be pending, verified, or rejected',
        });
        return;
      }

      await userService.updateKYCStatus(userId, status, reason);

      res.status(200).json({
        success: true,
        message: 'KYC status updated',
      });
    } catch (error) {
      logger.error('Update KYC API error', { error });
      res.status(500).json({
        error: 'Failed to update KYC',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async fundWallet(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { amount, token } = req.body;

      if (!amount) {
        res.status(400).json({
          error: 'Missing amount',
          message: 'Amount is required',
        });
        return;
      }

      const addressId = await userService.getUserWalletAddressId(userId);
      const result = await userWalletService.fundUserWallet(addressId, amount, token);

      res.status(200).json({
        success: true,
        message: 'Wallet funded successfully',
        data: {
          txHash: result.hash,
          status: result.status,
        },
      });
    } catch (error) {
      logger.error('Fund wallet API error', { error });
      res.status(500).json({
        error: 'Failed to fund wallet',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export const userController = new UserController();
