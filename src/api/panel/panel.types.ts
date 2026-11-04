export interface PanelCell {
  sec: number
  mosr: number
  target: number
  live: number
  shortfall: number
}

export interface PanelRegionMatrix {
  region_id: string | number
  region_code: number
  region_name: string
  total_target: number
  total_live: number
  total_shortfall: number
  cells: PanelCell[]
}

export interface PanelRegionBreakdown {
  region_id: string | number
  region_code: number
  region_name: string
  target: number
  live: number
  shortfall: number
  shortfall_pct: number
}

export interface PanelSecBreakdown {
  sec: number
  target: number
  live: number
  shortfall: number
  shortfall_pct: number
}

export interface PanelMosrBreakdown {
  mosr: number
  target: number
  live: number
  shortfall: number
  shortfall_pct: number
}

export interface PanelSummary {
  total_target: number
  total_live: number
  total_shortfall: number
  production_count: number
  installed_count: number
  training_count: number
  by_region: PanelRegionBreakdown[]
  by_sec: PanelSecBreakdown[]
  by_mosr: PanelMosrBreakdown[]
  matrix: PanelRegionMatrix[]
}

export interface HeatmapCell {
  sec: number
  mosr: number
  target: number
  live: number
  shortfall: number
  shortfall_pct: number
}

export interface UnclassifiedRow {
  id: string
  hhid?: string | null
  region_id?: string | null
  region?: string | null
  sec?: number | null
  mosr?: number | null
  sec_mapped?: number | null
  mos_mapped?: number | null
  current_status?: string | null
  created_at?: string | Date | null
}

export interface UnclassifiedResult {
  total: number
  total_count: number
  rows: UnclassifiedRow[]
  unclassified: UnclassifiedRow[]
}

export interface PanelUpdateMember {
  member_code?: string | null
  gender?: string | null
  age?: number | null
}

export interface PanelUpdateRow {
  id: string
  household_id?: string | null
  hhid?: string | null
  region_id?: string | null
  region: string
  current_status: string
  mos?: number | null
  sec?: number | null
  environment?: string | null
  is_rejected?: boolean
  sla_deadline?: string | Date | null
  sla_breached?: boolean
  recorded_at: string | Date
  is_recovered?: boolean
  member_count: number
  members: PanelUpdateMember[]
}

export interface UpdatesResult {
  total: number
  rows: PanelUpdateRow[]
  error?: string
}

export interface DemographicsMember {
  id: string
  hhid: string
  member_code?: string | null
  region: string
  gender?: string | null
  age?: number | null
  sec_mapped?: number | null
  mos_mapped?: number | null
}

export interface DemographicsAgeGroup {
  age_group: string
  total: number
  male: number
  female: number
  pct: number
}

export interface DemographicsRegion {
  region: string
  total_members: number
  total_households: number
  avg_hh_size: number
  male: number
  female: number
}

export interface DemographicsSummary {
  total_members: number
  total_households: number
  avg_hh_size: number
  avg_age: number
  gender: {
    male: number
    female: number
    male_pct: number
    female_pct: number
  }
  age_groups: DemographicsAgeGroup[]
  by_region: DemographicsRegion[]
  members: DemographicsMember[]
}


