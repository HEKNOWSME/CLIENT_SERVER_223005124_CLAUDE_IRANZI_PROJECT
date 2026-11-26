'use client';

import { X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from './button';

export function PdfViewer({ title, blob, onClose }: { title: string; blob: Blob | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  if (!blob) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-3 text-white">
        <p className="min-w-0 truncate text-sm font-semibold">{title}</p>
        <Button variant="inverse" onClick={onClose} icon={<X className="size-4" aria-hidden="true" />} aria-label="Close preview">Close</Button>
      </div>
      {url ? <iframe title={title} src={url} className="min-h-0 w-full flex-1 rounded-xl bg-white" /> : null}
    </div>
  );
}

export function Timeline({ items }: { items: { id: string; date: string; title: ReactNode; meta?: ReactNode; body?: ReactNode }[] }) {
  return (
    <ol className="relative grid gap-4 border-l border-brand-100 pl-5">
      {items.map(item => (
        <li key={item.id} className="relative">
          <span aria-hidden="true" className="absolute -left-[1.65rem] top-1.5 size-3 rounded-full bg-brand-600 ring-4 ring-brand-50" />
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">{item.date}</p>
          <div className="mt-1 text-base font-semibold text-ink">{item.title}</div>
          {item.meta ? <p className="text-sm text-muted">{item.meta}</p> : null}
          {item.body}
        </li>
      ))}
    </ol>
  );
}
