import { Controller, Get, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { sign, type KeyObject } from 'node:crypto';
import { AllowPendingAccount, CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/request-context';
import { env } from '../config';

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const leaseSeconds = 120;

export function issueRealtimeSession(userId: string, url: string, publishableKey: string,
  signing: { kid: string; key: KeyObject }, now = Math.floor(Date.now() / 1000)) {
  const exp = now + leaseSeconds;
  const header = encode({ alg: 'ES256', kid: signing.kid, typ: 'JWT' });
  const payload = encode({
    sub: userId, role: 'authenticated', aud: 'authenticated', iss: `${url}/auth/v1`,
    iat: now, exp, pmrms_realtime: true,
  });
  const unsigned = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(unsigned), { key: signing.key, dsaEncoding: 'ieee-p1363' });
  return {
    url, publishableKey, topic: `pmrms:user:${userId}`,
    token: `${unsigned}.${signature.toString('base64url')}`, expiresAt: exp * 1000,
  };
}

@ApiTags('Realtime')
@ApiBearerAuth()
@AllowPendingAccount()
@Controller('realtime')
export class RealtimeController {
  @Get('session')
  @Header('Cache-Control', 'no-store')
  session(@CurrentUser() user: AuthenticatedUser) {
    return { data: env.REALTIME_PROVIDER === 'supabase'
      ? issueRealtimeSession(user.id, env.SUPABASE_URL!, env.SUPABASE_PUBLISHABLE_KEY!, env.SUPABASE_REALTIME_SIGNING_JWK!)
      : null };
  }
}
