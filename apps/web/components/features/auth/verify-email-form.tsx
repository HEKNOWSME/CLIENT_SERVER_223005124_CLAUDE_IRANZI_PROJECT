'use client';

import { verifyEmailRequestSchema } from '@pmrms/contracts';
import { ShieldCheck } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiError, describeError } from '../../../lib/api';
import { HOME_BY_ROLE } from '../../../lib/roles';
import { useAuth } from '../../../lib/auth';
import { useZodForm } from '../../../lib/forms';
import { Alert, Button, TextField } from '../../ui';

export function VerifyEmailForm() {
  const { verifyEmail, resendOtp } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const email = (params.get('email') ?? '').trim().toLowerCase();
  const debugKey = `pmrms-local-otp:${email}`;
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    setDebugCode(sessionStorage.getItem(debugKey));
  }, [debugKey]);

  useEffect(() => {
    if (!cooldown) return;
    const id = setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1_000);
    return () => clearInterval(id);
  }, [cooldown]);

  const form = useZodForm({
    schema: verifyEmailRequestSchema,
    read: data => ({ email: data.get('email'), code: data.get('code') }),
    submit: verifyEmail,
    onSuccess: user => {
      sessionStorage.removeItem(debugKey);
      router.replace(HOME_BY_ROLE[user.role]);
    },
  });

  async function onResend() {
    if (!email || resending || cooldown) return;
    setResending(true);
    setResendError(null);
    setInfo(null);
    try {
      const pending = await resendOtp({ email });
      if (pending.debugCode) {
        sessionStorage.setItem(debugKey, pending.debugCode);
        setDebugCode(pending.debugCode);
      } else {
        setInfo('A new code was sent. Check your inbox.');
      }
      setCooldown(60);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'RATE_LIMITED' && error.retryAfterSeconds) setCooldown(error.retryAfterSeconds);
      setResendError(describeError(error));
    } finally {
      setResending(false);
    }
  }

  if (!email) {
    return (
      <div className="grid gap-4">
        <Alert tone="warning" title="Missing email.">Start from the registration form so we know which account to verify.</Alert>
        <Button variant="primary" fullWidth onClick={() => router.replace('/register')}>Back to registration</Button>
      </div>
    );
  }

  return (
    <form onSubmit={form.onSubmit} noValidate className="grid gap-5">
      <Alert tone="info">Enter the 6-digit verification code for <strong className="break-all">{email}</strong>.</Alert>
      {debugCode ? <Alert tone="warning" title="Local verification code">{debugCode}</Alert> : null}
      {info ? <Alert tone="success">{info}</Alert> : null}
      {form.formError ? <Alert tone="error">{form.formError}</Alert> : null}
      {resendError ? <Alert tone="error">{resendError}</Alert> : null}
      <input type="hidden" name="email" value={email} />
      <TextField
        label="Verification code"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="123456"
        required
        error={form.errors.code}
      />
      <Button type="submit" variant="primary" size="lg" fullWidth loading={form.pending} loadingText="Verifying…" icon={<ShieldCheck className="size-5" aria-hidden="true" />}>
        Verify and continue
      </Button>
      <Button type="button" variant="ghost" fullWidth loading={resending} disabled={cooldown > 0} onClick={() => void onResend()}>
        {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
      </Button>
    </form>
  );
}
