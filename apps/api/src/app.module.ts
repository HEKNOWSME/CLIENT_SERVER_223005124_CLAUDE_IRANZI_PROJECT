import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard, RolesGuard } from './auth/guards';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma.module';
import { AdminController } from './workspace/admin.controller';
import { ClinicalController } from './workspace/clinical.controller';
import { NotificationsController } from './workspace/notifications.controller';
import { PdfStorageService } from './workspace/pdf-storage.service';
import { RealtimeController } from './workspace/realtime.controller';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }] }),
    AuthModule,
  ],
  controllers: [HealthController, AdminController, ClinicalController, NotificationsController, RealtimeController],
  // Guards run in order: rate limit, then authentication (secure by default), then role checks.
  providers: [
    PdfStorageService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
  ],
})
export class AppModule {}
