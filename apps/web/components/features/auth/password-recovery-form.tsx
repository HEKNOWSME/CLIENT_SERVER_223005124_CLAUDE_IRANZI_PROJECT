'use client';

import { forgotPasswordRequestSchema, resetPasswordRequestSchema } from '@pmrms/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest, jsonBody } from '../../../lib/api';
import { confirmPassword, PASSWORD_HINT, useZodForm } from '../../../lib/forms';
import { Alert, Button, PasswordField, TextField } from '../../ui';

export function PasswordRecoveryForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [codeRequested, setCodeRequested] = useState(false);
  const request = useZodForm({
    schema: forgotPasswordRequestSchema,
    read: data => ({ email: data.get('email') }),
    submit: async input => {
      await apiRequest<void>('/auth/forgot-password', jsonBody(input));
      return input.email;
    },
    onSuccess: address => {
      setEmail(address);
      setCodeRequested(true);
    },
  });
  const reset = useZodForm({
    schema: resetPasswordRequestSchema,
    read: data => ({ email, code: data.get('code'), password: data.get('password') }),
    validate: confirmPassword,
    submit: input => apiRequest<void>('/auth/reset-password', jsonBody(input)),
    onSuccess: () => router.replace('/login?passwordReset=1'),
  });

  if (codeRequested) {
    return (
      <form key="reset" onSubmit={reset.onSubmit} noValidate className="grid gap-5">
        <Alert tone="info">If <strong className="break-all">{email}</strong> can be used to reset a password, you’ll receive a 6-digit code.</Alert>
        {reset.formError ? <Alert tone="error">{reset.formError}</Alert> : null}
        <TextField label="Reset code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required error={reset.errors.code} />
        <PasswordField label="New password" name="password" autoComplete="new-password" required hint={PASSWORD_HINT} error={reset.errors.password} />
        <PasswordField label="Confirm new password" name="confirmPassword" autoComplete="new-password" required error={reset.errors.confirmPassword} />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={reset.pending}>Reset password</Button>
        <Button type="button" variant="ghost" fullWidth disabled={reset.pending} onClick={() => setCodeRequested(false)}>
          Request another code or change email
        </Button>
      </form>
    );
  }

  return (
    <form key="request" onSubmit={request.onSubmit} noValidate className="grid gap-5">
      {request.formError ? <Alert tone="error">{request.formError}</Alert> : null}
      <TextField label="Account email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={email} required error={request.errors.email} />
      <Button type="submit" variant="primary" size="lg" fullWidth loading={request.pending}>Send reset code</Button>
    </form>
  );
}
