-- Panel lifecycle / retired households audit
-- Run this in PostgreSQL / Supabase SQL editor or apply it as a migration.

-- 1) Ensure panel_updates table exists
CREATE TABLE IF NOT EXISTS public.panel_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid,
  hhid text NOT NULL,
  region_id uuid,
  region text,
  current_status text NOT NULL,
  mos integer,
  sec integer,
  environment text,
  is_rejected boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Optional index for quick retrieval / dashboarding
CREATE INDEX IF NOT EXISTS idx_panel_updates_recorded_at
  ON public.panel_updates (recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_panel_updates_hhid
  ON public.panel_updates (hhid);

-- 2) Write a lifecycle update every time a household is moved to RETIRED
CREATE OR REPLACE FUNCTION public.log_panel_lifecycle_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_region text;
  v_region_id uuid;
  v_mos integer;
  v_sec integer;
  v_environment text;
BEGIN
  -- Log strictly on transition to RETIRED
  IF NEW.current_status = 'RETIRED'
     AND (OLD.current_status IS DISTINCT FROM NEW.current_status) THEN

    SELECT
      ph.region_id,
      COALESCE(r.region_name, ph.region_name, ph.region),
      ph.mos_mapped,
      ph.sec_mapped,
      UPPER(TRIM(COALESCE(ph.environment, 'PROD')))
    INTO v_region_id, v_region, v_mos, v_sec, v_environment
    FROM public.panel_households ph
    LEFT JOIN public.regions r
      ON r.id = ph.region_id
    WHERE ph.hhid = NEW.hhid
    LIMIT 1;

    INSERT INTO public.panel_updates (
      household_id,
      hhid,
      region_id,
      region,
      current_status,
      mos,
      sec,
      environment,
      is_rejected,
      recorded_at
    )
    VALUES (
      NEW.id,
      NEW.hhid,
      v_region_id,
      v_region,
      NEW.current_status,
      v_mos,
      v_sec,
      COALESCE(v_environment, 'PROD'),
      false,
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Drop old trigger if it exists, replace with retired lifecycle trigger
DROP TRIGGER IF EXISTS trg_panel_households_deinstalled_log ON public.panel_households;
DROP TRIGGER IF EXISTS trg_panel_households_lifecycle_log ON public.panel_households;

CREATE TRIGGER trg_panel_households_lifecycle_log
AFTER UPDATE OF current_status
ON public.panel_households
FOR EACH ROW
WHEN (
  NEW.current_status = 'RETIRED'
  AND (OLD.current_status IS DISTINCT FROM NEW.current_status)
)
EXECUTE FUNCTION public.log_panel_lifecycle_update();

-- 3) Optional helper to show rejected households together with member details
CREATE OR REPLACE FUNCTION public.get_panel_updates_with_members()
RETURNS TABLE (
  id uuid,
  household_id uuid,
  hhid text,
  region_id uuid,
  region text,
  current_status text,
  mos integer,
  sec integer,
  environment text,
  is_rejected boolean,
  sla_deadline timestamptz,
  sla_breached boolean,
  recorded_at timestamptz,
  member_count bigint,
  member_gender_summary jsonb,
  member_age_summary jsonb
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH member_summary AS (
    SELECT
      pm.hhid,
      COUNT(*) AS member_count,
      jsonb_agg(
        jsonb_build_object('gender', pm.gender, 'age', pm.age)
        ORDER BY pm.id
      ) AS member_details
    FROM public.panel_members pm
    GROUP BY pm.hhid
  )
  SELECT
    pu.id,
    pu.household_id,
    pu.hhid,
    pu.region_id,
    pu.region,
    pu.current_status,
    pu.mos,
    pu.sec,
    pu.environment,
    pu.is_rejected,
    pu.sla_deadline,
    pu.sla_breached,
    pu.recorded_at,
    COALESCE(ms.member_count, 0) AS member_count,
    COALESCE(ms.member_details, '[]'::jsonb) AS member_gender_summary,
    COALESCE(ms.member_details, '[]'::jsonb) AS member_age_summary
  FROM public.panel_updates pu
  LEFT JOIN member_summary ms ON ms.hhid = pu.hhid
  ORDER BY pu.recorded_at DESC;
$$;

-- 4) Optional lifecycle progression helper:
--    UNASSIGNED  -> DEINSTALLED after 3 days  (SLA clock starts at UNASSIGNED transition)
--    DEINSTALLED -> RETIRED after 30 days     (SLA clock starts at DEINSTALLED transition)
--    Reinstatement back to INSTALLED/TRAINING/PRODUCTION is allowed ONLY from RETIRED.
--    DEINSTALLED households CANNOT be directly reinstated.
CREATE OR REPLACE FUNCTION public.advance_panel_lifecycle()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.panel_households
  SET current_status = 'DEINSTALLED'
  WHERE current_status = 'UNASSIGNED'
    AND updated_at IS NOT NULL
    AND updated_at <= NOW() - INTERVAL '3 days';

  UPDATE public.panel_households
  SET current_status = 'RETIRED'
  WHERE current_status = 'DEINSTALLED'
    AND updated_at IS NOT NULL
    AND updated_at <= NOW() - INTERVAL '30 days';
END;
$$;
