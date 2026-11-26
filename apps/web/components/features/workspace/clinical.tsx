'use client';

import { createRecordSchema, updateRecordSchema, type ClinicalRecord, type DiagnosisCount, type Page, type PatientProfile, type Person } from '@pmrms/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { jsonBody } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useZodForm } from '../../../lib/forms';
import { isAwaitingApproval } from '../../../lib/roles';
import { Alert, Badge, Button, ButtonLink, Card, ConfirmAction, DataTable, FilterBar, PageHeader, SearchSelect, TextField, Timeline } from '../../ui';
import { inputClasses } from '../../ui/field';
import { RecordFiles } from './record-files';
import { ActionFeedback, DataState, Pagination, useWorkspaceAction, useWorkspaceData } from './workspace-ui';

type ClinicalRole = 'doctor' | 'patient';

function LockedClinical() {
  return <Alert tone="warning" title="Clinical tools are locked.">They open after an administrator approves your doctor account.</Alert>;
}

export function Records({ role, patient }: { role: ClinicalRole; patient?: PatientProfile }) {
  const { state } = useAuth();
  const locked = role === 'doctor' && state.status === 'authenticated' && isAwaitingApproval(state.user);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState('');
  const [view, setView] = useState<'timeline' | 'table'>(role === 'patient' && !patient ? 'timeline' : 'table');
  const path = patient ? `/patients/${patient.id}/records` : '/records';
  const records = useWorkspaceData<Page<ClinicalRecord>>(locked ? null : `${path}?page=${page}${filters}`, true);

  function filter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    new FormData(event.currentTarget).forEach((value, key) => {
      const text = String(value).trim();
      if (text && text !== 'ALL') params.set(key, text);
    });
    setPage(1);
    setFilters(params.size ? '&' + params : '');
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title={patient ? patient.fullName : role === 'doctor' ? 'Medical records' : 'Medical history'}
        description={patient ? `Born ${patient.birthDate}${patient.phone ? ` · ${patient.phone}` : ''}` : 'Filter, open, and follow each visit.'}
        actions={role === 'doctor' && !locked ? <ButtonLink variant="primary" href={patient ? `/doctor/records/new?patient=${patient.id}` : '/doctor/records/new'}>Create record</ButtonLink> : undefined}
      />
      {patient ? <ButtonLink className="justify-self-start" href="/doctor/patients">Back to assigned patients</ButtonLink> : null}
      {locked ? <LockedClinical /> : null}
      {!locked && <>
        <FilterBar onSubmit={filter} onClear={() => { setFilters(''); setPage(1); }}>
          <TextField label="Diagnosis" name="diagnosis" maxLength={255} />
          <TextField label="From" name="from" type="date" />
          <TextField label="To" name="to" type="date" />
          <label className="grid gap-1.5 text-sm font-semibold">Status
            <select name="status" className={inputClasses} defaultValue="ACTIVE">
              <option value="ALL">All</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
        </FilterBar>
        {role === 'patient' ? (
          <div className="flex gap-2">
            <Button variant={view === 'timeline' ? 'primary' : 'secondary'} onClick={() => setView('timeline')}>Timeline</Button>
            <Button variant={view === 'table' ? 'primary' : 'secondary'} onClick={() => setView('table')}>Table</Button>
          </div>
        ) : null}
        <DataState {...records} empty={records.data?.items.length === 0 ? 'No records match these filters.' : undefined}>
          {view === 'timeline' && records.data ? (
            <Timeline items={records.data.items.map(record => ({
              id: record.id,
              date: record.recordDate,
              title: <Link className="text-brand-700 hover:underline" href={`/${role}/records/${record.id}`}>{record.diagnosis}</Link>,
              meta: role === 'doctor' ? record.patient.fullName : record.doctor.fullName,
              body: <p className="mt-1 line-clamp-2 text-sm text-muted">{record.description || 'No notes.'}</p>,
            }))} />
          ) : records.data ? (
            <DataTable rows={records.data.items} columns={[
              { key: 'dx', header: 'Diagnosis', cell: row => <Link className="font-semibold text-brand-700 hover:underline" href={`/${role}/records/${row.id}`}>{row.diagnosis}</Link> },
              { key: 'who', header: role === 'doctor' ? 'Patient' : 'Doctor', cell: row => role === 'doctor' ? row.patient.fullName : row.doctor.fullName },
              { key: 'date', header: 'Date', cell: row => row.recordDate },
              { key: 'status', header: 'Status', cell: row => <Badge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>{row.status === 'ACTIVE' ? 'Active' : 'Archived'}</Badge> },
            ]} />
          ) : null}
        </DataState>
        {records.data ? <Pagination data={records.data} onChange={setPage} /> : null}
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
      <PageHeader title={record?.diagnosis ?? 'Record details'} description={record ? `${record.recordDate} · version ${record.version}` : undefined}
        actions={record ? <Badge tone={record.status === 'ACTIVE' ? 'success' : 'neutral'}>{record.status === 'ACTIVE' ? 'Active' : 'Archived'}</Badge> : undefined} />
      <ButtonLink className="justify-self-start" href={`/${role}/records`}>Back to records</ButtonLink>
      {locked ? <LockedClinical /> : null}
      {!locked && <DataState {...detail}>
        {record ? (
          <Card title="Visit" description={`${record.patient.fullName} · ${record.doctor.fullName}`}>
            <h3 className="text-sm font-semibold">Clinical notes</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{record.description || 'No notes were added.'}</p>
            {canEdit ? <div className="mt-5 flex flex-wrap gap-3">
              <Button onClick={() => setEditing(value => !value)}>{editing ? 'Cancel edit' : 'Edit record'}</Button>
              <ConfirmAction label="Archive" question="Archive this record?" confirmLabel="Archive record" loading={action.busy}
                onConfirm={() => action.run(async () => {
                  await authRequest(`/records/${id}/archive`, { ...jsonBody({ expectedVersion: record.version }), method: 'PATCH' });
                  router.push('/doctor/records');
                }, 'Record archived.')} />
            </div> : null}
          </Card>
        ) : null}
        <ActionFeedback {...action} />
        {record && canEdit && editing ? <RecordEditor key={record.version} record={record} onSaved={() => { setEditing(false); detail.reload(); }} /> : null}
        {record ? <RecordFiles id={id} canUpload={canEdit} /> : null}
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
      <PageHeader title="Create medical record" description="Only patients assigned to you can be selected." />
      <ButtonLink className="justify-self-start" href="/doctor/records">Back to records</ButtonLink>
      {locked ? <LockedClinical /> : null}
      {!locked && <DataState {...patients} empty={patients.data?.items.length === 0 ? 'No assigned patients are available.' : undefined}>
        {patients.data ? <RecordEditor patients={patients.data} changePage={setPage} onSaved={record => router.push(`/doctor/records/${record.id}`)} /> : null}
      </DataState>}
    </div>
  );
}

function RecordEditor({ record, patients, changePage, onSaved }: {
  record?: ClinicalRecord; patients?: Page<Person>; changePage?: (page: number) => void; onSaved: (record: ClinicalRecord) => void;
}) {
  const { authRequest } = useAuth();
  const [patientId, setPatientId] = useState('');
  const form = useZodForm({
    schema: record ? updateRecordSchema : createRecordSchema,
    read: fields => ({
      diagnosis: fields.get('diagnosis'), recordDate: fields.get('recordDate'), description: fields.get('description') || null,
      ...(record ? { expectedVersion: record.version } : { patientId }),
    }),
    submit: values => authRequest<ClinicalRecord>(record ? `/records/${record.id}` : '/records', { ...jsonBody(values), method: record ? 'PATCH' : 'POST' }),
    onSuccess: onSaved,
  });
  return (
    <Card title={record ? 'Correct this record' : 'New record'}>
      <form onSubmit={form.onSubmit} className="grid gap-4" noValidate>
        {form.formError ? <Alert tone="error">{form.formError}</Alert> : null}
        {patients ? <SearchSelect label="Patient" value={patientId} onChange={setPatientId} options={patients.items.map(item => ({ id: item.id, label: item.fullName }))} /> : null}
        {form.errors.patientId ? <span role="alert" className="text-xs text-danger-600">{form.errors.patientId}</span> : null}
        {patients && changePage ? <Pagination data={patients} onChange={changePage} /> : null}
        <TextField label="Diagnosis" name="diagnosis" required maxLength={255} defaultValue={record?.diagnosis} error={form.errors.diagnosis} />
        <TextField label="Record date" name="recordDate" type="date" required defaultValue={record?.recordDate} error={form.errors.recordDate} />
        <label className="grid gap-1.5 text-sm font-semibold">Clinical notes
          <textarea name="description" defaultValue={record?.description ?? ''} maxLength={10000} rows={6}
            className="w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-base text-ink focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/15" />
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
  const [query, setQuery] = useState('');
  const patients = useWorkspaceData<Page<Person>>(locked ? null : `/patients?page=${page}`, true);
  const rows = (patients.data?.items ?? []).filter(patient => patient.fullName.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="grid gap-5">
    <PageHeader title="Assigned patients" description="Open a history only for patients currently assigned to you." />
    {locked ? <LockedClinical /> : null}
    {!locked && <>
      <TextField label="Search this page" value={query} onChange={event => setQuery(event.target.value)} />
      <DataState {...patients} empty={rows.length === 0 ? 'No patients assigned.' : undefined}>
        {patients.data ? <DataTable rows={rows} columns={[
          { key: 'name', header: 'Patient', cell: row => row.fullName },
          { key: 'open', header: 'History', cell: row => <ButtonLink href={`/doctor/patients/${row.id}`}>Open history</ButtonLink> },
        ]} /> : null}
      </DataState>
      {patients.data ? <Pagination data={patients.data} onChange={setPage} /> : null}
    </>}
  </div>;
}

export function AssignedPatientHistory({ id }: { id: string }) {
  const { state } = useAuth();
  const locked = state.status === 'authenticated' && isAwaitingApproval(state.user);
  const profile = useWorkspaceData<PatientProfile>(locked ? null : `/patients/${id}`);
  if (locked) return <LockedClinical />;
  return <DataState {...profile}>{profile.data ? <Records role="doctor" patient={profile.data} /> : null}</DataState>;
}

export function DiagnosisAnalytics() {
  const { state } = useAuth();
  const locked = state.status === 'authenticated' && isAwaitingApproval(state.user);
  const counts = useWorkspaceData<DiagnosisCount[]>(locked ? null : '/analytics/diagnoses');
  const max = Math.max(1, ...(counts.data?.map(row => row.count) ?? [1]));
  const total = counts.data?.reduce((sum, row) => sum + row.count, 0) ?? 0;
  return <div className="grid gap-5">
    <PageHeader title="Diagnosis mix" description={`${total} active records across your current assignments.`} />
    {locked ? <LockedClinical /> : null}
    {!locked && <DataState {...counts} empty={counts.data?.length === 0 ? 'Not enough records to display.' : undefined}>
      <ul className="grid gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
        {counts.data?.map(row => (
          <li key={row.diagnosis}>
            <div className="mb-2 flex justify-between gap-4 text-sm"><span className="min-w-0 break-words font-medium">{row.diagnosis}</span><strong>{row.count}</strong></div>
            <div className="h-2 overflow-hidden rounded-full bg-brand-50"><div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.round((row.count / max) * 100)}%` }} /></div>
          </li>
        ))}
      </ul>
    </DataState>}
  </div>;
}
