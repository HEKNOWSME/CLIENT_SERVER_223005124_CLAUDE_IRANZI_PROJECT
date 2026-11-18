import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

const TONES: Record<BadgeTone, string> = {
  brand: 'bg-brand-50 text-brand-700 ring-brand-100',
  success: 'bg-brand-50 text-brand-700 ring-brand-100',
  warning: 'bg-warning-50 text-warning-700 ring-warning-200',
  danger: 'bg-danger-50 text-danger-600 ring-danger-200',
  neutral: 'bg-canvas text-muted ring-line',
};

export function Badge({ tone = 'neutral', dot, children, className }: { tone?: BadgeTone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', TONES[tone], className)}>
      {dot ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
