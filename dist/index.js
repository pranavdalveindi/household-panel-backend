"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const env_1 = require("./config/env");
const auth_1 = require("./middleware/auth");
const auth_routes_1 = __importDefault(require("./api/auth/auth.routes"));
const households_routes_1 = __importDefault(require("./api/households/households.routes"));
const appointments_routes_1 = __importDefault(require("./api/appointments/appointments.routes"));
const users_routes_1 = __importDefault(require("./api/admin/users/users.routes"));
const app = (0, express_1.default)();
app.use((0, helmet_1.default)());
// Allow requests from frontend running on localhost:3000, 3001, 127.0.0.1, or configured ALLOWED_ORIGIN
const allowedOrigins = [
    env_1.env.ALLOWED_ORIGIN,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
].filter(Boolean);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or server-to-server)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
            callback(null, true); // Permissive in dev to avoid blocking dashboard
        }
    },
    credentials: true,
}));
app.use(express_1.default.json());
// Public routes
app.get('/health', (_, res) => res.json({ status: 'ok' }));
app.use('/api/auth', auth_routes_1.default);
// All routes below require authentication
app.use(auth_1.authenticate);
app.use('/api/households', households_routes_1.default);
app.use('/api/households/:id/appointments', appointments_routes_1.default);
app.use('/api/admin/users', users_routes_1.default);
app.listen(env_1.env.PORT, () => {
    console.log(`API running on port ${env_1.env.PORT}`);
});
exports.default = app;
