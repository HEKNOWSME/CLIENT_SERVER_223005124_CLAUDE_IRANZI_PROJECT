-- Apply after Prisma migrations as the same table owner on the dedicated Supabase project.
BEGIN;

-- Keep public API roles away from all PMRMS tables, including tables without clinical RLS.
REVOKE ALL ON TABLE public."SystemCheck", public._prisma_migrations, public.users, public.patients,
  public.doctors, public.doctor_patients, public.records, public.medical_files, public.record_revisions,
  public.access_logs, public.notifications, public.refresh_sessions, public.email_otps, public.outbox_events
  FROM PUBLIC, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated, service_role;

DROP POLICY IF EXISTS pmrms_receive ON realtime.messages;
DROP POLICY IF EXISTS pmrms_receive_boundary ON realtime.messages;
DROP POLICY IF EXISTS pmrms_send_boundary ON realtime.messages;

CREATE POLICY pmrms_receive ON realtime.messages FOR SELECT TO authenticated
USING (
  extension = 'broadcast'
  AND (SELECT auth.jwt()) ->> 'pmrms_realtime' = 'true'
  AND (SELECT realtime.topic()) = 'pmrms:user:' || ((SELECT auth.jwt()) ->> 'sub')
  AND topic = (SELECT realtime.topic())
);

-- A permissive policy from another feature cannot grant access to a PMRMS topic.
CREATE POLICY pmrms_receive_boundary ON realtime.messages AS RESTRICTIVE FOR SELECT TO authenticated, anon
USING (
  CASE WHEN topic LIKE 'pmrms:user:%' OR (SELECT realtime.topic()) LIKE 'pmrms:user:%'
    OR (SELECT auth.jwt()) ->> 'pmrms_realtime' = 'true'
  THEN extension = 'broadcast'
    AND (SELECT auth.jwt()) ->> 'pmrms_realtime' = 'true'
    AND (SELECT realtime.topic()) = 'pmrms:user:' || ((SELECT auth.jwt()) ->> 'sub')
    AND topic = (SELECT realtime.topic())
  ELSE true END
);

CREATE POLICY pmrms_send_boundary ON realtime.messages AS RESTRICTIVE FOR INSERT TO authenticated, anon
WITH CHECK (
  (SELECT realtime.topic()) NOT LIKE 'pmrms:user:%'
  AND topic NOT LIKE 'pmrms:user:%'
  AND COALESCE((SELECT auth.jwt()) ->> 'pmrms_realtime', '') <> 'true'
);

CREATE OR REPLACE FUNCTION public.pmrms_notify_realtime()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  PERFORM realtime.send(
    '{}'::jsonb,
    'workspace.changed',
    'pmrms:user:' || NEW.recipient_user_id::text,
    true
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Committed notifications stay available through the API if Broadcast is unavailable.
  RAISE WARNING 'PMRMS Broadcast skipped (SQLSTATE %)', SQLSTATE;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.pmrms_notify_realtime() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS pmrms_notification_broadcast ON public.notifications;
CREATE TRIGGER pmrms_notification_broadcast AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.pmrms_notify_realtime();

COMMIT;
