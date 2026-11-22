import { HttpStatus, Injectable } from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { AppException } from '../common/app.exception';
import { env } from '../config';
import type { EmailOtpPurpose } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Creates a fresh OTP for the user, invalidates any previous unused codes, and emails it. */
  async issue(userId: string, email: string, purpose: EmailOtpPurpose): Promise<{ expiresIn: number; debugCode?: string }> {
    const now = new Date();
    const latest = await this.prisma.emailOtp.findFirst({
      where: { userId, purpose, consumedAt: null },
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

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(now.getTime() + env.OTP_TTL_MINUTES * 60_000);

    await this.prisma.$transaction([
      this.prisma.emailOtp.updateMany({
        where: { userId, purpose, consumedAt: null },
        data: { consumedAt: now },
      }),
      this.prisma.emailOtp.create({
        data: {
          userId,
          purpose,
          codeHash: this.hash(code),
          expiresAt,
          lastSentAt: now,
        },
      }),
    ]);

    await this.mail.sendRegistrationOtp(email, code, env.OTP_TTL_MINUTES);

    return {
      expiresIn: env.OTP_TTL_MINUTES * 60,
      ...(env.NODE_ENV !== 'production' ? { debugCode: code } : {}),
    };
  }

  /** Verifies the latest unused OTP. Wrong codes count toward the attempt limit. */
  async consume(userId: string, purpose: EmailOtpPurpose, code: string): Promise<void> {
    const now = new Date();
    const otp = await this.prisma.emailOtp.findFirst({
      where: { userId, purpose, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp || otp.expiresAt <= now) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'OTP_INVALID', 'That code is invalid or has expired. Request a new one.');
    }
    if (otp.attemptCount >= env.OTP_MAX_ATTEMPTS) {
      await this.prisma.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: now } });
      throw new AppException(HttpStatus.BAD_REQUEST, 'OTP_INVALID', 'Too many incorrect attempts. Request a new code.');
    }

    const matches = this.safeEqual(otp.codeHash, this.hash(code));
    if (!matches) {
      await this.prisma.emailOtp.update({ where: { id: otp.id }, data: { attemptCount: { increment: 1 } } });
      throw new AppException(HttpStatus.BAD_REQUEST, 'OTP_INVALID', 'That code is incorrect. Please try again.');
    }

    await this.prisma.emailOtp.update({ where: { id: otp.id }, data: { consumedAt: now } });
  }

  private hash(code: string): string {
    return createHmac('sha256', env.REFRESH_TOKEN_PEPPER).update(`otp:v1:${code}`).digest('hex');
  }

  private safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
