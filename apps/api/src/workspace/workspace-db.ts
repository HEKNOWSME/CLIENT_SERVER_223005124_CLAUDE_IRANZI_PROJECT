import { AppException } from '../common/app.exception';
import { clientContext } from '../common/request-context';
import type { Request } from 'express';
import type { Prisma } from '../generated/prisma/client';
import type { PrismaService } from '../prisma.service';

export const personSelect = { id: true, fullName: true } as const;
export type Paging = { page: number; limit: number };
export const pageArgs = ({ page, limit }: Paging) => ({ skip: (page - 1) * limit, take: limit + 1 });
export const paged = <T>(items: T[], query: Paging) => ({
  items: items.slice(0, query.limit), page: query.page, limit: query.limit, hasMore: items.length > query.limit,
});

export function databaseCode(error: unknown): string | undefined {
  return (error as { code?: string } | null)?.code;
}

export async function serialWrite<T>(prisma: PrismaService, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(work, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (databaseCode(error) !== 'P2034') throw error;
    }
  }
  throw new AppException(409, 'WRITE_CONFLICT', 'Another change is in progress. Please retry.');
}

export function writeAudit(db: Prisma.TransactionClient, req: Request, action: string, resourceType: string,
  resourceId: string | null, outcome: 'SUCCESS' | 'DENIED' | 'ERROR' = 'SUCCESS', reasonCode?: string) {
  return db.accessLog.create({
    data: { ...clientContext(req), actorUserId: req.user!.id, action, resourceType, resourceId, outcome, reasonCode },
  });
}
