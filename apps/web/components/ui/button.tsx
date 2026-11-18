import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline' | 'inverse' | 'inverse-outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white shadow-sm hover:bg-brand-700',
  secondary: 'border border-line bg-surface text-ink hover:border-brand-600 hover:text-brand-700',
  ghost: 'text-brand-700 hover:bg-brand-50',
  danger: 'bg-danger-600 text-white shadow-sm hover:bg-danger-800',
  'danger-outline': 'border border-danger-200 bg-surface text-danger-600 hover:border-danger-600',
  inverse: 'bg-white text-ink shadow-sm hover:bg-brand-50',
  'inverse-outline': 'border border-white/30 text-white hover:border-white hover:bg-white/10',
};

// md and lg are at least 44px tall: the minimum comfortable touch target.
const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 px-3 text-sm',
  md: 'h-11 gap-2 px-4 text-sm',
  lg: 'h-12 gap-2 px-6 text-base',
};

interface StyleProps { variant?: ButtonVariant; size?: ButtonSize; fullWidth?: boolean; className?: string }

export function buttonClasses({ variant = 'secondary', size = 'md', fullWidth, className }: StyleProps = {}) {
  return cn(
    'inline-flex select-none items-center justify-center whitespace-nowrap rounded-lg font-semibold transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:pointer-events-none aria-disabled:opacity-60',
    VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, StyleProps {
  loading?: boolean;
  loadingText?: string;
  icon?: ReactNode;
}

export function Button({ variant, size, fullWidth, className, loading, loadingText, icon, children, type = 'button', disabled, ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses({ variant, size, fullWidth, className })} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner /> : icon}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

interface ButtonLinkProps extends ComponentProps<typeof Link>, StyleProps { icon?: ReactNode; iconEnd?: ReactNode }

export function ButtonLink({ variant, size, fullWidth, className, icon, iconEnd, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, fullWidth, className })} {...rest}>
      {icon}{children}{iconEnd}
    </Link>
  );
}
