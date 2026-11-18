import { HeartPulse } from 'lucide-react';
import Link from 'next/link';
import { cn } from '../../lib/cn';

export function Brand({ tone = 'dark', className }: { tone?: 'dark' | 'light'; className?: string }) {
  return (
    <Link href="/" aria-label="PMRMS home" className={cn('inline-flex items-center gap-2.5 rounded-lg', className)}>
      <span className={cn('flex size-9 items-center justify-center rounded-xl', tone === 'dark' ? 'bg-brand-600 text-white' : 'bg-white/10 text-brand-300 ring-1 ring-inset ring-white/20')}>
        <HeartPulse className="size-5" aria-hidden="true" />
      </span>
      <span className={cn('text-xl font-bold tracking-tight', tone === 'dark' ? 'text-ink' : 'text-white')}>
        PM<span className={tone === 'dark' ? 'text-brand-600' : 'text-brand-300'}>+</span>RMS
      </span>
    </Link>
  );
}
