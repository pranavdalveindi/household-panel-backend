import { rdsPool } from '../../database/rds'
import { IPanelRepository } from './panel.repository.interface'
import {
  PanelSummary,
  HeatmapCell,
  PanelRegionMatrix,
  UnclassifiedResult,
  UpdatesResult,
  DemographicsSummary,
  PanelRegionBreakdown,
  PanelSecBreakdown,
  PanelMosrBreakdown,
  PanelCell,
  UnclassifiedRow,
} from './panel.types'

export class PanelRdsRepository implements IPanelRepository {
  async getSummary(): Promise<PanelSummary> {
    // 1. Fetch all master targets
    const targetsRes = await rdsPool.query(`
      SELECT id, region, sec, mosr, target_count 
      FROM panel_master_targets
    `)
    const targets = targetsRes.rows

    // 2. Fetch distinct households from panel_live_data (each HHID can have multiple member rows)
    const householdsRes = await rdsPool.query(`
      SELECT DISTINCT ON (hhid) 
        hhid, 
        region, 
        current_status, 
        sec_mapped, 
        mos_mapped, 
        environment
      FROM panel_live_data
    `)
    const households = householdsRes.rows

    // Filter households
    const prodHouseholds = households.filter((h) => h.current_status === 'PRODUCTION')
    const installedCount = households.filter((h) => h.current_status === 'INSTALLED').length
    const trainingCount = households.filter(
      (h) => h.current_status === 'TRAINING_1' || h.current_status === 'TRAINING_2'
    ).length

    const totalTarget = targets.reduce((sum, t) => sum + (Number(t.target_count) || 0), 0)
    const totalLive = prodHouseholds.length
    const totalShortfall = Math.max(0, totalTarget - totalLive)

    // Distinct sorted region names from targets
    const regionNames = Array.from(new Set(targets.map((t) => t.region).filter(Boolean))).sort()

    // Breakdown by region
    const byRegion: PanelRegionBreakdown[] = regionNames.map((regName, idx) => {
      const regTargets = targets.filter((t) => t.region === regName)
      const regProd = prodHouseholds.filter((h) => h.region === regName)

      const target = regTargets.reduce((sum, t) => sum + (Number(t.target_count) || 0), 0)
      const live = regProd.length
      const shortfall = Math.max(0, target - live)
      const shortfall_pct = target > 0 ? Number(((shortfall / target) * 100).toFixed(2)) : 0

      return {
        region_id: regName,
        region_code: idx + 1,
        region_name: regName,
        target,
        live,
        shortfall,
        shortfall_pct,
      }
    })

    // Full SEC × MOSR matrix per region (SEC 1..3 × MOSR 1..4)
    const matrix: PanelRegionMatrix[] = regionNames.map((regName, idx) => {
      const regTargets = targets.filter((t) => t.region === regName)
      const regProd = prodHouseholds.filter((h) => h.region === regName)

      const total_target = regTargets.reduce((sum, t) => sum + (Number(t.target_count) || 0), 0)
      const total_live = regProd.length

      const cells: PanelCell[] = []
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
        region_id: regName,
        region_code: idx + 1,
        region_name: regName,
        total_target,
        total_live,
        total_shortfall: Math.max(0, total_target - total_live),
        cells,
      }
    })

    // Breakdown by SEC (1..5)
    const bySec: PanelSecBreakdown[] = [1, 2, 3, 4, 5].map((sec) => {
      const target = targets
        .filter((t) => Number(t.sec) === sec)
        .reduce((sum, t) => sum + (Number(t.target_count) || 0), 0)
      const live = prodHouseholds.filter((h) => Number(h.sec_mapped) === sec).length
      const shortfall = Math.max(0, target - live)
      const shortfall_pct = target > 0 ? Number(((shortfall / target) * 100).toFixed(2)) : 0
      return { sec, target, live, shortfall, shortfall_pct }
    })

