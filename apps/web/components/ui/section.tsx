import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Eyebrow } from './page-header';

interface SectionProps {
  id?: string;
  eyebrow?: string;
  title?: ReactNode;
  description?: ReactNode;
  tone?: 'canvas' | 'surface';
  children: ReactNode;
  className?: string;
}

/** Full-width page band with a centred, max-width content column. */
export function Section({ id, eyebrow, title, description, tone = 'canvas', children, className }: SectionProps) {
  return (
    <section id={id} className={cn('scroll-mt-16 py-16 sm:py-20 lg:py-24', tone === 'surface' ? 'bg-surface' : 'bg-canvas', className)}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {title ? (
          <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl lg:text-4xl">{title}</h2>
            {description ? <p className="mt-3 text-base leading-relaxed text-muted text-pretty">{description}</p> : null}
          </div>
        ) : null}
        {children}
      </div>
    </section>
  );
}
