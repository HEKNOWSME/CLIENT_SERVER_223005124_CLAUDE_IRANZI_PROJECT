'use client';

import type { UnreadCount } from '@pmrms/contracts';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';
import { workspaceChanged } from './realtime';

export function useUnreadNotifications(enabled: boolean) {
  const { authRequest } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await authRequest<UnreadCount>('/notifications/unread-count');
      setCount(data.count);
    } catch {
      // Keep the last known count if a poll fails.
    }
  }, [authRequest, enabled]);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    void refresh();
    const onFocus = () => void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener(workspaceChanged, onFocus);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(workspaceChanged, onFocus);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [enabled, refresh]);

  return { count, refresh };
}
