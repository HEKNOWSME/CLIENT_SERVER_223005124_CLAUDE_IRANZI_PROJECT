'use client';

import type { AuthUser } from '@pmrms/contracts';
import { Clock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { isAwaitingApproval, ROLE_LABEL, titleCase } from '../../../lib/roles';
import { Badge, ButtonLink, Card, DescriptionList, type BadgeTone } from '../../ui';

export function AccountStatusBadge({ user }: { user: AuthUser }) {
  const tone: BadgeTone = user.status === 'SUSPENDED' ? 'danger' : isAwaitingApproval(user) ? 'warning' : 'success';
  const label = user.status === 'SUSPENDED' ? 'Suspended' : user.doctorVerification === 'REJECTED' ? 'Declined'
    : isAwaitingApproval(user) ? 'Pending approval' : 'Active';
  return <Badge tone={tone} dot>{label}</Badge>;
}

export function AccountCard({ user, accountHref }: { user: AuthUser; accountHref?: string }) {
  return (
    <Card
      title="Your account"
      action={<AccountStatusBadge user={user} />}
      footer={accountHref ? <ButtonLink href={accountHref} variant="ghost" className="-mx-3">Manage account</ButtonLink> : undefined}
    >
      <DescriptionList items={[
        { term: 'Name', value: user.name },
        { term: 'Email', value: user.email },
        { term: 'Role', value: ROLE_LABEL[user.role] },
        ...(user.doctorVerification ? [{ term: 'Verification', value: titleCase(user.doctorVerification) }] : []),
      ]} />
    </Card>
  );
}

function useCountdown(target: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.round((target - now) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function SessionCard({ expiresAt }: { expiresAt: number }) {
  const remaining = useCountdown(expiresAt);
  return (
    <Card title="Session security" description="Short-lived access with automatic, single-use renewal." action={<Badge tone="brand"><Clock className="size-3.5" aria-hidden="true" />{remaining}</Badge>}>
      <DescriptionList items={[
        { term: 'Access token', value: 'Kept in memory only, renews about a minute before expiry.' },
        { term: 'Refresh token', value: 'HttpOnly cookie, rotated on every use.' },
        { term: 'Other tabs', value: 'Signing in or out here applies everywhere.' },
      ]} />
    </Card>
  );
}
