import { supabase } from '../../database/supabase'
import { IPanelRepository } from './panel.repository.interface'
import {
  PanelSummary,
  HeatmapCell,
  PanelRegionMatrix,
  UnclassifiedResult,
  UpdatesResult,
  DemographicsSummary,
} from './panel.types'

const getAgeFromDob = (dob?: string | null): number | null => {
  if (!dob) return null

  const birthDate = new Date(dob)
  if (Number.isNaN(birthDate.getTime())) return null

  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }

  return age
}

export class PanelSupabaseRepository implements IPanelRepository {
  private async fetchDirectSummary(): Promise<PanelSummary> {
    // 1. Fetch regions
    const { data: regionsData } = await supabase
      .from('regions')
      .select('id, region_name, region_code')
      .order('region_name', { ascending: true })

    const regions = regionsData ?? []

    // 2. Fetch panel_master_targets
    const { data: targetsData } = await supabase
      .from('panel_master_targets')
      .select('region_id, sec, mosr, target_count')

    const targets = targetsData ?? []

    // 3. Fetch panel_households
    const { data: householdsData } = await supabase
      .from('panel_households')
      .select('region_id, sec_mapped, mos_mapped, current_status, environment')

    const households = householdsData ?? []

    const prodHouseholds = households.filter(
      (h) => h.current_status === 'PRODUCTION' && (h.environment ? h.environment.trim().toUpperCase() === 'PROD' : true)
    )
    const installedCount = households.filter(
      (h) => h.current_status === 'INSTALLED' && (h.environment ? h.environment.trim().toUpperCase() === 'PROD' : true)
    ).length
    const trainingCount = households.filter(
      (h) =>
        (h.current_status === 'TRAINING_1' || h.current_status === 'TRAINING_2') &&
        (h.environment ? h.environment.trim().toUpperCase() === 'PROD' : true)
    ).length

    const totalTarget = targets.reduce((sum, t) => sum + (Number(t.target_count) || 0), 0)
    const totalLive = prodHouseholds.length
    const totalShortfall = Math.max(0, totalTarget - totalLive)

    const byRegion = regions.map((r, idx) => {
      const regTargets = targets.filter((t) => t.region_id === r.id)
      const regProd = prodHouseholds.filter((h) => h.region_id === r.id)
      const target = regTargets.reduce((sum, t) => sum + (Number(t.target_count) || 0), 0)
      const live = regProd.length
      const shortfall = Math.max(0, target - live)
      const shortfall_pct = target > 0 ? Number(((shortfall / target) * 100).toFixed(2)) : 0

      return {
        region_id: r.id,
        region_code: r.region_code ?? idx + 1,
        region_name: r.region_name ?? `Region ${idx + 1}`,
        target,
        live,
        shortfall,
        shortfall_pct,
      }
    })

    const matrix: PanelRegionMatrix[] = regions.map((r, idx) => {
      const regTargets = targets.filter((t) => t.region_id === r.id)
      const regProd = prodHouseholds.filter((h) => h.region_id === r.id)
      const total_target = regTargets.reduce((sum, t) => sum + (Number(t.target_count) || 0), 0)
      const total_live = regProd.length

      const cells = []
      for (let sec = 1; sec <= 3; sec++) {
        for (let mosr = 1; mosr <= 4; mosr++) {
          const cellTarget = regTargets
            .filter((t) => Number(t.sec) === sec && Number(t.mosr) === mosr)
            .reduce((sum, t) => sum + (Number(t.target_count) || 0), 0)
          const cellLive = regProd.filter(
            (h) => Number(h.sec_mapped) === sec && Number(h.mos_mapped) === mosr
          ).length

          cells.push({
            sec,
            mosr,
            target: cellTarget,
            live: cellLive,
            shortfall: Math.max(0, cellTarget - cellLive),
          })
        }
      }

      return {
        region_id: r.id,
        region_code: r.region_code ?? idx + 1,
        region_name: r.region_name ?? `Region ${idx + 1}`,
        total_target,
        total_live,
        total_shortfall: Math.max(0, total_target - total_live),
        cells,
      }
    })

    const bySec = [1, 2, 3, 4, 5].map((sec) => {
      const target = targets
        .filter((t) => Number(t.sec) === sec)
        .reduce((sum, t) => sum + (Number(t.target_count) || 0), 0)
      const live = prodHouseholds.filter((h) => Number(h.sec_mapped) === sec).length
      const shortfall = Math.max(0, target - live)
      const shortfall_pct = target > 0 ? Number(((shortfall / target) * 100).toFixed(2)) : 0
      return { sec, target, live, shortfall, shortfall_pct }
    })

    const byMosr = [1, 2, 3, 4, 5, 6].map((mosr) => {
      const target = targets
        .filter((t) => Number(t.mosr) === mosr)
        .reduce((sum, t) => sum + (Number(t.target_count) || 0), 0)
      const live = prodHouseholds.filter((h) => Number(h.mos_mapped) === mosr).length
      const shortfall = Math.max(0, target - live)
      const shortfall_pct = target > 0 ? Number(((shortfall / target) * 100).toFixed(2)) : 0
      return { mosr, target, live, shortfall, shortfall_pct }
    })

    return {
      total_target: totalTarget,
      total_live: totalLive,
      total_shortfall: totalShortfall,
      production_count: totalLive,
      installed_count: installedCount,
      training_count: trainingCount,
      by_region: byRegion,
      by_sec: bySec,
      by_mosr: byMosr,
      matrix,
    }
  }

