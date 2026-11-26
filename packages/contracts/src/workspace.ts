import { z } from 'zod';
import { registerPatientRequestSchema } from './auth';

export const idSchema = z.uuid();
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export const recordQuery = pageQuery.extend({
  patientId: idSchema.optional(),
  diagnosis: z.string().trim().min(1).max(255).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
}).refine(query => !query.from || !query.to || query.from <= query.to, {
  path: ['to'], message: 'End date must be on or after the start date.',
});

const recordFields = z.object({
  diagnosis: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10000).nullable().optional(),
  recordDate: z.iso.date().refine(value => value >= '1900-01-01', 'Choose a date in 1900 or later.'),
});
export const createRecordSchema = recordFields.extend({ patientId: idSchema }).strict();
export const versionSchema = z.object({ expectedVersion: z.number().int().min(1).max(2147483646) }).strict();
export const updateRecordSchema = recordFields.partial().extend(versionSchema.shape).strict()
  .refine(input => input.diagnosis !== undefined || input.description !== undefined || input.recordDate !== undefined, {
    message: 'Provide at least one field to update.',
  });
export const approvalSchema = z.object({ decision: z.enum(['APPROVE', 'REJECT']) }).strict();
export const accountChangeSchema = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }).strict();
export const assignmentSchema = z.object({ doctorId: idSchema, patientId: idSchema }).strict();
export const patientProfileSchema = registerPatientRequestSchema.pick({ fullName: true, birthDate: true, phone: true })
  .extend({ phone: registerPatientRequestSchema.shape.phone.unwrap().nullable() });

export interface Page<T> { items: T[]; page: number; limit: number; hasMore: boolean }
export interface Person { id: string; fullName: string }
export interface PatientProfile extends Person { birthDate: string; phone: string | null }
export interface ClinicalRecord {
  id: string;
  patientId: string;
  doctorId: string;
  patient: Person;
  doctor: Person;
  diagnosis: string;
  description: string | null;
  recordDate: string;
  status: 'ACTIVE' | 'ARCHIVED';
  version: number;
}
export interface WorkspaceAccount {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'DOCTOR' | 'PATIENT';
  status: 'ACTIVE' | 'PENDING' | 'SUSPENDED';
}
export interface DoctorApplication extends Person {
  specialty: string;
  licenseNumber: string | null;
  user: { email: string };
}
export interface Assignment {
  id: string;
  doctor: Person;
  patient: Person;
  status: 'ACTIVE' | 'REVOKED';
  assignedAt: string;
}
export interface AuditRow {
  id: string;
  action: string;
  resourceType: string;
  outcome: string;
  reasonCode: string | null;
  requestId: string | null;
  createdAt: string;
}
export interface InboxItem {
  id: string;
  title: string;
  kind: 'RECORD_CREATED' | 'RECORD_UPDATED' | 'ASSIGNMENT_CHANGED' | 'ACCOUNT_STATUS_CHANGED' | 'GENERIC';
  relatedResourceId: string | null;
  readAt: string | null;
  createdAt: string;
}
export interface UnreadCount { count: number }
export interface DiagnosisCount { diagnosis: string; count: number }
export interface RecordFile { id: string; originalName: string; sizeBytes: number }

export const realtimeSessionSchema = z.object({
  url: z.url(),
  publishableKey: z.string().regex(/^sb_publishable_[\w-]+$/),
  token: z.string(),
  topic: z.string(),
  expiresAt: z.number().int(),
}).nullable();
