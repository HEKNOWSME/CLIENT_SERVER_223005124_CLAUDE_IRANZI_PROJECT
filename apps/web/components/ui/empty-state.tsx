import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconTile } from './icon-tile';

export function EmptyState({ icon, title, description, action }: { icon: LucideIcon; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
      <IconTile icon={icon} />
      <h3 className="mt-4 text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
