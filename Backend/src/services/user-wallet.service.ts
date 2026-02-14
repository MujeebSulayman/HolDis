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

            const userWallet: UserWalletInfo = {
        userId: request.userId,
        addressId: childAddress.id,
        address: childAddress.address,
        balance: childAddress.balance,
        label: childAddress.label,
        createdAt: new Date(childAddress.createdAt),
      };

      return userWallet;
    } catch (error) {
      logger.error('Failed to create user wallet', { error, request });
      throw error;
    }
  }

  async getUserWallet(userId: string): Promise<BlockradarChildAddress | null> {
    try {
                  
            const response = await this.client.get<BlockradarResponse<BlockradarChildAddress[]>>(
        `/v1/wallets/${this.walletId}/addresses`
      );

      const addresses = response.data.data;
            const userAddress = addresses.find((addr: any) => 
        addr.metadata?.userId === userId
      );

      return userAddress || null;
    } catch (error) {
      logger.error('Failed to get user wallet', { error, userId });
      throw error;
    }
  }

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

            const childAddress = await this.getChildAddress(addressId);

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

  async userHasWallet(userId: string): Promise<boolean> {
    try {
      const wallet = await this.getUserWallet(userId);
      return wallet !== null;
    } catch (error) {
      logger.error('Failed to check if user has wallet', { error, userId });
      return false;
    }
  }

  async getOrCreateUserWallet(request: CreateUserWalletRequest): Promise<UserWalletInfo> {
    try {
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

            return await this.createUserWallet(request);
    } catch (error) {
      logger.error('Failed to get or create user wallet', { error, request });
      throw error;
    }
  }
}

export const userWalletService = new UserWalletService();
