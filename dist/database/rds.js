"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rdsPool = void 0;
const pg_1 = require("pg");
const env_1 = require("../config/env");
exports.rdsPool = new pg_1.Pool({
    host: env_1.env.POSTGRES_HOST,
    port: parseInt(env_1.env.POSTGRES_PORT, 10),
    user: env_1.env.POSTGRES_USER,
    password: env_1.env.POSTGRES_PASSWORD,
    database: env_1.env.POSTGRES_DB,
    ssl: {
        rejectUnauthorized: false, // required for AWS RDS
    },
    max: 10, // max connections in pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});
// Test the connection on startup
exports.rdsPool.connect((err, client, release) => {
    if (err) {
        console.error('RDS connection error:', err.message);
        return;
    }
    console.log('RDS connected successfully');
    release?.();
});
