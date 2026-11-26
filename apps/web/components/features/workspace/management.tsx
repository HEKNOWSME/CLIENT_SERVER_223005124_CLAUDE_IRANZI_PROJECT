'use client';

import type { Assignment, AuditRow, DoctorApplication, InboxItem, Page, Person, WorkspaceAccount } from '@pmrms/contracts';
import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { jsonBody } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { titleCase } from '../../../lib/roles';
import { Badge, Button, Card, ConfirmAction, DataTable, PageHeader, SearchSelect } from '../../ui';
import { ActionFeedback, DataState, Pagination, useWorkspaceAction, useWorkspaceData } from './workspace-ui';

function matches(query: string, ...parts: string[]) {
  const needle = query.trim().toLowerCase();
  return !needle || parts.join(' ').toLowerCase().includes(needle);
}

export function Users() {
  const { state, authRequest } = useAuth();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const users = useWorkspaceData<Page<WorkspaceAccount>>(`/admin/users?page=${page}`);
  const action = useWorkspaceAction();
  const self = state.status === 'authenticated' ? state.user.id : null;
  const rows = (users.data?.items ?? []).filter(user => matches(query, user.name, user.email, user.role, user.status));
  return <div className="grid gap-5">
    <PageHeader title="User accounts" description="Suspend or restore access. You cannot change your own account here." />
    <ActionFeedback {...action} />
    <form className="max-w-md" onSubmit={event => event.preventDefault()}><label className="grid gap-1.5 text-sm font-semibold">Search this page
      <input className="h-12 rounded-lg border border-line px-3.5 text-base sm:h-11 sm:text-[15px]" value={query} onChange={event => setQuery(event.target.value)} />
    </label></form>
    <DataState {...users} empty={rows.length === 0 ? 'No user accounts match.' : undefined}>
      {users.data ? <DataTable rows={rows} columns={[
        { key: 'name', header: 'Name', cell: user => user.name },
        { key: 'email', header: 'Email', cell: user => <span className="break-all">{user.email}</span> },
        { key: 'role', header: 'Role', cell: user => titleCase(user.role) },
        { key: 'status', header: 'Status', cell: user => <Badge tone={user.status === 'SUSPENDED' ? 'danger' : user.status === 'PENDING' ? 'warning' : 'success'}>{titleCase(user.status)}</Badge> },
        { key: 'action', header: 'Action', cell: user => {
          if (user.id === self || user.status === 'PENDING') return <span className="text-muted">—</span>;
          const next = user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
          const label = next === 'ACTIVE' ? 'Reactivate' : 'Suspend';
          return <ConfirmAction label={label} question={`${label} this account?`} confirmLabel={label} loading={action.busy}
            onConfirm={() => action.run(async () => {
              await authRequest(`/admin/users/${user.id}/status`, { ...jsonBody({ status: next }), method: 'PATCH' });
              users.reload();
            }, 'Account updated.')} />;
        } },
      ]} /> : null}
    </DataState>
    {users.data ? <Pagination data={users.data} onChange={setPage} /> : null}
  </div>;
}

export function DoctorApprovals() {
  const { authRequest } = useAuth();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const applications = useWorkspaceData<Page<DoctorApplication>>(`/admin/doctors/pending?page=${page}`);
  const action = useWorkspaceAction();
  const rows = (applications.data?.items ?? []).filter(row => matches(query, row.fullName, row.user.email, row.specialty));
  return <div className="grid gap-5">
    <PageHeader title="Doctor applications" description="Approve before a doctor can see assigned patients." />
    <ActionFeedback {...action} />
    <form className="max-w-md" onSubmit={event => event.preventDefault()}><label className="grid gap-1.5 text-sm font-semibold">Search this page
      <input className="h-12 rounded-lg border border-line px-3.5 text-base sm:h-11 sm:text-[15px]" value={query} onChange={event => setQuery(event.target.value)} />
    </label></form>
    <DataState {...applications} empty={rows.length === 0 ? 'No pending applications.' : undefined}>
      {applications.data ? <DataTable rows={rows} columns={[
        { key: 'name', header: 'Doctor', cell: row => row.fullName },
        { key: 'email', header: 'Email', cell: row => <span className="break-all">{row.user.email}</span> },
        { key: 'spec', header: 'Specialty', cell: row => row.specialty },
        { key: 'license', header: 'License', cell: row => row.licenseNumber ?? '—' },
        { key: 'action', header: 'Decision', cell: row => <div className="flex flex-wrap gap-2">{(['APPROVE', 'REJECT'] as const).map(decision => {
          const label = titleCase(decision);
          return <ConfirmAction key={decision} label={label} question={`${label} this application?`} confirmLabel={label}
            variant={decision === 'APPROVE' ? 'secondary' : 'danger-outline'} loading={action.busy}
            onConfirm={() => action.run(async () => {
              await authRequest(`/admin/doctors/${row.id}/approval`, { ...jsonBody({ decision }), method: 'PATCH' });
              applications.reload();
            }, 'Application reviewed.')} />;
        })}</div> },
      ]} /> : null}
    </DataState>
    {applications.data ? <Pagination data={applications.data} onChange={setPage} /> : null}
  </div>;
}

