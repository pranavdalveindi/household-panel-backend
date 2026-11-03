-- ==============================================================================
-- Panel Module Postgres Functions for Supabase
-- Updated to use panel_households table with sec_mapped & mos_mapped
-- SEC x MOSR considers: PRODUCTION only
-- Summary cards include: Production, Installed, Training (TRAINING_1 + TRAINING_2)
-- ============================================================================== 

-- 1. get_panel_summary
CREATE OR REPLACE FUNCTION get_panel_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_target INT;
  v_total_live INT;
  v_total_shortfall INT;
  v_production_count INT;
  v_installed_count INT;
  v_training_count INT;
  v_by_region JSONB;
  v_by_sec JSONB;
  v_by_mosr JSONB;
  v_matrix JSONB;
BEGIN
  SELECT COALESCE(SUM(target_count), 0) INTO v_total_target FROM panel_master_targets;

  -- 1. Production count
  SELECT COALESCE(COUNT(*), 0) INTO v_production_count
  FROM panel_households
  WHERE current_status = 'PRODUCTION'
    AND UPPER(TRIM(environment)) = 'PROD';

  -- 2. Installed count
  SELECT COALESCE(COUNT(*), 0) INTO v_installed_count
  FROM panel_households
  WHERE current_status = 'INSTALLED'
    AND UPPER(TRIM(environment)) = 'PROD';

  -- 3. Training count (both TRAINING_1 and TRAINING_2)
  SELECT COALESCE(COUNT(*), 0) INTO v_training_count
  FROM panel_households
  WHERE current_status IN ('TRAINING_1', 'TRAINING_2')
    AND UPPER(TRIM(environment)) = 'PROD';

  -- In SEC x MOSR, live is PRODUCTION
  v_total_live := v_production_count;
  v_total_shortfall := v_total_target - v_total_live;

  -- Breakdown by Region (Production only)
  SELECT COALESCE(jsonb_agg(sub ORDER BY sub.region_code), '[]'::jsonb)
  INTO v_by_region
  FROM (
    SELECT
      r.id AS region_id,
      r.region_code,
      r.region_name,
      COALESCE(t.target, 0) AS target,
      COALESCE(l.live, 0) AS live,
      (COALESCE(t.target, 0) - COALESCE(l.live, 0)) AS shortfall,
      CASE
        WHEN COALESCE(t.target, 0) > 0
        THEN ROUND(((COALESCE(t.target, 0) - COALESCE(l.live, 0))::numeric / t.target) * 100, 2)
        ELSE 0.00
      END AS shortfall_pct
    FROM regions r
    LEFT JOIN (
      SELECT region_id, SUM(target_count) AS target
      FROM panel_master_targets
      GROUP BY region_id
    ) t ON t.region_id = r.id
    LEFT JOIN (
      SELECT region_id, COUNT(*) AS live
      FROM panel_households
      WHERE current_status = 'PRODUCTION'
        AND UPPER(TRIM(environment)) = 'PROD'
      GROUP BY region_id
    ) l ON l.region_id = r.id
  ) sub;

  -- Breakdown by SEC (Production only, using sec_mapped)
  SELECT COALESCE(jsonb_agg(sub ORDER BY sub.sec), '[]'::jsonb)
  INTO v_by_sec
  FROM (
    SELECT
      s.sec,
      COALESCE(t.target, 0) AS target,
      COALESCE(l.live, 0) AS live,
      (COALESCE(t.target, 0) - COALESCE(l.live, 0)) AS shortfall,
      CASE
        WHEN COALESCE(t.target, 0) > 0
        THEN ROUND(((COALESCE(t.target, 0) - COALESCE(l.live, 0))::numeric / t.target) * 100, 2)
        ELSE 0.00
      END AS shortfall_pct
    FROM (SELECT generate_series(1, 5) AS sec) s
    LEFT JOIN (
      SELECT sec, SUM(target_count) AS target
      FROM panel_master_targets
      GROUP BY sec
    ) t ON t.sec = s.sec
    LEFT JOIN (
      SELECT ph.sec_mapped AS sec, COUNT(*) AS live
      FROM panel_households ph
      WHERE ph.sec_mapped IS NOT NULL
        AND ph.current_status = 'PRODUCTION'
        AND UPPER(TRIM(ph.environment)) = 'PROD'
      GROUP BY ph.sec_mapped
    ) l ON l.sec = s.sec
  ) sub;

  -- Breakdown by MOSR (Production only, using mos_mapped)
  SELECT COALESCE(jsonb_agg(sub ORDER BY sub.mosr), '[]'::jsonb)
  INTO v_by_mosr
  FROM (
    SELECT
      m.mosr,
      COALESCE(t.target, 0) AS target,
      COALESCE(l.live, 0) AS live,
      (COALESCE(t.target, 0) - COALESCE(l.live, 0)) AS shortfall,
      CASE
        WHEN COALESCE(t.target, 0) > 0
        THEN ROUND(((COALESCE(t.target, 0) - COALESCE(l.live, 0))::numeric / t.target) * 100, 2)
        ELSE 0.00
      END AS shortfall_pct
    FROM (SELECT generate_series(1, 6) AS mosr) m
    LEFT JOIN (
      SELECT mosr, SUM(target_count) AS target
      FROM panel_master_targets
      GROUP BY mosr
    ) t ON t.mosr = m.mosr
    LEFT JOIN (
      SELECT ph.mos_mapped AS mosr, COUNT(*) AS live
      FROM panel_households ph
      WHERE ph.mos_mapped IS NOT NULL
        AND ph.current_status = 'PRODUCTION'
        AND UPPER(TRIM(ph.environment)) = 'PROD'
      GROUP BY ph.mos_mapped
    ) l ON l.mosr = m.mosr
  ) sub;

  -- Full matrix breakdown per region (SEC 1..3 × MOSR 1..4)
  SELECT COALESCE(jsonb_agg(rm ORDER BY rm.region_name), '[]'::jsonb)
  INTO v_matrix
  FROM (
    SELECT
      r.id AS region_id,
      r.region_code,
      r.region_name,
      COALESCE(t_tot.target, 0) AS total_target,
      COALESCE(l_tot.live, 0) AS total_live,
      (COALESCE(t_tot.target, 0) - COALESCE(l_tot.live, 0)) AS total_shortfall,
      (
        SELECT COALESCE(jsonb_agg(c ORDER BY c.sec, c.mosr), '[]'::jsonb)
        FROM (
          SELECT
            grid.sec,
            grid.mosr,
            COALESCE(pmt.target_count, 0) AS target,
            COALESCE(ph_live.live, 0) AS live,
            (COALESCE(pmt.target_count, 0) - COALESCE(ph_live.live, 0)) AS shortfall
          FROM (
            SELECT s.sec, m.mosr
            FROM generate_series(1, 3) AS s(sec)
            CROSS JOIN generate_series(1, 4) AS m(mosr)
          ) grid
          LEFT JOIN panel_master_targets pmt
            ON pmt.region_id = r.id
           AND pmt.sec = grid.sec
           AND pmt.mosr = grid.mosr
          LEFT JOIN (
            SELECT ph.sec_mapped AS sec, ph.mos_mapped AS mosr, COUNT(*) AS live
            FROM panel_households ph
            WHERE ph.region_id = r.id
              AND ph.sec_mapped IS NOT NULL
              AND ph.mos_mapped IS NOT NULL
              AND ph.current_status = 'PRODUCTION'
              AND UPPER(TRIM(ph.environment)) = 'PROD'
            GROUP BY ph.sec_mapped, ph.mos_mapped
          ) ph_live
            ON ph_live.sec = grid.sec
           AND ph_live.mosr = grid.mosr
        ) c
      ) AS cells
    FROM regions r
    LEFT JOIN (
      SELECT region_id, SUM(target_count) AS target
      FROM panel_master_targets
      GROUP BY region_id
    ) t_tot ON t_tot.region_id = r.id
    LEFT JOIN (
      SELECT region_id, COUNT(*) AS live
      FROM panel_households
      WHERE current_status = 'PRODUCTION'
        AND UPPER(TRIM(environment)) = 'PROD'
      GROUP BY region_id
    ) l_tot ON l_tot.region_id = r.id
  ) rm;

  RETURN jsonb_build_object(
    'total_target', v_total_target,
    'total_live', v_total_live,
    'total_shortfall', v_total_shortfall,
    'production_count', v_production_count,
    'installed_count', v_installed_count,
    'training_count', v_training_count,
    'by_region', v_by_region,
    'by_sec', v_by_sec,
    'by_mosr', v_by_mosr,
    'matrix', v_matrix
  );
