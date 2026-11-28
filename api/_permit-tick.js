/* global process */
/**
 * The county inspection check, run by the server on a schedule.
 *   GET /api/permit-pulse?tick=1  → { due, mode, done, failed, remaining, … }
 *
 * The office screens run this check while one is open (src/lib/permitPulse.js);
 * over a long weekend nobody opens the app and nothing would be read. So
 * .github/workflows/county-check.yml calls this through the day instead, and
 * it does exactly what a screen would, with the same rules
 * (src/lib/pulseCore.js, permitRules.js, jobStages.js, jobPhase.js,
 * subInspections.js, permitHealth.js):
 *
 *   8 AM and 1 PM (office time)  every tracked job not read since the slot
 *                                began (in the afternoon, not the jobs not
 *                                started yet), then permitPulse.lastRunAt
 *   in between                   the jobs never read, and the ones the county
 *                                was busy for, at most once per 10 minutes
 *
 * For each job: the new countyPermit (the last good reading kept if the
 * county failed, dropped permits into jobData.permitHistory), the stages the
 * county passed ticked (never unticked), the subs' bookings stamped with their
 * trade's results, the alerts (inspection_result to the sub, job_inspection and
 * job_ready to the PM, api/_notify.js), and finals passed marked for
 * close-out. After the run, each county's connection is graded and the office
 * emailed when one goes down or comes back.
 *
 * Safe to call any number of times, by anyone: it takes no input, only one
 * call works at a time (a lock in app_kv), each call stops starting batches at
 * about 45 s, the county is read at the screens' pace (3 jobs a batch, 5 s
 * apart, 25 s after a busy answer), and it never reads a job twice in a run.
 * While it works it keeps permitPulse.startedAt (or fillStartedAt) fresh, so an
 * open office screen leaves the run to it; a screen's own run is left alone the
 * same way, and takes over if this one stops.
 */
import { pulseJobs, uncheckedJobs, pulseRequest, nextReading, passedStagesOf, countyTotals, tally, BATCH, COOL_DOWN_MS, MAX_COOL_DOWNS, PACE_MS, STALE_START_MS, FILL_LOCK_MS } from '../src/lib/pulseCore.js'
import { currentPulseSlot, pulseDue, hourIn, PULSE_HOURS, PULSE_TZ, addToHistory, finaledChanges, inspectionSig, APPROVAL_STEPS } from '../src/lib/permitRules.js'
import { stampInspections } from '../src/lib/subInspections.js'
import { becameReady } from '../src/lib/jobPhase.js'
import { gradeRun, isBusyError } from '../src/lib/permitHealth.js'

export const BY = 'Automatic check'          // permitPulse.by when the server ran it
const LOCK_KEY = 'permit-tick:lock'
const LOCK_MS = 75 * 1000                     // longer than one call can run (60 s)
const runKey = (orgId) => `permit-tick:run:${orgId}`
export const BUDGET_MS = 45 * 1000            // no batch starts after this
export const HARD_MS = 55 * 1000              // a batch still out then is let go (read again next call)
const BATCH_PATIENCE_MS = 40 * 1000           // what a screen's batch gets (api/permit-pulse.js)
export const FILL_ROUND_MS = 10 * 60 * 1000   // the screens' 10-minute tick: a retry round
const PAGE = 1000
const TIMEOUT = Symbol('timeout')

export async function permitTick(req, res, { readCounty }) {
  res.setHeader?.('Cache-Control', 'no-store')
  try {
    res.status(200).json(await runTick(await liveDeps(req, readCounty)))
  } catch (e) {
    console.error('[permit tick]', e?.message || e)
    res.status(500).json({ error: 'The county check failed on the server.' })
  }
}

// The real database (service key), alerts and county reader
async function liveDeps(req, readCounty) {
  const [{ db }, { notifyFromServer }, { deliverPermitAlert }] = await Promise.all([import('./_round-robin.js'), import('./_notify.js'), import('./_permit-alert.js')])
  const sb = db()
  const host = req.headers?.host || ''
  const origin = process.env.APP_URL || (host ? `https://${host}` : 'https://www.deckplus.app')
  return {
    sb, readCounty,
    notify: (orgId, kind, id) => notifyFromServer(sb, { orgId, kind, id, host }),
    sendAlert: (orgId, change) => deliverPermitAlert({ sb, orgId, alert: change, origin }),
  }
}

