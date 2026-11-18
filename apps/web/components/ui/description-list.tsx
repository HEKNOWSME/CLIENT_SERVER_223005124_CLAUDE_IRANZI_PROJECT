import type { ReactNode } from 'react';

export interface DescriptionItem { term: string; value: ReactNode }

/** Label/value pairs: stacked on phones, side by side from `sm`. */
export function DescriptionList({ items }: { items: DescriptionItem[] }) {
  return (
    <dl className="divide-y divide-line">
      {items.map(item => (
        <div key={item.term} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[9rem_1fr] sm:gap-4">
          <dt className="text-sm text-muted">{item.term}</dt>
          <dd className="min-w-0 break-words text-sm font-medium text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-md border border-line bg-canvas px-1.5 py-0.5 font-mono text-xs break-all">{children}</code>;
}
