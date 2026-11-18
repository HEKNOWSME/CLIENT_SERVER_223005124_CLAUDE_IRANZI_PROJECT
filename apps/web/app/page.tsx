import {
  ArrowRight, Bell, CalendarDays, ClipboardList, FileLock, FileText, KeyRound, Link2, Lock, ScrollText, ShieldCheck,
  ShieldUser, Stethoscope, UserPlus, UserRound, type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { SiteFooter } from '../components/layout/site-footer';
import { SiteHeader } from '../components/layout/site-header';
import { Badge, ButtonLink, IconTile, Section } from '../components/ui';

const ROLES: { icon: LucideIcon; title: string; text: string; points: string[]; cta: { href: string; label: string } }[] = [
  {
    icon: UserRound, title: 'Patients', text: 'A clear, private view of your own medical history.',
    points: ['See visits, diagnoses and treatments', 'Download reports your doctors share', 'Get notified when something changes'],
    cta: { href: '/register', label: 'Create patient account' },
  },
  {
    icon: Stethoscope, title: 'Doctors', text: 'Structured records for the patients assigned to you.',
    points: ['Only assigned patients are visible', 'Every edit keeps a full revision', 'Attach files securely to records'],
    cta: { href: '/doctor/apply', label: 'Apply for access' },
  },
  {
    icon: ShieldUser, title: 'Administrators', text: 'Govern access without ever touching clinical content.',
    points: ['Approve doctors before they see data', 'Assign doctors to patients', 'Review a tamper-proof audit trail'],
    cta: { href: '/login', label: 'Sign in' },
  },
];

const SECURITY: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Lock, title: 'Least-privilege access', text: 'Every request is checked against role, approval status and the active doctor–patient assignment.' },
  { icon: KeyRound, title: 'Hardened sign-in', text: 'Short-lived tokens in memory, rotating HttpOnly refresh cookies and automatic lockout after failed attempts.' },
  { icon: ScrollText, title: 'Append-only audit log', text: 'Sign-ins, record views and changes are logged, and the database refuses to alter past entries.' },
  { icon: FileLock, title: 'Revision history', text: 'Medical records are never silently overwritten: each change creates a new revision.' },
  { icon: Link2, title: 'Assignment-based sharing', text: 'A doctor gains access only through an active assignment and loses it the moment it ends.' },
  { icon: Bell, title: 'Transparent notifications', text: 'Patients are told when records are added or updated, so nothing happens out of sight.' },
];

const STEPS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: UserPlus, title: 'Create an account', text: 'Patients register directly. Doctors apply and wait for administrator approval.' },
  { icon: Link2, title: 'Get connected', text: 'An administrator assigns each patient to the doctors responsible for their care.' },
  { icon: ClipboardList, title: 'Work with records', text: 'Doctors add and revise records; patients follow their history in real time.' },
];

const PREVIEW = [
  { date: '12 Nov', title: 'Follow-up consultation', by: 'Dr. A. Mugisha', tone: 'brand' as const, tag: 'Updated' },
  { date: '28 Oct', title: 'Blood panel results', by: 'Dr. A. Mugisha', tone: 'neutral' as const, tag: 'Report' },
  { date: '03 Oct', title: 'Initial assessment', by: 'Dr. E. Uwase', tone: 'neutral' as const, tag: 'Record' },
];

