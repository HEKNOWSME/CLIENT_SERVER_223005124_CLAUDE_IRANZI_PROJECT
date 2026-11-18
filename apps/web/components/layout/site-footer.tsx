import Link from 'next/link';
import { Brand } from './brand';

const LINKS = [
  { href: '/login', label: 'Sign in' },
  { href: '/register', label: 'Patient registration' },
  { href: '/doctor/apply', label: 'Doctor application' },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
        <div className="grid gap-2">
          <Brand />
          <p className="text-sm text-muted">Academic project</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-1">
            {LINKS.map(link => (
              <li key={link.href}><Link href={link.href} className="inline-flex min-h-11 items-center text-sm font-medium text-muted hover:text-ink">{link.label}</Link></li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
