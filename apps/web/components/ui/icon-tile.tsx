import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export function IconTile({ icon: Icon, tone = 'brand', className }: { icon: LucideIcon; tone?: 'brand' | 'inverse'; className?: string }) {
  return (
    <span className={cn(
      'inline-flex size-11 shrink-0 items-center justify-center rounded-xl',
      tone === 'brand' ? 'bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100' : 'bg-white/10 text-brand-300 ring-1 ring-inset ring-white/15',
      className,
    )}>
      <Icon className="size-5" aria-hidden="true" />
    </span>
  );
}
