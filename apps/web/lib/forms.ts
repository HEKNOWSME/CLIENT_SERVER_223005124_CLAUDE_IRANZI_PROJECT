'use client';

import { PASSWORD_MIN_LENGTH } from '@pmrms/contracts';
import { useState, type FormEvent } from 'react';
import type { z } from 'zod';
import { ApiError, describeError, fieldErrors } from './api';

export const PASSWORD_HINT = `At least ${PASSWORD_MIN_LENGTH} characters, with an uppercase letter, a lowercase letter and a digit.`;

/** Turns empty optional inputs into `undefined` so Zod treats them as omitted. */
export function optional(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length ? text : undefined;
}

export function confirmPassword(form: FormData): Record<string, string> {
  return form.get('password') === form.get('confirmPassword') ? {} : { confirmPassword: 'Passwords do not match.' };
}

interface ZodFormOptions<S extends z.ZodType, R> {
  schema: S;
  /** Maps the submitted FormData to the shape the schema expects. */
  read: (form: FormData) => unknown;
  /** Extra client-only checks (for example password confirmation), keyed by field name. */
  validate?: (form: FormData) => Record<string, string>;
  submit: (data: z.output<S>) => Promise<R>;
  onSuccess?: (result: R) => void;
}

/**
 * Shared form behaviour: validate with the same Zod contract as the API, show field errors from
 * either side, show a safe summary message, and block double submission.
 */
export function useZodForm<S extends z.ZodType, R>({ schema, read, validate, submit, onSuccess }: ZodFormOptions<S, R>) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const parsed = schema.safeParse(read(form));
    const extra = validate?.(form) ?? {};
    setFormError(null);
    if (!parsed.success || Object.keys(extra).length) {
      setErrors({ ...(parsed.success ? {} : fieldErrors(parsed.error.issues)), ...extra });
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const result = await submit(parsed.data);
      onSuccess?.(result);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') setErrors(fieldErrors(error.details));
      setFormError(describeError(error));
      setPending(false);
    }
  }

  return { errors, formError, pending, onSubmit };
}
