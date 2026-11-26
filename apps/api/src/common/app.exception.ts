import { HttpException, HttpStatus } from '@nestjs/common';

export interface ErrorDetail { path: string; message: string }

/** An HTTP error with a stable machine-readable code. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetail[],
    readonly retryAfterSeconds?: number,
  ) {
    super({ code, message, details }, status);
  }
}

export const unauthorized = (message = 'Authentication is required.') =>
  new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have permission to perform this action.', code = 'FORBIDDEN') =>
  new AppException(HttpStatus.FORBIDDEN, code, message);
