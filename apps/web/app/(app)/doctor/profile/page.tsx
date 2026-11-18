import type { Metadata } from 'next';
import { AccountPage } from '../../../../components/features/account/account-page';

export const metadata: Metadata = { title: 'Account | PMRMS' };

export default function Page() {
  return <AccountPage />;
}
