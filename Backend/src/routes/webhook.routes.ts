import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';

const router = Router();

/**
 * Webhook Routes
 */

// Blockradar webhook endpoint
router.post('/blockradar', (req, res) => webhookController.handleBlockradarWebhook(req, res));

// Test webhook (development only)
if (process.env.NODE_ENV !== 'production') {
  router.get('/test', (req, res) => webhookController.testWebhook(req, res));
}

export default router;
