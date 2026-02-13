import { createPublicClient, http, parseAbiItem, Log, Address } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { contractService } from './contract.service';
import { blockradarService } from './blockradar.service';
import { InvoiceStatus } from '../types/contract';

export class EventListenerService {
  private publicClient: ReturnType<typeof createPublicClient>;
  private contractAddress: Address;
  private isListening: boolean = false;
  private lastProcessedBlock: bigint = 0n;

  constructor() {
    this.contractAddress = env.CONTRACT_ADDRESS as Address;
    const chain = env.CHAIN_ID === 1 ? mainnet : sepolia;

    this.publicClient = createPublicClient({
      chain,
      transport: http(env.ETHEREUM_RPC_URL),
    });
  }

  /**
   * Start listening to contract events
   */
  async start(): Promise<void> {
    if (this.isListening) {
      logger.warn('Event listener already running');
      return;
    }

    logger.info('Starting contract event listener');
    this.isListening = true;

    try {
      // Get the latest block to start from
      this.lastProcessedBlock = await contractService.getBlockNumber();
      logger.info('Event listener initialized', {
        startBlock: this.lastProcessedBlock.toString(),
      });

      // Watch for new blocks and process events
      contractService.watchBlocks(async (blockNumber) => {
        await this.processBlockEvents(this.lastProcessedBlock + 1n, blockNumber);
        this.lastProcessedBlock = blockNumber;
      });

      // Listen to specific events
      this.watchInvoiceCreated();
      this.watchInvoiceFunded();
      this.watchDeliverySubmitted();
      this.watchDeliveryConfirmed();
      this.watchInvoiceCompleted();
      this.watchInvoiceCancelled();

    } catch (error) {
      logger.error('Failed to start event listener', { error });
      this.isListening = false;
      throw error;
    }
  }

  /**
   * Stop listening to events
   */
  stop(): void {
    this.isListening = false;
    logger.info('Event listener stopped');
  }

  /**
   * Process events for a range of blocks
   */
  private async processBlockEvents(fromBlock: bigint, toBlock: bigint): Promise<void> {
    if (fromBlock > toBlock) return;

    try {
      logger.debug('Processing block events', {
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
      });

      // Get all events for the block range
      const events = [
        'InvoiceCreated',
        'InvoiceFunded',
        'DeliverySubmitted',
        'DeliveryConfirmed',
        'InvoiceCompleted',
        'InvoiceCancelled',
      ];

      for (const eventName of events) {
        const logs = await contractService.getLogs(eventName, fromBlock, toBlock);
        
        for (const log of logs) {
          await this.processEvent(eventName, log);
        }
      }
    } catch (error) {
      logger.error('Failed to process block events', { error, fromBlock, toBlock });
    }
  }

  /**
   * Process individual event
   */
  private async processEvent(eventName: string, log: Log): Promise<void> {
    try {
      logger.info('Processing event', {
        eventName,
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber,
      });

      switch (eventName) {
        case 'InvoiceCreated':
          await this.handleInvoiceCreated(log);
          break;
        case 'InvoiceFunded':
          await this.handleInvoiceFunded(log);
          break;
        case 'DeliverySubmitted':
          await this.handleDeliverySubmitted(log);
          break;
        case 'DeliveryConfirmed':
          await this.handleDeliveryConfirmed(log);
          break;
        case 'InvoiceCompleted':
          await this.handleInvoiceCompleted(log);
          break;
        case 'InvoiceCancelled':
          await this.handleInvoiceCancelled(log);
          break;
      }
    } catch (error) {
      logger.error('Failed to process event', { error, eventName, log });
    }
  }

  /**
   * Watch for InvoiceCreated events
   */
  private watchInvoiceCreated(): void {
    this.publicClient.watchContractEvent({
      address: this.contractAddress,
      abi: [parseAbiItem('event InvoiceCreated(uint256 indexed invoiceId, address indexed issuer, address indexed payer, address receiver, uint256 amount, address token, bool requiresDelivery, uint256 timestamp)')],
      eventName: 'InvoiceCreated',
      onLogs: async (logs) => {
        for (const log of logs) {
          await this.handleInvoiceCreated(log);
        }
      },
    });
  }

