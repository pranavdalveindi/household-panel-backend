import { Response } from 'express'
import { AuthRequest } from '../../middleware/auth'
import { getPanelRepositoryWithSource } from './panel.repository'

/**
 * GET /api/panel/summary
 * Returns total_target, total_live, total_shortfall, status counts, and breakdowns.
 */
export const getPanelSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { repo, source } = getPanelRepositoryWithSource(req)
    console.log(`[Panel API] /summary served from: ${source}`)
    res.setHeader('x-data-source', source)
    const data = await repo.getSummary()
    res.json({ ...data, _source: source })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch panel summary', details: message })
  }
}

/**
 * GET /api/panel/heatmap
 * Returns flat array of SEC × MOSR cells across all regions with target, live, shortfall.
 */
export const getPanelHeatmap = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { repo, source } = getPanelRepositoryWithSource(req)
    res.setHeader('x-data-source', source)
    const data = await repo.getHeatmap()
    res.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch panel heatmap', details: message })
  }
}

/**
 * GET /api/panel/region/:regionCode
 * Returns SEC × MOSR breakdown for a single region.
 */
export const getPanelRegion = async (req: AuthRequest, res: Response): Promise<void> => {
  const rawCode = Array.isArray(req.params.regionCode) ? req.params.regionCode[0] : req.params.regionCode

  if (!rawCode) {
    res.status(400).json({ error: 'Region code is required' })
    return
  }

  try {
    const { repo, source } = getPanelRepositoryWithSource(req)
    res.setHeader('x-data-source', source)
    const data = await repo.getRegion(rawCode)

    if (!data) {
      res.status(404).json({ error: `Region ${rawCode} not found` })
      return
    }

    res.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch region breakdown', details: message })
  }
}

/**
 * GET /api/panel/unclassified
 * Returns all live data rows where sec_mapped IS NULL or mos_mapped IS NULL in PRODUCTION.
 */
export const getPanelUnclassified = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { repo, source } = getPanelRepositoryWithSource(req)
    res.setHeader('x-data-source', source)
    const data = await repo.getUnclassified()
    res.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch unclassified live data', details: message })
  }
}

/**
 * GET /api/panel/updates
 * Returns panel lifecycle updates (e.g. DEINSTALLED), enriched with member counts and details.
 */
export const getPanelUpdates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { repo, source } = getPanelRepositoryWithSource(req)
    console.log(`[Panel API] /updates served from: ${source}`)
    res.setHeader('x-data-source', source)
    const data = await repo.getUpdates()
    res.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ total: 0, rows: [], error: message })
  }
}

/**
 * GET /api/panel/demographics
 * Returns age and gender breakdown of members in PRODUCTION households.
 */
export const getPanelDemographics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { repo, source } = getPanelRepositoryWithSource(req)
    console.log(`[Panel API] /demographics served from: ${source}`)
    res.setHeader('x-data-source', source)
    const data = await repo.getDemographics()
    res.json(data)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    res.status(500).json({ error: 'Failed to fetch panel demographics', details: message })
  }
}

