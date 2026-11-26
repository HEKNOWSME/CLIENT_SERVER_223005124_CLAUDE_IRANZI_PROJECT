import { Body, Controller, Get, Header, Param, Patch, Post, Query, Req, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { createRecordSchema, idSchema, pageQuery, patientProfileSchema, recordQuery, updateRecordSchema, versionSchema } from '@pmrms/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import { AppException, forbidden } from '../common/app.exception';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthenticatedUser } from '../common/request-context';
import { openApiSchema, ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { pageArgs, paged, personSelect, serialWrite, writeAudit } from './workspace-db';
import { maxPdfBytes, PdfStorageService } from './pdf-storage.service';

const uuid = new ZodValidationPipe(idSchema);
const recordSelect = {
  id: true, patientId: true, doctorId: true, diagnosis: true, description: true, status: true, version: true,
  recordDate: true, patient: { select: personSelect }, doctor: { select: personSelect },
} satisfies Prisma.MedicalRecordSelect;
const approvedDoctor = (id: string): Prisma.DoctorWhereInput => ({
  userId: id, verificationStatus: 'APPROVED', user: { status: 'ACTIVE' },
});
const unavailable = () => new AppException(404, 'RECORD_UNAVAILABLE', 'This medical record is unavailable.');
const conflict = () => new AppException(409, 'RECORD_VERSION_CONFLICT', 'This record was updated by someone else. Refresh before editing.');
const date = (value: string) => new Date(value + 'T00:00:00.000Z');
const serialize = (record: Prisma.MedicalRecordGetPayload<{ select: typeof recordSelect }>) => ({
  ...record, recordDate: record.recordDate.toISOString().slice(0, 10),
});
const fileSelect = { id: true, originalName: true, sizeBytes: true } as const;
const serializeFile = (file: { id: string; originalName: string; sizeBytes: bigint }) => ({
  ...file, sizeBytes: Number(file.sizeBytes),
});
interface PdfUpload { buffer: Buffer; mimetype: string; originalname: string }
const patientSelect = { ...personSelect, birthDate: true, phone: true } as const;
const patientUnavailable = () => new AppException(404, 'PATIENT_UNAVAILABLE', 'This patient is unavailable.');
const serializePatient = (patient: Prisma.PatientGetPayload<{ select: typeof patientSelect }>) => ({
  ...patient, birthDate: patient.birthDate.toISOString().slice(0, 10),
});

@ApiTags('Clinical workspace')
@ApiBearerAuth()
@Roles('PATIENT', 'DOCTOR')
@Controller()
export class ClinicalController {
  constructor(private readonly prisma: PrismaService, private readonly pdfStorage: PdfStorageService) {}

  private withActor<T>(req: Request, work: (tx: Prisma.TransactionClient) => Promise<T>, write = false) {
    const run = async (tx: Prisma.TransactionClient) => {
      await tx.$queryRaw`SELECT set_config('pmrms.actor_id', ${req.user!.id}, true)`;
      return work(tx);
    };
    return write ? serialWrite(this.prisma, run) : this.prisma.$transaction(run);
  }

  private async scope(db: Prisma.TransactionClient, actor: AuthenticatedUser): Promise<Prisma.PatientWhereInput> {
    if (actor.role === 'PATIENT') return { userId: actor.id, user: { status: 'ACTIVE', emailVerifiedAt: { not: null } } };
    const doctor = await db.doctor.findFirst({ where: approvedDoctor(actor.id), select: { id: true } });
    if (!doctor) throw forbidden('Doctor approval is required.', 'DOCTOR_NOT_APPROVED');
    return {
      user: { status: 'ACTIVE', emailVerifiedAt: { not: null } },
      assignments: { some: { status: 'ACTIVE', doctorId: doctor.id, doctor: approvedDoctor(actor.id) } },
    };
  }

  @Get('patients')
  @Roles('DOCTOR')
  @Header('Cache-Control', 'no-store')
  async patients(@CurrentUser() actor: AuthenticatedUser, @Query(new ZodValidationPipe(pageQuery)) query: z.output<typeof pageQuery>) {
    return { data: paged(await this.prisma.patient.findMany({
      where: await this.scope(this.prisma, actor), select: personSelect,
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }], ...pageArgs(query),
    }), query) };
  }

  @Get('patients/me')
  @Roles('PATIENT')
  @Header('Cache-Control', 'no-store')
  async profile(@CurrentUser() actor: AuthenticatedUser) {
    const patient = await this.prisma.patient.findFirst({ where: await this.scope(this.prisma, actor), select: patientSelect });
    if (!patient) throw patientUnavailable();
    return { data: serializePatient(patient) };
  }

  @Patch('patients/me')
  @ApiBody({ schema: openApiSchema(patientProfileSchema) })
  @Roles('PATIENT')
  @Header('Cache-Control', 'no-store')
  async updateProfile(@Req() req: Request,
    @Body(new ZodValidationPipe(patientProfileSchema)) input: z.output<typeof patientProfileSchema>) {
    const patient = await serialWrite(this.prisma, async tx => {
      const updated = await tx.patient.updateMany({
        where: await this.scope(tx, req.user!),
        data: { ...input, birthDate: date(input.birthDate) },
      });
      if (!updated.count) throw patientUnavailable();
      await tx.user.update({ where: { id: req.user!.id }, data: { name: input.fullName } });
      const profile = await tx.patient.findUniqueOrThrow({ where: { userId: req.user!.id }, select: patientSelect });
      await writeAudit(tx, req, 'PATIENT_PROFILE_UPDATE', 'PATIENT', profile.id);
      return profile;
    });
    return { data: serializePatient(patient) };
  }

  @Get('patients/:id')
  @Header('Cache-Control', 'no-store')
  async patientDetail(@Req() req: Request, @Param('id', uuid) id: string) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, ...await this.scope(this.prisma, req.user!) }, select: patientSelect,
    });
    await writeAudit(this.prisma, req, 'PATIENT_READ', 'PATIENT', id, patient ? 'SUCCESS' : 'DENIED',
      patient ? undefined : 'PATIENT_UNAVAILABLE');
    if (!patient) throw patientUnavailable();
    return { data: serializePatient(patient) };
  }

  @Get('patients/:id/records')
  @Header('Cache-Control', 'no-store')
  async patientRecords(@Req() req: Request, @Param('id', uuid) id: string,
    @Query(new ZodValidationPipe(recordQuery)) query: z.output<typeof recordQuery>) {
    const patient = await this.prisma.patient.findFirst({
      where: { id, ...await this.scope(this.prisma, req.user!) }, select: { id: true },
    });
    if (!patient) {
      await writeAudit(this.prisma, req, 'RECORD_LIST', 'PATIENT', id, 'DENIED', 'PATIENT_UNAVAILABLE');
      throw patientUnavailable();
    }
    return this.list(req, { ...query, patientId: id });
  }

  @Get('records')
  @Header('Cache-Control', 'no-store')
  async list(@Req() req: Request, @Query(new ZodValidationPipe(recordQuery)) query: z.output<typeof recordQuery>) {
    const records = await this.withActor(req, async tx => tx.medicalRecord.findMany({
      where: {
        status: query.status, patient: await this.scope(tx, req.user!), patientId: query.patientId,
        diagnosis: query.diagnosis ? { contains: query.diagnosis, mode: 'insensitive' } : undefined,
        recordDate: { gte: query.from ? date(query.from) : undefined, lte: query.to ? date(query.to) : undefined },
      },
      select: recordSelect, orderBy: [{ recordDate: 'desc' }, { id: 'desc' }], ...pageArgs(query),
    }));
    await writeAudit(this.prisma, req, 'RECORD_LIST', 'RECORD', null);
    return { data: paged(records.map(serialize), query) };
  }

  @Get('records/:id')
  @Header('Cache-Control', 'no-store')
  async detail(@Req() req: Request, @Param('id', uuid) id: string) {
    const record = await this.withActor(req, async tx => tx.medicalRecord.findFirst({
      where: { id, patient: await this.scope(tx, req.user!) }, select: recordSelect,
    }));
    await writeAudit(this.prisma, req, 'RECORD_READ', 'RECORD', id, record ? 'SUCCESS' : 'DENIED',
      record ? undefined : 'RECORD_UNAVAILABLE');
    if (!record) throw unavailable();
    return { data: serialize(record) };
  }

  @Post('records')
  @ApiBody({ schema: openApiSchema(createRecordSchema) })
  @Roles('DOCTOR')
  @Header('Cache-Control', 'no-store')
  async create(@Req() req: Request, @Body(new ZodValidationPipe(createRecordSchema)) input: z.output<typeof createRecordSchema>) {
    const record = await this.withActor(req, async tx => {
      const doctor = await tx.doctor.findFirst({ where: approvedDoctor(req.user!.id), select: { id: true } });
      if (!doctor) throw forbidden('Doctor approval is required.', 'DOCTOR_NOT_APPROVED');
      const assignment = await tx.doctorPatient.findFirst({
        where: { doctorId: doctor.id, patientId: input.patientId, status: 'ACTIVE', patient: { user: { status: 'ACTIVE', emailVerifiedAt: { not: null } } } },
        select: { patient: { select: { userId: true } } },
      });
      if (!assignment) return null;
      const created = await tx.medicalRecord.create({
        data: { ...input, doctorId: doctor.id, recordDate: date(input.recordDate) }, select: recordSelect,
      });
      await writeAudit(tx, req, 'RECORD_CREATE', 'RECORD', created.id);
      await tx.notification.create({ data: {
        recipientUserId: assignment.patient.userId, kind: 'RECORD_CREATED', title: 'A medical record is available.', relatedResourceId: created.id,
      } });
      return created;
    }, true);
    if (!record) {
      await writeAudit(this.prisma, req, 'RECORD_CREATE', 'PATIENT', input.patientId, 'DENIED', 'PATIENT_UNAVAILABLE');
      throw patientUnavailable();
    }
    return { data: serialize(record) };
  }

  @Patch('records/:id')
  @ApiBody({ schema: openApiSchema(updateRecordSchema) })
  @Roles('DOCTOR')
  @Header('Cache-Control', 'no-store')
  update(@Req() req: Request, @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateRecordSchema)) input: z.output<typeof updateRecordSchema>) {
    return this.change(req, id, input, false);
  }

  @Patch('records/:id/archive')
  @ApiBody({ schema: openApiSchema(versionSchema) })
  @Roles('DOCTOR')
  @Header('Cache-Control', 'no-store')
  archive(@Req() req: Request, @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(versionSchema)) input: z.output<typeof versionSchema>) {
    return this.change(req, id, input, true);
  }

  private async change(req: Request, id: string, input: z.output<typeof versionSchema> &
    Partial<z.output<typeof updateRecordSchema>>, archive: boolean) {
    const action = archive ? 'RECORD_ARCHIVE' : 'RECORD_UPDATE';
    const result = await this.withActor(req, async tx => {
      const patient = await this.scope(tx, req.user!);
      const where: Prisma.MedicalRecordWhereInput = { id, status: 'ACTIVE', patient, doctor: approvedDoctor(req.user!.id) };
      const previous = await tx.medicalRecord.findFirst({ where, select: {
        id: true, version: true, diagnosis: true, description: true, recordDate: true, status: true,
        patient: { select: { userId: true } },
      } });
      if (!previous) return 'missing';
      if (previous.version !== input.expectedVersion) return 'conflict';
      const updated = await tx.medicalRecord.updateMany({
        where: { ...where, version: input.expectedVersion },
        data: {
          diagnosis: input.diagnosis, description: input.description,
          recordDate: input.recordDate ? date(input.recordDate) : undefined,
          status: archive ? 'ARCHIVED' : undefined, version: { increment: 1 },
        },
      });
      if (!updated.count) return 'conflict';
      await tx.recordRevision.create({ data: {
        recordId: id, changedById: req.user!.id, oldVersion: previous.version, newVersion: previous.version + 1,
        previousData: {
          diagnosis: previous.diagnosis, description: previous.description,
          recordDate: previous.recordDate.toISOString().slice(0, 10), status: previous.status,
        },
      } });
      await writeAudit(tx, req, action, 'RECORD', id);
      await tx.notification.create({ data: {
        recipientUserId: previous.patient.userId, kind: 'RECORD_UPDATED', title: 'Your medical history was updated.',
        relatedResourceId: archive ? null : id,
      } });
      return tx.medicalRecord.findUniqueOrThrow({ where: { id }, select: recordSelect });
    }, true);
    if (result === 'missing' || result === 'conflict') {
      const error = result === 'missing' ? unavailable() : conflict();
      await writeAudit(this.prisma, req, action, 'RECORD', id, 'DENIED', error.code);
      throw error;
    }
    return { data: serialize(result) };
  }

  @Get('analytics/diagnoses')
  @Roles('DOCTOR')
  @Header('Cache-Control', 'no-store')
  async diagnoses(@Req() req: Request) {
    const rows = await this.withActor(req, async tx => tx.medicalRecord.groupBy({
      by: ['diagnosis'], where: { status: 'ACTIVE', patient: await this.scope(tx, req.user!) },
      _count: { diagnosis: true }, orderBy: [{ _count: { diagnosis: 'desc' } }, { diagnosis: 'asc' }], take: 100,
    }));
    await writeAudit(this.prisma, req, 'DIAGNOSIS_ANALYTICS', 'RECORD', null);
    return { data: rows.map(row => ({ diagnosis: row.diagnosis, count: row._count.diagnosis })) };
  }

  @Get('records/:id/files')
  @Header('Cache-Control', 'no-store')
  async files(@Req() req: Request, @Param('id', uuid) id: string,
    @Query(new ZodValidationPipe(pageQuery)) query: z.output<typeof pageQuery>) {
    const record = await this.withActor(req, async tx => tx.medicalRecord.findFirst({
      where: { id, patient: await this.scope(tx, req.user!) },
      select: { files: { where: this.pdfStorage.readable, select: fileSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...pageArgs(query) } },
    }));
    await writeAudit(this.prisma, req, 'RECORD_FILE_LIST', 'RECORD', id, record ? 'SUCCESS' : 'DENIED',
      record ? undefined : 'RECORD_UNAVAILABLE');
    if (!record) throw unavailable();
    return { data: paged(record.files.map(serializeFile), query) };
  }

  @Post('records/:id/files')
  @Roles('DOCTOR')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: maxPdfBytes + 1, files: 1, fields: 0 } }))
  @Header('Cache-Control', 'no-store')
  async upload(@Req() req: Request, @Param('id', uuid) id: string, @UploadedFile() file?: PdfUpload) {
    const canAttach = async (tx: Prisma.TransactionClient) => {
      const patient = await this.scope(tx, req.user!);
      return tx.medicalRecord.findFirst({
        where: { id, patient, status: 'ACTIVE', doctor: approvedDoctor(req.user!.id) },
        select: { patient: { select: { userId: true } } },
      });
    };
    const denyUpload = async () => {
      await writeAudit(this.prisma, req, 'RECORD_FILE_UPLOAD', 'RECORD', id, 'DENIED', 'RECORD_UNAVAILABLE');
      throw unavailable();
    };
    if (!await this.withActor(req, canAttach)) return denyUpload();
    if (file && file.buffer.length > maxPdfBytes) throw new AppException(413, 'PAYLOAD_TOO_LARGE', 'PDF files must be 10 MiB or smaller.');
    if (!file || file.mimetype !== 'application/pdf' ||
      !/^%PDF-\d\.\d(?:\r|\n)/.test(file.buffer.subarray(0, 16).toString('latin1')) ||
      !/%%EOF\s*$/.test(file.buffer.subarray(-1024).toString('latin1'))) {
      throw new AppException(400, 'INVALID_PDF', 'Choose a valid PDF file.');
    }
    const originalName = file.originalname.replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/\.pdf$/i, '').trim().slice(0, 120) || 'report';
    const staged = await this.pdfStorage.stage(file.buffer);
    const data = await this.withActor(req, async tx => {
      const record = await canAttach(tx);
      if (!record) return null;
      const saved = await tx.medicalFile.create({
        data: { ...staged, recordId: id, originalName: `${originalName}.pdf`, mimeType: 'application/pdf', uploadedById: req.user!.id },
        select: fileSelect,
      });
      await writeAudit(tx, req, 'RECORD_FILE_UPLOAD', 'RECORD', id);
      await tx.notification.create({ data: {
        recipientUserId: record.patient.userId, kind: 'RECORD_UPDATED', title: 'A PDF report is available.',
        relatedResourceId: id,
      } });
      return serializeFile(saved);
    }, true).catch(async error => {
      if (error instanceof AppException && error.code === 'WRITE_CONFLICT') await this.pdfStorage.discard(staged.objectKey);
      else this.pdfStorage.flagForReconciliation(staged.objectKey);
      throw error;
    });
    if (data) return { data };
    await this.pdfStorage.discard(staged.objectKey);
    return denyUpload();
  }

  @Get('records/:id/files/:fileId/download')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Security-Policy', 'sandbox')
  downloadFile(@Req() req: Request, @Param('id', uuid) id: string, @Param('fileId', uuid) fileId: string) {
    return this.download(req, id, fileId);
  }

  @Get('records/:id/download')
  @Header('Cache-Control', 'no-store')
  @Header('Content-Security-Policy', 'sandbox')
  downloadLatest(@Req() req: Request, @Param('id', uuid) id: string) {
    return this.download(req, id);
  }

  private async download(req: Request, id: string, fileId?: string) {
    const file = await this.withActor(req, async tx => tx.medicalFile.findFirst({
      where: { ...this.pdfStorage.readable, id: fileId, recordId: id, record: { patient: await this.scope(tx, req.user!) } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: {
        originalName: true, localContent: true, objectKey: true, sizeBytes: true, checksumSha256: true,
      },
    }));
    if (!file) {
      await writeAudit(this.prisma, req, 'RECORD_FILE_DOWNLOAD', 'RECORD', id, 'DENIED', 'FILE_UNAVAILABLE');
      throw new AppException(404, 'FILE_UNAVAILABLE', 'This PDF is unavailable.');
    }
    const content = await this.pdfStorage.read(file).catch(async error => {
      await writeAudit(this.prisma, req, 'RECORD_FILE_DOWNLOAD', 'RECORD', id, 'ERROR', 'PDF_STORAGE_UNAVAILABLE');
      throw error;
    });
    await writeAudit(this.prisma, req, 'RECORD_FILE_DOWNLOAD', 'RECORD', id);
    const name = file.originalName.replace(/[^a-zA-Z0-9._ -]/g, '_');
    return new StreamableFile(content, { type: 'application/pdf', disposition: `attachment; filename="${name}"` });
  }
}
