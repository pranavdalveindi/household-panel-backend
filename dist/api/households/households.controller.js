"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patchHousehold = exports.getHouseholds = void 0;
const supabase_1 = require("../../database/supabase");
const CALL_STATUSES = ['call successful', 'Not reachable', 'Number does not connect'];
const APPOINTMENT_CALL_STATUSES = ['Scheduled', 'Rejected'];
const INSTALLATION_STATUSES = ['pending', 'installed', 'rejected'];
const getHouseholds = async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.max(1, parseInt(req.query.limit) || 25);
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit - 1;
        const role = req.user?.role;
        // 1. Fetch paginated households and operational counts in parallel
        const [{ data: households, count: totalCount, error: householdsError }, { count: notReachableCount }, { count: callSuccessfulCount }, { count: scheduledCount },] = await Promise.all([
            supabase_1.supabase
                .from('survey_households')
                .select('*', { count: 'exact' })
                .order('created_at', { ascending: false })
                .order('id', { ascending: true })
                .range(startIndex, endIndex),
            supabase_1.supabase
                .from('household_call_records')
                .select('id', { count: 'exact', head: true })
                .ilike('call_status', '%Not reachable%'),
            supabase_1.supabase
                .from('household_call_records')
                .select('id', { count: 'exact', head: true })
                .ilike('call_status', '%call successful%'),
            supabase_1.supabase
                .from('household_call_records')
                .select('id', { count: 'exact', head: true })
                .eq('appointment_call_status', 'Scheduled'),
        ]);
        if (householdsError) {
            res.status(500).json({ error: householdsError.message });
            return;
        }
        const rawRecords = households || [];
        const householdIds = rawRecords.map((h) => h.id);
        // 2. Fetch call records, installations, and appointments for this page's households
        const callRecordsMap = {};
        const installationsMap = {};
        const appointmentsMap = {};
        if (householdIds.length > 0) {
            const [{ data: callRecords }, { data: installationRecords }, { data: appointments },] = await Promise.all([
                supabase_1.supabase
                    .from('household_call_records')
                    .select('survey_household_id, call_status, appointment_call_status, scheduled_date, processed_at, processed_by')
                    .in('survey_household_id', householdIds),
                supabase_1.supabase
                    .from('household_installations')
                    .select('survey_household_id, installation_status, remarks, updated_by, updated_at')
                    .in('survey_household_id', householdIds),
                supabase_1.supabase
                    .from('household_appointments')
                    .select('id, household_record_id, scheduled_at, created_by, created_at')
                    .in('household_record_id', householdIds)
                    .order('scheduled_at', { ascending: true }),
            ]);
            if (callRecords) {
                for (const cr of callRecords) {
                    callRecordsMap[cr.survey_household_id] = cr;
                }
            }
            if (installationRecords) {
                for (const inst of installationRecords) {
                    installationsMap[inst.survey_household_id] = inst;
                }
            }
            if (appointments) {
                for (const appt of appointments) {
                    if (!appointmentsMap[appt.household_record_id]) {
                        appointmentsMap[appt.household_record_id] = [];
                    }
                    appointmentsMap[appt.household_record_id].push({
                        id: appt.id,
                        scheduled_at: appt.scheduled_at,
                        created_by: appt.created_by,
                        created_at: appt.created_at,
                    });
                }
            }
        }
        // 3. Mask PII if role is 'data_team' and merge workflow states
        const isDataTeam = role === 'data_team';
        const sanitizedHouseholds = rawRecords.map((record) => {
            const appts = appointmentsMap[record.id] || [];
            const call = callRecordsMap[record.id];
            const installation = installationsMap[record.id];
            const base = {
                ...record,
                call_status: call?.call_status ?? null,
                appointment_call_status: call?.appointment_call_status ?? null,
                scheduled_date: call?.scheduled_date ?? null,
                processed_at: call?.processed_at ?? null,
                processed_by: call?.processed_by ?? null,
                installation_status: installation?.installation_status ?? 'pending',
                remarks: installation?.remarks ?? null,
                appointments: appts,
            };
            if (isDataTeam) {
                return {
                    ...base,
                    respondent_name: null,
                    contact_number: null,
                    telephone_number: null,
                    household_address_or_nearest_landmark: null,
                    full_address_or_landmark: null,
                    confirmation_respondent_name: null,
                    confirmation_contact_number: null,
                    confirmation_address_or_location: null,
                    preferred_contact_person: null,
                    preferred_contact_number: null,
                    special_instructions_for_field_team: null,
                };
            }
            return base;
        });
        const total = totalCount || 0;
        const totalPages = Math.max(1, Math.ceil(total / limit));
        res.json({
            households: sanitizedHouseholds,
            pagination: {
                total,
                page,
                limit,
                totalPages,
            },
            counts: {
                total,
                not_reachable: notReachableCount || 0,
                call_successful: callSuccessfulCount || 0,
                scheduled: scheduledCount || 0,
            },
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message || 'Failed to fetch households' });
    }
};
exports.getHouseholds = getHouseholds;
const patchHousehold = async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const role = req.user?.role;
    if (!id) {
        res.status(400).json({ error: 'Household ID is required' });
        return;
    }
    // Verify survey household exists
    const { data: household, error: fetchError } = await supabase_1.supabase
        .from('survey_households')
        .select('id')
        .eq('id', id)
        .single();
    if (fetchError || !household) {
        res.status(404).json({ error: 'Household not found' });
        return;
    }
    if (role === 'call_center') {
        const { call_status, appointment_call_status } = req.body;
        if (call_status === undefined && appointment_call_status === undefined) {
            res.status(400).json({ error: 'At least one of call_status or appointment_call_status must be provided' });
            return;
        }
        // Fetch current call record
        const { data: currentRecord } = await supabase_1.supabase
            .from('household_call_records')
            .select('call_status, appointment_call_status, scheduled_date')
            .eq('survey_household_id', id)
            .single();
        let effectiveCallStatus = currentRecord?.call_status;
        const now = new Date().toISOString();
        const upsertPayload = {
            survey_household_id: id,
            processed_by: req.user.id,
            processed_at: now,
            updated_at: now,
        };
        // 1. Process call_status if provided
        if (call_status !== undefined) {
            const raw = typeof call_status === 'string' ? call_status.trim() : '';
            const matched = CALL_STATUSES.find((s) => s.toLowerCase() === raw.toLowerCase());
            if (!matched) {
                res.status(400).json({ error: 'Invalid call_status' });
                return;
            }
            effectiveCallStatus = matched;
            upsertPayload.call_status = matched;
        }
        // 2. Process appointment_call_status based on effectiveCallStatus
        if (effectiveCallStatus !== 'call successful') {
            // If the call was NOT successful (e.g. Not reachable, Number does not connect):
            // An appointment can NEVER be 'Scheduled'.
            if (typeof appointment_call_status === 'string' &&
                appointment_call_status.trim().toLowerCase() === 'scheduled') {
                res.status(400).json({ error: 'Call must be successful before setting appointment status to Scheduled' });
                return;
            }
            // When call is not successful, appointment status is automatically Rejected and scheduled_date is cleared
            upsertPayload.appointment_call_status = 'Rejected';
            upsertPayload.scheduled_date = null;
        }
        else {
            // Call IS successful
            if (appointment_call_status !== undefined && appointment_call_status !== null && appointment_call_status !== '') {
                const raw = typeof appointment_call_status === 'string' ? appointment_call_status.trim() : '';
                const matchedAppt = APPOINTMENT_CALL_STATUSES.find((s) => s.toLowerCase() === raw.toLowerCase());
                if (!matchedAppt) {
                    res.status(400).json({ error: 'Invalid appointment_call_status' });
                    return;
                }
                upsertPayload.appointment_call_status = matchedAppt;
                if (matchedAppt === 'Rejected') {
                    upsertPayload.scheduled_date = null;
                }
            }
        }
        const { data: updatedCall, error } = await supabase_1.supabase
            .from('household_call_records')
            .upsert(upsertPayload, { onConflict: 'survey_household_id' })
            .select()
            .single();
        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }
        res.json({
            success: true,
            household: {
                id,
                call_status: updatedCall?.call_status ?? effectiveCallStatus ?? null,
                appointment_call_status: updatedCall?.appointment_call_status ?? null,
                scheduled_date: updatedCall?.scheduled_date ?? null,
            },
        });
        return;
    }
    if (role === 'field_executive') {
        const { installation_status, remarks } = req.body;
        if (!installation_status) {
            res.status(400).json({ error: 'installation_status is required' });
            return;
        }
        const normalized = typeof installation_status === 'string' ? installation_status.trim().toLowerCase() : '';
        if (!INSTALLATION_STATUSES.includes(normalized)) {
            res.status(400).json({ error: 'Invalid installation_status' });
            return;
        }
        const updatePayload = {
            survey_household_id: id,
            installation_status: normalized,
            updated_by: req.user.id,
            updated_at: new Date().toISOString(),
        };
        if (remarks !== undefined) {
            updatePayload.remarks = remarks;
        }
        const { error } = await supabase_1.supabase
            .from('household_installations')
            .upsert(updatePayload, { onConflict: 'survey_household_id' });
        if (error) {
            res.status(500).json({ error: error.message });
            return;
        }
        res.json({
            success: true,
            household: {
                id,
                installation_status: normalized,
                remarks: remarks ?? null,
            },
        });
        return;
    }
    res.status(403).json({ error: 'Unauthorized role' });
};
exports.patchHousehold = patchHousehold;
