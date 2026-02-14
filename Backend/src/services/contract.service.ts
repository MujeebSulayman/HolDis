import { createPublicClient, http, parseAbi, formatUnits, Address } from 'viem';
import { mainnet, sepolia } from 'viem/chains';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import {
  Invoice,
  InvoiceStatus,
  PlatformSettings,
} from '../types/contract';

const holdisAbi = parseAbi([
    'function getInvoice(uint256 invoiceId) external view returns (tuple(uint256 id, address issuer, address payer, address receiver, uint256 amount, address tokenAddress, uint8 status, bool requiresDelivery, string description, string attachmentHash, uint256 createdAt, uint256 fundedAt, uint256 deliveredAt, uint256 completedAt))',
  'function getTotalInvoices() external view returns (uint256)',
  'function getIssuerInvoices(address issuer, uint256 offset, uint256 limit) external view returns (uint256[], uint256)',
  'function getPayerInvoices(address payer, uint256 offset, uint256 limit) external view returns (uint256[], uint256)',
  'function getReceiverInvoices(address receiver, uint256 offset, uint256 limit) external view returns (uint256[], uint256)',
  'function platformSettings() external view returns (tuple(uint256 platformFee, uint256 maxInvoiceAmount, uint256 minInvoiceAmount))',
  'function supportedTokens(address token) external view returns (bool)',
  
    'event InvoiceCreated(uint256 indexed invoiceId, address indexed issuer, address indexed payer, address receiver, uint256 amount, address token, bool requiresDelivery, uint256 timestamp)',
  'event InvoiceFunded(uint256 indexed invoiceId, address indexed payer, uint256 amount, uint256 timestamp)',
  'event DeliverySubmitted(uint256 indexed invoiceId, address indexed issuer, string proofHash, uint256 timestamp)',
  'event DeliveryConfirmed(uint256 indexed invoiceId, address indexed receiver, uint256 timestamp)',
  'event InvoiceCompleted(uint256 indexed invoiceId, uint256 platformFeeCollected, uint256 timestamp)',
  'event InvoiceCancelled(uint256 indexed invoiceId, address indexed cancelledBy, string reason, uint256 timestamp)',
  'event InvoiceStatusUpdated(uint256 indexed invoiceId, uint8 oldStatus, uint8 newStatus, uint256 timestamp)',
]);

export class ContractService {
  private publicClient: ReturnType<typeof createPublicClient>;
  private contractAddress: Address;
  private chain: typeof mainnet | typeof sepolia;

