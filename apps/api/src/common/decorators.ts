import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { UserRole } from '../generated/prisma/client';
import type { AuthenticatedUser } from './request-context';

export const IS_PUBLIC_KEY = 'auth:public';
export const ROLES_KEY = 'auth:roles';
export const ALLOW_PENDING_KEY = 'auth:allow-pending';

/** Skips access-token authentication. Every other route is protected by default. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restricts a route to the listed roles (checked after authentication). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Lets PENDING accounts (doctor applicants) reach the route; SUSPENDED is always refused. */
export const AllowPendingAccount = () => SetMetadata(ALLOW_PENDING_KEY, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const user = ctx.switchToHttp().getRequest<Request>().user;
  if (!user) throw new Error('CurrentUser used on a route without authentication.');
  return user;
});
