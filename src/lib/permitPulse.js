// ── Inspection pulse (browser side) ──────────────────────────────────────────
// Sends the ongoing Mecklenburg County jobs to /api/permit-pulse in small
// batches, and saves what the county site says on each job (countyPermit),
// checking off the stages the county has passed. Run by components/PermitPulse
// twice a day, or by "Check county now".
import { useStore } from '../store'
import { getStages } from '../pages/Jobs'
import { permitTracked, countyPassedStages, pulseDue } from './permitTracking'
import { isJob } from './attention'

const BATCH = 6

// Notes we already have, by inspection id, so the server only opens the
// "View Details" page of inspections it hasn't read before.
function knownNotes(prev) {
  const out = {}
  for (const p of prev?.permits || []) for (const i of p.completed || []) if (Array.isArray(i.notes)) out[i.id] = i.notes
  return out
}

function withNotes(result, prev) {
  const known = knownNotes(prev)
  return {
    ...result,
    permits: (result.permits || []).map(p => ({
      ...p,
      completed: (p.completed || []).map(i => (Array.isArray(i.notes) || !known[i.id] ? i : { ...i, notes: known[i.id] })),
    })),
  }
}

// ids: only these jobs (e.g. one job's "Check now"); otherwise every tracked job.
export async function runPermitPulse({ ids, onProgress } = {}) {
  const { proposals, setCountyPermit } = useStore.getState()
  const jobs = proposals
    .filter(p => isJob(p) && permitTracked(p))
    .filter(p => !ids || ids.includes(p.id))
  let done = 0, failed = 0
  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch = jobs.slice(i, i + BATCH)
    let results = {}
    try {
      const res = await fetch('/api/permit-pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobs: batch.map(p => ({
            id: p.id,
            address: p.address,
            client: p.client,
            pick: p.jobData?.countyPick || null,
            knownNotes: Object.keys(knownNotes(p.countyPermit)),
          })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `The permit check failed (${res.status})`)
      results = body.results || {}
    } catch (e) {
      failed += batch.length
      if (i === 0) throw e   // nothing worked at all — tell the person who asked
      continue
    }
    for (const p of batch) {
      const r = results[p.id]
      if (!r) { failed++; continue }
      // Keep the last good reading if this check failed, with the error on top.
      const prev = useStore.getState().proposals.find(x => x.id === p.id)?.countyPermit
      const next = r.error && !r.needsPick && prev?.permits?.length
        ? { ...prev, error: r.error, checkedAt: r.checkedAt }
        : withNotes(r, prev)
      const stageKeys = (getStages(p) || []).map(s => s.key)
      setCountyPermit(p.id, next, r.permits ? countyPassedStages({ countyPermit: next }, stageKeys) : [])
      done++
    }
    onProgress?.({ done, failed, total: jobs.length })
  }
  return { done, failed, total: jobs.length }
}

// The scheduled run (and "Check county now", with force). The run is marked
// as started in the shared settings first, so two office
// screens open at the same time don't both run it.
const STALE_START_MS = 15 * 60 * 1000
let running = false

export async function startPulse(by, { force = false } = {}) {
  const { permitPulse, setPermitPulse } = useStore.getState()
  if (running) return null
  if (!force) {
    if (!pulseDue(permitPulse?.lastRunAt)) return null
    const started = permitPulse?.startedAt && Date.now() - new Date(permitPulse.startedAt) < STALE_START_MS
    if (started && (!permitPulse.lastRunAt || permitPulse.startedAt > permitPulse.lastRunAt)) return null
  }
  running = true
  setPermitPulse({ ...(permitPulse || {}), startedAt: new Date().toISOString(), by })
  try {
    const out = await runPermitPulse()
    setPermitPulse({ ...(useStore.getState().permitPulse || {}), lastRunAt: new Date().toISOString(), by, last: out })
    return out
  } catch (e) {
    // Leave lastRunAt alone so the next screen (or the next check) tries again.
    setPermitPulse({ ...(useStore.getState().permitPulse || {}), startedAt: null, lastError: e.message })
    throw e
  } finally {
    running = false
  }
}