// One call. deps: sb (Supabase client with the service key), readCounty(jobs,
// deadline) → results by job id, notify(orgId, kind, id), sendAlert(orgId,
// change); now / sleep / timer / budgetMs / hardMs for tests.
export async function runTick(deps) {
  const ctx = {
    now: () => Date.now(), sleep: (ms) => new Promise(r => setTimeout(r, ms)),
    timer: (ms) => new Promise(r => { const t = setTimeout(r, ms); t.unref?.() }),
    budgetMs: BUDGET_MS, hardMs: HARD_MS, lockId: Math.random().toString(36).slice(2) + Date.now().toString(36),
    ...deps,
  }
  ctx.t0 = ctx.now()
  if (!(await takeLock(ctx))) return { due: null, done: 0, failed: 0, remaining: null, skipped: 'Another check is running', wait: 20 }
  try {
    const { data: orgs, error } = await ctx.sb.from('org_settings').select('org_id')
    if (error) throw new Error(`org_settings: ${error.message}`)
    const out = { due: false, done: 0, failed: 0, remaining: 0 }
    for (const { org_id: orgId } of orgs || []) {
      const r = await tickOrg(ctx, orgId)
      out.due = out.due || !!r.due
      out.done += r.done || 0
      out.failed += r.failed || 0
      out.remaining = out.remaining == null || r.remaining == null ? null : out.remaining + r.remaining
      for (const k of ['mode', 'skipped', 'wait', 'finished']) if (r[k] != null) out[k] = r[k]
    }
    return out
  } finally {
    await releaseLock(ctx)
  }
}

async function tickOrg(ctx, orgId) {
  const { sb } = ctx
  const at = new Date(ctx.now())
  const slot = currentPulseSlot(at, PULSE_TZ)
  const morning = hourIn(slot, PULSE_TZ) === PULSE_HOURS[0]
  const pulse = await readPulse(sb, orgId)
  const slotDue = pulseDue(pulse?.lastRunAt, at, PULSE_TZ)
  let run = await readRun(sb, orgId)

  // A run left from an earlier slot, or a retry round past its 10 minutes:
  // grade what it read (a screen does that for a run cut short too), then start afresh.
  const over = run && (run.kind === 'slot'
    ? !slotDue || run.slot !== slot.toISOString()
    : slotDue || ctx.now() - Date.parse(run.startedAt) > FILL_ROUND_MS)
  if (over) {
    if (!run.finished && run.tried?.length) await recordHealth(ctx, orgId, run.stats)
    run = null
    await clearRun(sb, orgId)
  }
  const fresh = (iso, ms) => iso && ctx.now() - Date.parse(iso) < ms

  if (slotDue) {
    // An office screen is running this slot: leave it to it (it takes ~5 minutes)
    const screenRun = fresh(pulse?.startedAt, STALE_START_MS) && (!pulse.lastRunAt || pulse.startedAt > pulse.lastRunAt) && pulse.startedAt !== pulse.serverStartedAt
    if (screenRun) return { due: true, mode: 'slot', remaining: 0, skipped: 'An office screen is running the check' }
    // …or retrying jobs right now: wait for it, so the two don't read the same ones
    if (fresh(pulse?.fillStartedAt, FILL_LOCK_MS) && pulse.fillStartedAt !== pulse.serverFillAt && !run) return { due: true, mode: 'slot', remaining: null, skipped: 'An office screen is retrying jobs', wait: 30 }
    // The last try read nothing at all (as on a screen, lastRunAt was left
    // alone): the next one comes 10 minutes later, not straight away
    if (run?.retryAfter) {
      if (ctx.now() < run.retryAfter) return { due: true, mode: 'slot', remaining: 0, skipped: 'Nothing could be read on the last try; trying again shortly' }
      run = null
    }
    const jobs = await loadJobs(sb, orgId)
    const list = pulseJobs(jobs, { scheduled: true, slot, morning })
    run ||= newRun('slot', at, { slot: slot.toISOString() })
    if (list.some(p => !run.tried.includes(String(p.id)))) {
      const iso = at.toISOString()
      await updatePulse(sb, orgId, (cur) => ({ ...(cur || {}), startedAt: iso, serverStartedAt: iso, by: BY }))
    }
    const r = await readBatches(ctx, orgId, run, list, jobs)
    if (r.remaining) return { due: true, mode: 'slot', ...r }
    // Not one job read, every request failed: like a screen's run that threw,
    // the slot stays due (a screen may pick it up) and the counties are graded
    if (!run.done && run.lastError) {
      await updatePulse(sb, orgId, (cur) => ({ ...(cur || {}), startedAt: null, lastError: run.lastError }))
      await recordHealth(ctx, orgId, run.stats)
      await saveRun(ctx, orgId, { ...newRun('slot', new Date(ctx.now()), { slot: slot.toISOString() }), retryAfter: ctx.now() + FILL_ROUND_MS })
      return { due: true, mode: 'slot', ...r, skipped: 'Nothing could be read; trying again shortly' }
    }
    // Nothing left in this slot: done, as a screen's finished run records it
    // The retries wait their 10 minutes after a full check, as on a screen
    // (the screens' too: fillStartedAt keeps their retry back for 8)
    const last = { done: run.done, failed: run.failed, total: run.tried.length }
    const end = new Date(ctx.now()).toISOString()
    await updatePulse(sb, orgId, (cur) => ({ ...(cur || {}), lastRunAt: end, by: BY, last, fillStartedAt: end, serverFillAt: end }))
    await recordHealth(ctx, orgId, run.stats)
    await saveRun(ctx, orgId, { ...newRun('fill', new Date(ctx.now())), finished: true })
    return { due: true, mode: 'slot', ...r, finished: true }
  }

  // Between slots: never-read and busy jobs, once per 10-minute round
  if (run?.finished) return { due: false, mode: 'fill', done: 0, failed: 0, remaining: 0 }
  // An office screen is retrying them already (lib/permitPulse.js)
  if (!run && fresh(pulse?.fillStartedAt, FILL_LOCK_MS) && pulse.fillStartedAt !== pulse.serverFillAt) {
    return { due: false, mode: 'fill', done: 0, failed: 0, remaining: 0, skipped: 'An office screen is retrying jobs' }
  }
  const jobs = await loadJobs(sb, orgId)
  const list = uncheckedJobs(jobs)
  run ||= newRun('fill', at)
  const todo = list.filter(p => !run.tried.includes(String(p.id)))
  if (todo.length) {
    const iso = at.toISOString()
    await updatePulse(sb, orgId, (cur) => ({ ...(cur || {}), fillStartedAt: iso, serverFillAt: iso }))
  }
  const r = await readBatches(ctx, orgId, run, list, jobs)
  if (!r.remaining) {
    if (run.tried.length) await recordHealth(ctx, orgId, run.stats)
    run.finished = true
  }
  await saveRun(ctx, orgId, run)
  return { due: todo.length > 0, mode: 'fill', ...r }
}

