'use client';

import { useState, type ReactNode } from 'react';
import { Button, type ButtonVariant } from './button';

interface ConfirmActionProps {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
}

/** Two-step inline confirmation for destructive actions, without a modal. */
export function ConfirmAction({ label, question, confirmLabel, onConfirm, variant = 'danger-outline', loading, disabled, icon }: ConfirmActionProps) {
  const [asking, setAsking] = useState(false);
  if (!asking) return <Button variant={variant} icon={icon} onClick={() => setAsking(true)} disabled={disabled}>{label}</Button>;
  return (
    <div role="group" aria-label={question} className="flex w-full flex-col gap-3 rounded-xl border border-danger-200 bg-danger-50 p-3 sm:w-auto sm:flex-row sm:items-center">
      <span className="text-sm font-medium text-danger-800">{question}</span>
      <div className="flex gap-2">
        <Button variant="danger" loading={loading} loadingText="Working…" onClick={() => void onConfirm()} disabled={disabled}>{confirmLabel}</Button>
        <Button variant="ghost" onClick={() => setAsking(false)} disabled={loading}>Cancel</Button>
      </div>
    </div>
  );
}
