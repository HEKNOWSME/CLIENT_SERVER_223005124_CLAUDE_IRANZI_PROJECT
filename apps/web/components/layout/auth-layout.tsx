import { ShieldCheck, Stethoscope, UserRound } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Eyebrow } from '../ui';
import { Brand } from './brand';

const POINTS = [
  { icon: UserRound, text: 'Patients see only their own records.' },
  { icon: Stethoscope, text: 'Doctors see only patients assigned to them.' },
  { icon: ShieldCheck, text: 'Administrators manage access, never clinical content.' },
];

/** Split screen on desktop; on phones the brand panel collapses to a compact header. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden overflow-hidden bg-brand-900 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div aria-hidden="true" className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-brand-600/40 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-20 size-96 rounded-full bg-brand-300/20 blur-3xl" />
        <Brand tone="light" className="relative" />
        <div className="relative max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">Patient Medical Records Management System</p>
          <p className="mt-4 text-3xl font-semibold leading-tight text-balance">Secure, role-based access to medical history.</p>
          <ul className="mt-8 grid gap-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-white/85">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10"><Icon className="size-4 text-brand-300" aria-hidden="true" /></span>
                <span className="pt-1">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/60">Academic project</p>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="flex h-16 items-center border-b border-line bg-surface px-4 sm:px-6 lg:hidden"><Brand /></header>
        <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:px-6 sm:py-12">{children}</main>
      </div>
    </div>
  );
}

interface AuthCardProps {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Links to the other auth pages. */
  footer?: { text: string; href: string; label: string }[];
}

export function AuthCard({ eyebrow, title, description, children, footer }: AuthCardProps) {
  return (
    <section aria-labelledby="auth-title" className="w-full max-w-lg rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-8">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 id="auth-title" className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {description ? <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{description}</p> : null}
      <div className="mt-6">{children}</div>
      {footer?.length ? (
        <div className="mt-6 grid gap-2 border-t border-line pt-5 text-sm text-muted">
          {footer.map(link => (
            <p key={link.href}>{link.text}{' '}<Link href={link.href} className="font-semibold text-brand-700 underline-offset-4 hover:underline">{link.label}</Link></p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
