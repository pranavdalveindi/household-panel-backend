"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
exports.refresh = refresh;
exports.logout = logout;
exports.getMe = getMe;
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("../../config/env");
// Dedicated ephemeral client for authentication requests so that signInWithPassword
// does NOT mutate or attach user sessions to the main database client.
function getAuthClient() {
    return (0, supabase_js_1.createClient)(env_1.env.SUPABASE_URL, env_1.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
async function login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required' });
        return;
    }
    try {
        const authClient = getAuthClient();
        const { data, error } = await authClient.auth.signInWithPassword({
            email,
            password,
        });
        if (error) {
            res.status(401).json({ error: error.message });
            return;
        }
        res.json({
            access_token: data.session?.access_token,
            refresh_token: data.session?.refresh_token,
            session: data.session,
            user: data.user,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: 'Failed to authenticate', details: message });
    }
}
async function refresh(req, res) {
    const { refresh_token } = req.body;
    if (!refresh_token) {
        res.status(400).json({ error: 'refresh_token is required' });
        return;
    }
    try {
        const authClient = getAuthClient();
        const { data, error } = await authClient.auth.refreshSession({
            refresh_token,
        });
        if (error || !data.session) {
            res.status(401).json({ error: error?.message || 'Failed to refresh token' });
            return;
        }
        res.json({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            session: data.session,
            user: data.user,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        res.status(500).json({ error: 'Failed to refresh session', details: message });
    }
}
async function logout(_req, res) {
    res.json({ success: true, message: 'Logged out successfully' });
}
async function getMe(req, res) {
    if (!req.user) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    res.json({ user: req.user });
}
