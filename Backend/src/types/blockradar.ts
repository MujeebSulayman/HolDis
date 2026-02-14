import { Address } from 'viem';

// Blockradar API Response Types
export interface BlockradarResponse<T> {
  message: string;
  statusCode: number;
  data: T;
}

export interface BlockradarError {
  message: string;
  statusCode: number;
  error: string;
  data?: Record<string, unknown>;
}

// Wallet Types
export interface BlockradarWallet {
  id: string;
  name: string;
  blockchain: {
    name: string;
    network: string;
  };
  address: string;
  balance: string;
  createdAt: string;
}

export interface BlockradarChildAddress {
  id: string;
  walletId: string;
  address: string;
  label?: string;
  balance: string;
  createdAt: string;
}

// Transfer Types
export interface TransferRequest {
  to: string;
  amount: string;
  token?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
}

export interface TransferResponse {
  id: string;
  hash: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  from: string;
  to: string;
  amount: string;
  token?: string;
  reference?: string;
}

// Smart Contract Types
export interface ContractReadRequest {
  address: string;
  method: string;
  parameters: unknown[];
  abi: Array<{
    constant?: boolean;
    inputs: Array<{ name: string; type: string }>;
    name: string;
    outputs: Array<{ name: string; type: string }>;
    stateMutability: string;
    type: string;
  }>;
}

export interface ContractWriteRequest extends ContractReadRequest {
  reference?: string;
  metadata?: Record<string, unknown>;
  // Batch operations
  calls?: ContractCall[];
}

export interface ContractCall {
  address: string;
  method: string;
  parameters: unknown[];
  abi: unknown[];
  reference?: string;
  metadata?: Record<string, unknown>;
}

export interface ContractWriteResponse {
  id: string;
  hash: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
}

export interface BatchContractWriteResponse {
  success: Array<{
    index: number;
    id: string;
    hash: string;
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
    reference?: string;
  }>;
  errors: Array<{
    index: number;
    method: string;
    error: string;
    message: string;
  }>;
}

export interface ContractNetworkFeeRequest {
  address: string;
  method: string;
  parameters: unknown[];
  abi: unknown[];
}

export interface ContractNetworkFeeResponse {
  networkFee: string;
  networkFeeInUSD: string;
  nativeBalance: string;
  nativeBalanceInUSD: string;
  estimatedArrivalTime: number;
}

// Webhook Types
export interface BlockradarWebhookPayload {
  event: string;
  data: BlockradarWebhookData;
  timestamp: string;
}

export interface BlockradarWebhookData {
  id: string;
  hash?: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  method?: string;
  contractAddress?: string;
  blockchain?: {
    name: string;
    network: string;
  };
  from?: string;
  to?: string;
  amount?: string;
  token?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

// Webhook Event Types
export enum BlockradarWebhookEvent {
  SMART_CONTRACT_SUCCESS = 'custom-smart-contract.success',
  SMART_CONTRACT_FAILED = 'custom-smart-contract.failed',
  TRANSFER_SUCCESS = 'transfer.success',
  TRANSFER_FAILED = 'transfer.failed',
  DEPOSIT_CONFIRMED = 'deposit.confirmed',
  WITHDRAWAL_CONFIRMED = 'withdrawal.confirmed',
}

// Balance Types
export interface TokenBalance {
  token: string;
  symbol: string;
  balance: string;
  balanceInUSD: string;
  decimals: number;
}

export interface WalletBalance {
  nativeBalance: string;
  nativeBalanceInUSD: string;
  tokens: TokenBalance[];
}

// Transaction Status
export interface TransactionStatus {
  id: string;
  hash: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  blockNumber?: number;
  confirmations?: number;
  timestamp?: string;
  error?: string;
}

// Fund Custody Operations
export interface HoldFundsRequest {
  walletAddress: string;
  amount: string;
  token: string;
  invoiceId: string;
  reference?: string;
}

export interface ReleaseFundsRequest {
  invoiceId: string;
  toAddress: string;
  amount: string;
  token: string;
  platformFee: string;
  reference?: string;
}

export interface FundsHoldRecord {
  invoiceId: string;
  walletAddress: string;
  amount: string;
  token: string;
  status: 'held' | 'released' | 'refunded';
  createdAt: Date;
  updatedAt: Date;
}
