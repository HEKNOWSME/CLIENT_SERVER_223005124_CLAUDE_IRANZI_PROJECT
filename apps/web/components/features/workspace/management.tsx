'use client';

import type { Assignment, AuditRow, DoctorApplication, InboxItem, Page, Person, WorkspaceAccount } from '@pmrms/contracts';
import { useState, type FormEvent, type ReactNode } from 'react';
import { jsonBody } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { titleCase } from '../../../lib/roles';
import { Badge, Button, Card, ConfirmAction, inputClasses, PageHeader } from '../../ui';
import { ActionFeedback, DataState, Pagination, useWorkspaceAction, useWorkspaceData } from './workspace-ui';

function ListCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <Card title={title} action={action}><div className="text-sm text-muted">{children}</div></Card>;
}

export function Users() {
  const { state, authRequest } = useAuth();
  const [page, setPage] = useState(1);
  const users = useWorkspaceData<Page<WorkspaceAccount>>(`/admin/users?page=${page}`);
  const action = useWorkspaceAction();
  const self = state.status === 'authenticated' ? state.user.id : null;
  return <div className="grid gap-5">
    <PageHeader title="User accounts" />
    <ActionFeedback {...action} />
    <DataState {...users} empty={users.data?.items.length === 0 ? 'No user accounts' : undefined}>
      <div className="grid gap-3">{users.data?.items.map(user => {
        const next = user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
        const label = next === 'ACTIVE' ? 'Reactivate' : 'Suspend';
        return <ListCard key={user.id} title={user.name} action={user.id !== self && user.status !== 'PENDING' &&
          <ConfirmAction key={next} label={label} question={`${label} this account?`} confirmLabel={label} loading={action.busy}
            onConfirm={() => action.run(async () => {
              await authRequest(`/admin/users/${user.id}/status`, { ...jsonBody({ status: next }), method: 'PATCH' });
              users.reload();
            }, 'Account updated.')} />}>
          <p className="break-all">{user.email}</p><p className="mt-1">{titleCase(user.role)} · {titleCase(user.status)}</p>
        </ListCard>;
      })}</div>
    </DataState>
    {users.data && <Pagination data={users.data} onChange={setPage} />}
  </div>;
}

export function DoctorApprovals() {
  const { authRequest } = useAuth();
  const [page, setPage] = useState(1);
  const applications = useWorkspaceData<Page<DoctorApplication>>(`/admin/doctors/pending?page=${page}`);
  const action = useWorkspaceAction();
  return <div className="grid gap-5">
    <PageHeader title="Doctor applications" />
    <ActionFeedback {...action} />
    <DataState {...applications} empty={applications.data?.items.length === 0 ? 'No pending applications' : undefined}>
      <div className="grid gap-3">{applications.data?.items.map(application =>
        <ListCard key={application.id} title={application.fullName}>
          <p className="break-all">{application.user.email}</p>
          <p>{application.specialty}{application.licenseNumber ? ` · License ${application.licenseNumber}` : ''}</p>
          <div className="mt-4 flex flex-wrap gap-2">{(['APPROVE', 'REJECT'] as const).map(decision => {
            const label = titleCase(decision);
            return <ConfirmAction key={decision} label={label} question={`${label} this application?`} confirmLabel={label}
              variant={decision === 'APPROVE' ? 'secondary' : 'danger-outline'} loading={action.busy}
              onConfirm={() => action.run(async () => {
                await authRequest(`/admin/doctors/${application.id}/approval`, { ...jsonBody({ decision }), method: 'PATCH' });
                applications.reload();
              }, 'Application reviewed.')} />;
          })}</div>
        </ListCard>)}</div>
    </DataState>
    {applications.data && <Pagination data={applications.data} onChange={setPage} />}
  </div>;
}