  /**
   * Handle InvoiceCreated event
   */
  private async handleInvoiceCreated(log: Log): Promise<void> {
    try {
      const { args } = log as any;
      const { invoiceId, issuer, payer, receiver, amount, token, requiresDelivery } = args;

      logger.info('Invoice created', {
        invoiceId: invoiceId.toString(),
        issuer,
        payer,
        receiver,
        amount: amount.toString(),
        token,
        requiresDelivery,
      });

      // Store in database (implementation depends on your DB choice)
      // await db.invoice.create({ ... });

      // Send notifications
      // await notificationService.sendInvoiceCreated(payer, invoiceId);

    } catch (error) {
      logger.error('Failed to handle InvoiceCreated event', { error, log });
    }
  }

  /**
   * Watch for InvoiceFunded events
   */
  private watchInvoiceFunded(): void {
    this.publicClient.watchContractEvent({
      address: this.contractAddress,
      abi: [parseAbiItem('event InvoiceFunded(uint256 indexed invoiceId, address indexed payer, uint256 amount, uint256 timestamp)')],
      eventName: 'InvoiceFunded',
      onLogs: async (logs) => {
        for (const log of logs) {
          await this.handleInvoiceFunded(log);
        }
      },
    });
  }

  /**
   * Handle InvoiceFunded event
   * This is where we record that funds are in custody
   */
  private async handleInvoiceFunded(log: Log): Promise<void> {
    try {
      const { args } = log as any;
      const { invoiceId, payer, amount } = args;

      logger.info('Invoice funded', {
        invoiceId: invoiceId.toString(),
        payer,
        amount: amount.toString(),
      });

      // Get full invoice details
      const invoice = await contractService.getInvoice(invoiceId);

      // Record funds in custody
      await blockradarService.holdFunds({
        walletAddress: payer,
        amount: amount.toString(),
        token: invoice.tokenAddress,
        invoiceId: invoiceId.toString(),
      });

      // Update database
      // await db.invoice.update({ ... });

      // Send notification to issuer
      // await notificationService.sendInvoiceFunded(invoice.issuer, invoiceId);

    } catch (error) {
      logger.error('Failed to handle InvoiceFunded event', { error, log });
    }
  }

  /**
   * Watch for DeliverySubmitted events
   */
  private watchDeliverySubmitted(): void {
    this.publicClient.watchContractEvent({
      address: this.contractAddress,
      abi: [parseAbiItem('event DeliverySubmitted(uint256 indexed invoiceId, address indexed issuer, string proofHash, uint256 timestamp)')],
      eventName: 'DeliverySubmitted',
      onLogs: async (logs) => {
        for (const log of logs) {
          await this.handleDeliverySubmitted(log);
        }
      },
    });
  }

  /**
   * Handle DeliverySubmitted event
   */
  private async handleDeliverySubmitted(log: Log): Promise<void> {
    try {
      const { args } = log as any;
      const { invoiceId, issuer, proofHash } = args;

      logger.info('Delivery submitted', {
        invoiceId: invoiceId.toString(),
        issuer,
        proofHash,
      });

      // Get invoice details
      const invoice = await contractService.getInvoice(invoiceId);

      // Update database
      // await db.invoice.update({ ... });

      // Notify receiver to confirm delivery
      // await notificationService.sendDeliverySubmitted(invoice.receiver, invoiceId, proofHash);

    } catch (error) {
      logger.error('Failed to handle DeliverySubmitted event', { error, log });
    }
  }

  /**
   * Watch for DeliveryConfirmed events
   */
  private watchDeliveryConfirmed(): void {
    this.publicClient.watchContractEvent({
      address: this.contractAddress,
      abi: [parseAbiItem('event DeliveryConfirmed(uint256 indexed invoiceId, address indexed receiver, uint256 timestamp)')],
      eventName: 'DeliveryConfirmed',
      onLogs: async (logs) => {
        for (const log of logs) {
          await this.handleDeliveryConfirmed(log);
        }
      },
    });
  }

