import { Address } from 'viem';

export enum InvoiceStatus {
  Pending = 0,
  Funded = 1,
  Delivered = 2,
  Completed = 3,
  Cancelled = 4,
}

export interface Invoice {
  id: bigint;
  issuer: Address;
  payer: Address;
  receiver: Address;
  amount: bigint;
  tokenAddress: Address;
  status: InvoiceStatus;
  requiresDelivery: boolean;
  description: string;
  attachmentHash: string;
  createdAt: bigint;
  fundedAt: bigint;
  deliveredAt: bigint;
  completedAt: bigint;
}

export interface PlatformSettings {
  platformFee: bigint;
  maxInvoiceAmount: bigint;
  minInvoiceAmount: bigint;
}

// Contract Events
export interface InvoiceCreatedEvent {
  invoiceId: bigint;
  issuer: Address;
  payer: Address;
  receiver: Address;
  amount: bigint;
  token: Address;
  requiresDelivery: boolean;
  timestamp: bigint;
}

export interface InvoiceFundedEvent {
  invoiceId: bigint;
  payer: Address;
  amount: bigint;
  timestamp: bigint;
}

export interface DeliverySubmittedEvent {
  invoiceId: bigint;
  issuer: Address;
  proofHash: string;
  timestamp: bigint;
}

export interface DeliveryConfirmedEvent {
  invoiceId: bigint;
  receiver: Address;
  timestamp: bigint;
}

export interface InvoiceCompletedEvent {
  invoiceId: bigint;
  platformFeeCollected: bigint;
  timestamp: bigint;
}

export interface InvoiceCancelledEvent {
  invoiceId: bigint;
  cancelledBy: Address;
  reason: string;
  timestamp: bigint;
}

export interface InvoiceStatusUpdatedEvent {
  invoiceId: bigint;
  oldStatus: InvoiceStatus;
  newStatus: InvoiceStatus;
  timestamp: bigint;
}

// Database Types
export interface InvoiceRecord {
  id: string;
  issuer: string;
  payer: string;
  receiver: string;
  amount: string;
  tokenAddress: string;
  status: InvoiceStatus;
  requiresDelivery: boolean;
  description: string;
  attachmentHash: string;
  blockchainTxHash?: string;
  createdAt: Date;
  updatedAt: Date;
  fundedAt?: Date;
  deliveredAt?: Date;
  completedAt?: Date;
}

export interface TransactionRecord {
  id: string;
  invoiceId: string;
  type: 'creation' | 'funding' | 'delivery' | 'completion' | 'cancellation';
  txHash: string;
  from: string;
  to?: string;
  amount?: string;
  status: 'pending' | 'success' | 'failed';
  blockNumber?: number;
  gasUsed?: string;
  timestamp: Date;
}
