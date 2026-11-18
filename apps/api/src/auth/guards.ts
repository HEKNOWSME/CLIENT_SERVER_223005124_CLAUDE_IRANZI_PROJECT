import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { forbidden, unauthorized } from '../common/app.exception';
import { ALLOW_PENDING_KEY, IS_PUBLIC_KEY, ROLES_KEY } from '../common/decorators';
import { env } from '../config';
import type { UserRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { TokenService } from './token.service';

export const CSRF_HEADER = 'x-pmrms-csrf';

/**
 * Verifies the bearer access token, then reloads the account from PostgreSQL so suspension,
 * role changes, password changes and logout take effect immediately rather than at token expiry.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = (req.get('authorization') ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw unauthorized();

    const claims = await this.tokens.verifyAccessToken(token);
    if (!claims) throw unauthorized('Access token is invalid or expired.');

    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: {
        id: true,
        role: true,
        status: true,
        passwordChangedAt: true,
        refreshSessions: {
          where: { familyId: claims.sid, revokedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true },
          take: 1,
        },
      },
    });
    const issuedBeforePasswordChange = user ? claims.iat < Math.floor(user.passwordChangedAt.getTime() / 1000) : true;
    if (!user || user.role !== claims.role || user.refreshSessions.length === 0 || issuedBeforePasswordChange) {
      throw unauthorized('Access token is invalid or expired.');
    }
    if (user.status === 'SUSPENDED') throw forbidden('This account is suspended.', 'ACCOUNT_SUSPENDED');
    if (user.status !== 'ACTIVE' && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_KEY, targets)) {
      throw forbidden('Your account is pending administrator approval.', 'ACCOUNT_PENDING');
    }

    req.user = { id: user.id, role: user.role, status: user.status, sessionFamilyId: claims.sid };
    return true;
  }
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles?.length) return true;
    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user || !roles.includes(user.role)) throw forbidden();
    return true;
  }
}

/**
 * Endpoints authenticated by the refresh cookie need CSRF protection. A custom header cannot be
 * sent cross-site without a CORS preflight (which only WEB_ORIGIN passes), and any Origin header
 * present must be the web app or the API itself. SameSite=Strict on the cookie is a third layer.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const origin = req.get('origin');
    const allowedOrigins = [env.WEB_ORIGIN, `${req.protocol}://${req.get('host')}`];
    if (req.get(CSRF_HEADER) !== '1' || (origin && !allowedOrigins.includes(origin))) {
      throw forbidden('Request failed cross-site request forgery checks.', 'CSRF_REJECTED');
    }
    return true;
  }
}
