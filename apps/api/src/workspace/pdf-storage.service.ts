import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { AppException } from '../common/app.exception';
import { env } from '../config';
import type { Prisma } from '../generated/prisma/client';

export const maxPdfBytes = 10 * 1024 * 1024;
const prefix = 'pmrms/reports/';
const unavailable = () => new AppException(503, 'PDF_STORAGE_UNAVAILABLE', 'PDF storage is temporarily unavailable.');

@Injectable()
export class PdfStorageService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfStorageService.name);
  private readonly r2 = env.PDF_STORAGE === 'r2' ? new S3Client({
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    region: 'auto',
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
  }) : null;

  onModuleDestroy() { this.r2?.destroy(); }

  get readable(): Prisma.MedicalFileWhereInput {
    const local = { localContent: { not: null } };
    return this.r2 ? { OR: [local, { objectKey: { startsWith: prefix } }] } : local;
  }

  async stage(buffer: Buffer) {
    const checksumSha256 = createHash('sha256').update(buffer).digest('hex');
    const sizeBytes = BigInt(buffer.length);
    if (!this.r2) {
      return { objectKey: `local/${randomUUID()}.pdf`, localContent: new Uint8Array(buffer), checksumSha256, sizeBytes };
    }
    const objectKey = `${prefix}${randomUUID()}.pdf`;
    try {
      await this.r2.send(new PutObjectCommand({
        Bucket: env.R2_BUCKET, Key: objectKey, Body: buffer, ContentLength: buffer.length,
        ContentType: 'application/pdf', CacheControl: 'private, no-store',
      }), { abortSignal: AbortSignal.timeout(15000) });
    } catch {
      await this.discard(objectKey);
      throw unavailable();
    }
    return { objectKey, localContent: null, checksumSha256, sizeBytes };
  }

  async discard(objectKey: string) {
    if (!this.r2 || !objectKey.startsWith(prefix)) return;
    try {
      await this.r2.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: objectKey }), {
        abortSignal: AbortSignal.timeout(5000),
      });
    } catch {
      this.flagForReconciliation(objectKey);
    }
  }

  flagForReconciliation(objectKey: string) {
    if (objectKey.startsWith(prefix)) this.logger.warn(`Reconcile PDF object against metadata before cleanup: ${objectKey}`);
  }

  async read(file: { objectKey: string; localContent: Uint8Array | null; sizeBytes: bigint; checksumSha256: string | null }) {
    if (file.localContent) return file.localContent;
    if (!this.r2 || !file.objectKey.startsWith(prefix)) throw unavailable();
    try {
      const result = await this.r2.send(new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: file.objectKey }), {
        abortSignal: AbortSignal.timeout(15000),
      });
      const expected = Number(file.sizeBytes);
      if (!result.Body || expected > maxPdfBytes || result.ContentLength !== expected) {
        if (result.Body) result.Body.transformToWebStream().cancel().catch(() => undefined);
        throw unavailable();
      }
      const buffer = await result.Body.transformToByteArray();
      if (buffer.length !== expected || createHash('sha256').update(buffer).digest('hex') !== file.checksumSha256) throw unavailable();
      return buffer;
    } catch {
      this.logger.warn('A private R2 PDF could not be read or verified.');
      throw unavailable();
    }
  }
}
