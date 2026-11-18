'use client';

import { registerDoctorRequestSchema } from '@pmrms/contracts';
import { Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth';
import { confirmPassword, optional, PASSWORD_HINT, useZodForm } from '../../../lib/forms';
import { HOME_BY_ROLE } from '../../../lib/roles';
import { Alert, Button, FieldRow, PasswordField, TextField } from '../../ui';

export function DoctorApplyForm() {
  const { registerDoctor } = useAuth();
  const router = useRouter();
  const form = useZodForm({
    schema: registerDoctorRequestSchema,
    read: data => ({
      fullName: data.get('fullName'),
      email: data.get('email'),
      password: data.get('password'),
      specialty: data.get('specialty'),
      licenseNumber: optional(data.get('licenseNumber')),
    }),
    validate: confirmPassword,
    submit: registerDoctor,
    onSuccess: user => router.replace(HOME_BY_ROLE[user.role]),
  });

  return (
    <form onSubmit={form.onSubmit} noValidate className="grid gap-5">
      {form.formError ? <Alert tone="error">{form.formError}</Alert> : null}
      <TextField label="Full name" name="fullName" autoComplete="name" required error={form.errors.fullName} />
      <TextField label="Work email" name="email" type="email" autoComplete="email" inputMode="email" required error={form.errors.email} />
      <FieldRow>
        <TextField label="Specialty" name="specialty" placeholder="e.g. Cardiology" required error={form.errors.specialty} />
        <TextField label="License number" name="licenseNumber" hint="Optional, speeds up review" error={form.errors.licenseNumber} />
      </FieldRow>
      <FieldRow>
        <PasswordField label="Password" name="password" autoComplete="new-password" required hint={PASSWORD_HINT} error={form.errors.password} />
        <PasswordField label="Confirm password" name="confirmPassword" autoComplete="new-password" required error={form.errors.confirmPassword} />
      </FieldRow>
      <Button type="submit" variant="primary" size="lg" fullWidth loading={form.pending} loadingText="Submitting…" icon={<Send className="size-5" aria-hidden="true" />}>
        Submit application
      </Button>
    </form>
  );
}
