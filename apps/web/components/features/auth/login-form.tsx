'use client';

import { loginRequestSchema } from '@pmrms/contracts';
import { LogIn } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { safeNextPath, useAuth } from '../../../lib/auth';
import { useZodForm } from '../../../lib/forms';
import { Alert, Button, PasswordField, TextField } from '../../ui';

export function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const form = useZodForm({
    schema: loginRequestSchema,
    read: data => ({ email: data.get('email'), password: data.get('password') }),
    submit: login,
    onSuccess: user => router.replace(safeNextPath(params.get('next'), user)),
  });

  return (
    <form onSubmit={form.onSubmit} noValidate className="grid gap-5">
      {params.get('expired') ? <Alert tone="info">Your session ended. Please sign in again to continue.</Alert> : null}
      {form.formError ? <Alert tone="error">{form.formError}</Alert> : null}
      <TextField label="Email" name="email" type="email" autoComplete="email" inputMode="email" required error={form.errors.email} />
      <PasswordField label="Password" name="password" autoComplete="current-password" required error={form.errors.password} />
      <Button type="submit" variant="primary" size="lg" fullWidth loading={form.pending} loadingText="Signing in…" icon={<LogIn className="size-5" aria-hidden="true" />}>
        Sign in
      </Button>
    </form>
  );
}
