import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env'

// Admin database client — configured to never persist or mutate session state
// Always uses the service role key to bypass RLS for server-side queries
export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

export default supabase