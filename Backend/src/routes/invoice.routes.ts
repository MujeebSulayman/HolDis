import { Router } from 'express';
import { invoiceController } from '../controllers/invoice.controller';

const router = Router();

/**
 * Invoice Management Routes
 */

// Create invoice
router.post('/create', (req, res) => invoiceController.createInvoice(req, res));

// Get invoice details
router.get('/:invoiceId', (req, res) => invoiceController.getInvoice(req, res));

// Fund invoice (payer marks as paid)
router.post('/:invoiceId/fund', (req, res) => invoiceController.fundInvoice(req, res));

// Submit delivery proof (issuer)
router.post('/:invoiceId/deliver', (req, res) => invoiceController.submitDelivery(req, res));

// Confirm delivery (payer)
router.post('/:invoiceId/confirm', (req, res) => invoiceController.confirmDelivery(req, res));

// Get user's invoices
router.get('/user/:userId', (req, res) => invoiceController.getUserInvoices(req, res));

export default router;
