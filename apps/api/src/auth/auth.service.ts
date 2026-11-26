import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type {
  AuthSession, AuthUser, ForgotPasswordRequest, LoginRequest, RegisterDoctorRequest, RegisterPatientRequest,
  RegistrationPending, ResendOtpRequest, ResetPasswordRequest, VerifyEmailRequest,
} from '@pmrms/contracts';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AppException, unauthorized } from '../common/app.exception';
import type { ClientContext } from '../common/request-context';
import { env } from '../config';
import { Prisma, SessionRevocationReason } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

const userWithProfiles = {
  patient: { select: { id: true } },
  doctor: { select: { id: true, verificationStatus: true } },
} satisfies Prisma.UserInclude;
type UserWithProfiles = Prisma.UserGetPayload<{ include: typeof userWithProfiles }>;

export interface IssuedSession { session: AuthSession; refreshToken: string }

const invalidCredentials = () => new AppException(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
const sessionExpired = () => new AppException(HttpStatus.UNAUTHORIZED, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
const accountExists = () => new AppException(HttpStatus.CONFLICT, 'ACCOUNT_EXISTS', 'An account with these details already exists.');
const invalidOtp = () => new AppException(HttpStatus.BAD_REQUEST, 'OTP_INVALID', 'That code is invalid or has expired. Request a new one.');
const isUniqueViolation = (error: unknown) => (error as { code?: string })?.code === 'P2002';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly otps: OtpService,
  ) {}

  /**
   * Creates (or refreshes) an unverified patient account and emails a 6-digit OTP.
   * No session is issued until `verifyEmail` succeeds.
   */
  async registerPatient(input: RegisterPatientRequest, context: ClientContext): Promise<RegistrationPending> {
    const passwordHash = await this.passwords.hash(input.password);
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      include: { patient: true },
    });

    let userId: string;
    if (existing) {
      if (existing.role !== 'PATIENT' || existing.emailVerifiedAt || !existing.patient) throw accountExists();
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          name: input.fullName,
          passwordHash,
          passwordChangedAt: new Date(),
          patient: { update: { fullName: input.fullName, birthDate: new Date(`${input.birthDate}T00:00:00.000Z`), phone: input.phone ?? null } },
        },
      });
      userId = existing.id;
    } else {
      try {
        const created = await this.prisma.user.create({
          data: {
            name: input.fullName,
            email: input.email,
            passwordHash,
            role: 'PATIENT',
            status: 'ACTIVE',
            emailVerifiedAt: null,
            patient: { create: { fullName: input.fullName, birthDate: new Date(`${input.birthDate}T00:00:00.000Z`), phone: input.phone } },
          },
          select: { id: true },
        });
        userId = created.id;
      } catch (error) {
        if (isUniqueViolation(error)) throw accountExists();
        throw error;
      }
    }

    await this.otps.issue(userId, input.email, 'REGISTER_PATIENT');
    await this.audit.record({ action: 'AUTH_REGISTER_PATIENT', outcome: 'SUCCESS', actorUserId: userId, reasonCode: 'OTP_SENT', context });
    return { status: 'PENDING_EMAIL_VERIFICATION', email: input.email, expiresIn: env.OTP_TTL_MINUTES * 60 };
  }

  async verifyEmail(input: VerifyEmailRequest, context: ClientContext): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email }, include: userWithProfiles });
    // Same generic response whether the email is unknown or already verified, to limit enumeration.
    if (!user || user.role !== 'PATIENT' || user.emailVerifiedAt) {
      throw invalidOtp();
    }
    if (user.status === 'SUSPENDED') {
      throw new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_SUSPENDED', 'This account is suspended. Contact an administrator.');
    }

    const verified = await this.prisma.$transaction(async tx => {
      if (!await this.otps.consume(tx, user.id, 'REGISTER_PATIENT', input.code)) return null;
      const updated = await tx.user.updateMany({
        where: { id: user.id, emailVerifiedAt: null, status: 'ACTIVE' },
        data: { emailVerifiedAt: new Date() },
      });
      return updated.count === 1 ? tx.user.findUnique({ where: { id: user.id }, include: userWithProfiles }) : null;
    });
    if (!verified) throw invalidOtp();
    await this.audit.record({ action: 'AUTH_VERIFY_EMAIL', outcome: 'SUCCESS', actorUserId: user.id, context });
    return this.startSession(verified, context);
  }

  async resendRegistrationOtp(input: ResendOtpRequest, context: ClientContext): Promise<RegistrationPending> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email }, select: { id: true, role: true, emailVerifiedAt: true, status: true } });
    // Always look like success timing-wise when the account is not awaiting verification.
    if (!user || user.role !== 'PATIENT' || user.emailVerifiedAt || user.status === 'SUSPENDED') {
      return { status: 'PENDING_EMAIL_VERIFICATION', email: input.email, expiresIn: env.OTP_TTL_MINUTES * 60 };
    }
    await this.otps.issue(user.id, input.email, 'REGISTER_PATIENT');
    await this.audit.record({ action: 'AUTH_RESEND_OTP', outcome: 'SUCCESS', actorUserId: user.id, context });
    return { status: 'PENDING_EMAIL_VERIFICATION', email: input.email, expiresIn: env.OTP_TTL_MINUTES * 60 };
  }

  forgotPassword(input: ForgotPasswordRequest, context: ClientContext): void {
    // Never make the public response wait on account lookup, cooldown, or the email provider.
    setImmediate(() => {
      void this.sendPasswordResetCode(input.email, context).catch(() => {
        this.logger.error(`Password reset request failed (request ${context.requestId})`);
      });
    });
  }

  private async sendPasswordResetCode(email: string, context: ClientContext): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email, emailVerifiedAt: { not: null }, status: { not: 'SUSPENDED' } },
      select: { id: true },
    });
    if (!user) return;
    try {
      await this.otps.issue(user.id, email, 'RESET_PASSWORD');
    } catch (error) {
      if (error instanceof AppException && ['RATE_LIMITED', 'EMAIL_DELIVERY_FAILED'].includes(error.code)) return;
      throw error;
    }
    await this.audit.record({ action: 'AUTH_PASSWORD_RESET_REQUEST', outcome: 'SUCCESS', actorUserId: user.id, context });
  }

  async resetPassword(input: ResetPasswordRequest, context: ClientContext): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email, emailVerifiedAt: { not: null }, status: { not: 'SUSPENDED' } },
      select: { id: true },
    });
    if (!user) throw invalidOtp();

    const changed = await this.prisma.$transaction(async tx => {
      if (!await this.otps.consume(tx, user.id, 'RESET_PASSWORD', input.code)) return false;
      const passwordHash = await this.passwords.hash(input.password);
      const now = new Date();
      const updated = await tx.user.updateMany({
        where: { id: user.id, email: input.email, emailVerifiedAt: { not: null }, status: { not: 'SUSPENDED' } },
        data: { passwordHash, passwordChangedAt: now, failedLoginAttempts: 0, lockedUntil: null },
      });
      if (updated.count !== 1) return false;
      await tx.refreshSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'PASSWORD_CHANGED' },
      });
      return true;
    });
    if (!changed) throw invalidOtp();
    await this.audit.record({ action: 'AUTH_PASSWORD_RESET', outcome: 'SUCCESS', actorUserId: user.id, context });
  }

  /** Doctor applicants get a PENDING account: they can sign in, but have no clinical access until approved. */
  async registerDoctorRequest(input: RegisterDoctorRequest, context: ClientContext): Promise<IssuedSession> {
    const passwordHash = await this.passwords.hash(input.password);
    let user: UserWithProfiles;
    try {
      user = await this.prisma.user.create({
        data: {
          name: input.fullName,
          email: input.email,
          passwordHash,
          role: 'DOCTOR',
          status: 'PENDING',
          emailVerifiedAt: new Date(),
          doctor: { create: { fullName: input.fullName, specialty: input.specialty, licenseNumber: input.licenseNumber } },
        },
        include: userWithProfiles,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw accountExists();
      throw error;
    }
    await this.audit.record({ action: 'AUTH_REGISTER_DOCTOR_REQUEST', outcome: 'SUCCESS', actorUserId: user.id, context });
    return this.startSession(user, context);
  }

  async login(input: LoginRequest, context: ClientContext): Promise<IssuedSession> {
    const now = new Date();
    const user = await this.prisma.user.findUnique({ where: { email: input.email }, include: userWithProfiles });

    if (user?.lockedUntil && user.lockedUntil > now) {
      await this.audit.record({ action: 'AUTH_LOGIN', outcome: 'DENIED', actorUserId: user.id, reasonCode: 'ACCOUNT_LOCKED', context });
      const retryAfterSeconds = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000);
      throw new AppException(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'Too many failed sign-in attempts. Please try again later.', undefined, retryAfterSeconds);
    }

    const valid = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.burnVerification(input.password);
    if (!user || !valid) {
      if (user) await this.recordFailedLogin(user.id);
      await this.audit.record({ action: 'AUTH_LOGIN', outcome: 'DENIED', actorUserId: user?.id ?? null, reasonCode: 'INVALID_CREDENTIALS', context });
      throw invalidCredentials();
    }

    // The password was correct, so revealing the account state does not enable enumeration.
    if (user.status === 'SUSPENDED') {
      await this.audit.record({ action: 'AUTH_LOGIN', outcome: 'DENIED', actorUserId: user.id, reasonCode: 'ACCOUNT_SUSPENDED', context });
      throw new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_SUSPENDED', 'This account is suspended. Contact an administrator.');
    }
    if (!user.emailVerifiedAt) {
      await this.audit.record({ action: 'AUTH_LOGIN', outcome: 'DENIED', actorUserId: user.id, reasonCode: 'EMAIL_NOT_VERIFIED', context });
      throw new AppException(HttpStatus.FORBIDDEN, 'EMAIL_NOT_VERIFIED', 'Confirm the code we emailed you before signing in.');
    }

    const issued = await this.startSession(user, context, now);
    await this.audit.record({ action: 'AUTH_LOGIN', outcome: 'SUCCESS', actorUserId: user.id, context });
    return issued;
  }

  /**
   * Single-use rotation. The old session is consumed with a conditional update, so two concurrent
   * refreshes with the same token can never both mint a successor. Presenting an already-rotated
   * token is treated as theft: the whole session family is revoked.
   */
  async refresh(refreshToken: string | undefined, context: ClientContext): Promise<IssuedSession> {
    if (!refreshToken) throw sessionExpired();
    const now = new Date();
    const current = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(refreshToken) },
      include: { user: { include: userWithProfiles } },
    });
    if (!current) throw sessionExpired();

    if (current.revokedAt) {
      if (current.revokedReason === 'ROTATED') await this.handleReuse(current.familyId, current.userId, context);
      throw sessionExpired();
    }
    if (current.expiresAt <= now) throw sessionExpired();
    if (current.user.status === 'SUSPENDED') {
      await this.revokeFamily(current.familyId, 'ACCOUNT_SUSPENDED');
      throw sessionExpired();
    }
    if (!current.user.emailVerifiedAt) {
      await this.revokeFamily(current.familyId, 'LOGOUT');
      throw sessionExpired();
    }

    const successorId = randomUUID();
    const successorToken = this.tokens.createRefreshToken();
    const rotated = await this.prisma.$transaction(async tx => {
      if (!await this.lockCurrentCredentials(tx, current.user)) throw sessionExpired();
      const consumed = await tx.refreshSession.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'ROTATED', replacedById: successorId, lastUsedAt: now },
      });
      if (consumed.count !== 1) return false;
      await tx.refreshSession.create({
        data: {
          id: successorId,
          userId: current.userId,
          familyId: current.familyId,
          tokenHash: this.tokens.hashRefreshToken(successorToken),
          expiresAt: this.tokens.refreshExpiry(now),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
      return true;
    });
    if (!rotated) {
      await this.handleReuse(current.familyId, current.userId, context);
      throw sessionExpired();
    }

    const accessToken = await this.tokens.signAccessToken(current.user.id, current.user.role, current.familyId);
    return { session: this.toSession(current.user, accessToken), refreshToken: successorToken };
  }

  /** Revokes the session family behind the presented cookie. Always succeeds so logout is idempotent. */
  async logout(refreshToken: string | undefined, context: ClientContext): Promise<void> {
    if (!refreshToken) return;
    const session = await this.prisma.refreshSession.findUnique({
      where: { tokenHash: this.tokens.hashRefreshToken(refreshToken) },
      select: { familyId: true, userId: true },
    });
    if (!session) return;
    await this.revokeFamily(session.familyId, 'LOGOUT');
    await this.audit.record({ action: 'AUTH_LOGOUT', outcome: 'SUCCESS', actorUserId: session.userId, context });
  }

  async logoutAll(userId: string, context: ClientContext): Promise<void> {
    const { count } = await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'LOGOUT_ALL' },
    });
    await this.audit.record({ action: 'AUTH_LOGOUT_ALL', outcome: 'SUCCESS', actorUserId: userId, reasonCode: `SESSIONS_REVOKED_${count}`, context });
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: userWithProfiles });
    if (!user) throw unauthorized();
    return this.toAuthUser(user);
  }

  private async startSession(user: UserWithProfiles, context: ClientContext, loginAt?: Date): Promise<IssuedSession> {
    const familyId = randomUUID();
    const refreshToken = this.tokens.createRefreshToken();
    await this.prisma.$transaction(async tx => {
      if (loginAt) {
        const updated = await tx.user.updateMany({
          where: { id: user.id, passwordHash: user.passwordHash, status: { not: 'SUSPENDED' } },
          data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: loginAt },
        });
        if (updated.count !== 1) throw invalidCredentials();
      } else if (!await this.lockCurrentCredentials(tx, user)) {
        throw sessionExpired();
      }
      await tx.refreshSession.create({
        data: {
          userId: user.id,
          familyId,
          tokenHash: this.tokens.hashRefreshToken(refreshToken),
          expiresAt: this.tokens.refreshExpiry(),
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        },
      });
    });
    const accessToken = await this.tokens.signAccessToken(user.id, user.role, familyId);
    return { session: this.toSession(user, accessToken), refreshToken };
  }

  // Lock the user before the session row so password reset can revoke every in-flight session.
  private async lockCurrentCredentials(tx: Prisma.TransactionClient, user: UserWithProfiles): Promise<boolean> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users
      WHERE id = ${user.id}::uuid AND password_hash = ${user.passwordHash} AND status <> 'SUSPENDED'
      FOR SHARE
    `;
    return rows.length === 1;
  }

  private async recordFailedLogin(userId: string): Promise<void> {
    const { failedLoginAttempts } = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
      select: { failedLoginAttempts: true },
    });
    if (failedLoginAttempts >= env.LOGIN_MAX_FAILED_ATTEMPTS) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + env.LOGIN_LOCKOUT_MINUTES * 60_000) },
      });
    }
  }

  private async handleReuse(familyId: string, userId: string, context: ClientContext): Promise<void> {
    await this.revokeFamily(familyId, 'REUSE_DETECTED');
    await this.audit.record({ action: 'AUTH_REFRESH', outcome: 'DENIED', actorUserId: userId, reasonCode: 'REFRESH_TOKEN_REUSE', context });
  }

  private revokeFamily(familyId: string, reason: SessionRevocationReason) {
    return this.prisma.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private toSession(user: UserWithProfiles, accessToken: string): AuthSession {
    return { accessToken, tokenType: 'Bearer', expiresIn: env.JWT_ACCESS_TTL_SECONDS, user: this.toAuthUser(user) };
  }

  private toAuthUser(user: UserWithProfiles): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      emailVerified: Boolean(user.emailVerifiedAt),
      patientId: user.patient?.id ?? null,
      doctorId: user.doctor?.id ?? null,
      doctorVerification: user.doctor?.verificationStatus ?? null,
    };
  }
}
