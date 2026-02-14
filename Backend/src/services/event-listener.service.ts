import { createPublicClient, http, parseAbiItem, Log, Address } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { contractService } from './contract.service';
import { blockradarService } from './blockradar.service';
import { gasManagerService } from './gas-manager.service';
import { InvoiceStatus } from '../types/contract';

export class EventListenerService {
  private publicClient: ReturnType<typeof createPublicClient>;
  private contractAddress: Address;
  private isListening: boolean = false;
  private lastProcessedBlock: bigint = 0n;

  constructor() {
    this.contractAddress = env.HOLDIS_CONTRACT_ADDRESS as Address;
    const chain = env.CHAIN_ID === 1 ? mainnet : sepolia;

    this.publicClient = createPublicClient({
      chain,
      transport: http(env.ETHEREUM_RPC_URL),
    });
  }

  async start(): Promise<void> {
    if (this.isListening) {
      logger.warn('Event listener already running');
      return;
    }

    logger.info('Starting contract event listener');
    this.isListening = true;

    try {
            await gasManagerService.monitorGasBalance();

            this.lastProcessedBlock = await contractService.getBlockNumber();
      logger.info('Event listener initialized', {
        startBlock: this.lastProcessedBlock.toString(),
      });

            contractService.watchBlocks(async (blockNumber) => {
        await this.processBlockEvents(this.lastProcessedBlock + 1n, blockNumber);
        this.lastProcessedBlock = blockNumber;
      });

            this.watchInvoiceCreated();
      this.watchInvoiceFunded();
      this.watchDeliverySubmitted();
      this.watchDeliveryConfirmed();
      this.watchInvoiceCompleted();
      this.watchInvoiceCancelled();

            setInterval(async () => {
        await gasManagerService.monitorGasBalance();
      }, 5 * 60 * 1000);

    } catch (error) {
      logger.error('Failed to start event listener', { error });
      this.isListening = false;
      throw error;
    }
  }

  stop(): void {
    this.isListening = false;
    logger.info('Event listener stopped');
  }

  private async processBlockEvents(fromBlock: bigint, toBlock: bigint): Promise<void> {
    if (fromBlock > toBlock) return;

    try {
      logger.debug('Processing block events', {
        fromBlock: fromBlock.toString(),
        toBlock: toBlock.toString(),
      });

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

    } catch (error) {
      logger.error('Failed to handle InvoiceCreated event', { error, log });
    }
  }

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

  private async handleInvoiceFunded(log: Log): Promise<void> {
    try {
      const { args } = log as any;
      const { invoiceId, payer, amount } = args;

      logger.info('Invoice funded', {
        invoiceId: invoiceId.toString(),
        payer,
        amount: amount.toString(),
      });

            const invoice = await contractService.getInvoice(invoiceId);

            await blockradarService.holdFunds({
        walletAddress: payer,
        amount: amount.toString(),
        token: invoice.tokenAddress,
        invoiceId: invoiceId.toString(),
      });

    } catch (error) {
      logger.error('Failed to handle InvoiceFunded event', { error, log });
    }
  }

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

  private async handleDeliverySubmitted(log: Log): Promise<void> {
    try {
      const { args } = log as any;
      const { invoiceId, issuer, proofHash } = args;

      logger.info('Delivery submitted', {
        invoiceId: invoiceId.toString(),
        issuer,
        proofHash,
      });

    } catch (error) {
      logger.error('Failed to handle DeliverySubmitted event', { error, log });
    }
  }

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

  private async handleDeliveryConfirmed(log: Log): Promise<void> {
    try {
      const { args } = log as any;
      const { invoiceId, receiver } = args;

      logger.info('Delivery confirmed', {
        invoiceId: invoiceId.toString(),
        receiver,
      });

    } catch (error) {
      logger.error('Failed to handle DeliveryConfirmed event', { error, log });
    }
  }

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

  private async handleInvoiceCompleted(log: Log): Promise<void> {
    try {
      const { args } = log as any;
      const { invoiceId, platformFeeCollected } = args;

      logger.info('Invoice completed', {
        invoiceId: invoiceId.toString(),
        platformFeeCollected: platformFeeCollected.toString(),
      });

            const invoice = await contractService.getInvoice(invoiceId);

            const gasCheck = await gasManagerService.checkGasBalance();
      if (!gasCheck.hasEnough) {
        const errorMsg = `Insufficient gas balance to process invoice ${invoiceId}. Current balance: ${gasCheck.nativeBalance} ETH`;
        logger.error(errorMsg, {
          invoiceId: invoiceId.toString(),
          nativeBalance: gasCheck.nativeBalance,
          nativeBalanceInUSD: gasCheck.nativeBalanceInUSD,
        });
        
                        throw new Error(errorMsg);
      }

      logger.info('Gas balance check passed', {
        invoiceId: invoiceId.toString(),
        nativeBalance: gasCheck.nativeBalance,
      });

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

    } catch (error) {
      logger.error('Failed to handle InvoiceCompleted event', { error, log });
            throw error;
    }
  }

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

  private async handleInvoiceCancelled(log: Log): Promise<void> {
    try {
      const { args } = log as any;
      const { invoiceId, cancelledBy, reason } = args;

      logger.info('Invoice cancelled', {
        invoiceId: invoiceId.toString(),
        cancelledBy,
        reason,
      });

            const invoice = await contractService.getInvoice(invoiceId);

            if (invoice.status === InvoiceStatus.Cancelled && invoice.fundedAt > 0n) {
        await blockradarService.refundFunds(
          invoiceId.toString(),
          invoice.payer,
          invoice.amount.toString(),
          invoice.tokenAddress
        );
      }

    } catch (error) {
      logger.error('Failed to handle InvoiceCancelled event', { error, log });
    }
  }

  getStatus(): { isListening: boolean; lastProcessedBlock: string } {
    return {
      isListening: this.isListening,
      lastProcessedBlock: this.lastProcessedBlock.toString(),
    };
  }
}

export const eventListenerService = new EventListenerService();
