'use client';

import type { UserRole } from '@pmrms/contracts';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth';
import { isAwaitingApproval, NAV_BY_ROLE, ROLE_LABEL } from '../../../lib/roles';
import { Card, CardGrid, IconTile, PageHeader } from '../../ui';
import { AccountCard, SessionCard } from '../account/account-cards';

const INTRO: Record<UserRole, string> = {
  ADMIN: 'Manage accounts, approve doctors, assign care relationships and review audit activity.',
  DOCTOR: 'Work with the patients assigned to you: their history, records and reports.',
  PATIENT: 'Your medical history and the reports your doctors share with you, in one place.',
};

export function DashboardHome({ role }: { role: UserRole }) {
  const { state } = useAuth();
  if (state.status !== 'authenticated') return null;
  const firstName = state.user.name.split(' ')[0];
  const available = NAV_BY_ROLE[role].slice(1, -1).filter(item => item.ready && !(item.clinical && isAwaitingApproval(state.user)));

  return (
    <>
      <PageHeader eyebrow={`${ROLE_LABEL[role]} overview`} title={`Welcome, ${firstName}`} description={INTRO[role]} />
      <CardGrid>
        <AccountCard user={state.user} accountHref={`/${role.toLowerCase()}/profile`} />
        <SessionCard expiresAt={state.expiresAt} />
      </CardGrid>
      {available.length ? (
        <Card title="Your workspace" className="mt-4 sm:mt-6">
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {available.map(item => (
              <li key={item.href} className="min-w-0">
                <Link href={item.href} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-brand-600 hover:text-brand-700">
                  <IconTile icon={item.icon} />
                  <span className="min-w-0 flex-1 text-sm font-medium">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
