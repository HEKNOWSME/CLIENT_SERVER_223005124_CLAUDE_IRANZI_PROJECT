import type { Metadata } from 'next';
import { DoctorApplyForm } from '../../../../components/features/auth/doctor-apply-form';
import { AuthCard } from '../../../../components/layout/auth-layout';

export const metadata: Metadata = { title: 'Doctor application | PMRMS' };

export default function DoctorApplyPage() {
  return (
    <AuthCard
      eyebrow="Doctor application"
      title="Apply for doctor access"
      description="Your account stays pending until an administrator approves you. You will not see any patient data before approval."
      footer={[{ text: 'Already applied?', href: '/login', label: 'Sign in' }]}
    >
      <DoctorApplyForm />
    </AuthCard>
  );
}
