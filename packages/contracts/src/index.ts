import { z } from 'zod';

export const healthResponseSchema = z.object({
  service: z.literal('pmrms-api'),
  status: z.enum(['ok', 'degraded']),
  database: z.enum(['connected', 'unavailable']),
  setup: z.enum(['ready', 'seed-required', 'unavailable']),
  checkedAt: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export * from './auth';
