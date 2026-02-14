import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { logger } from './utils/logger';
import { env } from './config/env';

// Import routes
import userRoutes from './routes/user.routes';
import invoiceRoutes from './routes/invoice.routes';
import webhookRoutes from './routes/webhook.routes';

export function createApp(): Application {
  const app = express();

  // ============================================
  // Security Middleware
  // ============================================
  app.use(helmet()); // Security headers
  app.use(cors({
    origin: env.NODE_ENV === 'production' 
      ? ['https://yourdomain.com'] // Configure your frontend domain
      : '*',
    credentials: true,
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later',
  });
  app.use('/api/', limiter);

  // ============================================
  // Request Parsing
  // ============================================
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ============================================
  // Logging
  // ============================================
  app.use(morgan('combined', {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  }));

  // ============================================
  // Health Check
  // ============================================
  app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
    });
  });

  // ============================================
  // API Routes
  // ============================================
  app.use('/api/users', userRoutes);
  app.use('/api/invoices', invoiceRoutes);
  app.use('/api/webhooks', webhookRoutes);

  // ============================================
  // 404 Handler
  // ============================================
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Cannot ${req.method} ${req.path}`,
    });
  });

  // ============================================
  // Error Handler
  // ============================================
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    });
  });

  return app;
}
