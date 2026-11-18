import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required. Run pnpm env:init.');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5000 }) });

async function seed() {
  await prisma.systemCheck.upsert({ where: { id: 'local-setup' }, create: { id: 'local-setup' }, update: {} });
  console.log('Database seed ready. No patient data or user accounts were created.');
}
seed().catch(() => { console.error('Seed failed. Check the database and migrations.'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