// A run's progress, kept in app_kv between calls: which jobs it has tried, the
// counties' tally, and the pace (cool-downs used, last batch)
const newRun = (kind, at, extra = {}) => ({ kind, startedAt: at.toISOString(), tried: [], stats: {}, done: 0, failed: 0, lastError: null, coolDowns: 0, cooling: false, lastBatchAt: null, ...extra })

// Read the jobs in `list` this run hasn't tried, a batch at a time, while the
// call has time. → { done, failed, remaining } (this call's, and what's left)
async function readBatches(ctx, orgId, run, list, jobs) {
  const countyJobs = countyTotals(jobs)
  const tried = new Set(run.tried)
  let done = 0, failed = 0
  const left = () => list.filter(p => !tried.has(String(p.id)))
  while (left().length) {
    // The pace a screen keeps: 5 s between batches, 25 s after a busy answer
    const since = run.lastBatchAt == null ? Infinity : ctx.now() - run.lastBatchAt
    const coolDown = run.cooling && run.coolDowns < MAX_COOL_DOWNS
    const wait = coolDown ? Math.max(0, COOL_DOWN_MS - since) : run.lastBatchAt == null ? 0 : Math.max(0, PACE_MS - since)
    if (ctx.now() + wait - ctx.t0 > ctx.budgetMs) break
    if (coolDown) run.coolDowns++
    if (wait) await ctx.sleep(wait)
    run.cooling = false
    const batch = left().slice(0, BATCH)
    const deadline = Math.min(ctx.now() + BATCH_PATIENCE_MS, ctx.t0 + ctx.hardMs - 3000)
    let results
    try {
      const answer = await Promise.race([ctx.readCounty(batch.map(pulseRequest), deadline), ctx.timer(Math.max(0, ctx.t0 + ctx.hardMs - ctx.now())).then(() => TIMEOUT)])
      if (answer === TIMEOUT) break   // out of time: these are read on the next call
      results = JSON.parse(JSON.stringify(answer || {}))   // as a screen gets it, over the wire
    } catch (e) {
      // A screen's failed request: counted as not read, tried again on the next check
      for (const p of batch) { tried.add(String(p.id)); tally(run.stats, countyJobs, p, false, e.message); failed++; run.failed++ }
      run.lastError = e.message
      run.lastBatchAt = ctx.now()
      run.tried = [...tried]
      await saveRun(ctx, orgId, run)
      continue
    }
    for (const p of batch) {
      tried.add(String(p.id))
      const r = results[p.id]
      if (!r) { failed++; run.failed++; tally(run.stats, countyJobs, p, false, 'No answer for this job'); continue }
      if (r.siteError && isBusyError(r.error)) run.cooling = true
      tally(run.stats, countyJobs, p, !r.siteError, r.error)
      await saveReading(ctx, orgId, p, r)
      done++; run.done++
    }
    run.lastBatchAt = ctx.now()
    run.tried = [...tried]
    await saveRun(ctx, orgId, run)   // so a call cut off later doesn't read these again
  }
  return { done, failed, remaining: left().length }
}

