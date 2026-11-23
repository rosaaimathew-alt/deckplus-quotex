/* global process */
/**
 * Painters' time clock, the server side (the rules are in the database:
 * supabase/time_clock.sql).
 *
 *   mapJobSites(userId)  find where the signed-in person's paint jobs are, from
 *                        each job's address (POST /api/email action 'job-sites').
 *                        A painter only ever maps their own jobs; nobody can
 *                        type a job's location in.
 *   dailyTimeClock()     from the daily cron (/api/booking?report=1): close
 *                        shifts left open at 4:30 PM, map new jobs, and on
 *                        Wednesday email the pay week that just ended
 *                        (Wednesday through Tuesday) to tc_settings.payroll_to.
 */
import { db } from './_round-robin.js'
import { sendMail } from './_mailer.js'
import { TZ, todayET, weekStartOf, addDaysStr, weekDays, dayName, hm, summarize, payrollCsv } from '../src/lib/timeClock.js'

const APP_URL = process.env.APP_URL || 'https://www.deckplus.app'
const UA = 'DeckPlus-QuoteX/1.0 (+https://www.deckplus.app; office@deckplus.app)'
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

// ── Address → point ─────────────────────────────────────────────────────────
// The Census Bureau's geocoder first (US addresses, no key), OpenStreetMap after.
async function geocode(address) {
  const q = encodeURIComponent(address)
  try {
    const r = await fetch(`https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${q}&benchmark=Public_AR_Current&format=json`,
      { signal: AbortSignal.timeout(6000) })
    const m = (await r.json())?.result?.addressMatches?.[0]?.coordinates
    if (m && Number.isFinite(m.y) && Number.isFinite(m.x)) return { lat: m.y, lng: m.x, source: 'census' }
  } catch { /* try the next one */ }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${q}`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) })
    const m = (await r.json())?.[0]
    if (m) return { lat: parseFloat(m.lat), lng: parseFloat(m.lon), source: 'osm' }
  } catch { /* not found */ }
  return null
}

const addressOf = (p, task) => {
  const d = p?.data || {}
  return String(d.address || d.contractDraft?.address || task?.data?.address || '').trim()
}

// Paint jobs that have a painter on them, mapped once per address. scope: the
// person's own jobs (a painter) or every paint job (the office / paint PM).
async function mapJobs(sb, orgId, tasks, max) {
  const ids = [...new Set(tasks.map(t => t.data?.proposalId).filter(Boolean).map(String))]
  if (!ids.length) return { mapped: 0, missing: 0 }
  const [{ data: props }, { data: sites }] = await Promise.all([
    sb.from('proposals').select('id, data').eq('org_id', orgId).in('id', ids),
    sb.from('job_sites').select('proposal_id, address, lat, found_at').eq('org_id', orgId).in('proposal_id', ids),
  ])
  const have = new Map((sites || []).map(s => [s.proposal_id, s]))
  const todo = []
  for (const id of ids) {
    const p = (props || []).find(x => String(x.id) === id)
    const address = addressOf(p, tasks.find(t => String(t.data?.proposalId) === id))
    if (!address) continue
    const s = have.get(id)
    // New, the address changed, or not found last time (try again after a day)
    const notFoundLately = s && s.address === address && s.lat == null && Date.now() - new Date(s.found_at) < 86_400_000
    if ((!s || s.address !== address || s.lat == null) && !notFoundLately) todo.push({ id, address })
  }
  let mapped = 0
  for (const job of todo.slice(0, max)) {
    const g = await geocode(job.address)
    await sb.from('job_sites').upsert({ org_id: orgId, proposal_id: job.id, address: job.address,
      lat: g?.lat ?? null, lng: g?.lng ?? null, source: g?.source ?? null, found_at: new Date().toISOString() })
    if (g) mapped++
  }
  return { mapped, missing: Math.max(0, todo.length - max) }
}

export async function mapJobSites(userId) {
  const sb = db()
  const { data: m } = await sb.from('org_members').select('org_id, role').eq('user_id', userId).limit(1).maybeSingle()
  if (!m) return { mapped: 0 }
  // The paint PM clocks in at any open job: map those
  if (m.role === 'paint') return mapJobs(sb, m.org_id, await openJobs(sb, m.org_id), 6)
  let q = sb.from('sub_tasks').select('id, owner_id, crew_id, data').eq('org_id', m.org_id).is('deleted_at', null).eq('data->>paint', 'true')
  if (m.role === 'sub') q = q.or(`crew_id.eq.${userId},owner_id.eq.${userId}`)
  else if (!['office', 'admin', 'pm'].includes(m.role)) return { mapped: 0 }
  else q = q.not('crew_id', 'is', null).gte('updated_at', new Date(Date.now() - 120 * 86_400_000).toISOString())
  const { data: tasks, error } = await q
  if (error) throw error
  return mapJobs(sb, m.org_id, tasks || [], 6)
}

// Every open job (won or brought over, not closed), in the shape mapJobs takes.
async function openJobs(sb, orgId) {
  const { data, error } = await sb.from('proposals').select('id, data->jobData->completedStages, data->jobData->invoicesOnly')
    .eq('org_id', orgId).is('deleted_at', null).in('status', ['Won', 'Imported'])
  if (error) throw error
  return (data || []).filter(p => !p.invoicesOnly && !(p.completedStages || []).includes('closed'))
    .map(p => ({ data: { proposalId: String(p.id) } }))
}

// ── The pay week, for the email ─────────────────────────────────────────────
// Midnight where the crews work, as a UTC instant.
function midnightET(day) {
  const guess = new Date(`${day}T05:00:00Z`)
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(guess))
  return new Date(guess.getTime() - hour * 3_600_000)
}

async function weekShifts(sb, orgId, start) {
  const from = midnightET(start).toISOString(), to = midnightET(addDaysStr(start, 7)).toISOString()
  const { data: rows, error } = await sb.from('time_shifts').select('*').eq('org_id', orgId).gte('clock_in_at', from).lt('clock_in_at', to).order('clock_in_at')
  if (error) throw error
  if (!rows?.length) return []
  const { data: pings } = await sb.from('time_pings').select('shift_id, kind, at, lat, lng, acc, dist_m, on_site').in('shift_id', rows.map(r => r.id)).order('at')
  const { data: members } = await sb.from('org_members').select('user_id, display_name').eq('org_id', orgId)
  const name = new Map((members || []).map(x => [x.user_id, x.display_name]))
  return rows.map(r => ({
    id: r.id, userId: r.user_id, worker: name.get(r.user_id) || r.worker || 'Painter', proposalId: r.proposal_id, client: r.client, address: r.address,
    day: todayET(new Date(r.clock_in_at)), in: r.clock_in_at, out: r.clock_out_at, autoOut: r.auto_out,
    pings: (pings || []).filter(p => p.shift_id === r.id).map(p => ({ kind: p.kind, at: p.at, lat: p.lat, lng: p.lng, acc: p.acc, dist: p.dist_m, onSite: p.on_site })),
  }))
}

function payrollEmail(rows, start) {
  const days = weekDays(start)
  const end = addDaysStr(start, 6)
  const td = 'padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px;'
  const th = 'padding:6px 8px;border-bottom:2px solid #d1d5db;font-size:12px;text-align:left;color:#374151;'
  const total = rows.reduce((a, w) => a + w.total, 0)
  const flags = (w) => [
    w.autoOuts && `${w.autoOuts} day${w.autoOuts > 1 ? 's' : ''} ended at 4:30 (didn't clock out at the job)`,
    w.gaps && `${w.gaps} gap${w.gaps > 1 ? 's' : ''} with no location`,
    w.offSite && `${w.offSite} check${w.offSite > 1 ? 's' : ''} away from the job`,
  ].filter(Boolean).join(' · ')
  const link = `${APP_URL}/money?tab=timeclock&week=${start}`
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111827">
<p style="font-size:15px;margin:0 0 4px"><strong>Painters' hours: ${esc(dayName(start))} – ${esc(dayName(end))}</strong></p>
<p style="font-size:13px;color:#6b7280;margin:0 0 14px">${rows.length} painter${rows.length === 1 ? '' : 's'} · ${hm(total)} hours in all</p>
<table style="border-collapse:collapse;width:100%;max-width:720px">
<tr><th style="${th}">Painter</th>${days.map(d => `<th style="${th}text-align:right">${esc(dayName(d, { weekday: 'short' }))}</th>`).join('')}<th style="${th}text-align:right">Total</th></tr>
${rows.map(w => `<tr><td style="${td}"><strong>${esc(w.worker)}</strong>${flags(w) ? `<br><span style="color:#b45309;font-size:12px">${esc(flags(w))}</span>` : ''}</td>${days.map(d => `<td style="${td}text-align:right">${w.days[d] ? hm(w.days[d]) : '–'}</td>`).join('')}<td style="${td}text-align:right"><strong>${hm(w.total)}</strong></td></tr>`).join('')}
</table>
<p style="font-size:13px;margin:16px 0 0"><a href="${esc(link)}">See every clock in, clock out and location on the map</a></p>
<p style="font-size:12px;color:#6b7280;margin:8px 0 0">Every shift is in the attached spreadsheet. Hours are clock in to clock out; a day nobody clocked out of at the job ends at 4:30 PM.</p>
</div>`
  const text = `Painters' hours: ${dayName(start)} – ${dayName(end)}\n\n${rows.map(w => `${w.worker}: ${hm(w.total)}${flags(w) ? ` (${flags(w)})` : ''}`).join('\n') || 'No hours this week.'}\n\n${link}`
  return {
    subject: `Painters' hours for payroll: ${dayName(start)} – ${dayName(end)}`,
    html, text,
    attachments: [{ filename: `painters-hours-${start}.csv`, content: payrollCsv(rows, start), contentType: 'text/csv' }],
  }
}

