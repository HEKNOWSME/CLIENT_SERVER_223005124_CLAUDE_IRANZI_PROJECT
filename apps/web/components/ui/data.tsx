import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function NavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);
  return (
    <span aria-label={`${count} unread`} className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
      {label}
    </span>
  );
}

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-5 py-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-ink">{value}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export interface TableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

export function DataTable<T extends { id: string }>({ columns, rows, empty }: { columns: TableColumn<T>[]; rows: T[]; empty?: string }) {
  if (!rows.length) return <p className="rounded-2xl border border-dashed border-line bg-surface px-4 py-10 text-center text-sm text-muted">{empty ?? 'Nothing to show.'}</p>;
  return (
    <>
      <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface shadow-card md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-canvas text-xs uppercase tracking-wider text-muted">
            <tr>{columns.map(column => <th key={column.key} className={cn('px-4 py-3 font-semibold', column.className)}>{column.header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-t border-line">
                {columns.map(column => <td key={column.key} className={cn('px-4 py-3 align-middle text-ink', column.className)}>{column.cell(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-3 md:hidden">
        {rows.map(row => (
          <li key={row.id} className="rounded-2xl border border-line bg-surface p-4 shadow-card">
            <dl className="grid gap-2">
              {columns.map(column => (
                <div key={column.key} className="grid gap-0.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{column.header}</dt>
                  <dd className="min-w-0 break-words text-sm">{column.cell(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
