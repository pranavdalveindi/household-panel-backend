"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPanelUpdates = exports.getPanelUnclassified = exports.getPanelRegion = exports.getPanelHeatmap = exports.getPanelSummary = void 0;
const supabase_1 = require("../../database/supabase");
const getAgeFromDob = (dob) => {
    if (!dob)
        return null;
    const birthDate = new Date(dob);
    if (Number.isNaN(birthDate.getTime()))
        return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age -= 1;
    }
    return age;
};
/**
 * Direct database query assembler for panel summary & region matrices.
 * Guaranteed to work regardless of RPC function state in Supabase.
 */
async function fetchPanelSummaryDirect() {
    // 1. Fetch regions
    const { data: regionsData } = await supabase_1.supabase
        .from('regions')
        .select('id, region_name, region_code')
        .order('region_name', { ascending: true });
    const regions = regionsData ?? [];
    // 2. Fetch panel_master_targets
    const { data: targetsData } = await supabase_1.supabase
        .from('panel_master_targets')
        .select('region_id, sec, mosr, target_count');
    const targets = targetsData ?? [];
    // 3. Fetch panel_households
    const { data: householdsData } = await supabase_1.supabase
        .from('panel_households')
        .select('region_id, sec_mapped, mos_mapped, current_status, environment');
    const households = householdsData ?? [];
    // Filter households by status
    const prodHouseholds = households.filter((h) => h.current_status === 'PRODUCTION' && (h.environment ? h.environment.trim().toUpperCase() === 'PROD' : true));
    const installedCount = households.filter((h) => h.current_status === 'INSTALLED' && (h.environment ? h.environment.trim().toUpperCase() === 'PROD' : true)).length;
    const trainingCount = households.filter((h) => (h.current_status === 'TRAINING_1' || h.current_status === 'TRAINING_2') &&
        (h.environment ? h.environment.trim().toUpperCase() === 'PROD' : true)).length;
    const totalTarget = targets.reduce((sum, t) => sum + (Number(t.target_count) || 0), 0);
    const totalLive = prodHouseholds.length;
    const totalShortfall = totalTarget - totalLive;
    // Breakdown by region
    const byRegion = regions.map((r, idx) => {
        const regTargets = targets.filter((t) => t.region_id === r.id);
        const regProd = prodHouseholds.filter((h) => h.region_id === r.id);
        const target = regTargets.reduce((sum, t) => sum + (Number(t.target_count) || 0), 0);
        const live = regProd.length;
        const shortfall = target - live;
        const shortfall_pct = target > 0 ? Number(((shortfall / target) * 100).toFixed(2)) : 0;
        return {
            region_id: r.id,
            region_code: r.region_code ?? idx + 1,
            region_name: r.region_name ?? `Region ${idx + 1}`,
            target,
            live,
            shortfall,
            shortfall_pct,
        };
    });
    // Full matrix per region (SEC 1..3 × MOSR 1..4)
    const matrix = regions.map((r, idx) => {
        const regTargets = targets.filter((t) => t.region_id === r.id);
        const regProd = prodHouseholds.filter((h) => h.region_id === r.id);
        const total_target = regTargets.reduce((sum, t) => sum + (Number(t.target_count) || 0), 0);
        const total_live = regProd.length;
        const cells = [];
        for (let sec = 1; sec <= 3; sec++) {
            for (let mosr = 1; mosr <= 4; mosr++) {
                const cellTarget = regTargets
                    .filter((t) => Number(t.sec) === sec && Number(t.mosr) === mosr)
                    .reduce((sum, t) => sum + (Number(t.target_count) || 0), 0);
                const cellLive = regProd.filter((h) => Number(h.sec_mapped) === sec && Number(h.mos_mapped) === mosr).length;
                cells.push({
                    sec,
                    mosr,
                    target: cellTarget,
                    live: cellLive,
                    shortfall: Math.max(0, cellTarget - cellLive),
                });
            }
        }
        return {
            region_id: r.id,
            region_code: r.region_code ?? idx + 1,
            region_name: r.region_name ?? `Region ${idx + 1}`,
            total_target,
            total_live,
            total_shortfall: Math.max(0, total_target - total_live),
            cells,
        };
    });
    // Breakdown by SEC (1..5)
    const bySec = [1, 2, 3, 4, 5].map((sec) => {
        const target = targets
            .filter((t) => Number(t.sec) === sec)
            .reduce((sum, t) => sum + (Number(t.target_count) || 0), 0);
        const live = prodHouseholds.filter((h) => Number(h.sec_mapped) === sec).length;
        const shortfall = target - live;
        const shortfall_pct = target > 0 ? Number(((shortfall / target) * 100).toFixed(2)) : 0;
        return { sec, target, live, shortfall, shortfall_pct };
    });
    // Breakdown by MOSR (1..6)
    const byMosr = [1, 2, 3, 4, 5, 6].map((mosr) => {
        const target = targets
            .filter((t) => Number(t.mosr) === mosr)
            .reduce((sum, t) => sum + (Number(t.target_count) || 0), 0);
        const live = prodHouseholds.filter((h) => Number(h.mos_mapped) === mosr).length;
        const shortfall = target - live;
        const shortfall_pct = target > 0 ? Number(((shortfall / target) * 100).toFixed(2)) : 0;
        return { mosr, target, live, shortfall, shortfall_pct };
    });
    return {
        total_target: totalTarget,
        total_live: totalLive,
        total_shortfall: totalShortfall,
        production_count: totalLive,
        installed_count: installedCount,
        training_count: trainingCount,
        by_region: byRegion,
        by_sec: bySec,
        by_mosr: byMosr,
        matrix,
    };
}
/**
 * GET /api/panel/summary
 * Returns total_target, total_live, total_shortfall, status counts, and breakdowns.
 */
