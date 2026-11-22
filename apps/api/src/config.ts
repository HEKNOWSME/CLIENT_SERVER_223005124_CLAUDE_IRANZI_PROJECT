import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

config({ path: resolve(__dirname, '../../..', '.env'), quiet: true });

const secret = z.string().min(32, 'must be at least 32 characters');

const result = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.url().refine(value => ['postgres:', 'postgresql:'].includes(new URL(value).protocol)),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  JWT_ACCESS_SECRET: secret,
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_PEPPER: secret,
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  LOGIN_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  RESEND_API_KEY: z.string().min(1, 'Resend API key is required for registration OTP emails'),
  RESEND_FROM_EMAIL: z.string().min(3, 'Verified Resend from address is required, e.g. PMRMS <noreply@yourdomain.com>'),
  OTP_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(10),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(30).max(600).default(60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
}).refine(value => value.JWT_ACCESS_SECRET !== value.REFRESH_TOKEN_PEPPER, {
  path: ['REFRESH_TOKEN_PEPPER'], message: 'must differ from JWT_ACCESS_SECRET',
}).safeParse(process.env);
if (!result.success) {
  const issues = result.error.issues.map(issue => `${issue.path.join('.')} (${issue.message})`).join(', ');
  throw new Error(`Invalid environment: ${issues}. Check the root .env file.`);
}
export const env = result.data;
export const isProduction = env.NODE_ENV === 'production';