// ── Every morning ───────────────────────────────────────────────────────────
// Never throws: the lead report that runs next must still go.
export async function dailyTimeClock(now = new Date()) {
  const out = { closed: 0, mapped: 0, payroll: [] }
  try {
    const sb = db()
    const { data: orgs } = await sb.from('tc_settings').select('*')
    const { data: openOrgs } = await sb.from('time_shifts').select('org_id').is('clock_out_at', null)
    const orgIds = [...new Set([...(orgs || []).map(o => o.org_id), ...(openOrgs || []).map(o => o.org_id)])]
    for (const orgId of orgIds) {
      try {
        const { data: n } = await sb.rpc('tc_close_stale', { p_org: orgId, p_user: null })
        out.closed += Number(n || 0)
        const { data: tasks } = await sb.from('sub_tasks').select('id, data').eq('org_id', orgId).is('deleted_at', null).eq('data->>paint', 'true')
          .not('crew_id', 'is', null).gte('updated_at', new Date(now.getTime() - 120 * 86_400_000).toISOString())
        out.mapped += (await mapJobs(sb, orgId, tasks || [], 5)).mapped
        // and the open jobs the paint PM can clock in at
        out.mapped += (await mapJobs(sb, orgId, await openJobs(sb, orgId), 20)).mapped
      } catch (err) { console.error('time clock daily:', orgId, err.message) }
    }

    // Wednesday: the week that ended last night (Wednesday through Tuesday)
    const today = todayET(now)
    if (weekStartOf(today) !== today) return out
    const start = addDaysStr(today, -7)
    for (const s of orgs || []) {
      if (!s.payroll_to?.length || s.last_payroll_week === start) continue
      // Claim it so a repeated run can't send it twice
      const { data: claimed } = await sb.from('tc_settings').update({ last_payroll_week: start }).eq('org_id', s.org_id)
        .or(`last_payroll_week.is.null,last_payroll_week.neq.${start}`).select('org_id')
      if (!claimed?.length) continue
      try {
        const rows = summarize(await weekShifts(sb, s.org_id, start), start, now)
        const r = await sendMail({ to: s.payroll_to, fromName: 'Deck Plus Time Clock', ...payrollEmail(rows, start) })
        if (r?.error) throw new Error(r.error)
        out.payroll.push({ org: s.org_id, week: start, painters: rows.length })
      } catch (err) {
        await sb.from('tc_settings').update({ last_payroll_week: s.last_payroll_week }).eq('org_id', s.org_id)
        console.error('payroll email:', err.message)
      }
    }
  } catch (err) { console.error('time clock daily:', err.message) }
  return out
}

