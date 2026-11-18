import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ErrorResponse } from '@pmrms/contracts';
import type { Request, Response } from 'express';
import { AppException } from './app.exception';

const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
  503: 'DEPENDENCY_UNAVAILABLE',
};

interface Normalised { status: number; code: string; message: string; details?: ErrorResponse['details'] }

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    if (res.headersSent) return;

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      // Structured bodies without a message (the health readiness report) are part of the contract.
      if (typeof body === 'object' && body !== null && !('message' in body)) {
        res.status(exception.getStatus()).json(body);
        return;
      }
    }

    const error = this.normalise(exception, req);
    if (exception instanceof AppException && exception.retryAfterSeconds) {
      res.setHeader('Retry-After', String(exception.retryAfterSeconds));
    }
    const payload: ErrorResponse = {
      statusCode: error.status,
      code: error.code,
      message: error.message,
      requestId: req.requestId ?? 'unknown',
      timestamp: new Date().toISOString(),
      ...(error.details?.length ? { details: error.details } : {}),
    };
    res.status(error.status).json(payload);
  }

  private normalise(exception: unknown, req: Request): Normalised {
    if (exception instanceof AppException) {
      return { status: exception.getStatus(), code: exception.code, message: exception.message, details: exception.details };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const raw = typeof body === 'string' ? body : (body as { message?: unknown }).message;
      const message = status === HttpStatus.TOO_MANY_REQUESTS
        ? 'Too many requests. Please wait and try again.'
        : Array.isArray(raw) ? raw.join('; ') : String(raw ?? exception.message);
      return { status, code: DEFAULT_CODES[status] ?? 'HTTP_ERROR', message };
    }
    const bodyParser = exception as { type?: string; status?: number };
    if (bodyParser?.type === 'entity.parse.failed') {
      return { status: 400, code: 'MALFORMED_JSON', message: 'Request body is not valid JSON.' };
    }
    if (bodyParser?.type === 'entity.too.large') {
      return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large.' };
    }
    if ((exception as { code?: string })?.code === 'P2002') {
      return { status: 409, code: 'CONFLICT', message: 'A record with the same unique value already exists.' };
    }
    this.logger.error(
      `${req.method} ${req.originalUrl} failed [${req.requestId}]`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    return { status: 500, code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' };
  }
}
