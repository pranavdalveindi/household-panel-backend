import { Request } from 'express'
import { IPanelRepository } from './panel.repository.interface'
import { PanelSupabaseRepository } from './panel.supabase.repo'
import { PanelRdsRepository } from './panel.rds.repo'

// Singleton instances
const supabaseRepo = new PanelSupabaseRepository()
const rdsRepo = new PanelRdsRepository()

/**
 * Returns the appropriate repository based on:
 * 1. Request Header: `x-environment: DEV` or `x-environment: PROD`
 * 2. Query param: `?env=dev` or `?env=prod`
 * 3. Environment variable: `PANEL_DATA_SOURCE=RDS` or `PANEL_DATA_SOURCE=SUPABASE`
 * 4. Default: 'SUPABASE' (or 'RDS' if in production)
 */
export type DataSource = 'RDS' | 'SUPABASE'

export function getPanelRepositoryWithSource(req?: Request): { repo: IPanelRepository; source: DataSource } {
  // 1. Check request header override
  const headerEnv = req?.headers['x-environment'] as string | undefined
  if (headerEnv) {
    const normalized = headerEnv.trim().toUpperCase()
    if (normalized === 'PROD' || normalized === 'PRODUCTION' || normalized === 'RDS') {
      return { repo: rdsRepo, source: 'RDS' }
    }
    if (normalized === 'DEV' || normalized === 'DEVELOPMENT' || normalized === 'SUPABASE') {
      return { repo: supabaseRepo, source: 'SUPABASE' }
    }
  }

  // 2. Check query parameter override
  const queryEnv = req?.query?.env as string | undefined
  if (queryEnv) {
    const normalized = queryEnv.trim().toUpperCase()
    if (normalized === 'PROD' || normalized === 'PRODUCTION' || normalized === 'RDS') {
      return { repo: rdsRepo, source: 'RDS' }
    }
    if (normalized === 'DEV' || normalized === 'DEVELOPMENT' || normalized === 'SUPABASE') {
      return { repo: supabaseRepo, source: 'SUPABASE' }
    }
  }

  // 3. Check environment variable
  const configEnv = (process.env.PANEL_DATA_SOURCE || '').trim().toUpperCase()
  if (configEnv === 'RDS' || configEnv === 'PROD' || configEnv === 'PRODUCTION') {
    return { repo: rdsRepo, source: 'RDS' }
  }

  // 4. Default fallback
  return { repo: supabaseRepo, source: 'SUPABASE' }
}

export function getPanelRepository(req?: Request): IPanelRepository {
  return getPanelRepositoryWithSource(req).repo
}


