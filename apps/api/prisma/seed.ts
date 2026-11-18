import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';
import { passwordSchema } from '@pmrms/contracts';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { ARGON2_OPTIONS } from '../src/auth/password.service';
import { PrismaClient, type UserRole, type AccountStatus } from '../src/generated/prisma/client';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required. Run pnpm env:init.');
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
  throw new Error('Refusing to seed demo accounts in production. Set ALLOW_DEMO_SEED=true only for a disposable demo database.');
}
const demoPassword = passwordSchema.safeParse(process.env.SEED_DEMO_PASSWORD ?? '');
if (!demoPassword.success) {
  throw new Error('SEED_DEMO_PASSWORD must be set in .env and meet the password policy (12+ characters, upper, lower, digit).');
}
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 }) });

// Stable, readable identifiers so demo scripts and the README can reference exact rows.
const id = (prefix: number, n: number) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER = 1, PATIENT = 2, DOCTOR = 3, RECORD = 4, ASSIGNMENT = 5, NOTIFICATION = 6;
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

interface SeedUser { n: number; name: string; email: string; role: UserRole; status: AccountStatus }

const admin: SeedUser = { n: 1, name: 'Admin Demo', email: 'admin.demo@example.test', role: 'ADMIN', status: 'ACTIVE' };

const doctors = [
  { n: 1, user: 11, name: 'Amani Demo', email: 'doctor.a@example.test', specialty: 'General Practice', license: 'DEMO-LIC-0001', approved: true },
  { n: 2, user: 12, name: 'Bruno Sample', email: 'doctor.b@example.test', specialty: 'Internal Medicine', license: 'DEMO-LIC-0002', approved: true },
  { n: 3, user: 13, name: 'Clara Test', email: 'doctor.c@example.test', specialty: 'Family Medicine', license: 'DEMO-LIC-0003', approved: true },
  { n: 4, user: 14, name: 'Pending Applicant', email: 'doctor.pending@example.test', specialty: 'Dermatology', license: 'DEMO-LIC-0004', approved: false },
] as const;

const patients = [
  { n: 1, name: 'Aline Test', birthDate: '2001-04-12', email: 'patient.a@example.test' },
  { n: 2, name: 'Eric Sample', birthDate: '1997-08-23', email: 'patient.b@example.test' },
  { n: 3, name: 'Diane Demo', birthDate: '2004-01-05', email: 'patient03@example.test' },
  { n: 4, name: 'Patrick Mock', birthDate: '1989-06-18', email: 'patient04@example.test' },
  { n: 5, name: 'Grace Fiction', birthDate: '1995-11-10', email: 'patient05@example.test' },
  { n: 6, name: 'Jean Example', birthDate: '2000-02-28', email: 'patient06@example.test' },
  { n: 7, name: 'Bella Sample', birthDate: '1992-09-17', email: 'patient07@example.test' },
  { n: 8, name: 'Kevin Demo', birthDate: '2003-07-03', email: 'patient08@example.test' },
  { n: 9, name: 'Sonia Test', birthDate: '1987-12-14', email: 'patient09@example.test' },
  { n: 10, name: 'David Fiction', birthDate: '1999-05-21', email: 'patient10@example.test' },
] as const;

// docs/04 section 13.2. Expected counts: Common cold 3, Headache 2, Allergic rhinitis 2, Gastritis 2, Back pain 1.
const records = [
  { n: 1, patient: 1, doctor: 1, diagnosis: 'Common cold', date: '2026-01-12', description: 'Mild fever and congestion for three days. Rest, fluids and paracetamol advised.' },
  { n: 2, patient: 2, doctor: 1, diagnosis: 'Headache', date: '2026-02-04', description: 'Tension-type headache linked to screen time. Hydration and regular breaks advised.' },
  { n: 3, patient: 3, doctor: 2, diagnosis: 'Allergic rhinitis', date: '2026-02-26', description: 'Seasonal sneezing and itchy eyes. Oral antihistamine prescribed.' },
  { n: 4, patient: 4, doctor: 2, diagnosis: 'Common cold', date: '2026-03-10', description: 'Sore throat and runny nose without complications. Symptomatic care.' },
  { n: 5, patient: 5, doctor: 3, diagnosis: 'Gastritis', date: '2026-04-01', description: 'Epigastric discomfort after meals. Dietary changes and antacid trial.' },
  { n: 6, patient: 6, doctor: 1, diagnosis: 'Headache', date: '2026-04-17', description: 'Recurrent frontal headache. Sleep diary requested for follow-up.' },
  { n: 7, patient: 7, doctor: 3, diagnosis: 'Back pain', date: '2026-05-09', description: 'Lower back strain after lifting. Stretching programme and review in two weeks.' },
  { n: 8, patient: 8, doctor: 2, diagnosis: 'Allergic rhinitis', date: '2026-06-22', description: 'Persistent nasal congestion. Saline rinse and antihistamine continued.' },
  { n: 9, patient: 9, doctor: 3, diagnosis: 'Common cold', date: '2026-07-08', description: 'Cough and mild fatigue. Symptomatic care; return if fever persists.' },
  { n: 10, patient: 10, doctor: 1, diagnosis: 'Gastritis', date: '2026-08-15', description: 'Burning stomach pain worsened by spicy food. Antacid and follow-up visit.' },
] as const;

