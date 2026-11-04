import {
  PanelSummary,
  HeatmapCell,
  PanelRegionMatrix,
  UnclassifiedResult,
  UpdatesResult,
  DemographicsSummary,
} from './panel.types'

export interface IPanelRepository {
  getSummary(): Promise<PanelSummary>
  getHeatmap(): Promise<HeatmapCell[]>
  getRegion(regionCodeOrName: string | number): Promise<PanelRegionMatrix | null>
  getUnclassified(): Promise<UnclassifiedResult>
  getUpdates(): Promise<UpdatesResult>
  getDemographics(): Promise<DemographicsSummary>
}