    // Breakdown by MOSR (1..6)
    const byMosr: PanelMosrBreakdown[] = [1, 2, 3, 4, 5, 6].map((mosr) => {
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

  async getHeatmap(): Promise<HeatmapCell[]> {
    const summary = await this.getSummary()
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
    const summary = await this.getSummary()
    const raw = String(regionCodeOrName).trim().toLowerCase()
    const numCode = typeof regionCodeOrName === 'number' ? regionCodeOrName : parseInt(raw, 10)

    const found = summary.matrix.find(
      (m) =>
        (!isNaN(numCode) && m.region_code === numCode) ||
        String(m.region_id).toLowerCase() === raw ||
        m.region_name.toLowerCase() === raw
    )

    return found ?? null
  }

  async getUnclassified(): Promise<UnclassifiedResult> {
    const res = await rdsPool.query(`
      SELECT DISTINCT ON (hhid)
        id, 
        hhid, 
        region, 
        sec_mapped, 
        mos_mapped, 
        current_status
      FROM panel_live_data
      WHERE current_status = 'PRODUCTION'
        AND (sec_mapped IS NULL OR mos_mapped IS NULL)
    `)

    const rows: UnclassifiedRow[] = res.rows.map((row) => ({
      id: row.id,
      hhid: row.hhid,
      region_id: row.region,
      region: row.region,
      sec: row.sec_mapped,
      mosr: row.mos_mapped,
      sec_mapped: row.sec_mapped,
      mos_mapped: row.mos_mapped,
      current_status: row.current_status,
      created_at: null,
    }))

    return {
      total: rows.length,
      total_count: rows.length,
      rows,
      unclassified: rows,
    }
  }

  async getUpdates(): Promise<UpdatesResult> {
    const updatesRes = await rdsPool.query(`
      SELECT 
        id, 
        hhid, 
        region, 
        current_status, 
        mos, 
        sec, 
        environment, 
        is_rejected, 
        recorded_at
      FROM panel_updates
      ORDER BY recorded_at DESC
    `)

    const hhids = Array.from(new Set(updatesRes.rows.map((r) => r.hhid).filter(Boolean)))
    const membersByHhid: Record<string, Array<{ member_code?: string | null; gender?: string | null; age?: number | null }>> = {}

    if (hhids.length > 0) {
      const placeholders = hhids.map((_, idx) => `$${idx + 1}`).join(', ')
      const membersRes = await rdsPool.query(
        `SELECT hhid, member_code, gender, age FROM panel_live_data WHERE hhid IN (${placeholders})`,
        hhids
      )

      for (const m of membersRes.rows) {
        if (!membersByHhid[m.hhid]) membersByHhid[m.hhid] = []
        membersByHhid[m.hhid].push({
          member_code: m.member_code ?? null,
          gender: m.gender ?? null,
          age: m.age != null ? Number(m.age) : null,
        })
      }
    }

    const rows = updatesRes.rows.map((update) => {
      const members = (update.hhid && membersByHhid[update.hhid]) || []
      return {
        id: update.id,
        household_id: update.hhid,
        hhid: update.hhid,
        region_id: update.region,
        region: update.region || 'Unknown',
        current_status: update.current_status,
        mos: update.mos != null ? Number(update.mos) : null,
        sec: update.sec != null ? Number(update.sec) : null,
        environment: update.environment,
        is_rejected: update.is_rejected ?? false,
        recorded_at: update.recorded_at,
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
    const membersRes = await rdsPool.query(`
      SELECT 
        id, 
        hhid, 
        region, 
        member_code, 
        gender, 
        age, 
        sec_mapped, 
        mos_mapped
      FROM panel_live_data
      WHERE current_status = 'PRODUCTION'
      ORDER BY region ASC, hhid ASC, member_code ASC
    `)
    const rawMembers = membersRes.rows

    const totalMembers = rawMembers.length
    const totalHouseholds = new Set(rawMembers.map((m) => m.hhid).filter(Boolean)).size
    const avgHhSize = totalHouseholds > 0 ? Number((totalMembers / totalHouseholds).toFixed(2)) : 0

    const validAges = rawMembers.map((m) => Number(m.age)).filter((a) => !isNaN(a) && a > 0)
    const avgAge = validAges.length > 0 ? Number((validAges.reduce((s, a) => s + a, 0) / validAges.length).toFixed(1)) : 0

    // Gender breakdown
    const maleCount = rawMembers.filter((m) => String(m.gender).trim().toLowerCase() === 'male').length
    const femaleCount = rawMembers.filter((m) => String(m.gender).trim().toLowerCase() === 'female').length
    const malePct = totalMembers > 0 ? Number(((maleCount / totalMembers) * 100).toFixed(1)) : 0
    const femalePct = totalMembers > 0 ? Number(((femaleCount / totalMembers) * 100).toFixed(1)) : 0

    // Age groups (requested ranges: 0-14, 15-30, 30-39, 40-49, 50-60, 60+)
    const AGE_BUCKETS = [
      { label: '0-14', min: 0, max: 14 },
      { label: '15-30', min: 15, max: 30 },
      { label: '30-39', min: 31, max: 39 },
      { label: '40-49', min: 40, max: 49 },
      { label: '50-60', min: 50, max: 60 },
      { label: '60+', min: 61, max: 150 },
    ]

    const ageGroups = AGE_BUCKETS.map((b) => {
      const inBucket = rawMembers.filter((m) => {
        const age = Number(m.age)
        return !isNaN(age) && age >= b.min && age <= b.max
      })
      const male = inBucket.filter((m) => String(m.gender).trim().toLowerCase() === 'male').length
      const female = inBucket.filter((m) => String(m.gender).trim().toLowerCase() === 'female').length
      const total = inBucket.length
      const pct = totalMembers > 0 ? Number(((total / totalMembers) * 100).toFixed(1)) : 0
      return {
        age_group: b.label,
        total,
        male,
        female,
        pct,
      }
    })

    // Regional breakdown
    const regionNames = Array.from(new Set(rawMembers.map((m) => m.region).filter(Boolean))).sort()
    const byRegion = regionNames.map((reg) => {
      const regMembers = rawMembers.filter((m) => m.region === reg)
      const regHhCount = new Set(regMembers.map((m) => m.hhid).filter(Boolean)).size
      const male = regMembers.filter((m) => String(m.gender).trim().toLowerCase() === 'male').length
      const female = regMembers.filter((m) => String(m.gender).trim().toLowerCase() === 'female').length
      const total = regMembers.length
      const avgSize = regHhCount > 0 ? Number((total / regHhCount).toFixed(2)) : 0

      return {
        region: reg,
        total_members: total,
        total_households: regHhCount,
        avg_hh_size: avgSize,
        male,
        female,
      }
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
      members: rawMembers.map((m) => ({
        id: m.id,
        hhid: m.hhid,
        member_code: m.member_code,
        region: m.region || 'Unknown',
        gender: m.gender,
        age: m.age != null ? Number(m.age) : null,
        sec_mapped: m.sec_mapped != null ? Number(m.sec_mapped) : null,
        mos_mapped: m.mos_mapped != null ? Number(m.mos_mapped) : null,
      })),
    }
  }
}

