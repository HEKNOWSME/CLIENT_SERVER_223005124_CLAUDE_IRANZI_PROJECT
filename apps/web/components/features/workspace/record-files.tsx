'use client';

import type { Page, RecordFile } from '@pmrms/contracts';
import { useState, type FormEvent } from 'react';
import { useAuth } from '../../../lib/auth';
import { Button, Card, DataTable, PdfViewer, TextField } from '../../ui';
import { ActionFeedback, DataState, Pagination, useWorkspaceAction, useWorkspaceData } from './workspace-ui';

export function RecordFiles({ id, canUpload }: { id: string; canUpload: boolean }) {
  const { authRequest, authDownload } = useAuth();
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<{ title: string; blob: Blob } | null>(null);
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

  function open(file: RecordFile, download: boolean) {
    void action.run(async () => {
      const blob = await authDownload(`${path}/${file.id}/download`);
      if (download) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.originalName;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        setPreview({ title: file.originalName, blob });
      }
    }, download ? 'PDF download started.' : 'PDF ready to preview.');
  }

  return <Card title="PDF reports" description="Preview stays in this session. Files are never opened from a public link.">
    <div className="grid gap-4">
      <ActionFeedback {...action} />
      <DataState {...files} empty={files.data?.items.length === 0 ? 'No PDFs attached.' : undefined}>
        {files.data?.items.length ? <DataTable rows={files.data.items} columns={[
          { key: 'name', header: 'File', cell: file => <span className="break-all">{file.originalName}</span> },
          { key: 'size', header: 'Size', cell: file => `${Math.ceil(file.sizeBytes / 1024)} KB` },
          { key: 'actions', header: 'Actions', cell: file => (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => open(file, false)} disabled={action.busy}>Preview</Button>
              <Button variant="secondary" onClick={() => open(file, true)} disabled={action.busy}>Download</Button>
            </div>
          ) },
        ]} /> : null}
      </DataState>
      {files.data ? <Pagination data={files.data} onChange={setPage} /> : null}
      {canUpload ? <form onSubmit={upload} className="grid gap-3 border-t border-line pt-4">
        <TextField label="Attach PDF" name="file" type="file" accept="application/pdf,.pdf" required hint="Maximum file size is 10 MiB." />
        <Button className="justify-self-start" type="submit" variant="primary" loading={action.busy}>Upload PDF</Button>
      </form> : null}
    </div>
    {preview ? <PdfViewer title={preview.title} blob={preview.blob} onClose={() => setPreview(null)} /> : null}
  </Card>;
}
