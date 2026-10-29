import { Pool } from 'pg'
import { env } from '../config/env'

export const rdsPool = new Pool({
  host: env.POSTGRES_HOST,
  port: parseInt(env.POSTGRES_PORT, 10),
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  database: env.POSTGRES_DB,
  ssl: {
    rejectUnauthorized: false, // required for AWS RDS
  },
  max: 10, // max connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// Test the connection on startup
rdsPool.connect((err, client, release) => {
  if (err) {
    console.error('RDS connection error:', err.message)
    return
  }
  console.log('RDS connected successfully')
  release?.()
})
