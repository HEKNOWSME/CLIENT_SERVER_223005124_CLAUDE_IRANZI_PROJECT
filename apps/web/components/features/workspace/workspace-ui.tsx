'use client';

import type { Page } from '@pmrms/contracts';
import { Inbox } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { describeError } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { workspaceChanged } from '../../../lib/realtime';
import { Alert, Button, EmptyState, Spinner } from '../../ui';

export function useWorkspaceData<T>(path: string | null, live = false) {
  const { authRequest } = useAuth();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ path: string; data?: T; error?: string }>();

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    authRequest<T>(path, { signal: controller.signal }).then(
      data => { if (!controller.signal.aborted) setResult({ path, data }); },
      error => { if (!controller.signal.aborted) setResult({ path, error: describeError(error) }); },
    );
    return () => controller.abort();
  }, [authRequest, path, revision]);

  useEffect(() => {
    if (!live || !path) return;
    const revalidate = () => setRevision(value => value + 1);
    window.addEventListener(workspaceChanged, revalidate);
    window.addEventListener('online', revalidate);
    return () => {
      window.removeEventListener(workspaceChanged, revalidate);
      window.removeEventListener('online', revalidate);
    };
  }, [live, path]);

  const current = result?.path === path ? result : undefined;
  return {
    data: current?.data, error: current?.error, loading: Boolean(path && !current),
    reload: () => { setResult(undefined); setRevision(value => value + 1); },
  };
}

export function useWorkspaceAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  async function run(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await work();
      setNotice(success);
    } catch (failure) {
      setError(describeError(failure));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, notice, run };
}

export function ActionFeedback({ error, notice }: { error?: string; notice?: string }) {
  if (error) return <Alert tone="error">{error}</Alert>;
  if (notice) return <Alert tone="success">{notice}</Alert>;
  return null;
}

export function DataState({ loading, error, reload, empty, children }: {
  loading: boolean; error?: string; reload: () => void; empty?: string; children: ReactNode;
}) {
  if (loading) return <p role="status" className="flex items-center gap-2 text-sm text-muted"><Spinner /> Loading…</p>;
  if (error) return <div className="grid gap-3"><Alert tone="error">{error}</Alert><Button className="justify-self-start" onClick={reload}>Try again</Button></div>;
  if (empty) return <EmptyState icon={Inbox} title={empty} />;
  return children;
}

export function Pagination({ data, onChange }: { data: Page<unknown>; onChange: (page: number) => void }) {
  if (data.page === 1 && !data.hasMore) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center gap-3">
      <Button disabled={data.page <= 1} onClick={() => onChange(data.page - 1)}>Previous</Button>
      <span className="text-sm text-muted">Page {data.page}</span>
      <Button disabled={!data.hasMore} onClick={() => onChange(data.page + 1)}>Next</Button>
    </nav>
  );
}
