'use client';

import type { Page, RecordFile } from '@pmrms/contracts';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../../../lib/auth';
import { Button, Card, TextField } from '../../ui';
import { ActionFeedback, DataState, Pagination, useWorkspaceAction, useWorkspaceData } from './workspace-ui';

export function RecordFiles({ id, canUpload }: { id: string; canUpload: boolean }) {
  const { authRequest, authDownload } = useAuth();
  const [page, setPage] = useState(1);
  const path = `/records/${id}/files`;
  const files = useWorkspaceData<Page<RecordFile>>(`${path}?page=${page}`, true);
  const action = useWorkspaceAction();

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    void action.run(async () => {
      await authRequest(path, { method: 'POST', body });
      form.reset();
      if (page === 1) files.reload();
      else setPage(1);
    }, 'PDF attached.');
  }

  function download(file: RecordFile) {
    void action.run(async () => {
      const blob = await authDownload(`${path}/${file.id}/download`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.originalName;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'PDF download started.');
  }

  return <Card title="PDF reports">
    <div className="grid gap-4">
      <ActionFeedback {...action} />
      <DataState {...files}>
        {files.data?.items.length === 0 && <p className="text-sm text-muted">No PDFs attached.</p>}
        <ul className="divide-y divide-line">
          {files.data?.items.map(file => <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 break-all">{file.originalName} <span className="text-muted">· {Math.ceil(file.sizeBytes / 1024)} KB</span></span>
            <Button size="sm" disabled={action.busy} onClick={() => download(file)}>Download PDF</Button>
          </li>)}
        </ul>
      </DataState>
      {files.data && <Pagination data={files.data} onChange={setPage} />}
      {canUpload && <form onSubmit={upload} className="grid gap-3 border-t border-line pt-4">
        <TextField label="Attach PDF" name="file" type="file" accept="application/pdf,.pdf" required hint="Maximum file size is 10 MiB." />
        <Button className="justify-self-start" type="submit" loading={action.busy}>Upload PDF</Button>
      </form>}
    </div>
  </Card>;
}