END;
$$;


-- 2. get_panel_heatmap
CREATE OR REPLACE FUNCTION get_panel_heatmap()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cells JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(sub ORDER BY sub.sec, sub.mosr), '[]'::jsonb)
  INTO v_cells
  FROM (
    SELECT
      grid.sec,
      grid.mosr,
      COALESCE(t.target, 0) AS target,
      COALESCE(l.live, 0) AS live,
      (COALESCE(t.target, 0) - COALESCE(l.live, 0)) AS shortfall,
      CASE
        WHEN COALESCE(t.target, 0) > 0
        THEN ROUND(((COALESCE(t.target, 0) - COALESCE(l.live, 0))::numeric / t.target) * 100, 2)
        ELSE 0.00
      END AS shortfall_pct
    FROM (
      SELECT s.sec, m.mosr
      FROM generate_series(1, 5) AS s(sec)
      CROSS JOIN generate_series(1, 6) AS m(mosr)
    ) grid
    LEFT JOIN (
      SELECT sec, mosr, SUM(target_count) AS target
      FROM panel_master_targets
      GROUP BY sec, mosr
    ) t ON t.sec = grid.sec AND t.mosr = grid.mosr
    LEFT JOIN (
      SELECT ph.sec_mapped AS sec,
             ph.mos_mapped AS mosr,
             COUNT(*) AS live
      FROM panel_households ph
      WHERE ph.sec_mapped IS NOT NULL
        AND ph.mos_mapped IS NOT NULL
        AND ph.current_status = 'PRODUCTION'
        AND UPPER(TRIM(ph.environment)) = 'PROD'
      GROUP BY ph.sec_mapped, ph.mos_mapped
    ) l ON l.sec = grid.sec AND l.mosr = grid.mosr
  ) sub;

  RETURN v_cells;
