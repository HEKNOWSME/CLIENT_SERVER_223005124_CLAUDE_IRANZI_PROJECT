'use client';

import {
  authSessionSchema, authUserSchema, registrationPendingSchema,
  type AuthSession, type AuthUser, type LoginRequest, type RegisterDoctorRequest, type RegisterPatientRequest,
  type RegistrationPending, type ResendOtpRequest, type VerifyEmailRequest,
} from '@pmrms/contracts';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, apiRequest, CSRF_HEADERS, jsonBody } from './api';
import { HOME_BY_ROLE } from './roles';

type AuthState =
  | { status: 'loading' }
  | { status: 'anonymous'; reason: 'none' | 'expired' | 'signed-out' }
  | { status: 'authenticated'; user: AuthUser; expiresAt: number };

interface AuthContextValue {
  state: AuthState;
  login(input: LoginRequest): Promise<AuthUser>;
  registerPatient(input: RegisterPatientRequest): Promise<RegistrationPending>;
  verifyEmail(input: VerifyEmailRequest): Promise<AuthUser>;
  resendOtp(input: ResendOtpRequest): Promise<RegistrationPending>;
  registerDoctor(input: RegisterDoctorRequest): Promise<AuthUser>;
  logout(): Promise<void>;
  logoutAllDevices(): Promise<void>;
  /** Authenticated API call: attaches the access token and retries once after a refresh on 401. */
  authRequest<T>(path: string, init?: RequestInit, schema?: Parameters<typeof apiRequest<T>>[2]): Promise<T>;
  reloadUser(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const CHANNEL = 'pmrms-auth';
const REFRESH_LOCK = 'pmrms-auth-refresh';
const REFRESH_EARLY_MS = 60_000;

/**
 * Refresh tokens are single-use: two concurrent refreshes would look like token theft and revoke
 * the session. The Web Locks API serialises refreshes across every tab of this origin, so the
 * second caller waits and then sends the already-rotated cookie.
 */
async function refreshWithLock(): Promise<AuthSession | null> {
  const run = async () => {
    try {
      return await apiRequest('/auth/refresh', { method: 'POST', headers: CSRF_HEADERS }, authSessionSchema);
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
      throw error;
    }
  };
  return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(REFRESH_LOCK, run) : run();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  // The access token lives only in memory, never in localStorage or a readable cookie.
  const accessToken = useRef<string | null>(null);
  const inFlight = useRef<Promise<AuthSession | null> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const refreshRef = useRef<() => Promise<AuthSession | null>>(async () => null);

  const clearSession = useCallback((reason: 'none' | 'expired' | 'signed-out') => {
    accessToken.current = null;
    if (timer.current) clearTimeout(timer.current);
    setState({ status: 'anonymous', reason });
  }, []);

  const applySession = useCallback((session: AuthSession) => {
    accessToken.current = session.accessToken;
    const expiresAt = Date.now() + session.expiresIn * 1000;
    setState({ status: 'authenticated', user: session.user, expiresAt });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void refreshRef.current(), Math.max(5_000, session.expiresIn * 1000 - REFRESH_EARLY_MS));
    return session.user;
  }, []);

  const refresh = useCallback((): Promise<AuthSession | null> => {
    inFlight.current ??= refreshWithLock()
      .then(session => {
        if (session) applySession(session);
        else clearSession(accessToken.current ? 'expired' : 'none');
        return session;
      })
      .catch(() => {
        // Network failure: keep the current state and let the next request retry.
        if (!accessToken.current) clearSession('none');
        return null;
      })
      .finally(() => { inFlight.current = null; });
    return inFlight.current;
  }, [applySession, clearSession]);
  refreshRef.current = refresh;

  useEffect(() => {
    void refresh();
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (event: MessageEvent<string>) => {
      if (event.data === 'signed-out') clearSession('signed-out');
      if (event.data === 'signed-in') void refresh();
    };
    channel.current = bc;
    return () => { bc.close(); channel.current = null; if (timer.current) clearTimeout(timer.current); };
  }, [refresh, clearSession]);

  const startSession = useCallback(async (path: string, body: unknown) => {
    const session = await apiRequest(path, jsonBody(body), authSessionSchema);
    channel.current?.postMessage('signed-in');
    return applySession(session);
  }, [applySession]);

  const authRequest = useCallback(async <T,>(path: string, init: RequestInit = {}, schema?: Parameters<typeof apiRequest<T>>[2]) => {
    const send = (token: string) => apiRequest<T>(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } }, schema);
    const token = accessToken.current ?? (await refresh())?.accessToken;
    if (!token) throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
    try {
      return await send(token);
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const renewed = await refresh();
      if (!renewed) throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
      return send(renewed.accessToken);
    }
  }, [refresh]);

  const reloadUser = useCallback(async () => {
    const user = await authRequest('/auth/me', {}, authUserSchema);
    setState(current => current.status === 'authenticated' ? { ...current, user } : current);
  }, [authRequest]);

  const value = useMemo<AuthContextValue>(() => ({
    state,
    login: input => startSession('/auth/login', input),
    registerPatient: input => apiRequest('/auth/register/patient', jsonBody(input), registrationPendingSchema),
    verifyEmail: input => startSession('/auth/verify-email', input),
    resendOtp: input => apiRequest('/auth/resend-otp', jsonBody(input), registrationPendingSchema),
    registerDoctor: input => startSession('/auth/register/doctor-request', input),
    async logout() {
      try { await apiRequest('/auth/logout', { method: 'POST', headers: CSRF_HEADERS }); } finally {
        channel.current?.postMessage('signed-out');
        clearSession('signed-out');
      }
    },
    async logoutAllDevices() {
      try { await authRequest('/auth/logout-all', { method: 'POST' }); } finally {
        channel.current?.postMessage('signed-out');
        clearSession('signed-out');
      }
    },
    authRequest,
    reloadUser,
  }), [state, startSession, clearSession, authRequest, reloadUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>.');
  return context;
}

/** Accepts only same-site relative paths inside the user's own area, so `?next=` cannot redirect elsewhere. */
export function safeNextPath(next: string | null, user: AuthUser): string {
  const home = HOME_BY_ROLE[user.role];
  if (next && next.startsWith('/') && !next.startsWith('//') && (next === home || next.startsWith(`${home}/`))) return next;
  return home;
}
