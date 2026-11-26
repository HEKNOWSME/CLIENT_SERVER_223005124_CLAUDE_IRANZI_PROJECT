'use client';

import { loginRequestSchema } from '@pmrms/contracts';
import { LogIn } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ApiError } from '../../../lib/api';
import { safeNextPath, useAuth } from '../../../lib/auth';
import { useZodForm } from '../../../lib/forms';
import { Alert, Button, PasswordField, TextField } from '../../ui';

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const form = useZodForm({
    schema: loginRequestSchema,
    read: data => ({ email: data.get('email'), password: data.get('password') }),
    submit: async input => {
      setUnverifiedEmail(null);
      try {
        return await login(input);
      } catch (error) {
        if (error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED') setUnverifiedEmail(input.email);
        throw error;
      }
    },
    onSuccess: user => router.replace(safeNextPath(params.get('next'), user)),
  });

  return (
    <form onSubmit={form.onSubmit} noValidate className="grid gap-5">
      {params.get('passwordReset') === '1' ? <Alert tone="success">Password reset. Sign in with your new password.</Alert> : null}
      {params.get('expired') ? <Alert tone="info">Your session ended. Please sign in again to continue.</Alert> : null}
      {unverifiedEmail ? (
        <Alert tone="warning" title="Email not confirmed yet.">
          Enter the code we sent to finish registration.{' '}
          <Link href={`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`} className="font-semibold text-brand-700 underline-offset-4 hover:underline">
            Verify email
          </Link>
        </Alert>
      ) : form.formError ? <Alert tone="error">{form.formError}</Alert> : null}
      <TextField label="Email" name="email" type="email" autoComplete="email" inputMode="email" required error={form.errors.email} />
      <PasswordField label="Password" name="password" autoComplete="current-password" required error={form.errors.password} />
      <Link href="/forgot-password" className="justify-self-end text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
        Forgot password?
      </Link>
      <Button type="submit" variant="primary" size="lg" fullWidth loading={form.pending} loadingText="Signing in…" icon={<LogIn className="size-5" aria-hidden="true" />}>
        Sign in
      </Button>
    </form>
  );
}
