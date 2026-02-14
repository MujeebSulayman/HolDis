import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';

const router = Router();

/**
 * @swagger
 * /api/webhooks/blockradar:
 *   post:
 *     summary: Handle Blockradar webhook events
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *                 enum: [custom-smart-contract.success, custom-smart-contract.failed, transfer.success, transfer.failed]
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Webhook received
 */
router.post('/blockradar', (req, res) => webhookController.handleBlockradarWebhook(req, res));

if (process.env.NODE_ENV !== 'production') {
  /**
   * @swagger
   * /api/webhooks/test:
   *   get:
   *     summary: Test webhook functionality (development only)
   *     tags: [Webhooks]
   *     responses:
   *       200:
   *         description: Test webhook processed
   */
  router.get('/test', (req, res) => webhookController.testWebhook(req, res));
}

export default router;
