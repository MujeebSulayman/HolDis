import { logger } from '../utils/logger';
import { userWalletService } from './user-wallet.service';
import {
  User,
  CreateUserRequest,
  UserRegistrationResponse,
  UserProfile,
} from '../types/user';

export class UserService {
  /**
   * Register a new user and create their child wallet address
   * This is the main onboarding flow
   */
  async registerUser(request: CreateUserRequest): Promise<UserRegistrationResponse> {
    try {
      logger.info('Starting user registration', { email: request.email });

      // 1. Generate unique user ID (in production, this would be from database)
      const userId = this.generateUserId();

      // 2. Hash password (implement proper hashing)
      // const hashedPassword = await this.hashPassword(request.password);

      // 3. Create user record in database
      // await db.user.create({
      //   id: userId,
      //   email: request.email,
      //   name: request.name,
      //   password: hashedPassword,
      //   kycStatus: 'pending',
      // });

      // 4. Create child wallet address on Blockradar
      const wallet = await userWalletService.createUserWallet({
        userId,
        label: request.name || request.email,
        metadata: {
          email: request.email,
          registeredAt: new Date().toISOString(),
        },
      });

      logger.info('User registered successfully', {
        userId,
        email: request.email,
        walletAddress: wallet.address,
      });

      // 5. Optional: Fund user with initial gas allowance
      // await this.fundInitialGasAllowance(wallet.addressId);

      return {
        user: {
          id: userId,
          email: request.email,
          name: request.name,
          walletAddress: wallet.address,
          kycStatus: 'pending',
        },
        wallet: {
          address: wallet.address,
          balance: wallet.balance,
        },
      };
    } catch (error) {
      logger.error('User registration failed', { error, request });
      throw error;
    }
  }

  /**
   * Get user profile with wallet and invoice stats
   */
  async getUserProfile(userId: string): Promise<UserProfile> {
    try {
      // 1. Get user from database
      // const user = await db.user.findById(userId);
      // if (!user) throw new Error('User not found');

      // 2. Get wallet info from Blockradar
      const wallet = await userWalletService.getUserWallet(userId);
      if (!wallet) {
        throw new Error('User wallet not found');
      }

      // 3. Get wallet balance
      const balance = await userWalletService.getChildAddressBalance(wallet.id);

      // 4. Get invoice stats from contract
      // const stats = await this.getInvoiceStats(userId);

      // Mock response (replace with actual data)
      return {
        id: userId,
        email: 'user@example.com', // from database
        name: wallet.label,
        walletAddress: wallet.address,
        walletBalance: {
          native: balance.nativeBalance,
          nativeInUSD: '0', // calculate from price feed
          tokens: balance.tokens.map(t => ({
            symbol: t.symbol,
            balance: t.balance,
            balanceInUSD: '0', // calculate from price feed
          })),
        },
        invoiceStats: {
          totalIssued: 0,
          totalPaid: 0,
          totalReceived: 0,
          pendingAmount: '0',
        },
        kycStatus: 'pending',
        createdAt: new Date(wallet.createdAt),
      };
    } catch (error) {
      logger.error('Failed to get user profile', { error, userId });
      throw error;
    }
  }

  /**
   * Check if user exists and has wallet
   */
  async userExists(email: string): Promise<boolean> {
    try {
      // Check database for user
      // const user = await db.user.findByEmail(email);
      // return !!user;
      return false; // placeholder
    } catch (error) {
      logger.error('Failed to check user existence', { error, email });
      return false;
    }
  }

  /**
   * Get user's wallet address ID
   */
  async getUserWalletAddressId(userId: string): Promise<string> {
    try {
      const wallet = await userWalletService.getUserWallet(userId);
      if (!wallet) {
        throw new Error('User wallet not found');
      }
      return wallet.id;
    } catch (error) {
      logger.error('Failed to get user wallet address ID', { error, userId });
      throw error;
    }
  }

  /**
   * Update KYC status
   */
  async updateKYCStatus(
    userId: string,
    status: 'pending' | 'verified' | 'rejected',
    reason?: string
  ): Promise<void> {
    try {
      logger.info('Updating KYC status', { userId, status, reason });

      // Update database
      // await db.user.update(userId, { kycStatus: status });

      // Optional: Notify user
      // await notificationService.sendKYCUpdate(userId, status, reason);

      logger.info('KYC status updated', { userId, status });
    } catch (error) {
      logger.error('Failed to update KYC status', { error, userId });
      throw error;
    }
  }

  /**
   * Fund user with initial gas allowance (optional onboarding feature)
   */
  private async fundInitialGasAllowance(addressId: string): Promise<void> {
    try {
      // Example: Give 0.01 ETH for gas fees
      const gasAllowance = '0.01'; // 0.01 native token

      await userWalletService.fundUserWallet(addressId, gasAllowance);

      logger.info('Initial gas allowance funded', {
        addressId,
        amount: gasAllowance,
      });
    } catch (error) {
      // Don't fail registration if gas funding fails
      logger.error('Failed to fund initial gas allowance', { error, addressId });
    }
  }

  /**
   * Generate unique user ID (in production, use database auto-increment or UUID)
   */
  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Hash password securely (implement with bcrypt or argon2)
   */
  private async hashPassword(password: string): Promise<string> {
    // TODO: Implement proper password hashing
    // import bcrypt from 'bcryptjs';
    // return await bcrypt.hash(password, 10);
    return password; // placeholder
  }

  /**
   * Get invoice statistics for user
   */
  private async getInvoiceStats(userId: string): Promise<any> {
    // Query Holdis contract for user's invoices
    // Return aggregated stats
    return {
      totalIssued: 0,
      totalPaid: 0,
      totalReceived: 0,
      pendingAmount: '0',
    };
  }
}

// Export singleton instance
export const userService = new UserService();
