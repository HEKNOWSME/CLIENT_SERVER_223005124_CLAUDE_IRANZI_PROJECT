import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { env } from './config';

const host = new URL(env.DATABASE_URL).hostname;
const supabaseDatabase = host.endsWith('.supabase.co') || host.endsWith('.pooler.supabase.com');
const databaseCa = process.env.DATABASE_SSL_CA;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({
      connectionString: env.DATABASE_URL,
      max: env.DATABASE_POOL_MAX,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      ...(supabaseDatabase && databaseCa ? {
        ssl: { rejectUnauthorized: true, ca: Buffer.from(databaseCa, 'base64').toString('utf8') },
      } : {}),
      ...(supabaseDatabase ? {} : { options: '-c statement_timeout=5000' }),
    }) });
  }
  async onModuleInit() {
    await this.$connect();
    if (supabaseDatabase || env.REALTIME_PROVIDER === 'supabase') {
      const [checks] = await this.$queryRaw<Array<{ restricted: boolean; api_roles_blocked: boolean; broadcast_ready: boolean }>>`
        SELECT row_security_active('public.records') AS restricted,
          NOT EXISTS (
            SELECT 1 FROM pg_roles r CROSS JOIN pg_class c
            WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
              AND c.oid IN ('public.users'::regclass, 'public.patients'::regclass, 'public.records'::regclass,
                'public.refresh_sessions'::regclass, 'public.email_otps'::regclass, 'public.notifications'::regclass,
                'public.medical_files'::regclass, 'public.record_revisions'::regclass, 'public.doctors'::regclass,
                'public.doctor_patients'::regclass, 'public.access_logs'::regclass, 'public.outbox_events'::regclass)
              AND has_table_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE')
          ) AS api_roles_blocked,
          EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.notifications'::regclass
            AND tgname = 'pmrms_notification_broadcast' AND tgenabled IN ('O', 'A')) AS broadcast_ready
      `;
      if (!checks?.restricted || !checks.api_roles_blocked || (env.REALTIME_PROVIDER === 'supabase' && !checks.broadcast_ready)) {
        throw new Error('Hosted PostgreSQL permissions or Realtime setup are incomplete. See README.md.');
      }
    }
  }
  async onModuleDestroy() { await this.$disconnect(); }
}
