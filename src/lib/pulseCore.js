// ── Inspection pulse: the rules both runs share ─────────────────────────────
// Which jobs a check reads, what is sent to the county reader for each, and
// how its answer becomes the job's new countyPermit. Used by the office
// screen's run (lib/permitPulse.js) and the server's scheduled run
// (api/_permit-tick.js), so the two always agree. Plain rules only (no store,
// no screens); imports name their .js file for Node.
import { permitTracked, countyPassedStages, countyConnected, jobCounty, keepHistory } from './permitRules.js'
import { isJob, getStages } from './jobStages.js'
import { countyOf, isBusyError } from './permitHealth.js'

// Jobs per request: one parallel round on the server, well inside its 60 s
export const BATCH = 3
// After a batch the county site called busy, wait this long before the next
// (at most this many times in one run, so a blocked site can't stall the check).
export const COOL_DOWN_MS = 25000
export const MAX_COOL_DOWNS = 8
// Between batches: the county limit counts page loads per minute, and the check
// is in no hurry (80 jobs take about five minutes this way).
export const PACE_MS = 5000
// A run marked started this recently is still going: nobody else starts one
export const STALE_START_MS = 15 * 60 * 1000
// The retry of never-checked / busy jobs: one runner at a time
export const FILL_LOCK_MS = 8 * 60 * 1000

// Notes we already have, by inspection id, so the server only opens the
// "View Details" page of inspections it hasn't read before.
export function knownNotes(prev) {
  const out = {}
  for (const p of prev?.permits || []) for (const i of p.completed || []) if (Array.isArray(i.notes)) out[i.id] = i.notes
  return out
}

export function withNotes(result, prev) {
  const known = knownNotes(prev)
  return {
    ...result,
    permits: (result.permits || []).map(p => ({
      ...p,
      completed: (p.completed || []).map(i => (Array.isArray(i.notes) || !known[i.id] ? i : { ...i, notes: known[i.id] })),
    })),
  }
}

// What the office set on the job to point at its permit (Permits tab): the
// permit's page on the county site ("Permit link or number"), else a number
// typed there or on one of the job's permit cards. Sent with the job so the
// county lookup opens that permit even when the address search finds nothing.
export function permitPointer(p) {
  const isNumber = (n) => /^(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,29}$/.test(n)
  const set = String(p?.jobData?.countyLink || '').trim()
  if (/^https?:\/\//i.test(set)) return { link: set.replace(/^http:/i, 'https:') }
  if (isNumber(set.toUpperCase())) return { typed: set.toUpperCase() }
  // A number on a permit card is only a hint: used when the address finds nothing
  const hint = Object.values(p?.jobData?.permits || {}).map(x => String(x?.number || '').trim().toUpperCase()).find(isNumber)
  return hint ? { hint } : {}
}

// A job under way: the county has its permit, or a step on its checklist is
// ticked. Jobs not started yet are only looked up in the morning check (to
// catch a newly issued permit), so the county site isn't searched twice a
// day for permits that don't exist yet.
export const pulseActive = (p) => (p.countyPermit?.permits || []).length > 0 || (p.jobData?.completedStages || []).length > 0

// Every job the check covers: ongoing, tracked, in a connected county.
export const pulseTracked = (p) => isJob(p) && permitTracked(p) && countyConnected(p)

// The jobs one run reads. ids: only these. scheduled: the 8 AM / 1 PM check,
// which skips jobs already read since the slot's start (so a check cut short
// and started again carries on instead of starting over), and in the
// afternoon (morning false) the jobs not started yet.
export function pulseJobs(proposals, { ids = null, scheduled = false, slot = null, morning = true } = {}) {
  const freshSince = (p) => p.countyPermit?.checkedAt && !p.countyPermit.siteError && new Date(p.countyPermit.checkedAt) >= slot
  return (proposals || [])
    .filter(pulseTracked)
    .filter(p => !ids || ids.includes(p.id))
    .filter(p => !scheduled || (!freshSince(p) && (morning || pulseActive(p) || !p.countyPermit)))
}

// Tracked jobs the county site has never been read for (e.g. just imported),
// or whose last read failed on the site's end (slow or down) — tried again on
// the next 10-minute tick instead of the next 8 AM / 1 PM, so one slow answer
// (and the county alert it raised) clears as soon as the site answers again.
export function uncheckedJobs(proposals) {
  return (proposals || [])
    .filter(pulseTracked)
    // never checked, or the county was busy last time (jobs not started yet
    // wait for the next morning check instead of being retried all day)
    .filter(p => !p.countyPermit || (p.countyPermit.siteError && pulseActive(p)))
}

// One job, as sent to the county reader (POST /api/permit-pulse { jobs })
export function pulseRequest(p) {
  return {
    id: p.id,
    address: p.address,
    client: p.client,
    county: jobCounty(p),
    jurisdiction: p.imported?.jurisdiction || '',
    pick: p.jobData?.countyPick || null,
    record: (String(p.imported?.permit || '').toUpperCase().match(/\b[A-Z]{1,5}-?(?:[A-Z]{2,5}-)?\d{2,4}-\d{3,7}\b/) || [])[0] || '',
    ...permitPointer(p),
    knownNotes: Object.keys(knownNotes(p.countyPermit)),
  }
}

// The county's answer r for a job whose countyPermit was prev → the new
// reading, and the permits that dropped out of it (for jobData.permitHistory).
export function nextReading(r, prev) {
  // Keep the last good reading if this check failed, with the error on top.
  // (siteError stays on it so the 10-minute tick tries it again.)
  const reading = r.error && !r.needsPick && prev?.permits?.length
    ? { ...prev, error: r.error, siteError: !!r.siteError, checkedAt: r.checkedAt }
    : withNotes(r, prev)
  // nothing the app has read is ever thrown away
  return keepHistory(reading, prev)
}

// The stages the county passed on this job, by the new reading
export function passedStagesOf(p, r, next) {
  const stageKeys = (getStages(p) || []).map(s => s.key)
  return r.permits ? countyPassedStages({ countyPermit: next }, stageKeys) : []
}

// Per county: jobs whose county site was read, and jobs where it wasn't (a
// busy answer is counted apart: it's the site pacing us, not an outage),
// against every tracked job in that county, not just the ones in this run.
export function countyTotals(proposals) {
  const countyJobs = {}
  for (const p of proposals || []) if (pulseTracked(p)) countyJobs[countyOf(p)] = (countyJobs[countyOf(p)] || 0) + 1
  return countyJobs
}
export function tally(stats, countyJobs, p, ok, error) {
  const county = countyOf(p)
  const c = (stats[county] ||= { ok: 0, failed: 0, busy: 0, total: countyJobs[county] || 0, lastError: '' })
  if (ok) c.ok++
  else if (isBusyError(error)) c.busy++
  else { c.failed++; c.lastError = error || c.lastError }
}