function RecordPreview() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full min-w-0 max-w-md lg:max-w-none">
      <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-linear-to-br from-brand-100 via-brand-50 to-transparent blur-2xl" />
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-pop sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-full bg-brand-600 font-semibold text-white">JN</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">Jane N.</p>
            <p className="truncate text-sm text-muted">Sample patient · Medical history</p>
          </div>
          <Badge tone="success" dot>Assigned</Badge>
        </div>
        <ol className="mt-6 grid gap-3">
          {PREVIEW.map(item => (
            <li key={item.title} className="flex items-center gap-3 rounded-xl border border-line p-3">
              <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-canvas text-[11px] font-semibold leading-tight text-muted">
                <CalendarDays className="size-3.5 text-brand-600" />{item.date}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{item.title}</span>
                <span className="block truncate text-xs text-muted">{item.by}</span>
              </span>
              <Badge tone={item.tone}>{item.tag}</Badge>
            </li>
          ))}
        </ol>
        <div className="mt-5 flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-xs font-medium text-brand-700">
          <ShieldCheck className="size-4 shrink-0" />Access logged · Revision 3 of 3
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden bg-surface">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[32rem] bg-[radial-gradient(60rem_30rem_at_70%_-10%,var(--color-brand-50),transparent)]" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-28">
            <div className="min-w-0 text-center lg:text-left">
              <Badge tone="brand"><ShieldCheck className="size-3.5" aria-hidden="true" />Patient Medical Records Management System</Badge>
              <h1 className="mt-5 text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                Medical history, shared <span className="text-brand-600">only</span> with the right people.
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted text-pretty sm:text-lg lg:mx-0">
                PMRMS gives patients a private view of their records, lets doctors work with the patients assigned to them, and keeps every access accountable.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <ButtonLink href="/register" variant="primary" size="lg" iconEnd={<ArrowRight className="size-5" aria-hidden="true" />}>Create patient account</ButtonLink>
                <ButtonLink href="/login" variant="secondary" size="lg">Sign in</ButtonLink>
              </div>
              <p className="mt-6 text-sm text-muted">Are you a doctor? <Link href="/doctor/apply" className="font-semibold text-brand-700 underline-offset-4 hover:underline">Apply for access</Link></p>
            </div>
            <RecordPreview />
          </div>
        </section>

        <Section id="roles" eyebrow="Who it serves" title="One system, three clearly separated roles" description="Each role has its own workspace and sees only what it needs.">
          <ul className="grid gap-4 sm:gap-6 md:grid-cols-3">
            {ROLES.map(role => (
              <li key={role.title} className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-card">
                <IconTile icon={role.icon} />
                <h3 className="mt-5 text-lg font-semibold">{role.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{role.text}</p>
                <ul className="mt-5 grid flex-1 gap-2.5">
                  {role.points.map(point => (
                    <li key={point} className="flex items-start gap-2.5 text-sm">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />{point}
                    </li>
                  ))}
                </ul>
                <ButtonLink href={role.cta.href} variant="secondary" fullWidth className="mt-6">{role.cta.label}</ButtonLink>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="security" tone="surface" eyebrow="Security by design" title="Built to protect sensitive health data" description="Access rules are enforced by the API and the database, not just hidden in the interface.">
          <ul className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {SECURITY.map(item => (
              <li key={item.title} className="flex gap-4">
                <IconTile icon={item.icon} />
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="how-it-works" eyebrow="How it works" title="From sign-up to shared records in three steps">
          <ol className="grid gap-4 sm:gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="relative rounded-2xl border border-line bg-surface p-6 shadow-card">
                <span className="absolute right-5 top-5 text-4xl font-bold text-brand-100" aria-hidden="true">{index + 1}</span>
                <IconTile icon={step.icon} />
                <h3 className="mt-5 text-lg font-semibold"><span className="sr-only">Step {index + 1}: </span>{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        <section className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8 lg:pb-24">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-brand-900 px-6 py-12 text-center text-white sm:px-12 sm:py-16">
            <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-brand-600/50 blur-3xl" />
            <div className="relative mx-auto max-w-2xl">
              <FileText className="mx-auto size-10 text-brand-300" aria-hidden="true" />
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">Ready to see your records in one secure place?</h2>
              <p className="mt-3 text-white/75">Create an account in under a minute. Demo data is fictional, so feel free to explore.</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <ButtonLink href="/register" variant="inverse" size="lg">Create patient account</ButtonLink>
                <ButtonLink href="/doctor/apply" variant="inverse-outline" size="lg">Apply as a doctor</ButtonLink>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
