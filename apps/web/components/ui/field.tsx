'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  error?: string;
  hint?: ReactNode;
}

// 16px text on phones prevents iOS from zooming into focused inputs.
export const inputClasses = cn(
  'h-12 w-full rounded-lg border border-line bg-surface px-3.5 text-base text-ink shadow-xs transition',
  'placeholder:text-muted/60 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/15',
  'aria-invalid:border-danger-600 aria-invalid:focus:ring-danger-600/15 sm:h-11 sm:text-[15px]',
);

function FieldShell({ id, label, required, hint, error, children }: { id: string; label: string; required?: boolean; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}{required ? <span aria-hidden="true" className="text-danger-600"> *</span> : null}
      </label>
      {children}
      {hint && !error ? <p id={`${id}-hint`} className="text-xs leading-relaxed text-muted">{hint}</p> : null}
      {error ? <p id={`${id}-error`} role="alert" className="text-xs font-medium text-danger-600">{error}</p> : null}
    </div>
  );
}

function describedBy(id: string, hint: ReactNode, error?: string) {
  return error ? `${id}-error` : hint ? `${id}-hint` : undefined;
}

export function TextField({ label, error, hint, id, className, ...input }: FieldProps) {
  const generated = useId();
  const inputId = id ?? generated;
  return (
    <FieldShell id={inputId} label={label} required={input.required} hint={hint} error={error}>
      <input id={inputId} aria-invalid={Boolean(error) || undefined} aria-describedby={describedBy(inputId, hint, error)} className={cn(inputClasses, className)} {...input} />
    </FieldShell>
  );
}

export function PasswordField({ label, error, hint, id, className, ...input }: Omit<FieldProps, 'type'>) {
  const generated = useId();
  const inputId = id ?? generated;
  const [visible, setVisible] = useState(false);
  return (
    <FieldShell id={inputId} label={label} required={input.required} hint={hint} error={error}>
      <div className="relative">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy(inputId, hint, error)}
          className={cn(inputClasses, 'pr-12', className)}
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          aria-controls={inputId}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-lg text-muted transition hover:text-brand-700"
        >
          {visible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
        </button>
      </div>
    </FieldShell>
  );
}

/** Two columns from the `sm` breakpoint, one column on phones. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
