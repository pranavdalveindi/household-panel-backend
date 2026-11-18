"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_ROLES = exports.ABSOLUTE_SESSION_TIMEOUT_MS = void 0;
exports.authenticate = authenticate;
const supabase_1 = require("../database/supabase");
exports.ABSOLUTE_SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours in ms
exports.ALLOWED_ROLES = ['developer', 'admin'];
async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }
    const token = authHeader.split(' ')[1];
    // Let Supabase validate its own token — works with ES256, HS256, any algorithm
    const { data: { user }, error } = await supabase_1.supabase.auth.getUser(token);
    if (error || !user) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
    }
    // 1. Enforce 2-hour absolute session timeout from user's last login
    if (user.last_sign_in_at) {
        const sessionAge = Date.now() - new Date(user.last_sign_in_at).getTime();
        if (sessionAge >= exports.ABSOLUTE_SESSION_TIMEOUT_MS) {
            res.status(401).json({
                error: 'Absolute session timeout (2 hours) reached. Please log in again.',
                code: 'SESSION_TIMEOUT',
            });
            return;
        }
    }
    // 2. Enforce company domain
    if (!user.email?.endsWith('@inditronics.com')) {
        res.status(403).json({ error: 'Unauthorized domain' });
        return;
    }
    // 3. Enforce strictly allowed roles (developer or admin)
    const { data: roleData } = await supabase_1.supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
    const rawRole = roleData?.role ?? '';
    if (!exports.ALLOWED_ROLES.includes(rawRole)) {
        res.status(403).json({
            error: 'Unauthorized role. Only developer and admin accounts are permitted.',
        });
        return;
    }
    req.user = {
        id: user.id,
        email: user.email,
        role: rawRole,
    };
    next();
}
