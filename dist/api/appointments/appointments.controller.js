"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteAppointment = exports.createAppointment = exports.getAppointments = void 0;
const supabase_1 = require("../../database/supabase");
const getAppointments = async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
        res.status(400).json({ error: 'Household ID is required' });
        return;
    }
    const { data, error } = await supabase_1.supabase
        .from('household_appointments')
        .select('id, household_record_id, scheduled_at, created_by, created_at')
        .eq('household_record_id', id)
        .order('scheduled_at', { ascending: true });
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ appointments: data });
};
exports.getAppointments = getAppointments;
const createAppointment = async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { scheduled_at } = req.body;
    if (!id) {
        res.status(400).json({ error: 'Household ID is required' });
        return;
    }
    if (!scheduled_at) {
        res.status(400).json({ error: 'scheduled_at is required' });
        return;
    }
    const parsed = new Date(scheduled_at);
    if (isNaN(parsed.getTime())) {
        res.status(400).json({ error: 'Invalid datetime' });
        return;
    }
    if (parsed <= new Date()) {
        res.status(400).json({ error: 'Appointment must be a future date and time' });
        return;
    }
    // Check appointment_call_status in household_call_records
    const { data: callRecord, error: fetchError } = await supabase_1.supabase
        .from('household_call_records')
        .select('appointment_call_status')
        .eq('survey_household_id', id)
        .single();
    if (fetchError || !callRecord) {
        res.status(404).json({ error: 'Household call record not found' });
        return;
    }
    if (callRecord.appointment_call_status !== 'Scheduled') {
        res.status(400).json({ error: 'Appointment call status must be Scheduled' });
        return;
    }
    const { data, error } = await supabase_1.supabase
        .from('household_appointments')
        .insert({
        household_record_id: id,
        scheduled_at: parsed.toISOString(),
        created_by: req.user.id,
    })
        .select()
        .single();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    // Update scheduled_date in household_call_records
    const scheduledDateOnly = parsed.toISOString().split('T')[0];
    await supabase_1.supabase
        .from('household_call_records')
        .update({
        scheduled_date: scheduledDateOnly,
        updated_at: new Date().toISOString(),
    })
        .eq('survey_household_id', id);
    res.status(201).json(data);
};
exports.createAppointment = createAppointment;
const deleteAppointment = async (req, res) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const appointmentId = Array.isArray(req.params.appointmentId)
        ? req.params.appointmentId[0]
        : req.params.appointmentId;
    if (!id || !appointmentId) {
        res.status(400).json({ error: 'Household ID and Appointment ID are required' });
        return;
    }
    const { error } = await supabase_1.supabase
        .from('household_appointments')
        .delete()
        .eq('id', appointmentId)
        .eq('household_record_id', id);
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    // Check if remaining appointments exist for this household
    const { data: remaining } = await supabase_1.supabase
        .from('household_appointments')
        .select('scheduled_at')
        .eq('household_record_id', id)
        .order('scheduled_at', { ascending: true })
        .limit(1);
    const latestScheduledDate = remaining && remaining.length > 0 && remaining[0]?.scheduled_at
        ? new Date(remaining[0].scheduled_at).toISOString().split('T')[0]
        : null;
    await supabase_1.supabase
        .from('household_call_records')
        .update({
        scheduled_date: latestScheduledDate,
        updated_at: new Date().toISOString(),
    })
        .eq('survey_household_id', id);
    res.json({ message: 'Appointment deleted successfully.' });
};
exports.deleteAppointment = deleteAppointment;