  async getSummary(): Promise<PanelSummary> {
    try {
      const { data, error } = await supabase.rpc('get_panel_summary')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!error && data && Array.isArray((data as any).matrix) && (data as any).matrix.length > 0) {
        return data as PanelSummary
      }
    } catch {
      // Fall through to direct query
    }
    return this.fetchDirectSummary()
  }

  async getHeatmap(): Promise<HeatmapCell[]> {
    try {
      const { data, error } = await supabase.rpc('get_panel_heatmap')
      if (!error && Array.isArray(data) && data.length > 0) {
        return data as HeatmapCell[]
      }
    } catch {
      // Fall through to fallback calculation
    }

    const summary = await this.fetchDirectSummary()
    const heatmapCells: HeatmapCell[] = []

    for (let sec = 1; sec <= 5; sec++) {
      for (let mosr = 1; mosr <= 6; mosr++) {
        let target = 0
        let live = 0
        for (const reg of summary.matrix) {
          const c = reg.cells.find((cell) => cell.sec === sec && cell.mosr === mosr)
          if (c) {
            target += c.target
            live += c.live
          }
        }
        const shortfall = Math.max(0, target - live)
        const shortfall_pct = target > 0 ? Number(((shortfall / target) * 100).toFixed(2)) : 0
        heatmapCells.push({ sec, mosr, target, live, shortfall, shortfall_pct })
      }
    }

    return heatmapCells
  }

  async getRegion(regionCodeOrName: string | number): Promise<PanelRegionMatrix | null> {
    const regionCode = typeof regionCodeOrName === 'number' ? regionCodeOrName : parseInt(regionCodeOrName, 10)

    if (!isNaN(regionCode)) {
      try {
        const { data, error } = await supabase.rpc('get_panel_region_breakdown', {
          p_region_code: regionCode,
        })
        if (!error && data) {
          return data as PanelRegionMatrix
        }
      } catch {
        // Fall through
      }
    }

    const summary = await this.fetchDirectSummary()
    const found = summary.matrix.find(
      (m) =>
        m.region_code === regionCode ||
        String(m.region_id) === String(regionCodeOrName) ||
        m.region_name.toLowerCase() === String(regionCodeOrName).toLowerCase()
    )

    return found ?? null
  }

  async getUnclassified(): Promise<UnclassifiedResult> {
    try {
      const { data, error } = await supabase.rpc('get_panel_unclassified')
      if (!error && data && Array.isArray((data as any).rows)) {
        return data as UnclassifiedResult
      }
    } catch {
      // Fall through
    }

    const { data: rows } = await supabase
      .from('panel_households')
      .select('id, hhid, region_id, sec_mapped, mos_mapped, current_status, created_at')
      .eq('current_status', 'PRODUCTION')
      .or('sec_mapped.is.null,mos_mapped.is.null')

    const unclassifiedRows = (rows ?? []).map((row) => ({
      ...row,
      sec: row.sec_mapped,
      mosr: row.mos_mapped,
    }))

    return {
      total: unclassifiedRows.length,
      total_count: unclassifiedRows.length,
      rows: unclassifiedRows,
      unclassified: unclassifiedRows,
    }
  }

  async getUpdates(): Promise<UpdatesResult> {
    const { data: updates, error: updatesError } = await supabase
      .from('panel_updates')
      .select('id, household_id, hhid, region_id, current_status, mos, sec, environment, is_rejected, sla_deadline, sla_breached, recorded_at')
      .order('recorded_at', { ascending: false })

    if (updatesError) {
      return { total: 0, rows: [], error: updatesError.message }
    }

    const regionIds = [...new Set((updates ?? []).map((row) => row.region_id).filter(Boolean))]
    const regionMap = new Map<string, string>()

    if (regionIds.length > 0) {
      const { data: regions } = await supabase
        .from('regions')
        .select('id, region_name')
        .in('id', regionIds)

      for (const region of regions ?? []) {
        if (region.id) regionMap.set(region.id, region.region_name ?? 'Unknown')
      }
    }

    const hhids = [...new Set((updates ?? []).map((row) => row.hhid).filter(Boolean))]
    const householdIds = [...new Set((updates ?? []).map((row) => row.household_id).filter(Boolean))]
    const membersByHhid: Record<string, Array<{ member_code?: string | null; gender?: string | null; age?: number | null }>> = {}
    const membersByHouseholdId: Record<string, Array<{ member_code?: string | null; gender?: string | null; age?: number | null }>> = {}

    if (hhids.length > 0 || householdIds.length > 0) {
      let membersQuery = supabase.from('panel_members').select('hhid, household_id, member_code, gender, dob')
      if (hhids.length > 0) membersQuery = membersQuery.in('hhid', hhids)
      if (householdIds.length > 0) membersQuery = membersQuery.in('household_id', householdIds)

      const { data: members } = await membersQuery
      for (const member of members ?? []) {
        if (member.hhid) {
          if (!membersByHhid[member.hhid]) membersByHhid[member.hhid] = []
          membersByHhid[member.hhid].push({
            member_code: member.member_code ?? null,
            gender: member.gender ?? null,
            age: getAgeFromDob(member.dob ?? null),
          })
        }
        if (member.household_id) {
          if (!membersByHouseholdId[member.household_id]) membersByHouseholdId[member.household_id] = []
          membersByHouseholdId[member.household_id].push({
            member_code: member.member_code ?? null,
            gender: member.gender ?? null,
            age: getAgeFromDob(member.dob ?? null),
          })
        }
      }
    }

    const rows = (updates ?? []).map((update) => {
      const members =
        (update.hhid && membersByHhid[update.hhid]) ||
        (update.household_id && membersByHouseholdId[update.household_id]) ||
        []

      return {
        ...update,
        region: update.region_id ? regionMap.get(update.region_id) ?? 'Unknown' : 'Unknown',
        member_count: members.length,
        members,
      }
    })

    return {
      total: rows.length,
      rows,
    }
  }

  async getDemographics(): Promise<DemographicsSummary> {
    const { data: households } = await supabase
      .from('panel_households')
      .select('id, hhid, region_id, sec_mapped, mos_mapped, current_status')
      .eq('current_status', 'PRODUCTION')

    const prodHhs = households ?? []
    const hhidList = prodHhs.map((h) => h.hhid).filter(Boolean)

    const { data: regions } = await supabase.from('regions').select('id, region_name')
    const regionMap = new Map<string, string>()
    for (const r of regions ?? []) {
      if (r.id) regionMap.set(r.id, r.region_name ?? 'Unknown')
    }

    let membersData: any[] = []
    if (hhidList.length > 0) {
      const { data: members } = await supabase
        .from('panel_members')
        .select('id, hhid, household_id, member_code, gender, dob')
        .in('hhid', hhidList)
      membersData = members ?? []
    }

    const hhMap = new Map<string, any>()
    for (const h of prodHhs) {
      if (h.hhid) hhMap.set(h.hhid, h)
    }

    const mappedMembers = membersData.map((m) => {
      const hh = hhMap.get(m.hhid)
      const regName = hh && hh.region_id ? regionMap.get(hh.region_id) ?? 'Unknown' : 'Unknown'
      return {
        id: m.id || String(Math.random()),
        hhid: m.hhid,
        member_code: m.member_code ?? null,
        region: regName,
        gender: m.gender ?? null,
        age: getAgeFromDob(m.dob ?? null),
        sec_mapped: hh ? hh.sec_mapped : null,
        mos_mapped: hh ? hh.mos_mapped : null,
      }
    })

    const totalMembers = mappedMembers.length
    const totalHouseholds = prodHhs.length
    const avgHhSize = totalHouseholds > 0 ? Number((totalMembers / totalHouseholds).toFixed(2)) : 0

    const validAges = mappedMembers.map((m) => Number(m.age)).filter((a) => !isNaN(a) && a > 0)
    const avgAge = validAges.length > 0 ? Number((validAges.reduce((s, a) => s + a, 0) / validAges.length).toFixed(1)) : 0

    const maleCount = mappedMembers.filter((m) => String(m.gender).trim().toLowerCase() === 'male').length
    const femaleCount = mappedMembers.filter((m) => String(m.gender).trim().toLowerCase() === 'female').length
    const malePct = totalMembers > 0 ? Number(((maleCount / totalMembers) * 100).toFixed(1)) : 0
    const femalePct = totalMembers > 0 ? Number(((femaleCount / totalMembers) * 100).toFixed(1)) : 0

    const AGE_BUCKETS = [
      { label: '0-14', min: 0, max: 14 },
      { label: '15-30', min: 15, max: 30 },
      { label: '30-39', min: 31, max: 39 },
      { label: '40-49', min: 40, max: 49 },
      { label: '50-60', min: 50, max: 60 },
      { label: '60+', min: 61, max: 150 },
    ]

    const ageGroups = AGE_BUCKETS.map((b) => {
      const inBucket = mappedMembers.filter((m) => {
        const age = Number(m.age)
        return !isNaN(age) && age >= b.min && age <= b.max
      })
      const male = inBucket.filter((m) => String(m.gender).trim().toLowerCase() === 'male').length
      const female = inBucket.filter((m) => String(m.gender).trim().toLowerCase() === 'female').length
      const total = inBucket.length
      const pct = totalMembers > 0 ? Number(((total / totalMembers) * 100).toFixed(1)) : 0
      return { age_group: b.label, total, male, female, pct }
    })

    const regionNames = Array.from(new Set(mappedMembers.map((m) => m.region).filter(Boolean))).sort()
    const byRegion = regionNames.map((reg) => {
      const regMembers = mappedMembers.filter((m) => m.region === reg)
      const regHhCount = new Set(regMembers.map((m) => m.hhid).filter(Boolean)).size
      const male = regMembers.filter((m) => String(m.gender).trim().toLowerCase() === 'male').length
      const female = regMembers.filter((m) => String(m.gender).trim().toLowerCase() === 'female').length
      const total = regMembers.length
      const avgSize = regHhCount > 0 ? Number((total / regHhCount).toFixed(2)) : 0
      return { region: reg, total_members: total, total_households: regHhCount, avg_hh_size: avgSize, male, female }
    })

    return {
      total_members: totalMembers,
      total_households: totalHouseholds,
      avg_hh_size: avgHhSize,
      avg_age: avgAge,
      gender: {
        male: maleCount,
        female: femaleCount,
        male_pct: malePct,
        female_pct: femalePct,
      },
      age_groups: ageGroups,
      by_region: byRegion,
      members: mappedMembers,
    }
  }
}

