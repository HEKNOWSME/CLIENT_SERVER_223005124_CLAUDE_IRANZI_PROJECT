import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { AppException } from '../common/app.exception';
import { env, isProduction } from '../config';
import type { EmailOtpPurpose } from '../generated/prisma/client';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend = env.OTP_DELIVERY === 'resend' ? new Resend(env.RESEND_API_KEY) : null;

  async sendOtp(to: string, purpose: EmailOtpPurpose, code: string, expiresInMinutes: number): Promise<void> {
    if (!this.resend) {
      this.logger.log(`Local OTP ${purpose} ${to}: ${code}`);
      return;
    }
    const reset = purpose === 'RESET_PASSWORD';
    const subject = reset ? 'Your PMRMS password reset code' : 'Your PMRMS verification code';
    const title = reset ? 'Reset your PMRMS password' : 'Confirm your PMRMS account';
    const instruction = reset ? 'Use this one-time code to reset your password.' : 'Use this one-time code to finish creating your patient account.';
    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#152f36;max-width:480px;margin:0 auto;padding:24px">
        <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
        <p style="margin:0 0 16px">${instruction} It expires in ${expiresInMinutes} minutes.</p>
        <p style="font-size:32px;letter-spacing:0.35em;font-weight:700;margin:24px 0;text-align:center">${code}</p>
        <p style="margin:0;color:#536970;font-size:14px">If you did not request this, you can ignore the email.</p>
      </div>
    `;

    const { error } = await this.resend.emails.send({
      from: env.RESEND_FROM_EMAIL!,
      to: [to],
      subject,
      html,
      text: `${instruction} Your code is ${code}. It expires in ${expiresInMinutes} minutes. If you did not request this, you can ignore the email.`,
    });

    if (error) {
      this.logger.error(`Resend failed for ${purpose}: ${error.name}`);
      throw new AppException(HttpStatus.BAD_GATEWAY, 'EMAIL_DELIVERY_FAILED', 'We could not send the email. Please try again shortly.');
    }

    if (!isProduction) this.logger.log(`OTP emailed for ${purpose}`);
  }
}