export function Assignments() {
  const { authRequest } = useAuth();
  const [page, setPage] = useState(1);
  const [optionPage, setOptionPage] = useState(1);
  const [query, setQuery] = useState('');
  const assignments = useWorkspaceData<Page<Assignment>>(`/admin/assignments?page=${page}`);
  const options = useWorkspaceData<Record<'doctors' | 'patients', Page<Person>>>(`/admin/assignment-options?page=${optionPage}`);
  const action = useWorkspaceAction();
  const [doctorId, setDoctorId] = useState('');
  const [patientId, setPatientId] = useState('');
  const rows = (assignments.data?.items ?? []).filter(row => matches(query, row.patient.fullName, row.doctor.fullName, row.status));

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!doctorId || !patientId) return;
    void action.run(async () => {
      await authRequest('/admin/assignments', jsonBody({ doctorId, patientId }));
      setDoctorId('');
      setPatientId('');
      if (page === 1) assignments.reload();
      else setPage(1);
    }, 'Assignment created.');
  }

  return <div className="grid gap-5">
    <PageHeader title="Care assignments" description="A doctor only sees a patient while this link is active." />
    <ActionFeedback {...action} />
    <Card title="Assign a doctor">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 md:grid-cols-2">
          <SearchSelect label="Doctor" value={doctorId} onChange={setDoctorId} options={(options.data?.doctors.items ?? []).map(item => ({ id: item.id, label: item.fullName }))} />
          <SearchSelect label="Patient" value={patientId} onChange={setPatientId} options={(options.data?.patients.items ?? []).map(item => ({ id: item.id, label: item.fullName }))} />
        </div>
        {options.data?.doctors ? <Pagination data={options.data.doctors} onChange={setOptionPage} /> : null}
        <Button type="submit" variant="primary" className="justify-self-start" disabled={!doctorId || !patientId} loading={action.busy}>Create assignment</Button>
      </form>
    </Card>
    <form className="max-w-md" onSubmit={event => event.preventDefault()}><label className="grid gap-1.5 text-sm font-semibold">Search this page
      <input className="h-12 rounded-lg border border-line px-3.5 text-base sm:h-11 sm:text-[15px]" value={query} onChange={event => setQuery(event.target.value)} />
    </label></form>
    <DataState {...assignments} empty={rows.length === 0 ? 'No assignments.' : undefined}>
      {assignments.data ? <DataTable rows={rows} columns={[
        { key: 'patient', header: 'Patient', cell: row => row.patient.fullName },
        { key: 'doctor', header: 'Doctor', cell: row => row.doctor.fullName },
        { key: 'when', header: 'Assigned', cell: row => new Date(row.assignedAt).toLocaleDateString() },
        { key: 'status', header: 'Status', cell: row => <Badge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>{titleCase(row.status)}</Badge> },
        { key: 'action', header: 'Action', cell: row => row.status === 'ACTIVE' ? <ConfirmAction label="Revoke" question="This doctor will lose access to this patient’s records." confirmLabel="Revoke assignment" loading={action.busy} onConfirm={() => action.run(async () => {
          await authRequest(`/admin/assignments/${row.id}/revoke`, { method: 'PATCH' });
          assignments.reload();
        }, 'Assignment revoked.')} /> : <span className="text-muted">—</span> },
      ]} /> : null}
    </DataState>
    {assignments.data ? <Pagination data={assignments.data} onChange={setPage} /> : null}
  </div>;
}