export function Assignments() {
  const { authRequest } = useAuth();
  const [page, setPage] = useState(1);
  const assignments = useWorkspaceData<Page<Assignment>>(`/admin/assignments?page=${page}`);
  const action = useWorkspaceAction();
  const [doctor, setDoctor] = useState<Person>();
  const [patient, setPatient] = useState<Person>();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!doctor || !patient) return;
    void action.run(async () => {
      await authRequest('/admin/assignments', jsonBody({ doctorId: doctor.id, patientId: patient.id }));
      setDoctor(undefined);
      setPatient(undefined);
      if (page === 1) assignments.reload();
      else setPage(1);
    }, 'Assignment created.');
  }
  return <div className="grid gap-5">
    <PageHeader title="Care assignments" />
    <ActionFeedback {...action} />
    <Card title="Assign a doctor to a patient">
      <form onSubmit={submit} className="grid items-start gap-4 sm:grid-cols-2">
        <AssignmentPicker field="doctors" selected={doctor} onSelect={setDoctor} />
        <AssignmentPicker field="patients" selected={patient} onSelect={setPatient} />
        <Button type="submit" variant="primary" className="justify-self-start" disabled={!doctor || !patient} loading={action.busy}>Create assignment</Button>
      </form>
    </Card>
    <DataState {...assignments} empty={assignments.data?.items.length === 0 ? 'No assignments' : undefined}>
      <div className="grid gap-3">{assignments.data?.items.map(row => (
        <ListCard key={row.id} title={row.patient.fullName} action={<Badge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>{titleCase(row.status)}</Badge>}>
          <p>{row.doctor.fullName} · {new Date(row.assignedAt).toLocaleDateString()}</p>
          {row.status === 'ACTIVE' && <div className="mt-3"><ConfirmAction label="Revoke" question="Remove this doctor’s access?"
            confirmLabel="Revoke assignment" loading={action.busy} onConfirm={() => action.run(async () => {
              await authRequest(`/admin/assignments/${row.id}/revoke`, { method: 'PATCH' });
              assignments.reload();
            }, 'Assignment revoked.')} /></div>}
        </ListCard>
      ))}</div>
    </DataState>
    {assignments.data && <Pagination data={assignments.data} onChange={setPage} />}
  </div>;
}

function AssignmentPicker({ field, selected, onSelect }: {
  field: 'doctors' | 'patients'; selected?: Person; onSelect: (value?: Person) => void;
}) {
  const [page, setPage] = useState(1);
  const options = useWorkspaceData<Record<'doctors' | 'patients', Page<Person>>>(`/admin/assignment-options?page=${page}`);
  const list = options.data?.[field];
  const label = field === 'doctors' ? 'Doctor' : 'Patient';
  return <div>
    <DataState {...options}>
      <label className="grid gap-1.5 text-sm font-semibold">{label}
        <select required value={selected?.id ?? ''} className={inputClasses}
          onChange={event => onSelect(list?.items.find(item => item.id === event.target.value))}>
          <option value="">{list?.items.length ? `Select a ${label.toLowerCase()}` : `No eligible ${field}`}</option>
          {selected && !list?.items.some(item => item.id === selected.id) && <option value={selected.id}>{selected.fullName}</option>}
          {list?.items.map(item => <option key={item.id} value={item.id}>{item.fullName}</option>)}
        </select>
      </label>
    </DataState>
    {list && <Pagination data={list} onChange={setPage} />}
  </div>;
}

export function AuditLogs() {
  const [page, setPage] = useState(1);
  const logs = useWorkspaceData<Page<AuditRow>>(`/admin/audit-logs?page=${page}`);
  return <div className="grid gap-5">
    <PageHeader title="Audit logs" description="Account, assignment, and record access activity." />
    <DataState {...logs} empty={logs.data?.items.length === 0 ? 'No audit entries' : undefined}>
      <div className="grid gap-3">{logs.data?.items.map(row => (
        <ListCard key={row.id} title={row.action.replaceAll('_', ' ')} action={<Badge>{titleCase(row.outcome)}</Badge>}>
          <p>{new Date(row.createdAt).toLocaleString()}{row.reasonCode ? ` · ${row.reasonCode}` : ''}</p>
          {row.requestId && <p className="break-all">Request {row.requestId}</p>}
        </ListCard>
      ))}</div>
    </DataState>
    {logs.data && <Pagination data={logs.data} onChange={setPage} />}
  </div>;
}

export function Notifications() {
  const { authRequest } = useAuth();
  const [page, setPage] = useState(1);
  const inbox = useWorkspaceData<Page<InboxItem>>(`/notifications?page=${page}`, true);
  const action = useWorkspaceAction();
  return <div className="grid gap-5">
    <PageHeader title="Notifications" />
    <Button className="justify-self-start" onClick={inbox.reload}>Refresh inbox</Button>
    <ActionFeedback {...action} />
    <DataState {...inbox} empty={inbox.data?.items.length === 0 ? 'No notifications' : undefined}>
      <div className="grid gap-3">{inbox.data?.items.map(row => (
        <ListCard key={row.id} title={row.title} action={!row.readAt && <Badge tone="brand">Unread</Badge>}>
          <p>{new Date(row.createdAt).toLocaleString()}</p>
          {!row.readAt && <Button size="sm" className="mt-3" loading={action.busy} onClick={() => void action.run(async () => {
            await authRequest(`/notifications/${row.id}/read`, { method: 'PATCH' });
            inbox.reload();
          }, 'Notification marked as read.')}>Mark as read</Button>}
        </ListCard>
      ))}</div>
    </DataState>
    {inbox.data && <Pagination data={inbox.data} onChange={setPage} />}
  </div>;
}
