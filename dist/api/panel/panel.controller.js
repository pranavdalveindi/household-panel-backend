"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPanelUnclassified = exports.getPanelRegion = exports.getPanelHeatmap = exports.getPanelSummary = void 0;
const supabase_1 = require("../../database/supabase");
/**
 * GET /api/panel/summary
 * Returns total_target, total_live, total_shortfall, and breakdowns by region, sec, and mosr.
 */
const getPanelSummary = async (req, res) => {
    try {
        const { data, error } = await supabase_1.supabase.rpc('get_panel_summary');
        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }
        res.json(data);
        return;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({ error: 'Failed to fetch panel summary', details: message });
        return;
    }
};
exports.getPanelSummary = getPanelSummary;
/**
 * GET /api/panel/heatmap
 * Returns a flat array of SEC × MOSR cells across all regions with target, live, shortfall, and shortfall_pct.
 */
const getPanelHeatmap = async (req, res) => {
    try {
        const { data, error } = await supabase_1.supabase.rpc('get_panel_heatmap');
        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }
        res.json(data);
        return;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({ error: 'Failed to fetch panel heatmap', details: message });
        return;
    }
};
exports.getPanelHeatmap = getPanelHeatmap;
/**
 * GET /api/panel/region/:regionCode
 * Returns the full SEC × MOSR breakdown for a single region with target, live, shortfall, and shortfall_pct per cell.
 */
const getPanelRegion = async (req, res) => {
    const rawCode = Array.isArray(req.params.regionCode) ? req.params.regionCode[0] : req.params.regionCode;
    if (!rawCode) {
        res.status(400).json({ error: 'Region code is required' });
        return;
    }
    const regionCode = parseInt(rawCode, 10);
    if (isNaN(regionCode)) {
        res.status(400).json({ error: 'Invalid region code. Must be a valid integer' });
        return;
    }
    try {
        const { data, error } = await supabase_1.supabase.rpc('get_panel_region_breakdown', {
            p_region_code: regionCode,
        });
        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }
        if (!data) {
            res.status(404).json({ error: `Region with code ${regionCode} not found` });
            return;
        }
        res.json(data);
        return;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({ error: 'Failed to fetch region breakdown', details: message });
        return;
    }
};
exports.getPanelRegion = getPanelRegion;
/**
 * GET /api/panel/unclassified
 * Returns all live data rows where sec IS NULL or mosr IS NULL, with their hhid and region_name, plus a total count.
 */
const getPanelUnclassified = async (req, res) => {
    try {
        const { data, error } = await supabase_1.supabase.rpc('get_panel_unclassified');
        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }
        res.json(data);
        return;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({ error: 'Failed to fetch unclassified live data', details: message });
        return;
    }
};
exports.getPanelUnclassified = getPanelUnclassified;
