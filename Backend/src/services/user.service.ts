import { logger } from '../utils/logger';
import { AuthUtils } from '../utils/auth';
import { userWalletService } from './user-wallet.service';
import {
  CreateUserRequest,
  UserRegistrationResponse,
  UserProfile,
} from '../types/user';

interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  walletAddressId: string;
  walletAddress: string;
}

const mockUsers: Map<string, UserRecord> = new Map();

export class UserService {
  async registerUser(request: CreateUserRequest): Promise<UserRegistrationResponse> {
    try {
      logger.info('Starting user registration', { email: request.email });

      const userId = this.generateUserId();
      const passwordHash = await AuthUtils.hashPassword(request.password);

      const wallet = await userWalletService.createUserWallet({
        userId,
        label: request.name || request.email,
        metadata: {
          email: request.email,
          registeredAt: new Date().toISOString(),
        },
      });

      mockUsers.set(request.email.toLowerCase(), {
        id: userId,
        email: request.email,
        passwordHash,
        walletAddressId: wallet.addressId,
        walletAddress: wallet.address,
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

  async login(email: string, password: string): Promise<{
    accessToken: string;
    refreshToken: string;
    user: {
      id: string;
      email: string;
      walletAddress: string;
    };
  }> {
    try {
      logger.info('User login attempt', { email });

      const user = mockUsers.get(email.toLowerCase());

      if (!user) {
        throw new Error('Invalid email or password');
      }

      const isValidPassword = await AuthUtils.comparePassword(password, user.passwordHash);

      if (!isValidPassword) {
        throw new Error('Invalid email or password');
      }

      const tokenPayload = {
        userId: user.id,
        email: user.email,
        walletAddress: user.walletAddress,
      };

      const accessToken = AuthUtils.generateAccessToken(tokenPayload);
      const refreshToken = AuthUtils.generateRefreshToken(tokenPayload);

      logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
      });

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          walletAddress: user.walletAddress,
        },
      };
    } catch (error) {
      logger.error('Login failed', { error, email });
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
        email: 'user@example.com',
        name: wallet.label,
        walletAddress: wallet.address,
        walletBalance: {
          native: balance.nativeBalance,
          nativeInUSD: '0',
          tokens: balance.tokens.map(t => ({
            symbol: t.symbol,
            balance: t.balance,
            balanceInUSD: '0',
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

  async userExists(email: string): Promise<boolean> {
    try {
      return mockUsers.has(email.toLowerCase());
    } catch (error) {
      logger.error('Failed to check user existence', { error, email });
      return false;
    }
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    return mockUsers.get(email.toLowerCase()) || null;
  }

  async getUserById(userId: string): Promise<UserRecord | null> {
    for (const user of mockUsers.values()) {
      if (user.id === userId) {
        return user;
      }
    }
    return null;
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

  private generateUserId(): string {
    return `user_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }
}

export const userService = new UserService();
