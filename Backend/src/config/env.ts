import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  API_VERSION: z.string().default('v1'),

    RPC_URL: z.string().url(),
  ETHEREUM_RPC_URL: z.string().url().optional(),
  ETHEREUM_TESTNET_RPC_URL: z.string().url().optional(),
  CHAIN_ID: z.string().transform(Number).default('1'),
  HOLDIS_CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),

    BLOCKRADAR_API_KEY: z.string().min(1),
  BLOCKRADAR_API_URL: z.string().url().default('https://api.blockradar.co'),
  BLOCKRADAR_WALLET_ID: z.string().min(1),
  BLOCKRADAR_WEBHOOK_SECRET: z.string().min(1),

    DATABASE_URL: z.string().url(),

    REDIS_URL: z.string().url().default('redis://localhost:6379'),

    PLATFORM_WALLET_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  PLATFORM_FEE_BASIS_POINTS: z.string().transform(Number).default('250'),

    JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().min(32),

    SENTRY_DSN: z.string().url().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

    RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);

export default env;
