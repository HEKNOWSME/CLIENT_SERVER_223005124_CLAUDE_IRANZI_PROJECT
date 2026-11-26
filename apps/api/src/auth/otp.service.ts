import { HttpStatus, Injectable } from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { AppException } from '../common/app.exception';
import { env } from '../config';
import type { EmailOtpPurpose, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Creates a fresh OTP for the user, invalidates any previous unused codes, and emails it. */
  async issue(userId: string, email: string, purpose: EmailOtpPurpose): Promise<void> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const issued = await this.prisma.$transaction(async tx => {
      await this.lockAccount(tx, userId);
      const now = new Date();
      const latest = await tx.emailOtp.findFirst({
        where: { userId, purpose, ...(purpose === 'REGISTER_PATIENT' ? { consumedAt: null } : {}) },
        orderBy: { lastSentAt: 'desc' },
        select: { lastSentAt: true },
      });
      if (latest) {
        const waitMs = env.OTP_RESEND_COOLDOWN_SECONDS * 1000 - (now.getTime() - latest.lastSentAt.getTime());
        if (waitMs > 0) {
          throw new AppException(
            HttpStatus.TOO_MANY_REQUESTS,
            'RATE_LIMITED',
            'Please wait before requesting another code.',
            undefined,
            Math.ceil(waitMs / 1000),
          );
        }
      }
      await tx.emailOtp.updateMany({
        where: { userId, purpose, consumedAt: null },
        data: { consumedAt: now },
      });
      return tx.emailOtp.create({
        data: {
          userId,
          purpose,
          codeHash: this.hash(userId, purpose, code),
          expiresAt: new Date(now.getTime() + env.OTP_TTL_MINUTES * 60_000),
          lastSentAt: now,
        },
        select: { id: true },
      });
    });
    try {
      await this.mail.sendOtp(email, purpose, code, env.OTP_TTL_MINUTES);
    } catch (error) {
      await this.prisma.emailOtp.updateMany({ where: { id: issued.id, consumedAt: null }, data: { consumedAt: new Date() } });
      throw error;
    }
  }

  /** Consume within the same transaction as the account change. Commit failed attempts too. */
  async consume(tx: Prisma.TransactionClient, userId: string, purpose: EmailOtpPurpose, code: string): Promise<boolean> {
    await this.lockAccount(tx, userId);
    const now = new Date();
    const otp = await tx.emailOtp.findFirst({
      where: { userId, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt <= now || otp.attemptCount >= env.OTP_MAX_ATTEMPTS) return false;

    const matches = this.safeEqual(otp.codeHash, this.hash(userId, purpose, code));
    await tx.emailOtp.update({
      where: { id: otp.id },
      data: matches ? { consumedAt: now } : { attemptCount: { increment: 1 } },
    });
    return matches;
  }

  private async lockAccount(tx: Prisma.TransactionClient, userId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
  }

  private hash(userId: string, purpose: EmailOtpPurpose, code: string): string {
    // Preserve verification codes issued before the password reset migration.
    const input = purpose === 'REGISTER_PATIENT' ? `otp:v1:${code}` : `otp:v2:${purpose}:${userId}:${code}`;
    return createHmac('sha256', env.REFRESH_TOKEN_PEPPER).update(input).digest('hex');
  }

  private safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
