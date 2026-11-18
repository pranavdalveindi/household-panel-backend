import { Request, Response, NextFunction } from 'express'
import { supabase } from '../database/supabase'

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    role: string
  }
}

export const ABSOLUTE_SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000 // 2 hours in ms
export const ALLOWED_ROLES = ['developer', 'admin'] as const

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' })
    return
  }

  const token = authHeader.split(' ')[1]

  // Let Supabase validate its own token — works with ES256, HS256, any algorithm
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  // 1. Enforce 2-hour absolute session timeout from user's last login
  if (user.last_sign_in_at) {
    const sessionAge = Date.now() - new Date(user.last_sign_in_at).getTime()
    if (sessionAge >= ABSOLUTE_SESSION_TIMEOUT_MS) {
      res.status(401).json({
        error: 'Absolute session timeout (2 hours) reached. Please log in again.',
        code: 'SESSION_TIMEOUT',
      })
      return
    }
  }

  // 2. Enforce company domain
  if (!user.email?.endsWith('@inditronics.com')) {
    res.status(403).json({ error: 'Unauthorized domain' })
    return
  }

  // 3. Enforce strictly allowed roles (developer or admin)
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  const rawRole = roleData?.role ?? ''
  if (!ALLOWED_ROLES.includes(rawRole as any)) {
    res.status(403).json({
      error: 'Unauthorized role. Only developer and admin accounts are permitted.',
    })
    return
  }

  req.user = {
    id: user.id,
    email: user.email,
    role: rawRole,
  }

  next()
}