import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  BlockradarResponse,
  BlockradarChildAddress,
  ContractReadRequest,
  ContractWriteRequest,
  ContractWriteResponse,
  TransferRequest,
  TransferResponse,
} from '../types/blockradar';

export interface CreateUserWalletRequest {
  userId: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface UserWalletInfo {
  userId: string;
  addressId: string;
  address: string;
  balance: string;
  label?: string;
  createdAt: Date;
}

export class UserWalletService {
  private client: AxiosInstance;
  private walletId: string;

  constructor() {
    this.walletId = env.BLOCKRADAR_WALLET_ID;
    this.client = axios.create({
      baseURL: env.BLOCKRADAR_API_URL,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.BLOCKRADAR_API_KEY,
      },
      timeout: 30000,
    });
  }

  /**
   * Create a child address for a new user
   * Each user gets their own blockchain address derived from master wallet
   */
  async createUserWallet(request: CreateUserWalletRequest): Promise<UserWalletInfo> {
    try {
      logger.info('Creating child address for user', {
        userId: request.userId,
        label: request.label,
      });

      const response = await this.client.post<BlockradarResponse<BlockradarChildAddress>>(
        `/v1/wallets/${this.walletId}/addresses`,
        {
          label: request.label || `User ${request.userId}`,
          metadata: {
            userId: request.userId,
            createdAt: new Date().toISOString(),
            ...request.metadata,
          },
        }
      );

      const childAddress = response.data.data;

      logger.info('Child address created successfully', {
        userId: request.userId,
        addressId: childAddress.id,
        address: childAddress.address,
      });

      // Store in database
      const userWallet: UserWalletInfo = {
        userId: request.userId,
        addressId: childAddress.id,
        address: childAddress.address,
        balance: childAddress.balance,
        label: childAddress.label,
        createdAt: new Date(childAddress.createdAt),
      };

      // await db.userWallet.create(userWallet);

      return userWallet;
    } catch (error) {
      logger.error('Failed to create user wallet', { error, request });
      throw error;
    }
  }

  /**
   * Get user's child address details
   */
  async getUserWallet(userId: string): Promise<BlockradarChildAddress | null> {
    try {
      // In production, query from database first
      // const wallet = await db.userWallet.findByUserId(userId);
      // if (!wallet) return null;

      // For now, list all addresses and find by metadata
      const response = await this.client.get<BlockradarResponse<BlockradarChildAddress[]>>(
        `/v1/wallets/${this.walletId}/addresses`
      );

      const addresses = response.data.data;
      // Find user's address (in production, use database query)
      const userAddress = addresses.find((addr: any) => 
        addr.metadata?.userId === userId
      );

      return userAddress || null;
    } catch (error) {
      logger.error('Failed to get user wallet', { error, userId });
      throw error;
    }
  }

  /**
   * Get child address balance
   */
  async getChildAddressBalance(addressId: string): Promise<{
    nativeBalance: string;
    tokens: Array<{ token: string; balance: string; symbol: string }>;
  }> {
    try {
      const response = await this.client.get<BlockradarResponse<any>>(
        `/v1/wallets/${this.walletId}/addresses/${addressId}/balance`
      );

      return response.data.data;
    } catch (error) {
      logger.error('Failed to get child address balance', { error, addressId });
      throw error;
    }
  }

  /**
   * Transfer from child address
   */
  async transferFromUserWallet(
    addressId: string,
    request: TransferRequest
  ): Promise<TransferResponse> {
    try {
      logger.info('Transfer from child address', {
        addressId,
        to: request.to,
        amount: request.amount,
      });

      const response = await this.client.post<BlockradarResponse<TransferResponse>>(
        `/v1/wallets/${this.walletId}/addresses/${addressId}/transfer`,
        request
      );

      logger.info('Transfer initiated from child address', {
        addressId,
        txHash: response.data.data.hash,
      });

      return response.data.data;
    } catch (error) {
      logger.error('Failed to transfer from child address', { error, addressId, request });
      throw error;
    }
  }

  /**
   * Read contract from child address context
   */
  async readContractFromChildAddress<T = unknown>(
    addressId: string,
    request: ContractReadRequest
  ): Promise<T> {
    try {
      const response = await this.client.post<BlockradarResponse<T>>(
        `/v1/wallets/${this.walletId}/addresses/${addressId}/contracts/read`,
        request
      );
      return response.data.data;
    } catch (error) {
      logger.error('Failed to read contract from child address', { error, addressId });
      throw error;
    }
  }

