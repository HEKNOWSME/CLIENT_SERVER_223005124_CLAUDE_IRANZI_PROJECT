'use client';

import { realtimeSessionSchema } from '@pmrms/contracts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { useAuth } from './auth';

export const workspaceChanged = 'pmrms:workspace-changed';

export function useWorkspaceRealtime(userId: string | null) {
  const { authRequest, reloadUser } = useAuth();

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    let client: SupabaseClient | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let throttle: ReturnType<typeof setTimeout> | undefined;
    let delay = 2000;
    const getLease = () => authRequest('/realtime/session', { signal: controller.signal }, realtimeSessionSchema);
    const notify = () => {
      if (controller.signal.aborted || throttle) return;
      throttle = setTimeout(() => {
        throttle = undefined;
        window.dispatchEvent(new Event(workspaceChanged));
        void reloadUser().catch(() => undefined);
      }, 250);
    };

    async function connect() {
      if (controller.signal.aborted) return;
      try {
        let lease = await getLease();
        if (!lease || controller.signal.aborted) return;
        const { createClient } = await import('@supabase/supabase-js');
        if (controller.signal.aborted) return;

        let refreshing: ReturnType<typeof getLease> | undefined;
        client = createClient(lease.url, lease.publishableKey, {
          accessToken: async () => {
            if (controller.signal.aborted) return null;
            if (lease && lease.expiresAt - Date.now() > 50000) return lease.token;
            refreshing ??= getLease().finally(() => { refreshing = undefined; });
            lease = await refreshing;
            return lease?.token ?? null;
          },
        });
        client.channel(lease.topic, { config: { private: true } })
          .on('broadcast', { event: 'workspace.changed' }, notify)
          .subscribe(status => {
            if (status === 'SUBSCRIBED') {
              delay = 2000;
              notify();
            }
            if (status === 'CLOSED' && !controller.signal.aborted && !retry) {
              client?.realtime.disconnect();
              client = undefined;
              scheduleRetry();
            }
          });
      } catch {
        scheduleRetry();
      }
    }

    function scheduleRetry() {
      if (controller.signal.aborted || retry) return;
      retry = setTimeout(() => { retry = undefined; void connect(); }, delay);
      delay = Math.min(delay * 2, 30000);
    }

    void connect();
    return () => {
      controller.abort();
      clearTimeout(retry);
      clearTimeout(throttle);
      if (client) {
        const shuttingDown = client;
        void shuttingDown.removeAllChannels().finally(() => shuttingDown.realtime.disconnect()).catch(() => undefined);
      }
    };
  }, [authRequest, reloadUser, userId]);
}
