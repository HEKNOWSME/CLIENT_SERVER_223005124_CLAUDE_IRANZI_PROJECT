import { Injectable, Logger } from '@nestjs/common';
import type { AuditOutcome } from '../generated/prisma/client';
import type { ClientContext } from '../common/request-context';
import { PrismaService } from '../prisma.service';

export interface AuditEntry {
  action: string;
  outcome: AuditOutcome;
  context: ClientContext;
  actorUserId?: string | null;
  resourceType?: string;
  resourceId?: string | null;
  reasonCode?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Appends to access_logs. A failed audit write is logged but never breaks the caller's request. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.accessLog.create({
        data: {
          action: entry.action,
          outcome: entry.outcome,
          actorUserId: entry.actorUserId ?? null,
          resourceType: entry.resourceType ?? 'USER',
          resourceId: entry.resourceId ?? entry.actorUserId ?? null,
          reasonCode: entry.reasonCode ?? null,
          requestId: entry.context.requestId,
          ipAddress: entry.context.ipAddress,
          userAgent: entry.context.userAgent,
        },
      });
    } catch (error) {
      this.logger.error(`Audit write failed for ${entry.action} [${entry.context.requestId}]`, error instanceof Error ? error.stack : undefined);
    }
  }
}
