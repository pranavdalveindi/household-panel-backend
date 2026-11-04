"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPanelDemographics = exports.getPanelUpdates = exports.getPanelUnclassified = exports.getPanelRegion = exports.getPanelHeatmap = exports.getPanelSummary = void 0;
const panel_repository_1 = require("./panel.repository");
/**
 * GET /api/panel/summary
 * Returns total_target, total_live, total_shortfall, status counts, and breakdowns.
 */
const getPanelSummary = async (req, res) => {
    try {
        const { repo, source } = (0, panel_repository_1.getPanelRepositoryWithSource)(req);
        console.log(`[Panel API] /summary served from: ${source}`);
        res.setHeader('x-data-source', source);
        const data = await repo.getSummary();
        res.json({ ...data, _source: source });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({ error: 'Failed to fetch panel summary', details: message });
    }
};
exports.getPanelSummary = getPanelSummary;
/**
 * GET /api/panel/heatmap
 * Returns flat array of SEC × MOSR cells across all regions with target, live, shortfall.
 */
const getPanelHeatmap = async (req, res) => {
    try {
        const { repo, source } = (0, panel_repository_1.getPanelRepositoryWithSource)(req);
        res.setHeader('x-data-source', source);
        const data = await repo.getHeatmap();
        res.json(data);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({ error: 'Failed to fetch panel heatmap', details: message });
    }
};
exports.getPanelHeatmap = getPanelHeatmap;
/**
 * GET /api/panel/region/:regionCode
 * Returns SEC × MOSR breakdown for a single region.
 */
const getPanelRegion = async (req, res) => {
    const rawCode = Array.isArray(req.params.regionCode) ? req.params.regionCode[0] : req.params.regionCode;
    if (!rawCode) {
        res.status(400).json({ error: 'Region code is required' });
        return;
    }
    try {
        const { repo, source } = (0, panel_repository_1.getPanelRepositoryWithSource)(req);
        res.setHeader('x-data-source', source);
        const data = await repo.getRegion(rawCode);
        if (!data) {
            res.status(404).json({ error: `Region ${rawCode} not found` });
            return;
        }
        res.json(data);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({ error: 'Failed to fetch region breakdown', details: message });
    }
};
exports.getPanelRegion = getPanelRegion;
/**
 * GET /api/panel/unclassified
 * Returns all live data rows where sec_mapped IS NULL or mos_mapped IS NULL in PRODUCTION.
 */
const getPanelUnclassified = async (req, res) => {
    try {
        const { repo, source } = (0, panel_repository_1.getPanelRepositoryWithSource)(req);
        res.setHeader('x-data-source', source);
        const data = await repo.getUnclassified();
        res.json(data);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({ error: 'Failed to fetch unclassified live data', details: message });
    }
};
exports.getPanelUnclassified = getPanelUnclassified;
/**
 * GET /api/panel/updates
 * Returns panel lifecycle updates (e.g. DEINSTALLED), enriched with member counts and details.
 */
const getPanelUpdates = async (req, res) => {
    try {
        const { repo, source } = (0, panel_repository_1.getPanelRepositoryWithSource)(req);
        console.log(`[Panel API] /updates served from: ${source}`);
        res.setHeader('x-data-source', source);
        const data = await repo.getUpdates();
        res.json(data);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({ total: 0, rows: [], error: message });
    }
};
exports.getPanelUpdates = getPanelUpdates;
/**
 * GET /api/panel/demographics
 * Returns age and gender breakdown of members in PRODUCTION households.
 */
const getPanelDemographics = async (req, res) => {
    try {
        const { repo, source } = (0, panel_repository_1.getPanelRepositoryWithSource)(req);
        console.log(`[Panel API] /demographics served from: ${source}`);
        res.setHeader('x-data-source', source);
        const data = await repo.getDemographics();
        res.json(data);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({ error: 'Failed to fetch panel demographics', details: message });
    }
};
exports.getPanelDemographics = getPanelDemographics;
