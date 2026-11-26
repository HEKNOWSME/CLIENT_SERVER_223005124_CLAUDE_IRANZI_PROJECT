'use client';

import type { DiagnosisCount, Page, UserRole } from '@pmrms/contracts';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth';
import { useUnreadNotifications } from '../../../lib/notifications';
import { isAwaitingApproval, NAV_BY_ROLE, ROLE_LABEL } from '../../../lib/roles';
import { CardGrid, IconTile, PageHeader, StatTile } from '../../ui';
import { AccountCard, SessionCard } from '../account/account-cards';
import { useWorkspaceData } from '../workspace/workspace-ui';

function countLabel(page?: Page<{ id: string }>) {
  if (!page) return '—';
  return page.hasMore ? `${page.items.length}+` : page.items.length;
}

const INTRO: Record<UserRole, string> = {
  ADMIN: 'Accounts, approvals, assignments, and the audit trail — never the clinical notes.',
  DOCTOR: 'Patients assigned to you, their records, and the reports you attach.',
  PATIENT: 'Your visits, the doctors who wrote them, and the PDFs they shared.',
};

export function DashboardHome({ role }: { role: UserRole }) {
  const { state } = useAuth();
  const unread = useUnreadNotifications(state.status === 'authenticated');
  const locked = state.status === 'authenticated' && isAwaitingApproval(state.user);
  const users = useWorkspaceData<Page<{ id: string }>>(role === 'ADMIN' ? '/admin/users?page=1&limit=100' : null);
  const doctors = useWorkspaceData<Page<{ id: string }>>(role === 'ADMIN' ? '/admin/doctors/pending?page=1&limit=100' : null);
  const assignments = useWorkspaceData<Page<{ id: string }>>(role === 'ADMIN' ? '/admin/assignments?page=1&limit=100' : null);
  const patients = useWorkspaceData<Page<{ id: string }>>(role === 'DOCTOR' && !locked ? '/patients?page=1&limit=100' : null);
  const records = useWorkspaceData<Page<{ id: string }>>(role !== 'ADMIN' && !locked ? '/records?page=1&limit=100&status=ACTIVE' : null);
  const analytics = useWorkspaceData<DiagnosisCount[]>(role === 'DOCTOR' && !locked ? '/analytics/diagnoses' : null);

  if (state.status !== 'authenticated') return null;
  const firstName = state.user.name.split(' ')[0];
  const shortcuts = NAV_BY_ROLE[role].slice(1, -1).filter(item => item.ready && !(item.clinical && locked));
  const diagnosisTotal = analytics.data?.reduce((sum, row) => sum + row.count, 0);

  return (
    <>
      <PageHeader eyebrow={`${ROLE_LABEL[role]} overview`} title={`Welcome, ${firstName}`} description={INTRO[role]} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatTile label="Unread notifications" value={unread.count} hint="Updates on the sidebar too" />
        {role === 'ADMIN' ? <>
          <StatTile label="Accounts on file" value={countLabel(users.data)} />
          <StatTile label="Doctors waiting" value={countLabel(doctors.data)} />
          <StatTile label="Assignments" value={countLabel(assignments.data)} />
        </> : null}
        {role === 'DOCTOR' && !locked ? <>
          <StatTile label="Assigned patients" value={countLabel(patients.data)} />
          <StatTile label="Active records" value={diagnosisTotal ?? countLabel(records.data)} />
        </> : null}
        {role === 'PATIENT' ? <StatTile label="Active records" value={countLabel(records.data)} /> : null}
      </div>
      <CardGrid>
        <AccountCard user={state.user} accountHref={`/${role.toLowerCase()}/profile`} />
        <SessionCard expiresAt={state.expiresAt} />
      </CardGrid>
      {shortcuts.length ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shortcuts.map(item => (
            <li key={item.href}>
              <Link href={item.href} className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 shadow-card hover:border-brand-600">
                <IconTile icon={item.icon} />
                <span className="font-semibold">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
