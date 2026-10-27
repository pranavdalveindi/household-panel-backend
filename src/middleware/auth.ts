import { Request, Response, NextFunction } from 'express'
import { supabase } from '../database/supabase'

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    role: string
  }
}

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

  if (!user.email?.endsWith('@inditronics.com')) {
    res.status(403).json({ error: 'Unauthorized domain' })
    return
  }

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  req.user = {
    id: user.id,
    email: user.email,
    role: roleData?.role ?? '',
  }

  next()
}