-- The migration owner seeds demo data. The restricted API role is subject to
-- these policies and gets its verified actor ID only inside a transaction.
CREATE FUNCTION public.pmrms_actor_id()
RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(current_setting('pmrms.actor_id', true), '')::uuid
$$;

CREATE FUNCTION public.pmrms_can_read_patient(target_patient uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.patients p
    JOIN public.users patient_user ON patient_user.id = p.user_id
    JOIN public.users actor ON actor.id = public.pmrms_actor_id()
    WHERE p.id = target_patient
      AND patient_user.status = 'ACTIVE' AND patient_user.email_verified_at IS NOT NULL
      AND actor.status = 'ACTIVE' AND actor.email_verified_at IS NOT NULL
      AND (
        (actor.role = 'PATIENT' AND actor.id = p.user_id)
        OR (actor.role = 'DOCTOR' AND EXISTS (
          SELECT 1
          FROM public.doctor_patients a
          JOIN public.doctors d ON d.id = a.doctor_id
          WHERE a.patient_id = p.id AND a.status = 'ACTIVE'
            AND d.user_id = actor.id AND d.verification_status = 'APPROVED'
        ))
      )
  )
$$;

CREATE FUNCTION public.pmrms_can_write_record(target_patient uuid, author_doctor uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT public.pmrms_can_read_patient(target_patient) AND EXISTS (
    SELECT 1
    FROM public.doctors d
    JOIN public.users u ON u.id = d.user_id
    WHERE d.id = author_doctor AND u.id = public.pmrms_actor_id()
      AND u.role = 'DOCTOR' AND d.verification_status = 'APPROVED'
  )
$$;

ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
CREATE POLICY records_read ON public.records FOR SELECT
  USING (public.pmrms_can_read_patient(patient_id));
CREATE POLICY records_insert ON public.records FOR INSERT
  WITH CHECK (public.pmrms_can_write_record(patient_id, doctor_id) AND status = 'ACTIVE' AND version = 1);
CREATE POLICY records_update ON public.records FOR UPDATE
  USING (status = 'ACTIVE' AND public.pmrms_can_write_record(patient_id, doctor_id))
  WITH CHECK (public.pmrms_can_write_record(patient_id, doctor_id));

ALTER TABLE public.medical_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY medical_files_read ON public.medical_files FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.records r WHERE r.id = record_id));
CREATE POLICY medical_files_insert ON public.medical_files FOR INSERT
  WITH CHECK (uploaded_by_id = public.pmrms_actor_id() AND EXISTS (
    SELECT 1 FROM public.records r WHERE r.id = record_id AND r.status = 'ACTIVE'
      AND public.pmrms_can_write_record(r.patient_id, r.doctor_id)
  ));

ALTER TABLE public.record_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY record_revisions_read ON public.record_revisions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.records r WHERE r.id = record_id
    AND public.pmrms_can_write_record(r.patient_id, r.doctor_id)));
CREATE POLICY record_revisions_insert ON public.record_revisions FOR INSERT
  WITH CHECK (changed_by_id = public.pmrms_actor_id() AND EXISTS (
    SELECT 1 FROM public.records r WHERE r.id = record_id
      AND public.pmrms_can_write_record(r.patient_id, r.doctor_id)
  ));
