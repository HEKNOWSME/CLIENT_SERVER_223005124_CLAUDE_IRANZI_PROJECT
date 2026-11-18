'use client';

import { ArrowRight, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { HOME_BY_ROLE } from '../../lib/roles';
import { ButtonLink } from '../ui';
import { Brand } from './brand';

const LINKS = [
  { href: '/#roles', label: 'Who it serves' },
  { href: '/#security', label: 'Security' },
  { href: '/#how-it-works', label: 'How it works' },
];

function AuthActions({ stacked }: { stacked?: boolean }) {
  const { state } = useAuth();
  if (state.status === 'authenticated') {
    return <ButtonLink href={HOME_BY_ROLE[state.user.role]} variant="primary" fullWidth={stacked} iconEnd={<ArrowRight className="size-4" aria-hidden="true" />}>Open workspace</ButtonLink>;
  }
  return (
    <>
      <ButtonLink href="/login" variant={stacked ? 'secondary' : 'ghost'} fullWidth={stacked}>Sign in</ButtonLink>
      <ButtonLink href="/register" variant="primary" fullWidth={stacked}>Create account</ButtonLink>
    </>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Brand />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map(link => (
            <Link key={link.href} href={link.href} className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-ink">{link.label}</Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex"><AuthActions /></div>
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="site-menu"
          className="-mr-2 flex size-11 items-center justify-center rounded-lg text-ink hover:bg-canvas md:hidden"
        >
          {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
        </button>
      </div>
      {open ? (
        <div id="site-menu" className="border-t border-line bg-surface px-4 pb-5 pt-2 shadow-pop md:hidden">
          <nav aria-label="Main mobile">
            <ul className="grid">
              {LINKS.map(link => (
                <li key={link.href}>
                  <Link href={link.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center border-b border-line text-base font-medium">{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="mt-4 grid gap-3"><AuthActions stacked /></div>
        </div>
      ) : null}
    </header>
  );
}
