import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { AppException } from '../common/app.exception';
import { env, isProduction } from '../config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend = new Resend(env.RESEND_API_KEY);

  async sendRegistrationOtp(to: string, code: string, expiresInMinutes: number): Promise<void> {
    const subject = 'Your PMRMS verification code';
    const html = `
      <div style="font-family:Segoe UI,Arial,sans-serif;line-height:1.5;color:#152f36;max-width:480px;margin:0 auto;padding:24px">
        <h1 style="font-size:20px;margin:0 0 12px">Confirm your PMRMS account</h1>
        <p style="margin:0 0 16px">Use this one-time code to finish creating your patient account. It expires in ${expiresInMinutes} minutes.</p>
        <p style="font-size:32px;letter-spacing:0.35em;font-weight:700;margin:24px 0;text-align:center">${code}</p>
        <p style="margin:0;color:#536970;font-size:14px">If you did not request this, you can ignore the email.</p>
      </div>
    `;

    const { error } = await this.resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: [to],
      subject,
      html,
      text: `Your PMRMS verification code is ${code}. It expires in ${expiresInMinutes} minutes.`,
    });

    if (error) {
      this.logger.error(`Resend failed for ${to}: ${error.message}`);
      throw new AppException(HttpStatus.BAD_GATEWAY, 'EMAIL_DELIVERY_FAILED', 'We could not send the verification email. Please try again shortly.');
    }

    if (!isProduction) this.logger.log(`Registration OTP emailed to ${to}`);
  }
}
