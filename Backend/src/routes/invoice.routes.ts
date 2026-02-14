import { Router } from 'express';
import { invoiceController } from '../controllers/invoice.controller';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

/**
 * @swagger
 * /api/invoices/create:
 *   post:
 *     summary: Create a new invoice
 *     tags: [Invoices]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateInvoiceRequest'
 *     responses:
 *       201:
 *         description: Invoice creation initiated
 *       401:
 *         description: Unauthorized
 */
router.post('/create', authenticate, (req, res) => invoiceController.createInvoice(req, res));

/**
 * @swagger
 * /api/invoices/{invoiceId}:
 *   get:
 *     summary: Get invoice details
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invoice details
 */
router.get('/:invoiceId', (req, res) => invoiceController.getInvoice(req, res));

/**
 * @swagger
 * /api/invoices/{invoiceId}/fund:
 *   post:
 *     summary: Fund invoice (payer marks as paid)
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *                 description: Payer's user ID
 *     responses:
 *       200:
 *         description: Invoice funding initiated
 */
router.post('/:invoiceId/fund', authenticate, (req, res) => invoiceController.fundInvoice(req, res));

/**
 * @swagger
 * /api/invoices/{invoiceId}/deliver:
 *   post:
 *     summary: Submit delivery proof (issuer)
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *               deliveryProof:
 *                 type: string
 *     responses:
 *       200:
 *         description: Delivery submission initiated
 */
router.post('/:invoiceId/deliver', authenticate, (req, res) => invoiceController.submitDelivery(req, res));

/**
 * @swagger
 * /api/invoices/{invoiceId}/confirm:
 *   post:
 *     summary: Confirm delivery (payer)
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: invoiceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *               confirmationNotes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Delivery confirmation initiated
 */
router.post('/:invoiceId/confirm', authenticate, (req, res) => invoiceController.confirmDelivery(req, res));

/**
 * @swagger
 * /api/invoices/user/{userId}:
 *   get:
 *     summary: Get user's invoices
 *     tags: [Invoices]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [issuer, payer, receiver]
 *     responses:
 *       200:
 *         description: User's invoices
 */
router.get('/user/:userId', authenticate, (req, res) => invoiceController.getUserInvoices(req, res));

export default router;