// One ACTIVE assignment per authoring doctor/patient pair, plus Doctor B on patient 1 for the
// concurrent-edit demo. Doctor C has no access to patient 1: the isolation test pair.
const assignments = [
  ...[...new Map(records.map(r => [`${r.doctor}-${r.patient}`, { doctor: r.doctor as number, patient: r.patient as number }])).values()],
  { doctor: 2, patient: 1 },
];

async function upsertUser(user: SeedUser & { userId: string }, passwordHash: string) {
  return prisma.user.upsert({
    where: { email: user.email },
    create: { id: user.userId, name: user.name, email: user.email, passwordHash, role: user.role, status: user.status },
    // Re-seeding resets the demo account to a known state (and invalidates its existing tokens).
    update: { name: user.name, passwordHash, status: user.status, failedLoginAttempts: 0, lockedUntil: null, passwordChangedAt: new Date() },
  });
}

async function seed() {
  const passwordHash = await hash(demoPassword.data!, ARGON2_OPTIONS);
  await prisma.systemCheck.upsert({ where: { id: 'local-setup' }, create: { id: 'local-setup' }, update: {} });

  const adminUser = await upsertUser({ ...admin, userId: id(USER, admin.n) }, passwordHash);
  const verifiedAt = new Date('2026-01-02T08:00:00.000Z');

  const doctorIds = new Map<number, string>();
  for (const d of doctors) {
    const user = await upsertUser(
      { n: d.user, userId: id(USER, d.user), name: d.name, email: d.email, role: 'DOCTOR', status: d.approved ? 'ACTIVE' : 'PENDING' },
      passwordHash,
    );
    const decision = d.approved
      ? { verificationStatus: 'APPROVED' as const, verifiedAt, verifiedByUserId: adminUser.id }
      : { verificationStatus: 'PENDING' as const, verifiedAt: null, verifiedByUserId: null };
    const doctor = await prisma.doctor.upsert({
      where: { userId: user.id },
      create: { id: id(DOCTOR, d.n), userId: user.id, fullName: d.name, specialty: d.specialty, licenseNumber: d.license, ...decision },
      update: { fullName: d.name, specialty: d.specialty, ...decision },
    });
    doctorIds.set(d.n, doctor.id);
  }

  const patientIds = new Map<number, string>();
  const patientUserIds = new Map<number, string>();
  for (const p of patients) {
    const user = await upsertUser({ n: 100 + p.n, userId: id(USER, 100 + p.n), name: p.name, email: p.email, role: 'PATIENT', status: 'ACTIVE' }, passwordHash);
    const patient = await prisma.patient.upsert({
      where: { userId: user.id },
      create: { id: id(PATIENT, p.n), userId: user.id, fullName: p.name, birthDate: date(p.birthDate) },
      update: { fullName: p.name, birthDate: date(p.birthDate) },
    });
    patientIds.set(p.n, patient.id);
    patientUserIds.set(p.n, user.id);
  }

  for (const [index, a] of assignments.entries()) {
    const doctorId = doctorIds.get(a.doctor)!;
    const patientId = patientIds.get(a.patient)!;
    const active = await prisma.doctorPatient.findFirst({ where: { doctorId, patientId, status: 'ACTIVE' }, select: { id: true } });
    if (active) continue;
    await prisma.doctorPatient.create({
      data: { id: id(ASSIGNMENT, index + 1), doctorId, patientId, assignedByUserId: adminUser.id, assignedAt: verifiedAt, note: 'Seeded demo assignment' },
    });
  }

  for (const r of records) {
    const recordId = id(RECORD, r.n);
    await prisma.medicalRecord.upsert({
      where: { id: recordId },
      create: {
        id: recordId,
        patientId: patientIds.get(r.patient)!,
        doctorId: doctorIds.get(r.doctor)!,
        diagnosis: r.diagnosis,
        description: r.description,
        recordDate: date(r.date),
      },
      // Leave existing rows untouched so edits made during a demo survive a re-seed.
      update: {},
    });
    await prisma.notification.upsert({
      where: { id: id(NOTIFICATION, r.n) },
      create: {
        id: id(NOTIFICATION, r.n),
        recipientUserId: patientUserIds.get(r.patient)!,
        kind: 'RECORD_CREATED',
        title: 'A new medical record was added to your file.',
        relatedResourceId: recordId,
      },
      update: {},
    });
  }

  const [users, patientCount, doctorCount, recordCount, activeAssignments] = await Promise.all([
    prisma.user.count(), prisma.patient.count(), prisma.doctor.count(), prisma.medicalRecord.count(),
    prisma.doctorPatient.count({ where: { status: 'ACTIVE' } }),
  ]);
  console.log(`Seed complete: ${users} users, ${patientCount} patients, ${doctorCount} doctors, ${recordCount} records, ${activeAssignments} active assignments.`);
  console.table([
    { email: admin.email, role: 'ADMIN', status: 'ACTIVE', id: adminUser.id },
    ...doctors.map(d => ({ email: d.email, role: 'DOCTOR', status: d.approved ? 'ACTIVE / APPROVED' : 'PENDING', id: doctorIds.get(d.n) })),
    ...patients.slice(0, 2).map(p => ({ email: p.email, role: 'PATIENT', status: 'ACTIVE', id: patientIds.get(p.n) })),
  ]);
  console.log('All demo accounts use the SEED_DEMO_PASSWORD value from the root .env file.');
}

seed().catch(error => {
  console.error('Seed failed. Check the database and migrations.', error instanceof Error ? error.message : '');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