  constructor() {
    this.contractAddress = env.HOLDIS_CONTRACT_ADDRESS as Address;
    this.chain = env.CHAIN_ID === 1 ? mainnet : sepolia;

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(env.RPC_URL),
    });

    logger.info('Contract service initialized', {
      contractAddress: this.contractAddress,
      chainId: env.CHAIN_ID,
    });
  }

  async getInvoice(invoiceId: bigint): Promise<Invoice> {
    try {
      const invoice = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: holdisAbi,
        functionName: 'getInvoice',
        args: [invoiceId],
      }) as any;

      return {
        id: invoice.id,
        issuer: invoice.issuer,
        payer: invoice.payer,
        receiver: invoice.receiver,
        amount: invoice.amount,
        tokenAddress: invoice.tokenAddress,
        status: invoice.status as InvoiceStatus,
        requiresDelivery: invoice.requiresDelivery,
        description: invoice.description,
        attachmentHash: invoice.attachmentHash,
        createdAt: invoice.createdAt,
        fundedAt: invoice.fundedAt,
        deliveredAt: invoice.deliveredAt,
        completedAt: invoice.completedAt,
      };
    } catch (error) {
      logger.error('Failed to get invoice from contract', { error, invoiceId });
      throw error;
    }
  }

  async getTotalInvoices(): Promise<bigint> {
    try {
      const total = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: holdisAbi,
        functionName: 'getTotalInvoices',
      }) as bigint;
      return total;
    } catch (error) {
      logger.error('Failed to get total invoices', { error });
      throw error;
    }
  }

  async getIssuerInvoices(
    issuer: Address,
    offset: bigint = 0n,
    limit: bigint = 20n
  ): Promise<{ invoiceIds: bigint[]; total: bigint }> {
    try {
      const [invoiceIds, total] = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: holdisAbi,
        functionName: 'getIssuerInvoices',
        args: [issuer, offset, limit],
      }) as [bigint[], bigint];
      return { invoiceIds, total };
    } catch (error) {
      logger.error('Failed to get issuer invoices', { error, issuer });
      throw error;
    }
  }

  async getPayerInvoices(
    payer: Address,
    offset: bigint = 0n,
    limit: bigint = 20n
  ): Promise<{ invoiceIds: bigint[]; total: bigint }> {
    try {
      const [invoiceIds, total] = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: holdisAbi,
        functionName: 'getPayerInvoices',
        args: [payer, offset, limit],
      }) as [bigint[], bigint];
      return { invoiceIds, total };
    } catch (error) {
      logger.error('Failed to get payer invoices', { error, payer });
      throw error;
    }
  }

  async getReceiverInvoices(
    receiver: Address,
    offset: bigint = 0n,
    limit: bigint = 20n
  ): Promise<{ invoiceIds: bigint[]; total: bigint }> {
    try {
      const [invoiceIds, total] = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: holdisAbi,
        functionName: 'getReceiverInvoices',
        args: [receiver, offset, limit],
      }) as [bigint[], bigint];
      return { invoiceIds, total };
    } catch (error) {
      logger.error('Failed to get receiver invoices', { error, receiver });
      throw error;
    }
  }

  async getPlatformSettings(): Promise<PlatformSettings> {
    try {
      const settings = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: holdisAbi,
        functionName: 'platformSettings',
      }) as any;

      return {
        platformFee: settings.platformFee,
        maxInvoiceAmount: settings.maxInvoiceAmount,
        minInvoiceAmount: settings.minInvoiceAmount,
      };
    } catch (error) {
      logger.error('Failed to get platform settings', { error });
      throw error;
    }
  }

  async isTokenSupported(token: Address): Promise<boolean> {
    try {
      const supported = await this.publicClient.readContract({
        address: this.contractAddress,
        abi: holdisAbi,
        functionName: 'supportedTokens',
        args: [token],
      }) as boolean;
      return supported;
    } catch (error) {
      logger.error('Failed to check token support', { error, token });
      throw error;
    }
  }

  formatAmount(amount: bigint, decimals: number = 18): string {
    return formatUnits(amount, decimals);
  }

  async getBlockNumber(): Promise<bigint> {
    try {
      const blockNumber = await this.publicClient.getBlockNumber();
      return blockNumber;
    } catch (error) {
      logger.error('Failed to get block number', { error });
      throw error;
    }
  }

  async getTransactionReceipt(txHash: `0x${string}`) {
    try {
      const receipt = await this.publicClient.getTransactionReceipt({ hash: txHash });
      return receipt;
    } catch (error) {
      logger.error('Failed to get transaction receipt', { error, txHash });
      throw error;
    }
  }

  calculatePlatformFee(amount: bigint, feeInBasisPoints: bigint): bigint {
    return (amount * feeInBasisPoints) / 10000n;
  }

  watchBlocks(callback: (blockNumber: bigint) => void) {
    return this.publicClient.watchBlockNumber({
      onBlockNumber: callback,
      poll: true,
      pollingInterval: 12_000,     });
  }

  async getLogs(
    eventName: string,
    fromBlock?: bigint,
    toBlock?: bigint
  ) {
    try {
      const eventAbi = holdisAbi.find(item => item.type === 'event' && item.name === eventName);
      if (!eventAbi || eventAbi.type !== 'event') {
        throw new Error(`Event ${eventName} not found in ABI`);
      }
      
      const logs = await this.publicClient.getLogs({
        address: this.contractAddress,
        event: eventAbi as any,
        fromBlock: fromBlock || 'earliest',
        toBlock: toBlock || 'latest',
      });
      return logs;
    } catch (error) {
      logger.error('Failed to get contract logs', { error, eventName });
      throw error;
    }
  }
}

export const contractService = new ContractService();
