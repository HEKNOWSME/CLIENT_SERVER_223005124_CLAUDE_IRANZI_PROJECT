import type { ReactNode } from 'react';

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-600">{children}</p>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 max-w-3xl">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink text-balance sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  );
}