const getPanelSummary = async (req, res) => {
    try {
        const { data, error } = await supabase_1.supabase.rpc('get_panel_summary');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!error && data && Array.isArray(data.matrix) && data.matrix.length > 0) {
            res.json(data);
            return;
        }
        // Direct database fallback
        const directData = await fetchPanelSummaryDirect();
        res.json(directData);
        return;
    }
    catch (err) {
        try {
            const directData = await fetchPanelSummaryDirect();
            res.json(directData);
            return;
        }
        catch (directErr) {
            const message = directErr instanceof Error ? directErr.message : 'Unknown error';
            res.status(500).json({ error: 'Failed to fetch panel summary', details: message });
            return;
        }
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
        if (!error && data) {
            res.json(data);
            return;
        }
        // Direct database fallback
        const summary = await fetchPanelSummaryDirect();
        const heatmapCells = [];
        for (let sec = 1; sec <= 5; sec++) {
            for (let mosr = 1; mosr <= 6; mosr++) {
                let target = 0;
                let live = 0;
                for (const reg of summary.matrix) {
                    const c = reg.cells.find((cell) => cell.sec === sec && cell.mosr === mosr);
                    if (c) {
                        target += c.target;
                        live += c.live;
                    }
                }
                const shortfall = Math.max(0, target - live);
                const shortfall_pct = target > 0 ? Number(((shortfall / target) * 100).toFixed(2)) : 0;
                heatmapCells.push({ sec, mosr, target, live, shortfall, shortfall_pct });
            }
        }
        res.json(heatmapCells);
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
    try {
        if (!isNaN(regionCode)) {
            const { data, error } = await supabase_1.supabase.rpc('get_panel_region_breakdown', {
                p_region_code: regionCode,
            });
            if (!error && data) {
                res.json(data);
                return;
            }
        }
        // Direct database fallback
        const summary = await fetchPanelSummaryDirect();
        const found = summary.matrix.find((m) => m.region_code === regionCode ||
            m.region_id === rawCode ||
            m.region_name.toLowerCase() === rawCode.toLowerCase());
        if (found) {
            res.json(found);
            return;
        }
        res.status(404).json({ error: `Region ${rawCode} not found` });
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
 * Returns all live data rows where sec_mapped IS NULL or mos_mapped IS NULL in PRODUCTION.
 */
const getPanelUnclassified = async (req, res) => {
    try {
        const { data, error } = await supabase_1.supabase.rpc('get_panel_unclassified');
        if (!error && data) {
            res.json(data);
            return;
        }
        // Direct database fallback
        const { data: rows, error: rowsErr } = await supabase_1.supabase
            .from('panel_households')
            .select('id, hhid, region_id, sec_mapped, mos_mapped, current_status, created_at')
            .eq('current_status', 'PRODUCTION')
            .or('sec_mapped.is.null,mos_mapped.is.null');
        if (rowsErr) {
            res.status(500).json({ error: rowsErr.message });
            return;
        }
        const unclassifiedRows = (rows ?? []).map((row) => ({
            ...row,
            sec: row.sec_mapped,
            mosr: row.mos_mapped,
        }));
        res.json({
            total: unclassifiedRows.length,
            total_count: unclassifiedRows.length,
            rows: unclassifiedRows,
            unclassified: unclassifiedRows,
        });
        return;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        res.status(500).json({ error: 'Failed to fetch unclassified live data', details: message });
        return;
    }
};
exports.getPanelUnclassified = getPanelUnclassified;
/**
 * GET /api/panel/updates
 * Returns all panel lifecycle updates recorded when a household is moved into DEINSTALLED.
 * Also enriches each entry with the member count and member details for the affected HHID.
 */
const getPanelUpdates = async (req, res) => {
    try {
        const { data: updates, error: updatesError } = await supabase_1.supabase
            .from('panel_updates')
            .select('id, household_id, hhid, region_id, current_status, mos, sec, environment, is_rejected, sla_deadline, sla_breached, recorded_at')
            .order('recorded_at', { ascending: false });
        if (updatesError) {
            console.error('panel_updates table query failed:', updatesError);
            res.json({
                total: 0,
                rows: [],
                error: updatesError.message,
            });
            return;
        }
        const regionIds = [...new Set((updates ?? []).map((row) => row.region_id).filter(Boolean))];
        const regionMap = new Map();
        if (regionIds.length > 0) {
            const { data: regions, error: regionsError } = await supabase_1.supabase
                .from('regions')
                .select('id, region_name')
                .in('id', regionIds);
            if (!regionsError) {
                for (const region of regions ?? []) {
                    if (region.id)
                        regionMap.set(region.id, region.region_name ?? 'Unknown');
                }
            }
        }
        const hhids = [...new Set((updates ?? []).map((row) => row.hhid).filter(Boolean))];
        const householdIds = [...new Set((updates ?? []).map((row) => row.household_id).filter(Boolean))];
        const membersByHhid = {};
        const membersByHouseholdId = {};
        if (hhids.length > 0 || householdIds.length > 0) {
            try {
                let membersQuery = supabase_1.supabase
                    .from('panel_members')
                    .select('hhid, household_id, member_code, gender, dob');
                if (hhids.length > 0) {
                    membersQuery = membersQuery.in('hhid', hhids);
                }
                if (householdIds.length > 0) {
                    membersQuery = membersQuery.in('household_id', householdIds);
                }
                const { data: members, error: membersError } = await membersQuery;
                if (membersError) {
                    console.warn('panel_members lookup failed for panel updates:', membersError);
                }
                else {
                    for (const member of members ?? []) {
                        const hhidKey = member.hhid;
                        const householdKey = member.household_id;
                        if (hhidKey) {
                            if (!membersByHhid[hhidKey])
                                membersByHhid[hhidKey] = [];
                            membersByHhid[hhidKey].push({
                                member_code: member.member_code ?? null,
                                gender: member.gender ?? null,
                                age: getAgeFromDob(member.dob ?? null),
                            });
                        }
                        if (householdKey) {
                            if (!membersByHouseholdId[householdKey])
                                membersByHouseholdId[householdKey] = [];
                            membersByHouseholdId[householdKey].push({
                                member_code: member.member_code ?? null,
                                gender: member.gender ?? null,
                                age: getAgeFromDob(member.dob ?? null),
                            });
                        }
                    }
                }
            }
            catch (memberErr) {
                console.warn('panel_members table is unavailable or mismatched:', memberErr);
            }
        }
        const rows = (updates ?? []).map((update) => {
            const members = (update.hhid && membersByHhid[update.hhid]) ||
                (update.household_id && membersByHouseholdId[update.household_id]) ||
                [];
            return {
                ...update,
                region: update.region_id ? regionMap.get(update.region_id) ?? 'Unknown' : 'Unknown',
                member_count: members.length,
                members,
            };
        });
        res.json({
            total: rows.length,
            rows,
        });
        return;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Unexpected error in getPanelUpdates:', err);
        res.json({
            total: 0,
            rows: [],
            error: message,
        });
        return;
    }
};
exports.getPanelUpdates = getPanelUpdates;
