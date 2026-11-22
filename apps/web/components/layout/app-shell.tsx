'use client';

import type { UserRole } from '@pmrms/contracts';
import { Lock, LogOut, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { initials, isAwaitingApproval, NAV_BY_ROLE, ROLE_LABEL } from '../../lib/roles';
import { Alert, Badge, Button, LoadingScreen } from '../ui';
import { Brand } from './brand';

/**
 * Layout and client-side gate for a role area. It only decides what to render: every API call is
 * still authorised by NestJS, so hiding UI is never the security boundary.
 */
export function AppShell({ role, children }: { role: UserRole; children: ReactNode }) {
  const { state, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (state.status === 'anonymous') {
      const params = new URLSearchParams({ next: pathname });
      if (state.reason === 'expired') params.set('expired', '1');
      router.replace(`/login?${params}`);
    } else if (state.status === 'authenticated' && state.user.role !== role) {
      router.replace('/unauthorized');
    }
  }, [state, role, pathname, router]);

  useEffect(() => setDrawerOpen(false), [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setDrawerOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [drawerOpen]);

  if (state.status !== 'authenticated' || state.user.role !== role) return <LoadingScreen label="Checking your session…" />;

  const user = state.user;
  const pending = isAwaitingApproval(user);

  async function signOut() {
    setSigningOut(true);
    try { await logout(); } finally { router.replace('/login'); }
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-pop">Skip to content</a>

      {drawerOpen ? <button type="button" aria-label="Close menu" onClick={() => setDrawerOpen(false)} className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-[2px] lg:hidden" /> : null}

      <aside
        id="app-sidebar"
        aria-label={`${ROLE_LABEL[role]} navigation`}
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[min(18rem,85vw)] flex-col border-r border-line bg-surface transition-transform duration-200',
          'lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0',
          drawerOpen ? 'translate-x-0 shadow-pop' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-line px-5">
          <Brand />
          <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="flex size-10 items-center justify-center rounded-lg text-muted hover:bg-canvas lg:hidden">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 pt-5"><Badge tone="brand">{ROLE_LABEL[role]} workspace</Badge></div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="grid gap-1">
            {NAV_BY_ROLE[role].map(item => {
              const locked = !item.ready || (item.clinical && pending);
              const active = pathname === item.href;
              const Icon = item.icon;
              const body = (
                <>
                  <Icon className="size-5 shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {locked ? (
                    item.clinical && pending
                      ? <Lock className="size-4" aria-label="Locked until approval" />
                      : <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">Soon</span>
                  ) : null}
                </>
              );
              const base = 'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors';
              return (
                <li key={item.href}>
                  {locked
                    ? <span aria-disabled="true" className={cn(base, 'cursor-not-allowed text-muted/60')}>{body}</span>
                    : <Link href={item.href} aria-current={active ? 'page' : undefined} className={cn(base, active ? 'bg-brand-50 text-brand-700' : 'text-ink hover:bg-canvas')}>{body}</Link>}
                </li>
              );
            })}
          </ul>
        </nav>
        
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls="app-sidebar"
            className="-ml-1 flex size-11 items-center justify-center rounded-lg text-ink hover:bg-canvas lg:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">{initials(user.name)}</span>
            <span className="grid min-w-0">
              <strong className="truncate text-sm font-semibold">{user.name}</strong>
              <span className="hidden truncate text-xs text-muted sm:block">{user.email}</span>
            </span>
          </div>
          <Button variant="secondary" onClick={() => void signOut()} loading={signingOut} icon={<LogOut className="size-4" aria-hidden="true" />} aria-label="Sign out">
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </header>

        {pending ? (
          <div className="px-4 pt-4 sm:px-6 lg:px-8">
            <Alert tone="warning" title="Awaiting approval.">Your doctor account is pending administrator review. Clinical features stay locked until you are approved.</Alert>
          </div>
        ) : null}

        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