// ── One job's reading → its row, its bookings, its alerts ────────────────────
// What setCountyPermit (src/store.js) and closeIfFinaled do on a screen,
// against the database. The row is written only if nobody changed it since it
// was read (updated_at); otherwise it is read again and the reading re-applied.
async function saveReading(ctx, orgId, p, r) {
  const { sb } = ctx
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await readRow(sb, 'proposals', orgId, p.id)
    if (!row) return
    const before = { ...row.data, id: row.data?.id ?? p.id }
    const { reading: next, dropped } = nextReading(r, before.countyPermit)
    const passed = passedStagesOf(p, r, next)
    const jd = before.jobData || {}
    const changes = {}
    if (dropped.length) changes.permitHistory = addToHistory(jd.permitHistory, dropped)
    const ticked = jd.completedStages || []
    const add = passed.filter(k => !ticked.includes(k))
    if (add.length) changes.completedStages = [...ticked, ...add]
    let after = { ...before, countyPermit: next, ...(Object.keys(changes).length ? { jobData: { ...jd, ...changes } } : {}) }
    // Every final passed: off the board, ready for the office's close-out
    const finals = r.permits?.length && !r.error ? finaledChanges(after) : null
    if (finals) after = { ...after, jobData: { ...(after.jobData || {}), ...finals } }
    const data = { ...row.data, countyPermit: next, ...('jobData' in after && after.jobData !== row.data?.jobData ? { jobData: after.jobData } : {}) }
    if (!(await writeRow(sb, 'proposals', orgId, row, data))) continue
    await stampBookings(ctx, orgId, after)                                   // each sub hears about their own trade's results
    if (passed.some(k => APPROVAL_STEPS.includes(k)) && becameReady(before, after)) await tell(ctx, orgId, 'job_ready', after.id)
    if (inspectionSig(before) !== inspectionSig(after)) await tell(ctx, orgId, 'job_inspection', after.id)   // and the job's PM about anything new
    return
  }
  console.error('[permit tick] job kept changing, reading not saved:', p.id)
}

// The job's bookings carry their own trade's results (lib/subInspections.js);
// a sub with a new pass / fail from the last three days is told.
async function stampBookings(ctx, orgId, job) {
  const { sb } = ctx
  const { data: rows, error } = await sb.from('sub_tasks').select('id, data, updated_at').eq('org_id', orgId).is('deleted_at', null).eq('data->>proposalId', String(job.id))
  if (error || !rows?.length) return   // no bookings (or no bookings table yet)
  ctx.subs ||= {}
  ctx.subs[orgId] ||= await loadSubs(sb, orgId)
  const since = new Date(ctx.now() - 3 * 86400000).toISOString().slice(0, 10)
  const tasks = rows.map(x => ({ ...x.data, id: x.data?.id ?? x.id }))
  const out = stampInspections(tasks, job, ctx.subs[orgId], { since })
  if (out.tasks === tasks) return
  const saved = new Set()
  for (let i = 0; i < tasks.length; i++) {
    if (out.tasks[i] === tasks[i]) continue
    let row = rows[i]
    for (let attempt = 0; attempt < 4 && row; attempt++) {
      if (await writeRow(sb, 'sub_tasks', orgId, row, { ...row.data, inspections: out.tasks[i].inspections })) { saved.add(String(tasks[i].id)); break }
      row = await readRow(sb, 'sub_tasks', orgId, row.id)
    }
  }
  for (const id of out.alert) if (saved.has(String(id))) await tell(ctx, orgId, 'inspection_result', id)
}

