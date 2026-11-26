import { Controller, Get, Header, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { idSchema, pageQuery } from '@pmrms/contracts';
import type { z } from 'zod';
import { AppException } from '../common/app.exception';
import { AllowPendingAccount, CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma.service';
import { pageArgs, paged } from './workspace-db';

@ApiTags('Notifications')
@ApiBearerAuth()
@AllowPendingAccount()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async list(@CurrentUser() actor: AuthenticatedUser, @Query(new ZodValidationPipe(pageQuery)) query: z.output<typeof pageQuery>) {
    return { data: paged(await this.prisma.notification.findMany({
      where: { recipientUserId: actor.id },
      select: { id: true, title: true, kind: true, relatedResourceId: true, readAt: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...pageArgs(query),
    }), query) };
  }

  @Get('unread-count')
  @Header('Cache-Control', 'no-store')
  async unread(@CurrentUser() actor: AuthenticatedUser) {
    const count = await this.prisma.notification.count({ where: { recipientUserId: actor.id, readAt: null } });
    return { data: { count } };
  }

  @Post('read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() actor: AuthenticatedUser) {
    await this.prisma.notification.updateMany({
      where: { recipientUserId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
  }

  @Patch(':id/read')
  @HttpCode(204)
  async read(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ZodValidationPipe(idSchema)) id: string) {
    const where = { id, recipientUserId: actor.id };
    const updated = await this.prisma.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: new Date() } });
    if (!updated.count && !await this.prisma.notification.findFirst({ where, select: { id: true } })) {
      throw new AppException(404, 'NOTIFICATION_UNAVAILABLE', 'This notification is unavailable.');
    }
  }
}
