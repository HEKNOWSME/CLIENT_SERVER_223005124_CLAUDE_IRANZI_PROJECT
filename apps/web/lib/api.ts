import { errorResponseSchema, type ErrorResponse } from '@pmrms/contracts';
import type { z } from 'zod';

export const CSRF_HEADERS = { 'X-PMRMS-CSRF': '1' } as const;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: NonNullable<ErrorResponse['details']> = [],
    readonly retryAfterSeconds: number | null = null,
    readonly requestId: string | null = null,
  ) {
    super(message);
  }
}

const networkError = () => new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');

/** Calls the API through the same-origin `/api` proxy and unwraps the `{ data }` envelope. */
export async function apiRequest<T>(path: string, init: RequestInit = {}, schema?: z.ZodType<T>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { cache: 'no-store', credentials: 'same-origin', ...init });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw networkError();
  }
  if (response.status === 204) return undefined as T;
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw toApiError(response, body);
  const data = (body as { data?: unknown } | null)?.data;
  if (!schema) return data as T;
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError(response.status, 'UNEXPECTED_RESPONSE', 'The server returned an unexpected response.');
  return parsed.data;
}

export function jsonBody(body: unknown, headers: Record<string, string> = {}): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) };
}

function toApiError(response: Response, body: unknown): ApiError {
  const parsed = errorResponseSchema.safeParse(body);
  const retryAfter = Number(response.headers.get('retry-after'));
  if (!parsed.success) {
    return new ApiError(response.status, response.status >= 500 ? 'SERVER_ERROR' : 'HTTP_ERROR', 'The request could not be completed.');
  }
  const { code, message, details, requestId } = parsed.data;
  return new ApiError(response.status, code, message, details, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null, requestId);
}

/** Maps stable API error codes to copy that is safe and useful for people. */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  switch (error.code) {
    case 'INVALID_CREDENTIALS': return 'Invalid email or password.';
    case 'ACCOUNT_SUSPENDED': return 'This account is suspended. Please contact an administrator.';
    case 'ACCOUNT_EXISTS': return 'An account with this email already exists. Try signing in instead.';
    case 'RATE_LIMITED': {
      const minutes = error.retryAfterSeconds ? Math.ceil(error.retryAfterSeconds / 60) : null;
      return minutes ? `Too many attempts. Please try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.` : 'Too many attempts. Please wait a moment and try again.';
    }
    case 'VALIDATION_FAILED': return 'Please correct the highlighted fields.';
    case 'SESSION_EXPIRED': return 'Your session has expired. Please sign in again.';
    case 'NETWORK_ERROR': return error.message;
    default: return error.status >= 500 ? 'The server had a problem. Please try again shortly.' : error.message;
  }
}

/** Field errors keyed by the first path segment, from either Zod (client) or the API (server). */
export function fieldErrors(issues: ReadonlyArray<{ path: PropertyKey[] | string; message: string }>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(Array.isArray(issue.path) ? issue.path[0] ?? '' : issue.path.split('.')[0]);
    if (key && !result[key]) result[key] = issue.message;
  }
  return result;
}