import { CircleCheck, Info, TriangleExclamationPoint } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type AlertTone = 'error' | 'warning' | 'info' | 'success';

const TONES: Record<AlertTone, { box: string; Icon: typeof Info }> = {
  error: { box: 'border-danger-200 bg-danger-50 text-danger-800', Icon: TriangleExclamationPoint },
  warning: { box: 'border-warning-200 bg-warning-50 text-warning-700', Icon: TriangleExclamationPoint },
  info: { box: 'border-brand-100 bg-brand-50 text-brand-700', Icon: Info },
  success: { box: 'border-brand-100 bg-brand-50 text-brand-700', Icon: CircleCheck },
};

export function Alert({ tone = 'info', title, children, className }: { tone?: AlertTone; title?: string; children: ReactNode; className?: string }) {
  const { box, Icon } = TONES[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed', box, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{title ? <strong className="font-semibold">{title} </strong> : null}{children}</div>
    </div>
  );
}
