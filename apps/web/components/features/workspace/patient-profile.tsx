'use client';

import { patientProfileSchema, type PatientProfile } from '@pmrms/contracts';
import { useAuth } from '../../../lib/auth';
import { jsonBody } from '../../../lib/api';
import { useZodForm } from '../../../lib/forms';
import { Alert, Button, Card, FieldRow, TextField } from '../../ui';
import { DataState, useWorkspaceData } from './workspace-ui';
import { useState } from 'react';

export function PatientProfileCard() {
  const profile = useWorkspaceData<PatientProfile>('/patients/me');
  return <Card title="Patient profile" className="mt-4 sm:mt-6">
    <DataState {...profile}>
      {profile.data && <ProfileForm profile={profile.data} />}
    </DataState>
  </Card>;
}

function ProfileForm({ profile }: { profile: PatientProfile }) {
  const { authRequest, reloadUser } = useAuth();
  const [saved, setSaved] = useState(false);
  const form = useZodForm({
    schema: patientProfileSchema,
    read: fields => ({ fullName: fields.get('fullName'), birthDate: fields.get('birthDate'), phone: fields.get('phone') || null }),
    submit: values => {
      setSaved(false);
      return authRequest<PatientProfile>('/patients/me', { ...jsonBody(values), method: 'PATCH' });
    },
    onSuccess: () => {
      setSaved(true);
      void reloadUser().catch(() => undefined);
    },
  });
  return <form className="grid gap-4" onSubmit={form.onSubmit} noValidate>
    {form.formError && <Alert tone="error">{form.formError}</Alert>}
    {saved && !form.formError && <Alert tone="success">Profile saved.</Alert>}
    <TextField label="Full name" name="fullName" autoComplete="name" defaultValue={profile.fullName} required error={form.errors.fullName} />
    <FieldRow>
      <TextField label="Date of birth" type="date" name="birthDate" defaultValue={profile.birthDate} required error={form.errors.birthDate} />
      <TextField label="Phone" type="tel" name="phone" autoComplete="tel" defaultValue={profile.phone ?? ''} error={form.errors.phone} />
    </FieldRow>
    <Button className="justify-self-start" type="submit" variant="primary" loading={form.pending}>Save profile</Button>
  </form>;
}
