import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { blockradarService } from './blockradar.service';

export interface BlockradarWebhookEvent {
  event: 'custom-smart-contract.success' | 'custom-smart-contract.failed' | 'transfer.success' | 'transfer.failed';
  data: {
    id: string;
    hash: string;
    status: 'SUCCESS' | 'FAILED' | 'PENDING';
    method?: string;
    contractAddress?: string;
    blockchain?: {
      name: string;
      network: string;
    };
    reference?: string;
    metadata?: Record<string, unknown>;
    error?: string;
  };
}

export class WebhookService {
  
  verifyWebhookSignature(payload: string, signature: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', env.BLOCKRADAR_WEBHOOK_SECRET)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error('Webhook signature verification failed', { error });
      return false;
    }
  }

  async handleWebhook(event: BlockradarWebhookEvent): Promise<void> {
    try {
      logger.info('Processing Blockradar webhook', {
        event: event.event,
        txHash: event.data.hash,
        status: event.data.status,
        reference: event.data.reference,
      });

      switch (event.event) {
        case 'custom-smart-contract.success':
          await this.handleContractSuccess(event);
          break;

        case 'custom-smart-contract.failed':
          await this.handleContractFailure(event);
          break;

        case 'transfer.success':
          await this.handleTransferSuccess(event);
          break;

        case 'transfer.failed':
          await this.handleTransferFailure(event);
          break;

        default:
          logger.warn('Unknown webhook event type', { event: event.event });
      }
    } catch (error) {
      logger.error('Failed to process webhook', { error, event });
      throw error;
    }
  }

  private async handleContractSuccess(event: BlockradarWebhookEvent): Promise<void> {
    const { reference, metadata, method } = event.data;

        if (metadata?.type) {
      switch (metadata.type) {
        case 'invoice_creation':
          await this.handleInvoiceCreationSuccess(event);
          break;

        case 'invoice_funding':
          await this.handleInvoiceFundingSuccess(event);
          break;

        case 'delivery_submission':
          await this.handleDeliverySubmissionSuccess(event);
          break;

        case 'delivery_confirmation':
          await this.handleDeliveryConfirmationSuccess(event);
          break;

        default:
          logger.info('Contract operation successful', { method, reference });
      }
    }

          }

  private async handleContractFailure(event: BlockradarWebhookEvent): Promise<void> {
    const { reference, metadata, error } = event.data;

    logger.error('Contract operation failed', {
      reference,
      error,
      metadata,
    });

        if (metadata?.retryable) {
      await this.scheduleRetry(event);
    }
  }

  private async handleInvoiceCreationSuccess(event: BlockradarWebhookEvent): Promise<void> {
    const { hash, metadata } = event.data;

    logger.info('Invoice created successfully', {
      txHash: hash,
      userId: metadata?.userId,
      invoiceId: metadata?.invoiceId,
    });

                      }

  private async handleInvoiceFundingSuccess(event: BlockradarWebhookEvent): Promise<void> {
    const { hash, metadata } = event.data;

    logger.info('Invoice funded successfully', {
      txHash: hash,
      invoiceId: metadata?.invoiceId,
    });

                      }

  private async handleDeliverySubmissionSuccess(event: BlockradarWebhookEvent): Promise<void> {
    const { hash, metadata } = event.data;

    logger.info('Delivery submitted successfully', {
      txHash: hash,
      invoiceId: metadata?.invoiceId,
    });

                      }

  private async handleDeliveryConfirmationSuccess(event: BlockradarWebhookEvent): Promise<void> {
    const { hash, metadata } = event.data;

    logger.info('Delivery confirmed successfully', {
      txHash: hash,
      invoiceId: metadata?.invoiceId,
    });

                          }

  private async handleTransferSuccess(event: BlockradarWebhookEvent): Promise<void> {
    const { reference, metadata, hash } = event.data;

    logger.info('Transfer successful', {
      txHash: hash,
      reference,
      metadata,
    });

        if (metadata?.type === 'fund_release') {
      await this.handleFundReleaseSuccess(event);
    }
  }

  private async handleTransferFailure(event: BlockradarWebhookEvent): Promise<void> {
    const { reference, error, metadata } = event.data;

    logger.error('Transfer failed', {
      reference,
      error,
      metadata,
    });

                              }

  private async handleFundReleaseSuccess(event: BlockradarWebhookEvent): Promise<void> {
    const { hash, metadata } = event.data;

    logger.info('Funds released successfully', {
      txHash: hash,
      invoiceId: metadata?.invoiceId,
      receiver: metadata?.receiver,
    });

                          }

  private async scheduleRetry(event: BlockradarWebhookEvent): Promise<void> {
    logger.info('Scheduling retry for failed operation', {
      reference: event.data.reference,
    });

                              }

  async getTransactionStatus(txId: string): Promise<any> {
    try {
      return await blockradarService.getTransactionStatus(txId);
    } catch (error) {
      logger.error('Failed to get transaction status', { error, txId });
      throw error;
    }
  }
}

export const webhookService = new WebhookService();