export function AuditLogs() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const logs = useWorkspaceData<Page<AuditRow>>(`/admin/audit-logs?page=${page}`);
  const rows = (logs.data?.items ?? []).filter(row => matches(query, row.action, row.outcome, row.reasonCode ?? '', row.resourceType));
  return <div className="grid gap-5">
    <PageHeader title="Audit logs" description="Security and access events. Clinical note text is not stored here." />
    <form className="max-w-md" onSubmit={event => event.preventDefault()}><label className="grid gap-1.5 text-sm font-semibold">Search this page
      <input className="h-12 rounded-lg border border-line px-3.5 text-base sm:h-11 sm:text-[15px]" value={query} onChange={event => setQuery(event.target.value)} />
    </label></form>
    <DataState {...logs} empty={rows.length === 0 ? 'No audit entries.' : undefined}>
      {logs.data ? <DataTable rows={rows} columns={[
        { key: 'when', header: 'When', cell: row => new Date(row.createdAt).toLocaleString() },
        { key: 'action', header: 'Action', cell: row => row.action.replaceAll('_', ' ') },
        { key: 'resource', header: 'Resource', cell: row => row.resourceType },
        { key: 'outcome', header: 'Outcome', cell: row => <Badge tone={row.outcome === 'SUCCESS' ? 'success' : row.outcome === 'DENIED' ? 'warning' : 'danger'}>{titleCase(row.outcome)}</Badge> },
        { key: 'reason', header: 'Reason', cell: row => row.reasonCode ?? '—' },
      ]} /> : null}
    </DataState>
    {logs.data ? <Pagination data={logs.data} onChange={setPage} /> : null}
  </div>;
}

export function Notifications() {
  const { state, authRequest } = useAuth();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const inbox = useWorkspaceData<Page<InboxItem>>(`/notifications?page=${page}`, true);
  const action = useWorkspaceAction();
  const role = state.status === 'authenticated' ? state.user.role : 'PATIENT';
  const rows = useMemo(() => (inbox.data?.items ?? []).filter(row => !unreadOnly || !row.readAt), [inbox.data, unreadOnly]);

  function target(row: InboxItem) {
    if (!row.relatedResourceId || role === 'ADMIN') return null;
    if (row.kind === 'RECORD_CREATED' || row.kind === 'RECORD_UPDATED') return `/${role.toLowerCase()}/records/${row.relatedResourceId}`;
    return null;
  }

  return <div className="grid gap-5">
    <PageHeader title="Notifications" description="The sidebar count updates about every 30 seconds, and immediately when a live event arrives."
      actions={<Button variant="secondary" loading={action.busy} onClick={() => void action.run(async () => {
        await authRequest('/notifications/read-all', { method: 'POST' });
        inbox.reload();
        window.dispatchEvent(new Event('pmrms:workspace-changed'));
      }, 'All notifications marked as read.')}>Mark all read</Button>} />
    <div className="flex gap-2">
      <Button variant={unreadOnly ? 'secondary' : 'primary'} onClick={() => setUnreadOnly(false)}>All</Button>
      <Button variant={unreadOnly ? 'primary' : 'secondary'} onClick={() => setUnreadOnly(true)}>Unread</Button>
    </div>
    <ActionFeedback {...action} />
    <DataState {...inbox} empty={rows.length === 0 ? 'No notifications.' : undefined}>
      {inbox.data ? <DataTable rows={rows} columns={[
        { key: 'title', header: 'Message', cell: row => {
          const href = target(row);
          return href ? <Link className="font-semibold text-brand-700 hover:underline" href={href}>{row.title}</Link> : <span className={row.readAt ? '' : 'font-semibold'}>{row.title}</span>;
        } },
        { key: 'when', header: 'When', cell: row => new Date(row.createdAt).toLocaleString() },
        { key: 'state', header: 'State', cell: row => row.readAt ? <Badge>Read</Badge> : <Badge tone="brand" dot>Unread</Badge> },
        { key: 'action', header: 'Action', cell: row => row.readAt ? <span className="text-muted">—</span> : <Button loading={action.busy} onClick={() => void action.run(async () => {
          await authRequest(`/notifications/${row.id}/read`, { method: 'PATCH' });
          inbox.reload();
          window.dispatchEvent(new Event('pmrms:workspace-changed'));
        }, 'Notification marked as read.')}>Mark read</Button> },
      ]} /> : null}
    </DataState>
    {inbox.data ? <Pagination data={inbox.data} onChange={setPage} /> : null}
  </div>;
}
