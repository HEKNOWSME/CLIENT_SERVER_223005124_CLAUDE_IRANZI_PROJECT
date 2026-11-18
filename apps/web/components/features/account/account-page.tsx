'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { describeError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { Alert, Card, CardGrid, ConfirmAction, PageHeader } from '../../ui';
import { AccountCard, SessionCard } from './account-cards';

export function AccountPage() {
  const { state, reloadUser, logoutAllDevices } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    reloadUser().catch(reason => setError(describeError(reason)));
  }, [reloadUser]);

  if (state.status !== 'authenticated') return null;

  async function signOutEverywhere() {
    setWorking(true);
    try {
      await logoutAllDevices();
      router.replace('/login');
    } catch (reason) {
      setError(describeError(reason));
      setWorking(false);
    }
  }

  return (
    <>
      <PageHeader eyebrow="Account" title="Account and security" description="Your profile details and the sessions signed in to this account." />
      {error ? <div className="mb-4 sm:mb-6"><Alert tone="error">{error}</Alert></div> : null}
      <CardGrid>
        <AccountCard user={state.user} />
        <SessionCard expiresAt={state.expiresAt} />
      </CardGrid>
      <Card title="Sign out everywhere" description="Ends every session for this account, including other browsers and devices. Use this if you think someone else has access." className="mt-4 sm:mt-6">
        <ConfirmAction
          label="Sign out of all devices"
          question="Sign out of every device now?"
          confirmLabel="Yes, sign out"
          onConfirm={signOutEverywhere}
          loading={working}
          icon={<LogOut className="size-4" aria-hidden="true" />}
        />
      </Card>
    </>
  );
}
