import { logger } from '../utils/logger';
import { userWalletService } from './user-wallet.service';
import {
  User,
  CreateUserRequest,
  UserRegistrationResponse,
  UserProfile,
} from '../types/user';

export class UserService {
  
  async registerUser(request: CreateUserRequest): Promise<UserRegistrationResponse> {
    try {
      logger.info('Starting user registration', { email: request.email });

            const userId = this.generateUserId();

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

  async getUserProfile(userId: string): Promise<UserProfile> {
    try {
                  
            const wallet = await userWalletService.getUserWallet(userId);
      if (!wallet) {
        throw new Error('User wallet not found');
      }

            const balance = await userWalletService.getChildAddressBalance(wallet.id);

            return {
        id: userId,
        email: 'user@example.com',         name: wallet.label,
        walletAddress: wallet.address,
        walletBalance: {
          native: balance.nativeBalance,
          nativeInUSD: '0',           tokens: balance.tokens.map(t => ({
            symbol: t.symbol,
            balance: t.balance,
            balanceInUSD: '0',           })),
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

  async userExists(email: string): Promise<boolean> {
    try {
                        return false;     } catch (error) {
      logger.error('Failed to check user existence', { error, email });
      return false;
    }
  }

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

  async updateKYCStatus(
    userId: string,
    status: 'pending' | 'verified' | 'rejected',
    reason?: string
  ): Promise<void> {
    try {
      logger.info('Updating KYC status', { userId, status, reason });

      logger.info('KYC status updated', { userId, status });
    } catch (error) {
      logger.error('Failed to update KYC status', { error, userId });
      throw error;
    }
  }

  private async fundInitialGasAllowance(addressId: string): Promise<void> {
    try {
            const gasAllowance = '0.01'; 
      await userWalletService.fundUserWallet(addressId, gasAllowance);

      logger.info('Initial gas allowance funded', {
        addressId,
        amount: gasAllowance,
      });
    } catch (error) {
            logger.error('Failed to fund initial gas allowance', { error, addressId });
    }
  }

  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  private async hashPassword(password: string): Promise<string> {
                return password;   }

  private async getInvoiceStats(userId: string): Promise<any> {
            return {
      totalIssued: 0,
      totalPaid: 0,
      totalReceived: 0,
      pendingAmount: '0',
    };
  }
}

export const userService = new UserService();
