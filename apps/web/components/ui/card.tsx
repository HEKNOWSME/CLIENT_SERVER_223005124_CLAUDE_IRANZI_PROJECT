import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  /** Rendered at the top right of the header (a badge or a small button). */
  action?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function Card({ title, description, action, footer, children, className }: CardProps) {
  return (
    <section className={cn('flex flex-col rounded-2xl border border-line bg-surface shadow-card', className)}>
      {title || action ? (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold text-ink">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p> : null}
          </div>
          {action}
        </header>
      ) : null}
      {children ? <div className="flex-1 px-5 py-5 sm:px-6">{children}</div> : null}
      {footer ? <footer className="border-t border-line px-5 py-4 text-sm text-muted sm:px-6">{footer}</footer> : null}
    </section>
  );
}

/** Responsive grid for cards: one column on phones, two from `md`, optional three from `xl`. */
export function CardGrid({ columns = 2, children }: { columns?: 2 | 3; children: ReactNode }) {
  return <div className={cn('grid gap-4 sm:gap-6 md:grid-cols-2', columns === 3 && 'xl:grid-cols-3')}>{children}</div>;
}
