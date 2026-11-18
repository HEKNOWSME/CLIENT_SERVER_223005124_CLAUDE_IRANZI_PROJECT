import { config } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

config({ path: resolve(__dirname, '../../..', '.env'), quiet: true });

const result = z.object({
  DATABASE_URL: z.url().refine(value => ['postgres:', 'postgresql:'].includes(new URL(value).protocol)),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
}).safeParse(process.env);
if (!result.success) {
  throw new Error(`Invalid environment: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}. Check the root .env file.`);
}
export const env = result.data;
