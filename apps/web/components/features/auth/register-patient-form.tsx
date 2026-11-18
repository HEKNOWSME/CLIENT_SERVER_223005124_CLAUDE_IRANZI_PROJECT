'use client';

import { registerPatientRequestSchema } from '@pmrms/contracts';
import { UserPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth';
import { confirmPassword, optional, PASSWORD_HINT, useZodForm } from '../../../lib/forms';
import { HOME_BY_ROLE } from '../../../lib/roles';
import { Alert, Button, FieldRow, PasswordField, TextField } from '../../ui';

export function RegisterPatientForm() {
  const { registerPatient } = useAuth();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const form = useZodForm({
    schema: registerPatientRequestSchema,
    read: data => ({
      fullName: data.get('fullName'),
      email: data.get('email'),
      password: data.get('password'),
      birthDate: data.get('birthDate'),
      phone: optional(data.get('phone')),
    }),
    validate: confirmPassword,
    submit: registerPatient,
    onSuccess: user => router.replace(HOME_BY_ROLE[user.role]),
  });

  return (
    <form onSubmit={form.onSubmit} noValidate className="grid gap-5">
      {form.formError ? <Alert tone="error">{form.formError}</Alert> : null}
      <TextField label="Full name" name="fullName" autoComplete="name" required error={form.errors.fullName} />
      <TextField label="Email" name="email" type="email" autoComplete="email" inputMode="email" required error={form.errors.email} />
      <FieldRow>
        <TextField label="Date of birth" name="birthDate" type="date" min="1900-01-01" max={today} required error={form.errors.birthDate} />
        <TextField label="Phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" hint="Optional" error={form.errors.phone} />
      </FieldRow>
      <FieldRow>
        <PasswordField label="Password" name="password" autoComplete="new-password" required hint={PASSWORD_HINT} error={form.errors.password} />
        <PasswordField label="Confirm password" name="confirmPassword" autoComplete="new-password" required error={form.errors.confirmPassword} />
      </FieldRow>
      <Button type="submit" variant="primary" size="lg" fullWidth loading={form.pending} loadingText="Creating account…" icon={<UserPlus className="size-5" aria-hidden="true" />}>
        Create patient account
      </Button>
    </form>
  );
}
