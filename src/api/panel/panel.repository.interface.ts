import {
  PanelSummary,
  HeatmapCell,
  HeatmapResult,
  PanelRegionMatrix,
  UnclassifiedResult,
  UpdatesResult,
  DemographicsSummary,
  ViewershipSummary,
} from './panel.types'

export interface IPanelRepository {
  getSummary(): Promise<PanelSummary>
  getHeatmap(): Promise<HeatmapResult>
  getRegion(regionCodeOrName: string | number): Promise<PanelRegionMatrix | null>
  getUnclassified(): Promise<UnclassifiedResult>
  getUpdates(): Promise<UpdatesResult>
  getDemographics(): Promise<DemographicsSummary>
  getViewership(timeWindow?: string, bypassCache?: boolean): Promise<ViewershipSummary>
}

