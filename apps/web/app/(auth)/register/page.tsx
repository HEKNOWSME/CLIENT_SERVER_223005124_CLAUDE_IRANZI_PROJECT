import type { Metadata } from 'next';
import { RegisterPatientForm } from '../../../components/features/auth/register-patient-form';
import { AuthCard } from '../../../components/layout/auth-layout';

export const metadata: Metadata = { title: 'Create patient account | PMRMS' };

export default function RegisterPage() {
  return (
    <AuthCard
      eyebrow="Patient registration"
      title="Create your account"
      description="View your medical history and download reports shared by your doctors."
      footer={[
        { text: 'Already registered?', href: '/login', label: 'Sign in' },
        { text: 'Are you a doctor?', href: '/doctor/apply', label: 'Apply for access' },
      ]}
    >
      <RegisterPatientForm />
    </AuthCard>
  );
}
