import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { eventListenerService } from './services/event-listener.service';

const PORT = env.PORT || 3000;

async function bootstrap() {
  try {
    logger.info('🚀 Starting Holdis Backend...');

    const app = createApp();

    const server = app.listen(PORT, () => {
      logger.info(`✅ HTTP Server listening on port ${PORT}`);
      logger.info(`🌍 Environment: ${env.NODE_ENV}`);
      logger.info(`📡 Chain: ${env.CHAIN_ID}`);
      logger.info(`📝 Contract: ${env.HOLDIS_CONTRACT_ADDRESS}`);
      logger.info(`📚 API Docs: http://localhost:${PORT}/api-docs`);
    });

    logger.info('🔗 Starting blockchain event listener...');
    await eventListenerService.start();
    logger.info('✅ Event listener started');

    const shutdown = async () => {
      logger.info('📴 Shutting down gracefully...');

      server.close(() => {
        logger.info('✅ HTTP server closed');
      });

      eventListenerService.stop();
      logger.info('✅ Event listener stopped');

      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', { error });
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { reason, promise });
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start application', { error });
    process.exit(1);
  }
}

bootstrap();
