import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  APP_BASE_URL: z.string().url().default('http://localhost:3001'),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  SESSION_SECRET: z.string().min(16).default('development-only-change-me'),
  DATABASE_URL: z.string().default('postgresql://reachinbox:reachinbox@localhost:5432/reachinbox?schema=public'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  ELASTICSEARCH_URL: z.string().url().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('emails'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(10),
  MIN_SEND_INTERVAL_MS: z.coerce.number().int().nonnegative().default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().positive().default(200),
  ETHEREAL_HOST: z.string().default('smtp.ethereal.email'),
  ETHEREAL_PORT: z.coerce.number().int().positive().default(587),
  ETHEREAL_USER: z.string().optional(),
  ETHEREAL_PASS: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.string().url().default('http://localhost:3001/auth/google/callback'),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.string().url().default('http://localhost:3001/auth/slack/callback'),
  SLACK_STATE_SECRET: z.string().min(16).default('development-only-slack-secret'),
});

export const env = schema.parse(process.env);
export type Environment = typeof env;
