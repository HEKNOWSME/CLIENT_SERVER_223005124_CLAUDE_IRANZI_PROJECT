import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VerifyEmailForm } from '../../../components/features/auth/verify-email-form';
import { AuthCard } from '../../../components/layout/auth-layout';
import { Spinner } from '../../../components/ui';

export const metadata: Metadata = { title: 'Verify email | PMRMS' };

export default function VerifyEmailPage() {
  return (
    <AuthCard
      eyebrow="Email verification"
      title="Enter your code"
      description="Confirm the address you registered with before we open your patient workspace."
      footer={[{ text: 'Wrong email?', href: '/register', label: 'Register again' }]}
    >
      <Suspense fallback={<div className="flex justify-center py-10 text-brand-600"><Spinner className="size-6" /></div>}>
        <VerifyEmailForm />
      </Suspense>
    </AuthCard>
  );
}
