import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AccountStatus, UserRole } from '../generated/prisma/client';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  status: AccountStatus;
  sessionFamilyId: string;
}

export interface ClientContext {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      user?: AuthenticatedUser;
    }
  }
}

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,100}$/;

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id');
  req.requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

export function clientContext(req: Request): ClientContext {
  return {
    requestId: req.requestId,
    ipAddress: req.ip?.slice(0, 64) ?? null,
    userAgent: req.get('user-agent')?.slice(0, 300) ?? null,
  };
}
