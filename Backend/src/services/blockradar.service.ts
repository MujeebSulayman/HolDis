import axios, { AxiosInstance, AxiosError } from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  BlockradarResponse,
  BlockradarError,
  TransferRequest,
  TransferResponse,
  ContractReadRequest,
  ContractWriteRequest,
  ContractWriteResponse,
  BatchContractWriteResponse,
  ContractNetworkFeeRequest,
  ContractNetworkFeeResponse,
  WalletBalance,
  TransactionStatus,
  HoldFundsRequest,
  ReleaseFundsRequest,
} from '../types/blockradar';

export class BlockradarService {
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

        this.client.interceptors.request.use(
      (config) => {
        logger.debug('Blockradar API Request', {
          method: config.method,
          url: config.url,
          data: config.data,
        });
        return config;
      },
      (error) => {
        logger.error('Blockradar API Request Error', { error });
        return Promise.reject(error);
      }
    );

        this.client.interceptors.response.use(
      (response) => {
        logger.debug('Blockradar API Response', {
          status: response.status,
          data: response.data,
        });
        return response;
      },
      (error: AxiosError<BlockradarError>) => {
        const errorDetails = error.response?.data || {
          message: error.message,
          statusCode: error.response?.status || 500,
          error: 'UNKNOWN_ERROR',
        };

        logger.error('Blockradar API Error', {
          status: error.response?.status,
          error: errorDetails,
        });

        return Promise.reject(errorDetails);
      }
    );
  }

  async getWalletBalance(): Promise<WalletBalance> {
    try {
      const response = await this.client.get<BlockradarResponse<WalletBalance>>(
        `/v1/wallets/${this.walletId}/balance`
      );
      return response.data.data;
    } catch (error) {
      logger.error('Failed to get wallet balance', { error });
      throw error;
    }
  }

  async readContract<T = unknown>(
    request: ContractReadRequest
  ): Promise<T> {
    try {
      const response = await this.client.post<BlockradarResponse<T>>(
        `/v1/wallets/${this.walletId}/contracts/read`,
        request
      );
      return response.data.data;
    } catch (error) {
      logger.error('Failed to read contract', { error, request });
      throw error;
    }
  }

  async writeContract(
    request: ContractWriteRequest
  ): Promise<ContractWriteResponse | BatchContractWriteResponse> {
    try {
      const response = await this.client.post(
        `/v1/wallets/${this.walletId}/contracts/write`,
        request
      );
      return response.data.data;
    } catch (error) {
      logger.error('Failed to write contract', { error, request });
      throw error;
    }
  }

  async estimateNetworkFee(
    request: ContractNetworkFeeRequest
  ): Promise<ContractNetworkFeeResponse> {
    try {
      const response = await this.client.post<BlockradarResponse<ContractNetworkFeeResponse>>(
        `/v1/wallets/${this.walletId}/contracts/network-fee`,
        request
      );
      return response.data.data;
    } catch (error) {
      logger.error('Failed to estimate network fee', { error, request });
      throw error;
    }
  }

  async transfer(request: TransferRequest): Promise<TransferResponse> {
    try {
      const response = await this.client.post<BlockradarResponse<TransferResponse>>(
        `/v1/wallets/${this.walletId}/transfer`,
        request
      );
      return response.data.data;
    } catch (error) {
      logger.error('Failed to transfer', { error, request });
      throw error;
    }
  }

  async getTransactionStatus(txId: string): Promise<TransactionStatus> {
    try {
      const response = await this.client.get<BlockradarResponse<TransactionStatus>>(
        `/v1/wallets/${this.walletId}/transactions/${txId}`
      );
      return response.data.data;
    } catch (error) {
      logger.error('Failed to get transaction status', { error, txId });
      throw error;
    }
  }

  async holdFunds(request: HoldFundsRequest): Promise<void> {
    try {
      logger.info('Holding funds in custody', {
        invoiceId: request.invoiceId,
        amount: request.amount,
        token: request.token,
      });

                      } catch (error) {
      logger.error('Failed to hold funds', { error, request });
      throw error;
    }
  }

  async releaseFunds(request: ReleaseFundsRequest): Promise<{
    receiverTransfer: TransferResponse;
    platformFeeTransfer: TransferResponse;
  }> {
    try {
      logger.info('Releasing funds from custody', {
        invoiceId: request.invoiceId,
        toAddress: request.toAddress,
        amount: request.amount,
        platformFee: request.platformFee,
      });

            const netAmount = (
        BigInt(request.amount) - BigInt(request.platformFee)
      ).toString();

            const isNativeToken = request.token === '0x0000000000000000000000000000000000000000';
      const tokenForBalance = isNativeToken ? undefined : request.token;
      
      const hasSufficientBalance = await this.hasSufficientBalance(
        request.amount,
        tokenForBalance
      );

      if (!hasSufficientBalance) {
        const errorMsg = `Insufficient ${isNativeToken ? 'native' : 'token'} balance for transfer`;
        logger.error(errorMsg, {
          invoiceId: request.invoiceId,
          required: request.amount,
          token: request.token,
        });
        throw new Error(errorMsg);
      }

                  const receiverTransfer = await this.transfer({
        to: request.toAddress,
        amount: netAmount,
        token: isNativeToken ? undefined : request.token,
        reference: `invoice-${request.invoiceId}-payment`,
        metadata: {
          invoiceId: request.invoiceId,
          type: 'invoice_payment',
        },
      });

      logger.info('Receiver transfer initiated', {
        invoiceId: request.invoiceId,
        txHash: receiverTransfer.hash,
        status: receiverTransfer.status,
      });

            const platformFeeTransfer = await this.transfer({
        to: env.PLATFORM_WALLET_ADDRESS,
        amount: request.platformFee,
        token: isNativeToken ? undefined : request.token,
        reference: `invoice-${request.invoiceId}-fee`,
        metadata: {
          invoiceId: request.invoiceId,
          type: 'platform_fee',
        },
      });

      logger.info('Funds released successfully', {
        invoiceId: request.invoiceId,
        receiverTx: receiverTransfer.hash,
        feeTx: platformFeeTransfer.hash,
      });

      return { receiverTransfer, platformFeeTransfer };
    } catch (error) {
      logger.error('Failed to release funds', { error, request });
      throw error;
    }
  }

  async refundFunds(
    invoiceId: string,
    payerAddress: string,
    amount: string,
    token: string
  ): Promise<TransferResponse> {
    try {
      logger.info('Refunding funds to payer', {
        invoiceId,
        payerAddress,
        amount,
      });

      const refundTransfer = await this.transfer({
        to: payerAddress,
        amount,
        token: token === '0x0000000000000000000000000000000000000000' 
          ? undefined 
          : token,
        reference: `invoice-${invoiceId}-refund`,
        metadata: {
          invoiceId,
          type: 'refund',
        },
      });

      logger.info('Refund completed', {
        invoiceId,
        txHash: refundTransfer.hash,
      });

      return refundTransfer;
    } catch (error) {
      logger.error('Failed to refund funds', { error, invoiceId });
      throw error;
    }
  }

  async batchReadContract<T = unknown>(
    requests: ContractReadRequest[]
  ): Promise<T[]> {
    try {
      const results = await Promise.all(
        requests.map(request => this.readContract<T>(request))
      );
      return results;
    } catch (error) {
      logger.error('Failed to batch read contract', { error });
      throw error;
    }
  }

  async hasSufficientBalance(
    amount: string,
    token?: string
  ): Promise<boolean> {
    try {
      const balance = await this.getWalletBalance();
      
      if (!token || token === '0x0000000000000000000000000000000000000000') {
                return BigInt(balance.nativeBalance) >= BigInt(amount);
      }

            const tokenBalance = balance.tokens.find(t => 
        t.token.toLowerCase() === token.toLowerCase()
      );

      if (!tokenBalance) {
        return false;
      }

      return BigInt(tokenBalance.balance) >= BigInt(amount);
    } catch (error) {
      logger.error('Failed to check balance', { error, amount, token });
      return false;
    }
  }

  async pollTransactionStatus(
    txId: string,
    options?: {
      maxAttempts?: number;
      intervalMs?: number;
      onUpdate?: (status: TransactionStatus) => void;
    }
  ): Promise<TransactionStatus> {
    const maxAttempts = options?.maxAttempts || 60;     const intervalMs = options?.intervalMs || 2000;     let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const status = await this.getTransactionStatus(txId);

        if (options?.onUpdate) {
          options.onUpdate(status);
        }

        if (status.status === 'SUCCESS' || status.status === 'FAILED') {
          logger.info('Transaction finalized', {
            txId,
            status: status.status,
            attempts,
          });
          return status;
        }

                await new Promise((resolve) => setTimeout(resolve, intervalMs));
        attempts++;
      } catch (error) {
        logger.error('Error polling transaction status', { error, txId, attempts });
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    throw new Error(`Transaction polling timeout after ${maxAttempts} attempts for txId: ${txId}`);
  }
}

export const blockradarService = new BlockradarService();
