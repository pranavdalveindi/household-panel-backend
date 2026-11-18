import { Router } from 'express'
import {
  getPanelSummary,
  getPanelHeatmap,
  getPanelRegion,
  getPanelUnclassified,
  getPanelUpdates,
  getPanelDemographics,
  getPanelViewership,
} from './panel.controller'

const router = Router()

// All panel routes are read-only and protected by the authenticate middleware in index.ts
router.get('/summary', getPanelSummary)
router.get('/heatmap', getPanelHeatmap)
router.get('/region/:regionCode', getPanelRegion)
router.get('/unclassified', getPanelUnclassified)
router.get('/updates', getPanelUpdates)
router.get('/demographics', getPanelDemographics)
router.get('/viewership', getPanelViewership)

export default router

