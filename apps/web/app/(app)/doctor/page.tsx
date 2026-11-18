import type { Metadata } from 'next';
import { DashboardHome } from '../../../components/features/dashboard/dashboard-home';

export const metadata: Metadata = { title: 'Overview | PMRMS' };

export default function Page() {
  return <DashboardHome role="DOCTOR" />;
}
