import { Request, Response } from 'express';
import { blockradarService } from '../services/blockradar.service';
import { userWalletService } from '../services/user-wallet.service';
import { userService } from '../services/user.service';
import { contractService } from '../services/contract.service';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export class InvoiceController {
  
  async createInvoice(req: Request, res: Response): Promise<void> {
    try {
      const {
        userId,         payer,
        receiver,
        amount,
        tokenAddress,
        requiresDelivery,
        description,
        attachmentHash,
      } = req.body;

            if (!userId || !payer || !receiver || !amount) {
        res.status(400).json({
          error: 'Missing required fields',
          message: 'userId, payer, receiver, and amount are required',
        });
        return;
      }

            const addressId = await userService.getUserWalletAddressId(userId);

            const holdisAbi = [
        {
          name: 'createInvoice',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: '_payer', type: 'address' },
            { name: '_receiver', type: 'address' },
            { name: '_amount', type: 'uint256' },
            { name: '_tokenAddress', type: 'address' },
            { name: '_requiresDelivery', type: 'bool' },
            { name: '_description', type: 'string' },
            { name: '_attachmentHash', type: 'string' },
          ],
          outputs: [{ name: 'invoiceId', type: 'uint256' }],
        },
      ];

            const reference = `invoice-create-${Date.now()}-${Math.random().toString(36).substring(7)}`;

            const result = await userWalletService.writeContractFromChildAddress(addressId, {
        address: env.HOLDIS_CONTRACT_ADDRESS,
        method: 'createInvoice',
        parameters: [
          payer,
          receiver,
          amount,
          tokenAddress || '0x0000000000000000000000000000000000000000',
          requiresDelivery || false,
          description || '',
          attachmentHash || '',
        ],
        abi: holdisAbi,
        reference,
        metadata: {
          userId,
          type: 'invoice_creation',
          issuer: userId,
          payer,
          receiver,
          amount,
          tokenAddress: tokenAddress || 'native',
          requiresDelivery,
          timestamp: new Date().toISOString(),
        },
      });

      logger.info('Invoice creation initiated', {
        userId,
        reference,
        txHash: result.hash,
      });

      res.status(201).json({
        success: true,
        message: 'Invoice creation initiated',
        data: {
          txId: result.id,
          txHash: result.hash,
          status: result.status,
          reference,
        },
      });
    } catch (error) {
      logger.error('Create invoice API error', { error });
      res.status(500).json({
        error: 'Failed to create invoice',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async fundInvoice(req: Request, res: Response): Promise<void> {
    try {
      const { invoiceId } = req.params;
      const { userId } = req.body; 
      if (!userId) {
        res.status(400).json({
          error: 'Missing userId',
          message: 'Payer userId is required',
        });
        return;
      }

            const invoice = await contractService.getInvoice(BigInt(invoiceId));
      if (!invoice) {
        res.status(404).json({
          error: 'Invoice not found',
        });
        return;
      }

            const addressId = await userService.getUserWalletAddressId(userId);

            const isERC20 = invoice.tokenAddress !== '0x0000000000000000000000000000000000000000';

            const approveAbi = [
        {
          name: 'approve',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          outputs: [{ name: '', type: 'bool' }],
        },
      ];

      const markFundedAbi = [
        {
          name: 'markAsFunded',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [{ name: '_invoiceId', type: 'uint256' }],
          outputs: [],
        },
      ];

            if (isERC20) {
                const gasEstimate = await userWalletService.estimateNetworkFeeForChildAddress(
          addressId,
          {
            address: invoice.tokenAddress,
            method: 'approve',
            parameters: [env.HOLDIS_CONTRACT_ADDRESS, invoice.amount.toString()],
            abi: approveAbi,
          }
        );

        logger.info('Gas estimate for approve + fund', {
          invoiceId,
          gas: gasEstimate.networkFee,
          gasUSD: gasEstimate.networkFeeInUSD,
        });

                if (parseFloat(gasEstimate.nativeBalance) < parseFloat(gasEstimate.networkFee) * 2) {
          res.status(400).json({
            error: 'Insufficient gas balance',
            message: 'Not enough native token for gas fees',
            data: {
              required: parseFloat(gasEstimate.networkFee) * 2,
              available: gasEstimate.nativeBalance,
            },
          });
          return;
        }

                const batchResult = await blockradarService.writeContract({
          calls: [
            {
              address: invoice.tokenAddress,
              method: 'approve',
              parameters: [env.HOLDIS_CONTRACT_ADDRESS, invoice.amount.toString()],
              abi: approveAbi,
              reference: `approve-${invoiceId}-${Date.now()}`,
              metadata: {
                userId,
                invoiceId,
                type: 'token_approval',
                step: 1,
              },
            },
            {
              address: env.HOLDIS_CONTRACT_ADDRESS,
              method: 'markAsFunded',
              parameters: [invoiceId],
              abi: markFundedAbi,
              reference: `fund-${invoiceId}-${Date.now()}`,
              metadata: {
                userId,
                invoiceId,
                type: 'invoice_funding',
                step: 2,
              },
            },
          ],
        } as any);

        logger.info('Batch funding initiated', {
          invoiceId,
          userId,
          success: (batchResult as any).success?.length || 0,
          errors: (batchResult as any).errors?.length || 0,
        });

        res.status(200).json({
          success: true,
          message: 'Invoice funding batch initiated',
          data: {
            operations: (batchResult as any).success,
            errors: (batchResult as any).errors,
          },
        });
      } else {
                const result = await userWalletService.writeContractFromChildAddress(addressId, {
          address: env.HOLDIS_CONTRACT_ADDRESS,
          method: 'markAsFunded',
          parameters: [invoiceId],
          abi: markFundedAbi,
          reference: `fund-${invoiceId}-${Date.now()}`,
          metadata: {
            userId,
            invoiceId,
            type: 'invoice_funding',
            tokenType: 'native',
          },
        });

        res.status(200).json({
          success: true,
          message: 'Invoice funding initiated',
          data: {
            txId: result.id,
            txHash: result.hash,
            status: result.status,
            reference: `fund-${invoiceId}-${Date.now()}`,
          },
        });
      }
    } catch (error) {
      logger.error('Fund invoice API error', { error });
      res.status(500).json({
        error: 'Failed to fund invoice',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async submitDelivery(req: Request, res: Response): Promise<void> {
    try {
      const { invoiceId } = req.params;
      const { userId, deliveryProof } = req.body; 
      const addressId = await userService.getUserWalletAddressId(userId);
      const reference = `delivery-submit-${invoiceId}-${Date.now()}`;

      const submitDeliveryAbi = [
        {
          name: 'submitDelivery',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [{ name: '_invoiceId', type: 'uint256' }],
          outputs: [],
        },
      ];

      const result = await userWalletService.writeContractFromChildAddress(addressId, {
        address: env.HOLDIS_CONTRACT_ADDRESS,
        method: 'submitDelivery',
        parameters: [invoiceId],
        abi: submitDeliveryAbi,
        reference,
        metadata: {
          userId,
          invoiceId,
          type: 'delivery_submission',
          deliveryProof,
          timestamp: new Date().toISOString(),
        },
      });

      res.status(200).json({
        success: true,
        message: 'Delivery submission initiated',
        data: {
          txId: result.id,
          txHash: result.hash,
          status: result.status,
          reference,
        },
      });
    } catch (error) {
      logger.error('Submit delivery API error', { error });
      res.status(500).json({
        error: 'Failed to submit delivery',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async confirmDelivery(req: Request, res: Response): Promise<void> {
    try {
      const { invoiceId } = req.params;
      const { userId, confirmationNotes } = req.body; 
      const addressId = await userService.getUserWalletAddressId(userId);
      const reference = `delivery-confirm-${invoiceId}-${Date.now()}`;

      const confirmDeliveryAbi = [
        {
          name: 'confirmDelivery',
          type: 'function',
          stateMutability: 'nonpayable',
          inputs: [{ name: '_invoiceId', type: 'uint256' }],
          outputs: [],
        },
      ];

      const result = await userWalletService.writeContractFromChildAddress(addressId, {
        address: env.HOLDIS_CONTRACT_ADDRESS,
        method: 'confirmDelivery',
        parameters: [invoiceId],
        abi: confirmDeliveryAbi,
        reference,
        metadata: {
          userId,
          invoiceId,
          type: 'delivery_confirmation',
          confirmationNotes,
          timestamp: new Date().toISOString(),
        },
      });

      res.status(200).json({
        success: true,
        message: 'Delivery confirmation initiated',
        data: {
          txId: result.id,
          txHash: result.hash,
          status: result.status,
          reference,
        },
      });
    } catch (error) {
      logger.error('Confirm delivery API error', { error });
      res.status(500).json({
        error: 'Failed to confirm delivery',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getInvoice(req: Request, res: Response): Promise<void> {
    try {
      const { invoiceId } = req.params;

      const invoice = await contractService.getInvoice(BigInt(invoiceId));
      if (!invoice) {
        res.status(404).json({
          error: 'Invoice not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: invoice,
      });
    } catch (error) {
      logger.error('Get invoice API error', { error });
      res.status(500).json({
        error: 'Failed to get invoice',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getUserInvoices(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const { role } = req.query; 
            const wallet = await userWalletService.getUserWallet(userId);
      if (!wallet) {
        res.status(404).json({
          error: 'User wallet not found',
        });
        return;
      }

      let invoices;
      switch (role) {
        case 'issuer':
          invoices = await contractService.getIssuerInvoices(wallet.address as `0x${string}`);
          break;
        case 'payer':
          invoices = await contractService.getPayerInvoices(wallet.address as `0x${string}`);
          break;
        case 'receiver':
          invoices = await contractService.getReceiverInvoices(wallet.address as `0x${string}`);
          break;
        default:
                    const [issued, paying, receiving] = await Promise.all([
            contractService.getIssuerInvoices(wallet.address as `0x${string}`),
            contractService.getPayerInvoices(wallet.address as `0x${string}`),
            contractService.getReceiverInvoices(wallet.address as `0x${string}`),
          ]);
          invoices = { issued, paying, receiving };
      }

      res.status(200).json({
        success: true,
        data: invoices,
      });
    } catch (error) {
      logger.error('Get user invoices API error', { error });
      res.status(500).json({
        error: 'Failed to get invoices',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export const invoiceController = new InvoiceController();
