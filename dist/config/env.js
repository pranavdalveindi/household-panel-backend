"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.env = {
    PORT: process.env.PORT || 4000,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
    ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
    // Future RDS
    RDS_HOST: process.env.RDS_HOST,
    RDS_USER: process.env.RDS_USER,
    RDS_PASSWORD: process.env.RDS_PASSWORD,
    RDS_DATABASE: process.env.RDS_DATABASE,
    // AWS RDS Postgres
    POSTGRES_HOST: process.env.POSTGRES_HOST,
    POSTGRES_PORT: process.env.POSTGRES_PORT || '5432',
    POSTGRES_USER: process.env.POSTGRES_USER,
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
    POSTGRES_DB: process.env.POSTGRES_DB,
};
// Temporary debug log: does not expose secret keys
console.log('[SUPABASE CONFIG DEBUG]', {
    urlConfigured: Boolean(exports.env.SUPABASE_URL),
    urlHost: exports.env.SUPABASE_URL
        ? new URL(exports.env.SUPABASE_URL).host
        : null,
    serviceRoleKeyConfigured: Boolean(exports.env.SUPABASE_SERVICE_ROLE_KEY),
});
