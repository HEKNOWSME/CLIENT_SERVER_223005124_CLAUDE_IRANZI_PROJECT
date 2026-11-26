import { Body, Controller, Get, Header, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import { accountChangeSchema, approvalSchema, assignmentSchema, idSchema, pageQuery } from '@pmrms/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import { AppException } from '../common/app.exception';
import { Roles } from '../common/decorators';
import { openApiSchema, ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma.service';
import { databaseCode, pageArgs, paged, personSelect, serialWrite, writeAudit } from './workspace-db';

const accountSelect = { id: true, name: true, email: true, role: true, status: true } as const;
const assignmentSelect = {
  id: true, doctor: { select: personSelect }, patient: { select: personSelect }, status: true, assignedAt: true,
} as const;
const uuid = new ZodValidationPipe(idSchema);
const pagination = new ZodValidationPipe(pageQuery);
type PageQuery = z.output<typeof pageQuery>;
const approved: Prisma.DoctorWhereInput = { verificationStatus: 'APPROVED', user: { status: 'ACTIVE' } };
const eligible: Prisma.PatientWhereInput = { user: { status: 'ACTIVE', emailVerifiedAt: { not: null } } };
const missing = () => new AppException(404, 'RESOURCE_UNAVAILABLE', 'This resource is unavailable.');

@ApiTags('Administration')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('users')
  @Header('Cache-Control', 'no-store')
  async users(@Query(pagination) query: PageQuery) {
    return { data: paged(await this.prisma.user.findMany({
      select: accountSelect, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...pageArgs(query),
    }), query) };
  }

  @Patch('users/:id/status')
  @ApiBody({ schema: openApiSchema(accountChangeSchema) })
  @Header('Cache-Control', 'no-store')
  async status(@Req() req: Request, @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(accountChangeSchema)) { status }: z.output<typeof accountChangeSchema>) {
    const updated = await serialWrite(this.prisma, async tx => {
      const user = await tx.user.findUnique({ where: { id }, select: {
        role: true, status: true, emailVerifiedAt: true, doctor: { select: { verificationStatus: true } },
      } });
      if (!user) throw missing();
      if (user.status === status) return tx.user.findUniqueOrThrow({ where: { id }, select: accountSelect });
      if (status === 'ACTIVE' && (!user.emailVerifiedAt || (user.role === 'DOCTOR' && user.doctor?.verificationStatus !== 'APPROVED'))) {
        throw new AppException(409, 'ACCOUNT_NOT_ELIGIBLE', 'The account must complete verification or doctor approval first.');
      }
      if (status === 'SUSPENDED' && user.role === 'ADMIN' && user.status === 'ACTIVE') {
        const otherAdmins = await tx.user.count({ where: { id: { not: id }, role: 'ADMIN', status: 'ACTIVE', emailVerifiedAt: { not: null } } });
        if (!otherAdmins || id === req.user!.id) {
          throw new AppException(409, 'ADMIN_PROTECTED', 'You cannot suspend your own account or the last active administrator.');
        }
      }
      const account = await tx.user.update({ where: { id }, data: { status }, select: accountSelect });
      if (status === 'SUSPENDED') {
        await tx.refreshSession.updateMany({
          where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'ACCOUNT_SUSPENDED' },
        });
      }
      await writeAudit(tx, req, 'ACCOUNT_STATUS_CHANGE', 'USER', id);
      await tx.notification.create({ data: { recipientUserId: id, kind: 'ACCOUNT_STATUS_CHANGED', title: 'Your account status changed.' } });
      return account;
    });
    return { data: updated };
  }

  @Get('doctors/pending')
  @Header('Cache-Control', 'no-store')
  async pending(@Query(pagination) query: PageQuery) {
    return { data: paged(await this.prisma.doctor.findMany({
      where: { verificationStatus: 'PENDING', user: { status: 'PENDING' } },
      select: { ...personSelect, specialty: true, licenseNumber: true, user: { select: { email: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], ...pageArgs(query),
    }), query) };
  }

  @Patch('doctors/:id/approval')
  @ApiBody({ schema: openApiSchema(approvalSchema) })
  @Header('Cache-Control', 'no-store')
  async approval(@Req() req: Request, @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(approvalSchema)) { decision }: z.output<typeof approvalSchema>) {
    const approvedDecision = decision === 'APPROVE';
    return { data: await serialWrite(this.prisma, async tx => {
      const doctor = await tx.doctor.findUnique({ where: { id }, select: {
        userId: true, verificationStatus: true, user: { select: { status: true } },
      } });
      if (!doctor) throw missing();
      if (doctor.verificationStatus !== 'PENDING' || doctor.user.status !== 'PENDING') {
        throw new AppException(409, 'APPLICATION_ALREADY_DECIDED', 'This application cannot be decided.');
      }
      const updated = await tx.doctor.update({ where: { id }, data: {
        verificationStatus: approvedDecision ? 'APPROVED' : 'REJECTED',
        verifiedAt: new Date(), verifiedByUserId: req.user!.id,
      }, select: { id: true, verificationStatus: true } });
      if (approvedDecision) await tx.user.update({ where: { id: doctor.userId }, data: { status: 'ACTIVE' } });
      await writeAudit(tx, req, approvedDecision ? 'DOCTOR_APPROVE' : 'DOCTOR_REJECT', 'DOCTOR', id);
      await tx.notification.create({ data: {
        recipientUserId: doctor.userId, kind: 'ACCOUNT_STATUS_CHANGED',
        title: approvedDecision ? 'Your doctor application was approved.' : 'Your doctor application was rejected.',
      } });
      return updated;
    }) };
  }

  @Get('assignments')
  @Header('Cache-Control', 'no-store')
  async assignments(@Query(pagination) query: PageQuery) {
    return { data: paged(await this.prisma.doctorPatient.findMany({
      select: assignmentSelect, orderBy: [{ assignedAt: 'desc' }, { id: 'desc' }], ...pageArgs(query),
    }), query) };
  }

  @Get('assignment-options')
  @Header('Cache-Control', 'no-store')
  async options(@Query(pagination) query: PageQuery) {
    const orderBy = [{ fullName: 'asc' }, { id: 'asc' }] as const;
    const [doctors, patients] = await Promise.all([
      this.prisma.doctor.findMany({ where: approved, select: personSelect, orderBy: [...orderBy], ...pageArgs(query) }),
      this.prisma.patient.findMany({ where: eligible, select: personSelect, orderBy: [...orderBy], ...pageArgs(query) }),
    ]);
    return { data: { doctors: paged(doctors, query), patients: paged(patients, query) } };
  }

  @Post('assignments')
  @ApiBody({ schema: openApiSchema(assignmentSchema) })
  @Header('Cache-Control', 'no-store')
  async assign(@Req() req: Request, @Body(new ZodValidationPipe(assignmentSchema)) input: z.output<typeof assignmentSchema>) {
    try {
      return { data: await serialWrite(this.prisma, async tx => {
        const doctor = await tx.doctor.findFirst({ where: { ...approved, id: input.doctorId }, select: { userId: true } });
        const patient = await tx.patient.findFirst({ where: { ...eligible, id: input.patientId }, select: { userId: true } });
        if (!doctor || !patient) throw missing();
        const assignment = await tx.doctorPatient.create({
          data: { ...input, assignedByUserId: req.user!.id }, select: assignmentSelect,
        });
        await this.assignmentEffects(tx, req, assignment.id, doctor.userId, patient.userId, 'ASSIGNMENT_CREATE');
        return assignment;
      }) };
    } catch (error) {
      if (databaseCode(error) === 'P2002') throw new AppException(409, 'ASSIGNMENT_EXISTS', 'This doctor is already assigned to the patient.');
      throw error;
    }
  }

  @Patch('assignments/:id/revoke')
  @Header('Cache-Control', 'no-store')
  async revoke(@Req() req: Request, @Param('id', uuid) id: string) {
    return { data: await serialWrite(this.prisma, async tx => {
      const assignment = await tx.doctorPatient.findUnique({ where: { id }, select: {
        status: true, doctor: { select: { userId: true } }, patient: { select: { userId: true } },
      } });
      if (!assignment) throw missing();
      if (assignment.status === 'REVOKED') return tx.doctorPatient.findUniqueOrThrow({ where: { id }, select: assignmentSelect });
      const updated = await tx.doctorPatient.update({ where: { id }, data: {
        status: 'REVOKED', activeLock: null, revokedAt: new Date(), revokedByUserId: req.user!.id,
      }, select: assignmentSelect });
      await this.assignmentEffects(tx, req, id, assignment.doctor.userId, assignment.patient.userId, 'ASSIGNMENT_REVOKE');
      return updated;
    }) };
  }

  private async assignmentEffects(tx: Prisma.TransactionClient, req: Request, id: string, doctorId: string, patientId: string, action: string) {
    await writeAudit(tx, req, action, 'ASSIGNMENT', id);
    await tx.notification.createMany({ data: [doctorId, patientId].map(recipientUserId => ({
      recipientUserId, kind: 'ASSIGNMENT_CHANGED', title: 'A care assignment changed.',
    })) });
  }

  @Get('audit-logs')
  @Header('Cache-Control', 'no-store')
  async audit(@Query(pagination) query: PageQuery) {
    return { data: paged(await this.prisma.accessLog.findMany({
      select: { id: true, action: true, resourceType: true, outcome: true, reasonCode: true, requestId: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], ...pageArgs(query),
    }), query) };
  }
}