END;
$$;


-- 3. get_panel_region_breakdown
CREATE OR REPLACE FUNCTION get_panel_region_breakdown(p_region_code INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_region RECORD;
  v_cells JSONB;
  v_total_target INT;
  v_total_live INT;
  v_total_shortfall INT;
BEGIN
  SELECT id, region_code, region_name
  INTO v_region
  FROM regions
  WHERE region_code = p_region_code;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(target_count), 0)
  INTO v_total_target
  FROM panel_master_targets
  WHERE region_id = v_region.id;

  SELECT COALESCE(COUNT(*), 0)
  INTO v_total_live
  FROM panel_households
  WHERE region_id = v_region.id
    AND current_status = 'PRODUCTION'
    AND UPPER(TRIM(environment)) = 'PROD';

  v_total_shortfall := v_total_target - v_total_live;

  SELECT COALESCE(jsonb_agg(sub ORDER BY sub.sec, sub.mosr), '[]'::jsonb)
  INTO v_cells
  FROM (
    SELECT
      grid.sec,
      grid.mosr,
      COALESCE(t.target, 0) AS target,
      COALESCE(l.live, 0) AS live,
      (COALESCE(t.target, 0) - COALESCE(l.live, 0)) AS shortfall,
      CASE
        WHEN COALESCE(t.target, 0) > 0
        THEN ROUND(((COALESCE(t.target, 0) - COALESCE(l.live, 0))::numeric / t.target) * 100, 2)
        ELSE 0.00
      END AS shortfall_pct
    FROM (
      SELECT s.sec, m.mosr
      FROM generate_series(1, 5) AS s(sec)
      CROSS JOIN generate_series(1, 6) AS m(mosr)
    ) grid
    LEFT JOIN (
      SELECT sec, mosr, SUM(target_count) AS target
      FROM panel_master_targets
      WHERE region_id = v_region.id
      GROUP BY sec, mosr
    ) t ON t.sec = grid.sec AND t.mosr = grid.mosr
    LEFT JOIN (
      SELECT ph.sec_mapped AS sec,
             ph.mos_mapped AS mosr,
             COUNT(*) AS live
      FROM panel_households ph
      WHERE ph.region_id = v_region.id
        AND ph.sec_mapped IS NOT NULL
        AND ph.mos_mapped IS NOT NULL
        AND ph.current_status = 'PRODUCTION'
        AND UPPER(TRIM(ph.environment)) = 'PROD'
      GROUP BY ph.sec_mapped, ph.mos_mapped
    ) l ON l.sec = grid.sec AND l.mosr = grid.mosr
  ) sub;

  RETURN jsonb_build_object(
    'region_id', v_region.id,
    'region_code', v_region.region_code,
    'region_name', v_region.region_name,
    'total_target', v_total_target,
    'total_live', v_total_live,
    'total_shortfall', v_total_shortfall,
    'cells', v_cells
  );
END;
$$;

-- 4. get_panel_unclassified
CREATE OR REPLACE FUNCTION get_panel_unclassified()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total INT;
  v_rows JSONB;
BEGIN
  SELECT COUNT(*)
  INTO v_total
  FROM panel_households
  WHERE (sec_mapped IS NULL OR mos_mapped IS NULL)
    AND current_status = 'PRODUCTION'
    AND UPPER(TRIM(environment)) = 'PROD';

  SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      ph.id,
      ph.hhid,
      ph.region_id,
      r.region_code,
      r.region_name,
      ph.sec_mapped AS sec,
      ph.mos_mapped AS mosr,
      ph.current_status,
      ph.created_at
    FROM panel_households ph
    LEFT JOIN regions r ON r.id = ph.region_id
    WHERE (ph.sec_mapped IS NULL OR ph.mos_mapped IS NULL)
      AND ph.current_status = 'PRODUCTION'
      AND UPPER(TRIM(ph.environment)) = 'PROD'
    ORDER BY ph.created_at DESC, ph.hhid ASC
  ) sub;

  RETURN jsonb_build_object(
    'total', v_total,
    'total_count', v_total,
    'rows', v_rows,
    'unclassified', v_rows
  );
END;
$$;
