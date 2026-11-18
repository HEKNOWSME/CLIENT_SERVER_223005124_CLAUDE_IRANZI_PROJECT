import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { userRoleSchema } from '@pmrms/contracts';
import { env } from '../config';
import type { UserRole } from '../generated/prisma/client';

export const JWT_ISSUER = 'pmrms-api';
export const JWT_AUDIENCE = 'pmrms-api';

const accessClaimsSchema = z.object({
  sub: z.uuid(),
  role: userRoleSchema,
  sid: z.uuid(),
  typ: z.literal('access'),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.uuid(),
});
export type AccessClaims = z.infer<typeof accessClaimsSchema>;

@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  signAccessToken(userId: string, role: UserRole, sessionFamilyId: string): Promise<string> {
    return this.jwt.signAsync({ role, sid: sessionFamilyId, typ: 'access' }, { subject: userId, jwtid: randomUUID() });
  }

  /** Returns validated claims, or null for any bad signature, algorithm, issuer, audience, expiry or shape. */
  async verifyAccessToken(token: string): Promise<AccessClaims | null> {
    try {
      const parsed = accessClaimsSchema.safeParse(await this.jwt.verifyAsync(token));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  createRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /** Keyed hash: a leaked refresh_sessions table cannot be replayed without the server-side pepper. */
  hashRefreshToken(token: string): string {
    return createHmac('sha256', env.REFRESH_TOKEN_PEPPER).update(token).digest('hex');
  }

  refreshExpiry(from = new Date()): Date {
    return new Date(from.getTime() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  }
}
