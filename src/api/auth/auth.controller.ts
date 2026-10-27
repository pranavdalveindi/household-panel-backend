import { Request, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { env } from '../../config/env'
import { AuthRequest } from '../../middleware/auth'

// Dedicated ephemeral client for authentication requests so that signInWithPassword
// does NOT mutate or attach user sessions to the main database client.
function getAuthClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' })
    return
  }

  try {
    const authClient = getAuthClient()
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      res.status(401).json({ error: error.message })
      return
    }

    res.json({
      access_token: data.session?.access_token,
      refresh_token: data.session?.refresh_token,
      session: data.session,
      user: data.user,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to authenticate', details: message })
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refresh_token } = req.body

  if (!refresh_token) {
    res.status(400).json({ error: 'refresh_token is required' })
    return
  }

  try {
    const authClient = getAuthClient()
    const { data, error } = await authClient.auth.refreshSession({
      refresh_token,
    })

    if (error || !data.session) {
      res.status(401).json({ error: error?.message || 'Failed to refresh token' })
      return
    }

    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      session: data.session,
      user: data.user,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to refresh session', details: message })
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, message: 'Logged out successfully' })
}

export async function getMe(req: AuthRequest, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  res.json({ user: req.user })
}
