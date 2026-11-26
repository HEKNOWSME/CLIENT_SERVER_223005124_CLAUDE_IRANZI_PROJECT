import { config } from 'dotenv';
import { createPrivateKey } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';

config({ path: resolve(__dirname, '../../..', '.env'), quiet: true });

const secret = z.string().min(32, 'must be at least 32 characters');
const httpsOrigin = z.string().refine(value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password &&
      url.pathname === '/' && !url.search && !url.hash;
  } catch {
    return false;
  }
}, 'must be an HTTPS origin').transform(value => new URL(value).origin);
const signingJwk = z.string().transform((value, context) => {
  try {
    const jwk = z.object({
      kty: z.literal('EC'), crv: z.literal('P-256'), kid: z.string().min(1),
      x: z.string(), y: z.string(), d: z.string(),
    }).parse(JSON.parse(value));
    return { kid: jwk.kid, key: createPrivateKey({ key: jwk, format: 'jwk' }) };
  } catch {
    context.addIssue({ code: 'custom', message: 'must be a private ES256 JWK with a key ID' });
    return z.NEVER;
  }
});

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
  OTP_DELIVERY: z.enum(['resend', 'local']).default('resend'),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  OTP_TTL_MINUTES: z.coerce.number().int().min(5).max(60).default(10),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(30).max(600).default(60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
  PDF_STORAGE: z.enum(['postgres', 'r2']).default('postgres'),
  R2_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/i).optional(),
  R2_BUCKET: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/).optional(),
  R2_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
  R2_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
  REALTIME_PROVIDER: z.enum(['disabled', 'supabase']).default('disabled'),
  SUPABASE_URL: httpsOrigin.optional(),
  SUPABASE_PUBLISHABLE_KEY: z.string().regex(/^sb_publishable_[\w-]+$/).optional(),
  SUPABASE_REALTIME_SIGNING_JWK: signingJwk.optional(),
}).superRefine((value, context) => {
  if (value.OTP_DELIVERY === 'local' && (value.NODE_ENV === 'production' || !['127.0.0.1', '::1', 'localhost'].includes(value.API_HOST))) {
    context.addIssue({ code: 'custom', path: ['OTP_DELIVERY'], message: 'Local OTP requires a loopback API in development or test.' });
  }
  if (value.OTP_DELIVERY === 'resend') {
    for (const key of ['RESEND_API_KEY', 'RESEND_FROM_EMAIL'] as const) {
      if (!value[key]?.trim()) context.addIssue({ code: 'custom', path: [key], message: 'Required for Resend OTP delivery.' });
    }
  }
  if (value.PDF_STORAGE === 'r2') {
    for (const key of ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'] as const) {
      if (!value[key]) context.addIssue({ code: 'custom', path: [key], message: 'Required for R2 PDF storage.' });
    }
  }
  if (value.REALTIME_PROVIDER === 'supabase') {
    for (const key of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_REALTIME_SIGNING_JWK'] as const) {
      if (!value[key]) context.addIssue({ code: 'custom', path: [key], message: 'Required for Supabase Realtime.' });
    }
  }
}).refine(value => value.JWT_ACCESS_SECRET !== value.REFRESH_TOKEN_PEPPER, {
  path: ['REFRESH_TOKEN_PEPPER'], message: 'must differ from JWT_ACCESS_SECRET',
}).safeParse(process.env);
if (!result.success) {
  const issues = result.error.issues.map(issue => `${issue.path.join('.')} (${issue.message})`).join(', ');
  throw new Error(`Invalid environment: ${issues}. Check the root .env file.`);
}
export const env = result.data;
export const isProduction = env.NODE_ENV === 'production';