async function tell(ctx, orgId, kind, id) {
  try { await ctx.notify(orgId, kind, id) } catch (e) { console.error('[permit tick] alert', kind, id, e?.message || e) }   // an alert never stops the check
}

// Each county's connection graded after a run; the office emailed when one
// goes down or comes back (lib/permitHealth.js).
async function recordHealth(ctx, orgId, stats) {
  if (!stats) return
  let changes = []
  await updatePulse(ctx.sb, orgId, (cur) => {
    const g = gradeRun(cur?.health, stats)
    changes = g.changes
    return { ...(cur || {}), health: g.health }
  })
  for (const c of changes) {
    try { await ctx.sendAlert(orgId, c) } catch (e) { console.error('[permit tick] county alert', e?.message || e) }
  }
}

// ── Storage ──────────────────────────────────────────────────────────────────
async function loadJobs(sb, orgId) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('proposals').select('id, data').eq('org_id', orgId).is('deleted_at', null)
      .in('status', ['Won', 'Imported']).order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(`proposals: ${error.message}`)
    out.push(...(data || []).map(r => ({ ...(r.data || {}), id: r.data?.id ?? r.id })))
    if (!data || data.length < PAGE) return out
  }
}
async function loadSubs(sb, orgId) {
  const { data } = await sb.from('subcontractors').select('id, data').eq('org_id', orgId).is('deleted_at', null)
  return (data || []).map(r => ({ ...(r.data || {}), id: r.data?.id ?? r.id }))
}
async function readRow(sb, table, orgId, id) {
  const { data, error } = await sb.from(table).select('id, data, updated_at').eq('org_id', orgId).eq('id', String(id)).is('deleted_at', null).maybeSingle()
  if (error) throw new Error(`${table}: ${error.message}`)
  return data || null
}
// Only if the row is as it was read; → whether it was written
async function writeRow(sb, table, orgId, row, data) {
  const { data: hit, error } = await sb.from(table).update({ data }).eq('org_id', orgId).eq('id', row.id).eq('updated_at', row.updated_at).select('id')
  if (error) throw new Error(`${table}: ${error.message}`)
  return (hit || []).length > 0
}
async function readPulse(sb, orgId) {
  const { data, error } = await sb.from('org_settings').select('data, updated_at').eq('org_id', orgId).maybeSingle()
  if (error) throw new Error(`org_settings: ${error.message}`)
  return data?.data?.permitPulse || null
}
// org_settings.data.permitPulse, changed by fn, the rest of the settings untouched
async function updatePulse(sb, orgId, fn) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error } = await sb.from('org_settings').select('data, updated_at').eq('org_id', orgId).maybeSingle()
    if (error) throw new Error(`org_settings: ${error.message}`)
    if (!row) return null
    const next = fn(row.data?.permitPulse || null)
    const { data: hit, error: e2 } = await sb.from('org_settings').update({ data: { ...(row.data || {}), permitPulse: next } })
      .eq('org_id', orgId).eq('updated_at', row.updated_at).select('org_id')
    if (e2) throw new Error(`org_settings: ${e2.message}`)
    if (hit?.length) return next
  }
  throw new Error('org_settings kept changing; the check state was not saved')
}
async function readRun(sb, orgId) {
  const { data } = await sb.from('app_kv').select('value').eq('key', runKey(orgId)).maybeSingle()
  return data?.value || null
}
async function saveRun(ctx, orgId, run) {
  const at = ctx.now()
  const { error } = await ctx.sb.from('app_kv').upsert({ key: runKey(orgId), value: run, expires_at: new Date(at + 86400000).toISOString(), updated_at: new Date(at).toISOString() }, { onConflict: 'key' })
  if (error) throw new Error(`app_kv: ${error.message}`)
}
async function clearRun(sb, orgId) { await sb.from('app_kv').delete().eq('key', runKey(orgId)) }

// One call at a time: a row only one insert can create; a lock left by a call
// that died runs out after LOCK_MS.
async function takeLock(ctx) {
  const at = ctx.now()
  await ctx.sb.from('app_kv').delete().eq('key', LOCK_KEY).lt('expires_at', new Date(at).toISOString())
  const { error } = await ctx.sb.from('app_kv').insert({ key: LOCK_KEY, value: { id: ctx.lockId, at: new Date(at).toISOString() }, expires_at: new Date(at + LOCK_MS).toISOString() })
  return !error
}
async function releaseLock(ctx) {
  try { await ctx.sb.from('app_kv').delete().eq('key', LOCK_KEY).eq('value->>id', ctx.lockId) } catch { /* runs out by itself */ }
}