  /**
   * Write contract from child address (user signs transaction)
   */
  async writeContractFromChildAddress(
    addressId: string,
    request: ContractWriteRequest
  ): Promise<ContractWriteResponse> {
    try {
      logger.info('Writing contract from child address', {
        addressId,
        method: request.method,
        contract: request.address,
      });

      const response = await this.client.post<BlockradarResponse<ContractWriteResponse>>(
        `/v1/wallets/${this.walletId}/addresses/${addressId}/contracts/write`,
        request
      );

      logger.info('Contract write initiated from child address', {
        addressId,
        txHash: response.data.data.hash,
        status: response.data.data.status,
      });

      return response.data.data;
    } catch (error) {
      logger.error('Failed to write contract from child address', { error, addressId });
      throw error;
    }
  }

  /**
   * Estimate network fee for child address operation
   */
  async estimateNetworkFeeForChildAddress(
    addressId: string,
    request: ContractReadRequest
  ): Promise<any> {
    try {
      const response = await this.client.post<BlockradarResponse<any>>(
        `/v1/wallets/${this.walletId}/addresses/${addressId}/contracts/network-fee`,
        request
      );
      return response.data.data;
    } catch (error) {
      logger.error('Failed to estimate network fee for child address', { error, addressId });
      throw error;
    }
  }

  /**
   * List all child addresses for master wallet
   */
  async listAllChildAddresses(): Promise<BlockradarChildAddress[]> {
    try {
      const response = await this.client.get<BlockradarResponse<BlockradarChildAddress[]>>(
        `/v1/wallets/${this.walletId}/addresses`
      );

      logger.info('Listed child addresses', {
        count: response.data.data.length,
      });

      return response.data.data;
    } catch (error) {
      logger.error('Failed to list child addresses', { error });
      throw error;
    }
  }

  /**
   * Get specific child address by ID
   */
  async getChildAddress(addressId: string): Promise<BlockradarChildAddress> {
    try {
      const response = await this.client.get<BlockradarResponse<BlockradarChildAddress>>(
        `/v1/wallets/${this.walletId}/addresses/${addressId}`
      );

      return response.data.data;
    } catch (error) {
      logger.error('Failed to get child address', { error, addressId });
      throw error;
    }
  }

  /**
   * Fund user wallet from master wallet (onboarding)
   * Useful for gas fee allowances or initial balance
   */
  async fundUserWallet(
    addressId: string,
    amount: string,
    token?: string
  ): Promise<TransferResponse> {
    try {
      logger.info('Funding user wallet from master', {
        addressId,
        amount,
        token,
      });

      // Get child address details
      const childAddress = await this.getChildAddress(addressId);

      // Transfer from master wallet to child address
      const response = await this.client.post<BlockradarResponse<TransferResponse>>(
        `/v1/wallets/${this.walletId}/transfer`,
        {
          to: childAddress.address,
          amount,
          token,
          reference: `onboarding-${addressId}`,
          metadata: {
            type: 'user_onboarding',
            addressId,
          },
        }
      );

      logger.info('User wallet funded successfully', {
        addressId,
        txHash: response.data.data.hash,
      });

      return response.data.data;
    } catch (error) {
      logger.error('Failed to fund user wallet', { error, addressId });
      throw error;
    }
  }

  /**
   * Check if user already has a wallet
   */
  async userHasWallet(userId: string): Promise<boolean> {
    try {
      const wallet = await this.getUserWallet(userId);
      return wallet !== null;
    } catch (error) {
      logger.error('Failed to check if user has wallet', { error, userId });
      return false;
    }
  }

  /**
   * Get or create user wallet (idempotent)
   */
  async getOrCreateUserWallet(request: CreateUserWalletRequest): Promise<UserWalletInfo> {
    try {
      // Check if user already has wallet
      const existing = await this.getUserWallet(request.userId);
      
      if (existing) {
        logger.info('User already has wallet', {
          userId: request.userId,
          address: existing.address,
        });

        return {
          userId: request.userId,
          addressId: existing.id,
          address: existing.address,
          balance: existing.balance,
          label: existing.label,
          createdAt: new Date(existing.createdAt),
        };
      }

      // Create new wallet
      return await this.createUserWallet(request);
    } catch (error) {
      logger.error('Failed to get or create user wallet', { error, request });
      throw error;
    }
  }
}

// Export singleton instance
export const userWalletService = new UserWalletService();
