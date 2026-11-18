import { healthResponseSchema } from '@pmrms/contracts';

export async function getHealth(signal?: AbortSignal) {
  const response = await fetch('/api/health', { cache: 'no-store', signal });
  const parsed = healthResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('The API returned an unexpected response. Check that the backend is running.');
  return parsed.data;
}
