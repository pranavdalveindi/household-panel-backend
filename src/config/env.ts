import dotenv from 'dotenv'

dotenv.config()

export const env = {
  PORT: process.env.PORT || 4000,
  SUPABASE_URL: process.env.SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET!,
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',

  // Future RDS
  RDS_HOST: process.env.RDS_HOST,
  RDS_USER: process.env.RDS_USER,
  RDS_PASSWORD: process.env.RDS_PASSWORD,
  RDS_DATABASE: process.env.RDS_DATABASE,
}

// Temporary debug log: does not expose secret keys
console.log('[SUPABASE CONFIG DEBUG]', {
  urlConfigured: Boolean(env.SUPABASE_URL),
  urlHost: env.SUPABASE_URL
    ? new URL(env.SUPABASE_URL).host
    : null,
  serviceRoleKeyConfigured: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
})