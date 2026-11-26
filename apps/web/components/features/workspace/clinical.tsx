'use client';

import { createRecordSchema, updateRecordSchema, type ClinicalRecord, type DiagnosisCount, type Page, type PatientProfile, type Person } from '@pmrms/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { jsonBody } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useZodForm } from '../../../lib/forms';
import { isAwaitingApproval } from '../../../lib/roles';
import { Alert, Badge, Button, ButtonLink, Card, ConfirmAction, inputClasses, PageHeader, TextField } from '../../ui';
import { ActionFeedback, DataState, Pagination, useWorkspaceAction, useWorkspaceData } from './workspace-ui';
import { RecordFiles } from './record-files';

type ClinicalRole = 'doctor' | 'patient';

export function Records({ role, patient }: { role: ClinicalRole; patient?: PatientProfile }) {
  const { state } = useAuth();
  const locked = role === 'doctor' && state.status === 'authenticated' && isAwaitingApproval(state.user);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState('');
  const path = patient ? `/patients/${patient.id}/records` : '/records';
  const records = useWorkspaceData<Page<ClinicalRecord>>(locked ? null : `${path}?page=${page}${filters}`, true);
  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => {
      if (String(value).trim()) params.set(key, String(value).trim());
    });
    setPage(1);
    setFilters(params.size ? '&' + params : '');
  }
  return (
    <div className="grid gap-5">
      <PageHeader title={patient ? patient.fullName : role === 'doctor' ? 'Medical records' : 'Medical history'}
        description={patient ? `Born ${patient.birthDate}${patient.phone ? ` · ${patient.phone}` : ''}` : undefined} />
      {patient && <ButtonLink className="justify-self-start" href="/doctor/patients">Back to assigned patients</ButtonLink>}
      {!locked && <>
        <Card>
          <form onSubmit={filter} className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <TextField label="Diagnosis" name="diagnosis" maxLength={255} />
            <TextField label="From" name="from" type="date" />
            <TextField label="To" name="to" type="date" />
            <label className="grid gap-1.5 text-sm font-semibold">Status
              <select name="status" className={inputClasses}><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select>
            </label>
            <Button type="submit">Filter</Button>
          </form>
        </Card>
        {role === 'doctor' && <ButtonLink className="justify-self-start" variant="primary" href="/doctor/records/new">Create record</ButtonLink>}
        <DataState {...records} empty={records.data?.items.length === 0 ? 'No records match these filters' : undefined}>
          <div className="grid gap-3">
            {records.data?.items.map(record => (
              <Card key={record.id} className="min-w-0 pb-5 sm:pb-6" title={<Link className="break-words text-brand-700 hover:underline" href={`/${role}/records/${record.id}`}>{record.diagnosis}</Link>}
                description={role === 'doctor' ? record.patient.fullName : record.doctor.fullName}
                action={<time dateTime={record.recordDate} className="text-sm text-muted">{record.recordDate}</time>} />
            ))}
          </div>
        </DataState>
        {records.data && <Pagination data={records.data} onChange={setPage} />}
      </>}
    </div>
  );
}

export function RecordDetail({ role, id }: { role: ClinicalRole; id: string }) {
  const { state, authRequest } = useAuth();
  const router = useRouter();
  const locked = role === 'doctor' && state.status === 'authenticated' && isAwaitingApproval(state.user);
  const detail = useWorkspaceData<ClinicalRecord>(locked ? null : `/records/${id}`, role === 'patient');
  const action = useWorkspaceAction();
  const [editing, setEditing] = useState(false);
  const record = detail.data;
  const canEdit = state.status === 'authenticated' && role === 'doctor' && record?.status === 'ACTIVE' && record.doctorId === state.user.doctorId;
  return (
    <div className="grid gap-5">
      <PageHeader title="Record details" />
      <ButtonLink className="justify-self-start" href={`/${role}/records`}>Back to records</ButtonLink>
      {!locked && <DataState {...detail}>
        {record && <Card title={record.diagnosis} action={<Badge>{record.status === 'ARCHIVED' ? 'Archived' : `Version ${record.version}`}</Badge>}>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div><dt className="font-semibold">Date</dt><dd>{record.recordDate}</dd></div>
            <div><dt className="font-semibold">Patient</dt><dd>{record.patient.fullName}</dd></div>
            <div><dt className="font-semibold">Doctor</dt><dd>{record.doctor.fullName}</dd></div>
          </dl>
          <h3 className="mt-5 text-sm font-semibold">Clinical notes</h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">{record.description || 'No notes were added.'}</p>
          {canEdit && <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={() => setEditing(value => !value)}>{editing ? 'Cancel edit' : 'Edit record'}</Button>
            <ConfirmAction label="Archive" question="Archive this record?" confirmLabel="Archive record" loading={action.busy}
              onConfirm={() => action.run(async () => {
                await authRequest(`/records/${id}/archive`, { ...jsonBody({ expectedVersion: record.version }), method: 'PATCH' });
                router.push('/doctor/records');
              }, 'Record archived.')} />
            <Button onClick={() => { setEditing(false); detail.reload(); }}>Reload record</Button>
          </div>}
        </Card>}
        <ActionFeedback {...action} />
        {record && canEdit && editing && <RecordEditor key={record.version} record={record} onSaved={() => {
          setEditing(false);
          detail.reload();
        }} />}
        {record && <RecordFiles id={id} canUpload={canEdit} />}
      </DataState>}
    </div>
  );
}

