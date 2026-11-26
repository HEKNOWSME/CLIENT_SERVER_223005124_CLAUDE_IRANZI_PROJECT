import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCookieAuth, ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  authSessionSchema, authUserSchema, forgotPasswordRequestSchema, loginRequestSchema, registerDoctorRequestSchema, registerPatientRequestSchema,
  registrationPendingSchema, resendOtpRequestSchema, resetPasswordRequestSchema, verifyEmailRequestSchema,
  type AuthSession, type AuthUser, type ForgotPasswordRequest, type LoginRequest, type RegisterDoctorRequest, type RegisterPatientRequest,
  type RegistrationPending, type ResendOtpRequest, type ResetPasswordRequest, type VerifyEmailRequest,
} from '@pmrms/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { AllowPendingAccount, CurrentUser, Public } from '../common/decorators';
import { clientContext, type AuthenticatedUser } from '../common/request-context';
import { openApiData, openApiSchema, ZodValidationPipe } from '../common/zod-validation.pipe';
import { env, isProduction } from '../config';
import { AuthService, type IssuedSession } from './auth.service';
import { CSRF_HEADER, CsrfGuard } from './guards';

// The __Host- prefix makes browsers refuse the cookie unless it is Secure, host-only and Path=/.
export const REFRESH_COOKIE = isProduction ? '__Host-pmrms_refresh' : 'pmrms_refresh';

const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'strict',
  path: '/',
};

const AUTH_RATE = { default: { limit: 10, ttl: 60_000 } };
const csrfHeader = { name: CSRF_HEADER, required: true, description: 'Must be "1". Protects cookie-authenticated calls from CSRF.' };

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register/patient')
  @ApiOperation({ summary: 'Create a PATIENT account and email a one-time verification code. No session until verified.' })
  @ApiBody({ schema: openApiSchema(registerPatientRequestSchema) })
  @ApiResponse({ status: 201, schema: openApiData(registrationPendingSchema) })
  @ApiResponse({ status: 409, description: 'ACCOUNT_EXISTS' })
  async registerPatient(
    @Body(new ZodValidationPipe(registerPatientRequestSchema)) body: RegisterPatientRequest,
    @Req() req: Request,
  ): Promise<{ data: RegistrationPending }> {
    return { data: await this.auth.registerPatient(body, clientContext(req)) };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm the registration OTP and start a session' })
  @ApiBody({ schema: openApiSchema(verifyEmailRequestSchema) })
  @ApiResponse({ status: 200, schema: openApiData(authSessionSchema), description: 'Sets the HttpOnly refresh cookie.' })
  @ApiResponse({ status: 400, description: 'OTP_INVALID' })
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailRequestSchema)) body: VerifyEmailRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: AuthSession }> {
    return this.respond(res, await this.auth.verifyEmail(body, clientContext(req)));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend the patient registration OTP (rate limited)' })
  @ApiBody({ schema: openApiSchema(resendOtpRequestSchema) })
  @ApiResponse({ status: 200, schema: openApiData(registrationPendingSchema) })
  async resendOtp(
    @Body(new ZodValidationPipe(resendOtpRequestSchema)) body: ResendOtpRequest,
    @Req() req: Request,
  ): Promise<{ data: RegistrationPending }> {
    return { data: await this.auth.resendRegistrationOtp(body, clientContext(req)) };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Request a password reset code. Returns the same response for any valid email.' })
  @ApiBody({ schema: openApiSchema(forgotPasswordRequestSchema) })
  @ApiResponse({ status: 204 })
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema)) body: ForgotPasswordRequest,
    @Req() req: Request,
  ): void {
    this.auth.forgotPassword(body, clientContext(req));
  }

  @Public()
  @Throttle(AUTH_RATE)
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set a new password using an emailed code and revoke the account’s sessions' })
  @ApiBody({ schema: openApiSchema(resetPasswordRequestSchema) })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 400, description: 'OTP_INVALID' })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.resetPassword(body, clientContext(req));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register/doctor-request')
  @ApiOperation({ summary: 'Apply as a doctor. The account stays PENDING with no clinical access until an admin approves it' })
  @ApiBody({ schema: openApiSchema(registerDoctorRequestSchema) })
  @ApiResponse({ status: 201, schema: openApiData(authSessionSchema) })
  @ApiResponse({ status: 409, description: 'ACCOUNT_EXISTS' })
  async registerDoctorRequest(
    @Body(new ZodValidationPipe(registerDoctorRequestSchema)) body: RegisterDoctorRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: AuthSession }> {
    return this.respond(res, await this.auth.registerDoctorRequest(body, clientContext(req)));
  }

  @Public()
  @Throttle(AUTH_RATE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange email and password for an access JWT and a refresh cookie' })
  @ApiBody({ schema: openApiSchema(loginRequestSchema) })
  @ApiResponse({ status: 200, schema: openApiData(authSessionSchema) })
  @ApiResponse({ status: 401, description: 'INVALID_CREDENTIALS (same response for unknown email and wrong password)' })
  @ApiResponse({ status: 403, description: 'ACCOUNT_SUSPENDED or EMAIL_NOT_VERIFIED' })
  @ApiResponse({ status: 429, description: 'RATE_LIMITED, including temporary lockout after repeated failures' })
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ data: AuthSession }> {
    return this.respond(res, await this.auth.login(body, clientContext(req)));
  }

  @Public()
  @UseGuards(CsrfGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiHeader(csrfHeader)
  @ApiOperation({ summary: 'Rotate the refresh cookie and return a new access JWT' })
  @ApiResponse({ status: 200, schema: openApiData(authSessionSchema) })
  @ApiResponse({ status: 401, description: 'SESSION_EXPIRED. Reusing a rotated token also revokes every session in its family' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ data: AuthSession }> {
    try {
      return this.respond(res, await this.auth.refresh(this.readRefreshCookie(req), clientContext(req)));
    } catch (error) {
      res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
      throw error;
    }
  }

  @Public()
  @UseGuards(CsrfGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiHeader(csrfHeader)
  @ApiOperation({ summary: 'Revoke the current session family and clear the refresh cookie' })
  @ApiResponse({ status: 204 })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(this.readRefreshCookie(req), clientContext(req));
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
  }

  @AllowPendingAccount()
  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke every session of the signed-in user on all devices' })
  @ApiResponse({ status: 204 })
  async logoutAll(@CurrentUser() user: AuthenticatedUser, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logoutAll(user.id, clientContext(req));
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
  }

  @AllowPendingAccount()
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current account summary, read from the database on every call' })
  @ApiResponse({ status: 200, schema: openApiData(authUserSchema) })
  @ApiResponse({ status: 401, description: 'UNAUTHORIZED' })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<{ data: AuthUser }> {
    return { data: await this.auth.me(user.id) };
  }

  private respond(res: Response, issued: IssuedSession): { data: AuthSession } {
    res.cookie(REFRESH_COOKIE, issued.refreshToken, { ...refreshCookieOptions, maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000 });
    res.setHeader('Cache-Control', 'no-store');
    return { data: issued.session };
  }

  private readRefreshCookie(req: Request): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length > 0 && value.length <= 128 ? value : undefined;
  }
}
