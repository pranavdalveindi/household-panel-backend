import { rdsPool } from '../../database/rds'
import { IPanelRepository } from './panel.repository.interface'
import {
  PanelSummary,
  HeatmapCell,
  HeatmapResult,
  PanelRegionMatrix,
  UnclassifiedResult,
  UpdatesResult,
  DemographicsSummary,
  PanelRegionBreakdown,
  PanelSecBreakdown,
  PanelMosrBreakdown,
  PanelCell,
  UnclassifiedRow,
  ViewershipSummary,
  HouseholdViewershipRow,
} from './panel.types'

export class PanelRdsRepository implements IPanelRepository {
  async getSummary(): Promise<PanelSummary> {
    // 1. Fetch all master targets
    const targetsRes = await rdsPool.query(`
      SELECT id, region, sec, mosr, target_count 
      FROM panel_master_targets
    `)
    const targets = targetsRes.rows

    // 2. Fetch distinct households from panel_live_data (PROD environment and valid panel statuses)
    const householdsRes = await rdsPool.query(`
      SELECT DISTINCT ON (hhid) 
        hhid, 
        region, 
        current_status, 
        sec_mapped, 
        mos_mapped, 
        environment
      FROM panel_live_data
      WHERE environment = 'PROD' 
        AND current_status IN ('INSTALLED', 'PRODUCTION', 'TRAINING_1', 'TRAINING_2')
    `)
    const households = householdsRes.rows

    // Filter households: PROD environment with current_status in ('INSTALLED', 'PRODUCTION', 'TRAINING_1', 'TRAINING_2')
    const prodHouseholds = households.filter((h) => h.current_status === 'PRODUCTION')
    const installedHouseholds = households.filter((h) => h.current_status === 'INSTALLED')
    const trainingHouseholds = households.filter(
      (h) => h.current_status === 'TRAINING_1' || h.current_status === 'TRAINING_2'
    )

    const productionCount = prodHouseholds.length
    const installedCount = installedHouseholds.length
    const trainingCount = trainingHouseholds.length

    // Active households considered for table & quotas: PROD environment, status in (INSTALLED, PRODUCTION, TRAINING_1, TRAINING_2)
    const activeHouseholds = households

    const totalTarget = targets.reduce((sum, t) => sum + (Number(t.target_count) || 0), 0)
    const totalLive = activeHouseholds.length
    const totalShortfall = Math.max(0, totalTarget - totalLive)

    // Distinct sorted region names from targets
    const regionNames = Array.from(new Set(targets.map((t) => t.region).filter(Boolean))).sort()

    // Breakdown by region
    const byRegion: PanelRegionBreakdown[] = regionNames.map((regName, idx) => {
      const regTargets = targets.filter((t) => t.region === regName)
      const regActive = activeHouseholds.filter((h) => h.region === regName)

      const target = regTargets.reduce((sum, t) => sum + (Number(t.target_count) || 0), 0)
      const live = regActive.length
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
      const regActive = activeHouseholds.filter((h) => h.region === regName)

      const total_target = regTargets.reduce((sum, t) => sum + (Number(t.target_count) || 0), 0)
      const total_live = regActive.length

      const cells: PanelCell[] = []
      for (let sec = 1; sec <= 3; sec++) {
        for (let mosr = 1; mosr <= 4; mosr++) {
          const cellTarget = regTargets
            .filter((t) => Number(t.sec) === sec && Number(t.mosr) === mosr)
            .reduce((sum, t) => sum + (Number(t.target_count) || 0), 0)

          const inCell = regActive.filter(
            (h) => Number(h.sec_mapped) === sec && Number(h.mos_mapped) === mosr
          )
          const cellLive = inCell.length
          const cellProd = inCell.filter((h) => h.current_status === 'PRODUCTION').length
          const cellInst = inCell.filter((h) => h.current_status === 'INSTALLED').length
          const cellTrain = inCell.filter(
            (h) => h.current_status === 'TRAINING_1' || h.current_status === 'TRAINING_2'
          ).length

          cells.push({
            sec,
            mosr,
            target: cellTarget,
            live: cellLive,
            shortfall: Math.max(0, cellTarget - cellLive),
            production: cellProd,
            installed: cellInst,
            training: cellTrain,
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
      const live = activeHouseholds.filter((h) => Number(h.sec_mapped) === sec).length
      const shortfall = Math.max(0, target - live)
      const shortfall_pct = target > 0 ? Number(((shortfall / target) * 100).toFixed(2)) : 0
      return { sec, target, live, shortfall, shortfall_pct }
    })

    // Breakdown by MOSR (1..6)
    const byMosr: PanelMosrBreakdown[] = [1, 2, 3, 4, 5, 6].map((mosr) => {
      const target = targets
        .filter((t) => Number(t.mosr) === mosr)
        .reduce((sum, t) => sum + (Number(t.target_count) || 0), 0)
      const live = activeHouseholds.filter((h) => Number(h.mos_mapped) === mosr).length
      const shortfall = Math.max(0, target - live)
      const shortfall_pct = target > 0 ? Number(((shortfall / target) * 100).toFixed(2)) : 0
      return { mosr, target, live, shortfall, shortfall_pct }
    })

    return {
      total_target: totalTarget,
      total_live: totalLive,
      total_shortfall: totalShortfall,
      production_count: productionCount,
      installed_count: installedCount,
      training_count: trainingCount,
      by_region: byRegion,
      by_sec: bySec,
      by_mosr: byMosr,
      matrix,
    }
  }

  async getHeatmap(): Promise<HeatmapResult> {
    // Query all PROD qualifying households for the full status breakdown per cell
    const householdsRes = await rdsPool.query(`
      SELECT DISTINCT ON (hhid) 
        hhid, 
        region,
        current_status, 
        COALESCE(sec_mapped, sec) as sec_mapped, 
        COALESCE(mos_mapped, mos) as mos_mapped
      FROM panel_live_data
      WHERE environment = 'PROD' 
        AND current_status IN ('INSTALLED', 'PRODUCTION', 'TRAINING_1', 'TRAINING_2')
    `)
    const allHouseholds = householdsRes.rows

    // Also need targets
    const targetsRes = await rdsPool.query(`
      SELECT sec, mosr, target_count 
      FROM panel_master_targets
    `)
    const targets = targetsRes.rows

    const heatmapCells: HeatmapCell[] = []

    for (let sec = 1; sec <= 5; sec++) {
      for (let mosr = 1; mosr <= 6; mosr++) {
        // Target for this cell (sum across all regions)
        const target = targets
          .filter((t) => Number(t.sec) === sec && Number(t.mosr) === mosr)
          .reduce((sum, t) => sum + (Number(t.target_count) || 0), 0)

        // Count households in each status for this SEC × MOSR cell
        const inCell = allHouseholds.filter(
          (h) => Number(h.sec_mapped) === sec && Number(h.mos_mapped) === mosr
        )

        const production = inCell.filter((h) => h.current_status === 'PRODUCTION').length
        const installed = inCell.filter((h) => h.current_status === 'INSTALLED').length
        const training = inCell.filter(
          (h) => h.current_status === 'TRAINING_1' || h.current_status === 'TRAINING_2'
        ).length
        const total = inCell.length
        const live = production + installed + training

        const shortfall = Math.max(0, target - live)
        const shortfall_pct = target > 0 ? Number(((shortfall / target) * 100).toFixed(2)) : 0

        const households = inCell.map((h) => ({
          hhid: h.hhid,
          current_status: h.current_status,
          region: h.region || null,
        }))

        heatmapCells.push({
          sec,
          mosr,
          target,
          production,
          installed,
          training,
          total,
          live,
          shortfall,
          shortfall_pct,
          households,
        })
      }
    }

    // Pipeline: households with no sec_mapped/mos_mapped (not yet classified into grid)
    const pipeline = {
      installed_no_sec: allHouseholds.filter(
        (h) => h.current_status === 'INSTALLED' && (h.sec_mapped === null || h.mos_mapped === null)
      ).length,
      training_no_sec: allHouseholds.filter(
        (h) =>
          (h.current_status === 'TRAINING_1' || h.current_status === 'TRAINING_2') &&
          (h.sec_mapped === null || h.mos_mapped === null)
      ).length,
      observation: allHouseholds.filter((h) => h.current_status === 'OBSERVATION').length,
    }

    return { cells: heatmapCells, pipeline }
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
        sec,
        mos,
        sec_mapped, 
        mos_mapped, 
        current_status
      FROM panel_live_data
      WHERE environment = 'PROD'
        AND current_status IN ('INSTALLED', 'PRODUCTION', 'TRAINING_1', 'TRAINING_2')
        AND (sec_mapped IS NULL OR mos_mapped IS NULL OR sec IS NULL OR mos IS NULL)
      ORDER BY hhid
    `)

    const rows: UnclassifiedRow[] = res.rows.map((row) => {
      const hasSec = row.sec_mapped != null || row.sec != null
      const hasMos = row.mos_mapped != null || row.mos != null

      let issue_type: 'NO_SEC' | 'NO_MOSR' | 'NO_SEC_AND_MOSR' = 'NO_SEC_AND_MOSR'
      let description = 'Both SEC and MOSR are missing.'

      if (!hasSec && !hasMos) {
        issue_type = 'NO_SEC_AND_MOSR'
        description = 'Both SEC and MOSR are missing. Requires demographic survey to classify.'
      } else if (!hasSec) {
        issue_type = 'NO_SEC'
        const mosrVal = row.mos_mapped ?? row.mos
        description = `SEC is missing (MOSR ${mosrVal} is present). Requires socio-economic classification.`
      } else if (!hasMos) {
        issue_type = 'NO_MOSR'
        const secVal = row.sec_mapped ?? row.sec
        description = `MOSR is missing (SEC ${secVal} is present). Requires household member count.`
      }

      return {
        id: row.id,
        hhid: row.hhid,
        region_id: row.region,
        region: row.region,
        sec: row.sec_mapped ?? row.sec ?? null,
        mosr: row.mos_mapped ?? row.mos ?? null,
        sec_mapped: row.sec_mapped,
        mos_mapped: row.mos_mapped,
        current_status: row.current_status,
        issue_type,
        description,
        created_at: null,
      }
    })

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
      WHERE current_status = 'PRODUCTION' AND environment = 'PROD'
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

    // Age groups (requested ranges: 1-14, 15-30, 30-39, 40-49, 50-60, 60+)
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

  // In-memory cache for viewership data
  private static viewershipCache = new Map<string, { timestamp: number; data: ViewershipSummary }>()
  private static CACHE_TTL_MS = 60 * 1000 // 60 seconds

  async getViewership(timeWindow = '24h', bypassCache = false): Promise<ViewershipSummary> {
    const cacheKey = `viewership_${timeWindow}`
    const now = Math.floor(Date.now() / 1000)

    if (!bypassCache) {
      const cached = PanelRdsRepository.viewershipCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < PanelRdsRepository.CACHE_TTL_MS) {
        return cached.data
      }
    }

    // 1. Determine time window
    let windowSeconds = 86400 // default 24h
    if (timeWindow === '7d') windowSeconds = 7 * 86400
    else if (timeWindow === '30d') windowSeconds = 30 * 86400
    else if (timeWindow === 'all') windowSeconds = 365 * 86400

    const fromTs = String(now - windowSeconds)
    const toTs = now

    // 2. Fetch distinct production households and their members from panel_live_data (PROD environment)
    const liveRes = await rdsPool.query(`
      SELECT 
        hhid, 
        region, 
        current_status, 
        member_code, 
        gender, 
        age
      FROM panel_live_data
      WHERE current_status = 'PRODUCTION' AND environment = 'PROD'
      ORDER BY hhid, member_code
    `)

    interface HhAccumulator {
      hhid: string
      region: string
      current_status: string
      members: Array<{ member_code?: string | null; gender?: string | null; age?: number | null }>
    }

    const hhMap = new Map<string, HhAccumulator>()
    for (const r of liveRes.rows) {
      if (!hhMap.has(r.hhid)) {
        hhMap.set(r.hhid, {
          hhid: r.hhid,
          region: r.region || 'Unknown',
          current_status: r.current_status,
          members: [],
        })
      }
      if (r.member_code || r.gender || r.age !== null) {
        hhMap.get(r.hhid)!.members.push({
          member_code: r.member_code,
          gender: r.gender,
          age: r.age != null ? Number(r.age) : null,
        })
      }
    }

    // 3. Fetch meter IDs assigned to these production households
    const meterMapRes = await rdsPool.query(`
      SELECT m.meter_id, h.hhid
      FROM meters m
      JOIN households h ON h.id = m.assigned_household_id
      WHERE h.current_status = 'PRODUCTION'
    `)

    const meterToHhid = new Map<string, string>()
    const hhidToMeter = new Map<string, string>()
    for (const r of meterMapRes.rows) {
      if (r.meter_id && r.hhid) {
        meterToHhid.set(r.meter_id, r.hhid)
        hhidToMeter.set(r.hhid, r.meter_id)
      }
    }

    const deviceIds = Array.from(meterToHhid.keys())

    // 4. Query aggregated events from RDS events table (Type 29 Image Recognition & Type 42 Audio Fingerprinting)
    let eventRows: Array<{
      device_id: string
      type: number
      v_status: 'POSITIVE' | 'NEGATIVE'
      channel: string | null
      latest_ts: number
      count: number
    }> = []

    if (deviceIds.length > 0) {
      const eventsRes = await rdsPool.query(
        `
        SELECT 
          device_id,
          type,
          CASE 
            WHEN type = 29 AND (lower(details->>'status') = 'recognized' OR (details->>'label' IS NOT NULL AND details->>'label' != '')) THEN 'POSITIVE'
            WHEN type = 42 AND (upper(details->>'status') = 'MATCHED' OR (details->>'channel_name' IS NOT NULL AND details->>'channel_name' != '')) THEN 'POSITIVE'
            ELSE 'NEGATIVE'
          END as v_status,
          COALESCE(NULLIF(details->>'label', ''), NULLIF(details->>'channel_name', '')) as channel,
          max("timestamp"::bigint) as latest_ts,
          count(*) as count
        FROM events
        WHERE "timestamp" >= $1
          AND device_id = ANY($2::text[])
          AND type IN (29, 42)
        GROUP BY 1, 2, 3, 4
      `,
        [fromTs, deviceIds]
      )

      eventRows = eventsRes.rows.map((r) => ({
        device_id: r.device_id,
        type: Number(r.type),
        v_status: r.v_status as 'POSITIVE' | 'NEGATIVE',
        channel: r.channel,
        latest_ts: Number(r.latest_ts),
        count: Number(r.count),
      }))
    }

    // Group events by device_id
    const deviceEventsMap = new Map<string, typeof eventRows>()
    for (const ev of eventRows) {
      if (!deviceEventsMap.has(ev.device_id)) {
        deviceEventsMap.set(ev.device_id, [])
      }
      deviceEventsMap.get(ev.device_id)!.push(ev)
    }

    // Global channel tracker
    const globalChannelMap = new Map<string, { total: number; image: number; audio: number }>()

    // 5. Construct household viewership rows
    const householdRows: HouseholdViewershipRow[] = []
    let totalPositiveHh = 0
    let totalNegativeHh = 0
    let imagePositiveHh = 0
    let audioPositiveHh = 0
    let dualPositiveHh = 0

    const sortedHhids = Array.from(hhMap.keys()).sort()

    for (const hhid of sortedHhids) {
      const hh = hhMap.get(hhid)!
      const meterId = hhidToMeter.get(hhid) || null
      const devEvents = meterId ? deviceEventsMap.get(meterId) || [] : []

      // Type 29 (Image)
      const t29Events = devEvents.filter((e) => e.type === 29)
      const t29PositiveCount = t29Events
        .filter((e) => e.v_status === 'POSITIVE')
        .reduce((sum, e) => sum + e.count, 0)
      const t29TotalCount = t29Events.reduce((sum, e) => sum + e.count, 0)

      let t29Status: 'POSITIVE' | 'NEGATIVE' | 'NO_EVENTS' = 'NO_EVENTS'
      if (t29TotalCount > 0) {
        t29Status = t29PositiveCount > 0 ? 'POSITIVE' : 'NEGATIVE'
      }

      // Latest channel for image
      const t29WithChannel = t29Events.filter((e) => e.channel && e.v_status === 'POSITIVE')
      t29WithChannel.sort((a, b) => b.latest_ts - a.latest_ts)
      const t29LatestChannel = t29WithChannel[0]?.channel || null
      const t29LatestTs = t29Events.length > 0 ? Math.max(...t29Events.map((e) => e.latest_ts)) : null

      // Type 42 (Audio)
      const t42Events = devEvents.filter((e) => e.type === 42)
      const t42MatchedCount = t42Events
        .filter((e) => e.v_status === 'POSITIVE')
        .reduce((sum, e) => sum + e.count, 0)
      const t42UnmatchedCount = t42Events
        .filter((e) => e.v_status === 'NEGATIVE')
        .reduce((sum, e) => sum + e.count, 0)
      const t42TotalCount = t42MatchedCount + t42UnmatchedCount

      let t42Status: 'POSITIVE' | 'NEGATIVE' | 'NO_EVENTS' = 'NO_EVENTS'
      if (t42TotalCount > 0) {
        t42Status = t42MatchedCount > 0 ? 'POSITIVE' : 'NEGATIVE'
      }

      // Latest channel for audio
      const t42WithChannel = t42Events.filter((e) => e.channel && e.v_status === 'POSITIVE')
      t42WithChannel.sort((a, b) => b.latest_ts - a.latest_ts)
      const t42LatestChannel = t42WithChannel[0]?.channel || null
      const t42LatestTs = t42Events.length > 0 ? Math.max(...t42Events.map((e) => e.latest_ts)) : null

      // Overall Viewership status
      const isPositive = t29Status === 'POSITIVE' || t42Status === 'POSITIVE'
      if (isPositive) {
        totalPositiveHh++
      } else {
        totalNegativeHh++
      }

      if (t29Status === 'POSITIVE') imagePositiveHh++
      if (t42Status === 'POSITIVE') audioPositiveHh++
      if (t29Status === 'POSITIVE' && t42Status === 'POSITIVE') dualPositiveHh++

      // Top channels for this household
      const hhChannelMap = new Map<string, number>()
      for (const ev of devEvents) {
        if (ev.channel && ev.v_status === 'POSITIVE') {
          hhChannelMap.set(ev.channel, (hhChannelMap.get(ev.channel) || 0) + ev.count)

          // Update global channel stats
          if (!globalChannelMap.has(ev.channel)) {
            globalChannelMap.set(ev.channel, { total: 0, image: 0, audio: 0 })
          }
          const glob = globalChannelMap.get(ev.channel)!
          glob.total += ev.count
          if (ev.type === 29) glob.image += ev.count
          if (ev.type === 42) glob.audio += ev.count
        }
      }

      const topChannels = Array.from(hhChannelMap.entries())
        .map(([channel, count]) => ({ channel, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)

      const latestTs = Math.max(t29LatestTs || 0, t42LatestTs || 0) || null

      householdRows.push({
        hhid,
        region: hh.region,
        current_status: hh.current_status,
        meter_id: meterId,
        member_count: hh.members.length,
        members: hh.members,
        has_viewership: isPositive,
        image_viewership: {
          status: t29Status,
          positive_count: t29PositiveCount,
          total_count: t29TotalCount,
          latest_channel: t29LatestChannel,
          latest_ts: t29LatestTs,
        },
        audio_viewership: {
          status: t42Status,
          matched_count: t42MatchedCount,
          unmatched_count: t42UnmatchedCount,
          total_count: t42TotalCount,
          latest_channel: t42LatestChannel,
          latest_ts: t42LatestTs,
        },
        top_channels: topChannels,
        latest_event_ts: latestTs,
      })
    }

    // Regional breakdown
    const distinctRegions = Array.from(new Set(householdRows.map((h) => h.region))).sort()
    const regionalBreakdown = distinctRegions.map((region) => {
      const regHhs = householdRows.filter((h) => h.region === region)
      const positiveHhs = regHhs.filter((h) => h.has_viewership).length
      const negativeHhs = regHhs.length - positiveHhs
      const pct = regHhs.length > 0 ? Number(((positiveHhs / regHhs.length) * 100).toFixed(1)) : 0
      return {
        region,
        total_households: regHhs.length,
        positive_households: positiveHhs,
        negative_households: negativeHhs,
        positive_pct: pct,
      }
    })

    // Global top channels
    const globalTopChannels = Array.from(globalChannelMap.entries())
      .map(([channel, stats]) => ({
        channel,
        count: stats.total,
        image_count: stats.image,
        audio_count: stats.audio,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const totalProdHh = householdRows.length
    const positivePct = totalProdHh > 0 ? Number(((totalPositiveHh / totalProdHh) * 100).toFixed(1)) : 0

    const summary: ViewershipSummary = {
      total_production_households: totalProdHh,
      positive_viewership_count: totalPositiveHh,
      negative_viewership_count: totalNegativeHh,
      positive_pct: positivePct,
      image_positive_count: imagePositiveHh,
      audio_positive_count: audioPositiveHh,
      dual_positive_count: dualPositiveHh,
      time_window: timeWindow,
      from_timestamp: Number(fromTs),
      to_timestamp: toTs,
      regional_breakdown: regionalBreakdown,
      top_channels: globalTopChannels,
      households: householdRows,
    }

    // Cache the result
    PanelRdsRepository.viewershipCache.set(cacheKey, {
      timestamp: Date.now(),
      data: summary,
    })

    return summary
  }
}


