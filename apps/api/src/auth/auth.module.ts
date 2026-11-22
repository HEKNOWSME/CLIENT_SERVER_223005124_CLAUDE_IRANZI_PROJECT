import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { env } from '../config';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CsrfGuard, JwtAuthGuard, RolesGuard } from './guards';
import { OtpService } from './otp.service';
import { PasswordService } from './password.service';
import { JWT_AUDIENCE, JWT_ISSUER, TokenService } from './token.service';

@Module({
  imports: [
    MailModule,
    JwtModule.register({
      secret: env.JWT_ACCESS_SECRET,
      signOptions: { algorithm: 'HS256', expiresIn: env.JWT_ACCESS_TTL_SECONDS, issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      // Pinning the algorithm rejects `alg: none` and algorithm-confusion tokens.
      verifyOptions: { algorithms: ['HS256'], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService, OtpService, JwtAuthGuard, RolesGuard, CsrfGuard],
  exports: [TokenService, JwtAuthGuard, RolesGuard, PasswordService],
})
export class AuthModule {}