export function NewRecord() {
  const router = useRouter();
  const { state } = useAuth();
  const locked = state.status === 'authenticated' && isAwaitingApproval(state.user);
  const [page, setPage] = useState(1);
  const patients = useWorkspaceData<Page<Person>>(locked ? null : `/patients?page=${page}`, true);
  return (
    <div className="grid gap-5">
      <PageHeader title="Create medical record" />
      <ButtonLink className="justify-self-start" href="/doctor/records">Back to records</ButtonLink>
      {!locked && <DataState {...patients} empty={patients.data?.items.length === 0 ? 'No assigned patients are available' : undefined}>
        {patients.data && <RecordEditor patients={patients.data} changePage={setPage} onSaved={record => router.push(`/doctor/records/${record.id}`)} />}
      </DataState>}
    </div>
  );
}

function RecordEditor({ record, patients, changePage, onSaved }: {
  record?: ClinicalRecord; patients?: Page<Person>; changePage?: (page: number) => void; onSaved: (record: ClinicalRecord) => void;
}) {
  const { authRequest } = useAuth();
  const form = useZodForm({
    schema: record ? updateRecordSchema : createRecordSchema,
    read: fields => ({
      diagnosis: fields.get('diagnosis'), recordDate: fields.get('recordDate'), description: fields.get('description') || null,
      ...(record ? { expectedVersion: record.version } : { patientId: fields.get('patientId') }),
    }),
    submit: values => authRequest<ClinicalRecord>(record ? `/records/${record.id}` : '/records',
      { ...jsonBody(values), method: record ? 'PATCH' : 'POST' }),
    onSuccess: onSaved,
  });
  return (
    <Card title={record ? 'Edit record' : undefined}>
      <form onSubmit={form.onSubmit} className="grid gap-4" noValidate>
        {form.formError && <Alert tone="error">{form.formError}</Alert>}
        {patients && <label className="grid gap-1.5 text-sm font-semibold">Patient
          <select required name="patientId" className={inputClasses} defaultValue="" aria-invalid={Boolean(form.errors.patientId)}>
            <option value="" disabled>Select an assigned patient</option>
            {patients.items.map(patient => <option key={patient.id} value={patient.id}>{patient.fullName}</option>)}
          </select>
          {form.errors.patientId && <span role="alert" className="text-xs text-danger-600">{form.errors.patientId}</span>}
        </label>}
        {patients && changePage && <Pagination data={patients} onChange={changePage} />}
        <TextField label="Diagnosis" name="diagnosis" required maxLength={255} defaultValue={record?.diagnosis} error={form.errors.diagnosis} />
        <TextField label="Record date" name="recordDate" type="date" required defaultValue={record?.recordDate} error={form.errors.recordDate} />
        <label className="grid gap-1.5 text-sm font-semibold">Clinical notes
          <textarea name="description" defaultValue={record?.description ?? ''} maxLength={10000} rows={5}
            aria-invalid={Boolean(form.errors.description)}
            className="w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-base text-ink focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/15" />
          {form.errors.description && <span role="alert" className="text-xs text-danger-600">{form.errors.description}</span>}
        </label>
        <Button className="justify-self-start" type="submit" variant="primary" loading={form.pending}>Save record</Button>
      </form>
    </Card>
  );
}

export function AssignedPatients() {
  const { state } = useAuth();
  const locked = state.status === 'authenticated' && isAwaitingApproval(state.user);
  const [page, setPage] = useState(1);
  const patients = useWorkspaceData<Page<Person>>(locked ? null : `/patients?page=${page}`, true);
  return <div className="grid gap-5">
    <PageHeader title="Assigned patients" />
    {!locked && <DataState {...patients} empty={patients.data?.items.length === 0 ? 'No patients assigned' : undefined}>
      <div className="grid gap-3">{patients.data?.items.map(patient => (
        <Card key={patient.id} className="pb-5 sm:pb-6" title={patient.fullName}
          action={<ButtonLink href={`/doctor/patients/${patient.id}`}>View history</ButtonLink>} />
      ))}</div>
    </DataState>}
    {patients.data && <Pagination data={patients.data} onChange={setPage} />}
  </div>;
}

export function AssignedPatientHistory({ id }: { id: string }) {
  const { state } = useAuth();
  const locked = state.status === 'authenticated' && isAwaitingApproval(state.user);
  const profile = useWorkspaceData<PatientProfile>(locked ? null : `/patients/${id}`);
  return <DataState {...profile}>
    {profile.data && <Records role="doctor" patient={profile.data} />}
  </DataState>;
}

export function DiagnosisAnalytics() {
  const { state } = useAuth();
  const locked = state.status === 'authenticated' && isAwaitingApproval(state.user);
  const counts = useWorkspaceData<DiagnosisCount[]>(locked ? null : '/analytics/diagnoses');
  const max = counts.data?.[0]?.count ?? 1;
  return <div className="grid gap-5">
    <PageHeader title="Diagnosis counts" description="Active records for your current patient assignments." />
    {!locked && <DataState {...counts} empty={counts.data?.length === 0 ? 'No diagnoses to summarize' : undefined}>
      <Card><ul className="grid gap-4">{counts.data?.map(row => (
        <li key={row.diagnosis}>
          <div className="flex justify-between gap-4 text-sm"><span className="min-w-0 break-words">{row.diagnosis}</span><strong>{row.count}</strong></div>
          <progress aria-hidden="true" className="mt-2 h-2 w-full accent-brand-600" value={row.count} max={max} />
        </li>
      ))}</ul></Card>
    </DataState>}
  </div>;
}