  /**
   * Handle DeliveryConfirmed event
   */
  private async handleDeliveryConfirmed(log: Log): Promise<void> {
    try {
      const { args } = log as any;
      const { invoiceId, receiver } = args;

      logger.info('Delivery confirmed', {
        invoiceId: invoiceId.toString(),
        receiver,
      });

      // This event triggers before InvoiceCompleted
      // The actual fund release happens in InvoiceCompleted handler

    } catch (error) {
      logger.error('Failed to handle DeliveryConfirmed event', { error, log });
    }
  }

  /**
   * Watch for InvoiceCompleted events
   */
  private watchInvoiceCompleted(): void {
    this.publicClient.watchContractEvent({
      address: this.contractAddress,
      abi: [parseAbiItem('event InvoiceCompleted(uint256 indexed invoiceId, uint256 platformFeeCollected, uint256 timestamp)')],
      eventName: 'InvoiceCompleted',
      onLogs: async (logs) => {
        for (const log of logs) {
          await this.handleInvoiceCompleted(log);
        }
      },
    });
  }

  /**
   * Handle InvoiceCompleted event
   * This is where we execute the actual fund transfer
   */
  private async handleInvoiceCompleted(log: Log): Promise<void> {
    try {
      const { args } = log as any;
      const { invoiceId, platformFeeCollected } = args;

      logger.info('Invoice completed', {
        invoiceId: invoiceId.toString(),
        platformFeeCollected: platformFeeCollected.toString(),
      });

      // Get full invoice details
      const invoice = await contractService.getInvoice(invoiceId);

      // Release funds from custody to receiver and collect platform fee
      const { receiverTransfer, platformFeeTransfer } = await blockradarService.releaseFunds({
        invoiceId: invoiceId.toString(),
        toAddress: invoice.receiver,
        amount: invoice.amount.toString(),
        token: invoice.tokenAddress,
        platformFee: platformFeeCollected.toString(),
      });

      logger.info('Funds released successfully', {
        invoiceId: invoiceId.toString(),
        receiverTxHash: receiverTransfer.hash,
        platformFeeTxHash: platformFeeTransfer.hash,
      });

      // Update database with transaction hashes
      // await db.invoice.update({ ... });
      // await db.transaction.createMany([...]);

      // Send completion notifications
      // await notificationService.sendInvoiceCompleted(invoice.receiver, invoiceId);
      // await notificationService.sendInvoiceCompleted(invoice.issuer, invoiceId);

    } catch (error) {
      logger.error('Failed to handle InvoiceCompleted event', { error, log });
      // Implement retry logic or alert admin
    }
  }

  /**
   * Watch for InvoiceCancelled events
   */
  private watchInvoiceCancelled(): void {
    this.publicClient.watchContractEvent({
      address: this.contractAddress,
      abi: [parseAbiItem('event InvoiceCancelled(uint256 indexed invoiceId, address indexed cancelledBy, string reason, uint256 timestamp)')],
      eventName: 'InvoiceCancelled',
      onLogs: async (logs) => {
        for (const log of logs) {
          await this.handleInvoiceCancelled(log);
        }
      },
    });
  }

  /**
   * Handle InvoiceCancelled event
   */
  private async handleInvoiceCancelled(log: Log): Promise<void> {
    try {
      const { args } = log as any;
      const { invoiceId, cancelledBy, reason } = args;

      logger.info('Invoice cancelled', {
        invoiceId: invoiceId.toString(),
        cancelledBy,
        reason,
      });

      // Get invoice details
      const invoice = await contractService.getInvoice(invoiceId);

      // If invoice was funded, refund to payer
      if (invoice.status === InvoiceStatus.Cancelled && invoice.fundedAt > 0n) {
        await blockradarService.refundFunds(
          invoiceId.toString(),
          invoice.payer,
          invoice.amount.toString(),
          invoice.tokenAddress
        );
      }

      // Update database
      // await db.invoice.update({ ... });

      // Send notifications
      // await notificationService.sendInvoiceCancelled(invoice.payer, invoiceId, reason);

    } catch (error) {
      logger.error('Failed to handle InvoiceCancelled event', { error, log });
    }
  }

  /**
   * Get status
   */
  getStatus(): { isListening: boolean; lastProcessedBlock: string } {
    return {
      isListening: this.isListening,
      lastProcessedBlock: this.lastProcessedBlock.toString(),
    };
  }
}

// Export singleton instance
export const eventListenerService = new EventListenerService();
