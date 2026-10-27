"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.updateUserRole = exports.createUser = exports.listUsers = void 0;
const supabase_1 = require("../../../database/supabase");
const listUsers = async (req, res) => {
    const { data: authUsers, error } = await supabase_1.supabase.auth.admin.listUsers();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    const { data: roles } = await supabase_1.supabase.from('user_roles').select('user_id, role');
    const roleMap = Object.fromEntries((roles ?? []).map(r => [r.user_id, r.role]));
    const users = authUsers.users.map(u => ({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at ?? null,
        role: roleMap[u.id] ?? null,
    }));
    res.json({ users });
};
exports.listUsers = listUsers;
const createUser = async (req, res) => {
    const { email, password, role } = req.body;
    const ALLOWED_ROLES = ['data_team', 'call_center', 'field_executive', 'developer', 'admin'];
    if (!email || !password || !role) {
        res.status(400).json({ error: 'email, password and role are required' });
        return;
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail.endsWith('@inditronics.com')) {
        res.status(400).json({ error: 'Only @inditronics.com emails are allowed' });
        return;
    }
    if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
    }
    if (!ALLOWED_ROLES.includes(role)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
    }
    const { data: authUser, error: createError } = await supabase_1.supabase.auth.admin.createUser({
        email: normalizedEmail,
        password,
        email_confirm: true,
    });
    if (createError || !authUser.user) {
        res.status(500).json({ error: createError?.message ?? 'Failed to create user' });
        return;
    }
    const { error: roleError } = await supabase_1.supabase
        .from('user_roles')
        .insert({ user_id: authUser.user.id, role });
    if (roleError) {
        await supabase_1.supabase.auth.admin.deleteUser(authUser.user.id);
        res.status(500).json({ error: 'Failed to assign role, user creation rolled back' });
        return;
    }
    res.status(201).json({ id: authUser.user.id, email: normalizedEmail, role });
};
exports.createUser = createUser;
const updateUserRole = async (req, res) => {
    const { userId } = req.params;
    const { role } = req.body;
    const ALLOWED_ROLES = ['data_team', 'call_center', 'field_executive', 'developer', 'admin'];
    if (!ALLOWED_ROLES.includes(role)) {
        res.status(400).json({ error: 'Invalid role' });
        return;
    }
    const { error } = await supabase_1.supabase
        .from('user_roles')
        .upsert({ user_id: userId, role });
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ success: true });
};
exports.updateUserRole = updateUserRole;
const deleteUser = async (req, res) => {
    const { userId } = req.params;
    if (userId === req.user.id) {
        res.status(400).json({ error: 'You cannot delete your own account' });
        return;
    }
    const { error } = await supabase_1.supabase.auth.admin.deleteUser(userId);
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json({ success: true });
};
exports.deleteUser = deleteUser;
