-- ==============================================================================
-- Panel Module Postgres Functions for Supabase
-- Run this script in the Supabase SQL Editor
-- ==============================================================================

-- 1. get_panel_summary
-- Returns total_target, total_live, total_shortfall, and breakdowns by region, sec, and mosr
CREATE OR REPLACE FUNCTION get_panel_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total_target INT;
  v_total_live INT;
  v_total_shortfall INT;
  v_by_region JSONB;
  v_by_sec JSONB;
  v_by_mosr JSONB;
BEGIN
  SELECT COALESCE(SUM(target_count), 0) INTO v_total_target FROM panel_master_targets;
  SELECT COALESCE(COUNT(*), 0) INTO v_total_live FROM panel_live_data;
  v_total_shortfall := v_total_target - v_total_live;

  -- Breakdown by Region
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
      FROM panel_live_data
      GROUP BY region_id
    ) l ON l.region_id = r.id
  ) sub;

  -- Breakdown by SEC (1 to 5)
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
      SELECT sec, COUNT(*) AS live
      FROM panel_live_data
      WHERE sec IS NOT NULL
      GROUP BY sec
    ) l ON l.sec = s.sec
  ) sub;

  -- Breakdown by MOSR (1 to 6)
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
      SELECT mosr, COUNT(*) AS live
      FROM panel_live_data
      WHERE mosr IS NOT NULL
      GROUP BY mosr
    ) l ON l.mosr = m.mosr
  ) sub;

  RETURN jsonb_build_object(
    'total_target', v_total_target,
    'total_live', v_total_live,
    'total_shortfall', v_total_shortfall,
    'by_region', v_by_region,
    'by_sec', v_by_sec,
    'by_mosr', v_by_mosr
  );
END;
$$;


-- 2. get_panel_heatmap
-- Returns a flat array of SEC × MOSR cells across all regions
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
      SELECT sec, mosr, COUNT(*) AS live
      FROM panel_live_data
      WHERE sec IS NOT NULL AND mosr IS NOT NULL
      GROUP BY sec, mosr
    ) l ON l.sec = grid.sec AND l.mosr = grid.mosr
  ) sub;

  RETURN v_cells;
END;
$$;


-- 3. get_panel_region_breakdown
-- Returns the full SEC × MOSR breakdown for a single region
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
  FROM panel_live_data
  WHERE region_id = v_region.id;

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
      SELECT sec, mosr, COUNT(*) AS live
      FROM panel_live_data
      WHERE region_id = v_region.id AND sec IS NOT NULL AND mosr IS NOT NULL
      GROUP BY sec, mosr
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
-- Returns all live data rows where sec IS NULL or mosr IS NULL, with their hhid and region_name, plus a total count
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
  FROM panel_live_data
  WHERE sec IS NULL OR mosr IS NULL;

  SELECT COALESCE(jsonb_agg(sub), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT 
      pld.id,
      pld.hhid,
      pld.region_id,
      r.region_code,
      r.region_name,
      pld.sec,
      pld.mosr,
      pld.created_at
    FROM panel_live_data pld
    LEFT JOIN regions r ON r.id = pld.region_id
    WHERE pld.sec IS NULL OR pld.mosr IS NULL
    ORDER BY pld.created_at DESC, pld.hhid ASC
  ) sub;

  RETURN jsonb_build_object(
    'total', v_total,
    'total_count', v_total,
    'rows', v_rows,
    'unclassified', v_rows
  );
END;
$$;

