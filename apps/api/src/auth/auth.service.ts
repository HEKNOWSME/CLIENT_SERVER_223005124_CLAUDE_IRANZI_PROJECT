import { HttpStatus, Injectable } from '@nestjs/common';
import type { AuthSession, AuthUser, LoginRequest, RegisterDoctorRequest, RegisterPatientRequest } from '@pmrms/contracts';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AppException, unauthorized } from '../common/app.exception';
import type { ClientContext } from '../common/request-context';
import { env } from '../config';
import { Prisma, SessionRevocationReason } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
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
const isUniqueViolation = (error: unknown) => (error as { code?: string })?.code === 'P2002';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  /** Public registration can only ever create an ACTIVE patient; the role is never read from the client. */
  async registerPatient(input: RegisterPatientRequest, context: ClientContext): Promise<IssuedSession> {
    const passwordHash = await this.passwords.hash(input.password);
    let user: UserWithProfiles;
    try {
      user = await this.prisma.user.create({
        data: {
          name: input.fullName,
          email: input.email,
          passwordHash,
          role: 'PATIENT',
          status: 'ACTIVE',
          patient: { create: { fullName: input.fullName, birthDate: new Date(`${input.birthDate}T00:00:00.000Z`), phone: input.phone } },
        },
        include: userWithProfiles,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw accountExists();
      throw error;
    }
    await this.audit.record({ action: 'AUTH_REGISTER_PATIENT', outcome: 'SUCCESS', actorUserId: user.id, context });
    return this.startSession(user, context);
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

    await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now } });
    await this.audit.record({ action: 'AUTH_LOGIN', outcome: 'SUCCESS', actorUserId: user.id, context });
    return this.startSession(user, context);
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

    const successorId = randomUUID();
    const successorToken = this.tokens.createRefreshToken();
    const rotated = await this.prisma.$transaction(async tx => {
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

  private async startSession(user: UserWithProfiles, context: ClientContext): Promise<IssuedSession> {
    const familyId = randomUUID();
    const refreshToken = this.tokens.createRefreshToken();
    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: this.tokens.hashRefreshToken(refreshToken),
        expiresAt: this.tokens.refreshExpiry(),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
    const accessToken = await this.tokens.signAccessToken(user.id, user.role, familyId);
    return { session: this.toSession(user, accessToken), refreshToken };
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
      patientId: user.patient?.id ?? null,
      doctorId: user.doctor?.id ?? null,
      doctorVerification: user.doctor?.verificationStatus ?? null,
    };
  }
}
