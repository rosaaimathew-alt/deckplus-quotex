// ── Inspection pulse (browser side) ──────────────────────────────────────────
// Sends the ongoing Mecklenburg County jobs to /api/permit-pulse in small
// batches, and saves what the county site says on each job (countyPermit),
// checking off the stages the county has passed. Run by components/PermitPulse
// at 8 AM and 1 PM (and right away for jobs never checked), or by "Check county now".
import { useStore } from '../store'
import { getStages } from '../pages/Jobs'
import { permitTracked, countyPassedStages, pulseDue, countyConnected, jobCounty } from './permitTracking'
import { isJob } from './attention'
import { countyOf, gradeRun, sendConnectionAlert } from './permitHealth'

// Jobs per request: one parallel round on the server, well inside its 60 s
const BATCH = 3

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
    .filter(p => isJob(p) && permitTracked(p) && countyConnected(p))
    .filter(p => !ids || ids.includes(p.id))
  let done = 0, failed = 0, lastError = null
  // Per county: jobs whose county site was read, and jobs where it wasn't
  const stats = {}
  const tally = (p, ok, error) => {
    const c = (stats[countyOf(p)] ||= { ok: 0, failed: 0, lastError: '' })
    if (ok) c.ok++; else { c.failed++; c.lastError = error || c.lastError }
  }
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
            county: jobCounty(p),
            jurisdiction: p.imported?.jurisdiction || '',
            pick: p.jobData?.countyPick || null,
            record: (String(p.imported?.permit || '').toUpperCase().match(/\b[A-Z]{1,5}-?(?:[A-Z]{2,5}-)?\d{2,4}-\d{3,7}\b/) || [])[0] || '',
            knownNotes: Object.keys(knownNotes(p.countyPermit)),
          })),
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `The permit check failed (${res.status})`)
      results = body.results || {}
    } catch (e) {
      // Keep going with the rest; these jobs are tried again on the next check
      failed += batch.length
      lastError = e
      for (const p of batch) tally(p, false, e.message)
      useStore.getState().setPermitPulseProgress?.({ done: done + failed, total: jobs.length })
      continue
    }
    for (const p of batch) {
      const r = results[p.id]
      if (!r) { failed++; tally(p, false, 'No answer for this job'); continue }
      tally(p, !r.siteError, r.error)
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
    useStore.getState().setPermitPulseProgress?.({ done: done + failed, total: jobs.length })
  }
  useStore.getState().setPermitPulseProgress?.(null)
  if (!done && lastError) { lastError.stats = stats; throw lastError }   // nothing worked at all — tell the person who asked
  return { done, failed, total: jobs.length, stats }
}

// Tracked jobs the county site has never been read for (e.g. just imported),
// or whose last read failed on the site's end (slow or down) before we had any
// result — tried again on the next 10-minute tick instead of the next 8 AM / 1 PM.
export function uncheckedJobIds() {
  return useStore.getState().proposals
    .filter(p => isJob(p) && permitTracked(p) && countyConnected(p))
    .filter(p => !p.countyPermit || (p.countyPermit.siteError && !p.countyPermit.permits?.length))
    .map(p => p.id)
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
    if (!pulseDue(permitPulse?.lastRunAt)) {
      // Not time for the full check, but fill in jobs never checked
      const ids = uncheckedJobIds()
      if (!ids.length) return null
      running = true
      try {
        const out = await runPermitPulse({ ids })
        recordHealth(out.stats)
        return out
      } catch (e) { recordHealth(e.stats); throw e } finally { running = false; useStore.getState().setPermitPulseProgress?.(null) }
    }
    const started = permitPulse?.startedAt && Date.now() - new Date(permitPulse.startedAt) < STALE_START_MS
    if (started && (!permitPulse.lastRunAt || permitPulse.startedAt > permitPulse.lastRunAt)) return null
  }
  running = true
  setPermitPulse({ ...(permitPulse || {}), startedAt: new Date().toISOString(), by })
  try {
    const out = await runPermitPulse()
    const { stats, ...last } = out
    setPermitPulse({ ...(useStore.getState().permitPulse || {}), lastRunAt: new Date().toISOString(), by, last })
    recordHealth(stats)
    return out
  } catch (e) {
    // Leave lastRunAt alone so the next screen (or the next check) tries again.
    setPermitPulse({ ...(useStore.getState().permitPulse || {}), startedAt: null, lastError: e.message })
    recordHealth(e.stats)
    throw e
  } finally {
    running = false
    useStore.getState().setPermitPulseProgress?.(null)
  }
}

// Grade each county's connection after a run, and email office / admin when
// one goes down or comes back (see lib/permitHealth.js).
function recordHealth(stats) {
  if (!stats) return
  const { permitPulse, setPermitPulse } = useStore.getState()
  const { health, changes } = gradeRun(permitPulse?.health, stats)
  setPermitPulse({ ...(permitPulse || {}), health })
  changes.forEach(sendConnectionAlert)
}
