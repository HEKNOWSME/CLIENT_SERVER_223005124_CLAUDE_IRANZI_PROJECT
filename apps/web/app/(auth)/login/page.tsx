import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '../../../components/features/auth/login-form';
import { AuthCard } from '../../../components/layout/auth-layout';
import { Spinner } from '../../../components/ui';

export const metadata: Metadata = { title: 'Sign in | PMRMS' };

export default function LoginPage() {
  return (
    <AuthCard
      eyebrow="Welcome back"
      title="Sign in"
      description="Use the email and password for your PMRMS account."
      footer={[
        { text: 'New patient?', href: '/register', label: 'Create an account' },
        { text: 'Are you a doctor?', href: '/doctor/apply', label: 'Apply for access' },
      ]}
    >
      <Suspense fallback={<div className="flex justify-center py-10 text-brand-600"><Spinner className="size-6" /></div>}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
