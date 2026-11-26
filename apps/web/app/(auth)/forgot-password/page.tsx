import type { Metadata } from 'next';
import { PasswordRecoveryForm } from '../../../components/features/auth/password-recovery-form';
import { AuthCard } from '../../../components/layout/auth-layout';

export const metadata: Metadata = { title: 'Reset password | PMRMS' };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      eyebrow="Account recovery"
      title="Reset your password"
      footer={[{ text: 'Remember your password?', href: '/login', label: 'Sign in' }]}
    >
      <PasswordRecoveryForm />
    </AuthCard>
  );
}
