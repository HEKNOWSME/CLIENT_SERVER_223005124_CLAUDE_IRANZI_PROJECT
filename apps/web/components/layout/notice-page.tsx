import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Eyebrow, IconTile } from '../ui';
import { Brand } from './brand';

/** Full-page message for errors and access decisions (404, access denied, and similar). */
export function NoticePage({ icon, eyebrow, title, description, actions }: { icon: LucideIcon; eyebrow: string; title: string; description: string; actions: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center px-4 sm:px-6"><Brand /></header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16 sm:px-6">
        <div className="w-full max-w-lg text-center">
          <IconTile icon={icon} className="mx-auto" />
          <div className="mt-6"><Eyebrow>{eyebrow}</Eyebrow></div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted sm:text-base">{description}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">{actions}</div>
        </div>
      </main>
    </div>
  );
}
