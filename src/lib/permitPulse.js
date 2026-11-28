// ── Inspection pulse (browser side) ──────────────────────────────────────────
// Sends the ongoing Mecklenburg County jobs to /api/permit-pulse in small
// batches, and saves what the county site says on each job (countyPermit),
// checking off the stages the county has passed. Run by components/PermitPulse
// at 8 AM and 1 PM (and right away for jobs never checked), or by "Check county now".
// The server runs the same check on a schedule (api/_permit-tick.js, with the
// same rules: lib/pulseCore.js), so it happens even with no screen open; this
// run then finds nothing left to do.
import { useStore } from '../store'
import { pulseDue, closeIfFinaled, currentPulseSlot, PULSE_HOURS, addToHistory } from './permitTracking'
import { gradeRun, sendConnectionAlert, isBusyError } from './permitHealth'
import { BATCH, COOL_DOWN_MS, MAX_COOL_DOWNS, PACE_MS, STALE_START_MS, FILL_LOCK_MS, pulseJobs, uncheckedJobs, pulseRequest, nextReading, passedStagesOf, countyTotals, tally as tallyInto } from './pulseCore'

// The rules both runs share (lib/pulseCore.js), still offered from here
export { permitPointer, pulseActive } from './pulseCore'

// A fetch that throws (instead of answering) means this browser lost the
// connection: the phone locked, the app was switched away from, or the wifi
// dropped. That says nothing about the county site, so it must never mark a
// county as down. Wait until the screen is back, try once more, and if it
// still can't connect, stop the run (the next screen or check picks it up).
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
async function whenVisible() {
  if (typeof document === 'undefined' || !document.hidden) return
  await new Promise(res => {
    const on = () => { if (!document.hidden) { document.removeEventListener('visibilitychange', on); res() } }
    document.addEventListener('visibilitychange', on)
  })
}
async function postBatch(body) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch('/api/permit-pulse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    } catch {
      if (attempt >= 1) { const lost = new Error('The app lost its connection during the check'); lost.interrupted = true; throw lost }
      await whenVisible()
      await sleep(2000)
    }
  }
}

// scheduled: the 8 AM / 1 PM check. It skips jobs already read since the
// check's own start time (so a check cut short and started again carries on
// instead of starting over), and in the afternoon the jobs not started yet.
export async function runPermitPulse({ ids, onProgress, scheduled = false } = {}) {
  const { proposals, setCountyPermit } = useStore.getState()
  const slot = currentPulseSlot()
  const morning = slot.getHours() === PULSE_HOURS[0]
  const jobs = pulseJobs(proposals, { ids, scheduled, slot, morning })
  let done = 0, failed = 0, lastError = null, interrupted = false, cooling = false
  // Per county: jobs whose county site was read, and jobs where it wasn't
  // (a busy answer is counted apart: it's the site pacing us, not an outage),
  // against every tracked job in that county, not just the ones in this run.
  const stats = {}
  const countyJobs = countyTotals(proposals)
  const tally = (p, ok, error) => tallyInto(stats, countyJobs, p, ok, error)
  let coolDowns = 0
  for (let i = 0; i < jobs.length; i += BATCH) {
    const batch = jobs.slice(i, i + BATCH)
    let results = {}
    try {
      // The county site said "too many requests" on the last batch: its limit
      // counts requests per minute, so give it a breather before the next one.
      if (cooling && coolDowns < MAX_COOL_DOWNS) { coolDowns++; await sleep(COOL_DOWN_MS) }
      else if (i > 0) await sleep(PACE_MS)   // an unhurried pace between batches
      cooling = false
      await whenVisible()
      const res = await postBatch(JSON.stringify({ jobs: batch.map(pulseRequest) }))
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `The permit check failed (${res.status})`)
      results = body.results || {}
    } catch (e) {
      // Our own connection dropped: stop here without blaming any county.
      if (e.interrupted) { interrupted = true; lastError = e; break }
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
      if (r.siteError && isBusyError(r.error)) cooling = true
      tally(p, !r.siteError, r.error)
      // The new reading (the last good one kept if this check failed), and
      // the permits that dropped out of it: nothing read is ever thrown away
      const prev = useStore.getState().proposals.find(x => x.id === p.id)?.countyPermit
      const { reading: next, dropped } = nextReading(r, prev)
      if (dropped.length) {
        const job = useStore.getState().proposals.find(x => x.id === p.id)
        useStore.getState().updateJobData(p.id, { permitHistory: addToHistory(job?.jobData?.permitHistory, dropped) })
      }
      setCountyPermit(p.id, next, passedStagesOf(p, r, next))
      // Every final passed: off the board, ready for the office's close-out
      if (r.permits?.length && !r.error) closeIfFinaled(p.id, useStore.getState)
      done++
    }
    onProgress?.({ done, failed, total: jobs.length })
    useStore.getState().setPermitPulseProgress?.({ done: done + failed, total: jobs.length })
  }
  useStore.getState().setPermitPulseProgress?.(null)
  if (!done && lastError) { lastError.stats = stats; throw lastError }   // nothing worked at all — tell the person who asked
  return { done, failed, total: jobs.length, stats, interrupted }
}

// Tracked jobs never read, or busy last time (lib/pulseCore.js uncheckedJobs):
// tried again on the next 10-minute tick.
export function uncheckedJobIds() {
  return uncheckedJobs(useStore.getState().proposals).map(p => p.id)
}

// The scheduled run (and "Check county now", with force). The run is marked
// as started in the shared settings first, so two office screens open at the
// same time don't both run it, and none starts while the server's scheduled
// check (api/_permit-tick.js) has it under way: the server keeps startedAt
// (and fillStartedAt for its retries) fresh while it works. This screen's run
// is the fallback for when the server's hasn't happened.
let running = false

export async function startPulse(by, { force = false } = {}) {
  const { permitPulse, setPermitPulse } = useStore.getState()
  if (running) return null
  if (!force) {
    if (!pulseDue(permitPulse?.lastRunAt)) {
      // Not time for the full check, but fill in jobs never checked
      const ids = uncheckedJobIds()
      if (!ids.length) return null
      // One office screen at a time: every open screen ticks every 10 minutes,
      // and all of them retrying the same jobs at once is what makes a busy
      // county site busier.
      const filling = permitPulse?.fillStartedAt && Date.now() - new Date(permitPulse.fillStartedAt) < FILL_LOCK_MS
      if (filling) return null
      running = true
      setPermitPulse({ ...(permitPulse || {}), fillStartedAt: new Date().toISOString() })
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
    const out = await runPermitPulse({ scheduled: !force })
    const { stats, interrupted, ...last } = out
    // Cut short by our own connection: grade only the counties actually read,
    // and leave lastRunAt alone so the next screen finishes the check.
    if (interrupted) setPermitPulse({ ...(useStore.getState().permitPulse || {}), startedAt: null })
    else setPermitPulse({ ...(useStore.getState().permitPulse || {}), lastRunAt: new Date().toISOString(), by, last })
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
