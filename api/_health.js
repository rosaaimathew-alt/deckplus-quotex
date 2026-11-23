/* global process */
/**
 * The app's health, emailed to the owner (org_settings.ownerUserId), from the
 * daily cron (/api/booking?report=1). Sent when something needs a look, and a
 * short summary every Monday, so a quiet day sends nothing.
 *
 *   County inspection check   when it last finished, counties marked down,
 *                             jobs the county was too busy to answer, jobs
 *                             not read in two days
 *   Time clock                shifts still open, days closed at 4:30,
 *                             refused clock ins and outs, the payroll email
 *   Data                      how many proposals, purchase orders and
 *                             invoices there are, and the week's growth
 *
 * Never throws: the lead report that runs next must still go.
 */
import { db } from './_round-robin.js'
import { sendMail } from './_mailer.js'
import { todayET, addDaysStr } from '../src/lib/timeClock.js'

const APP_URL = process.env.APP_URL || 'https://www.deckplus.app'
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const DAY = 86_400_000
const count = async (sb, table, orgId, since) => {
  let q = sb.from(table).select('id', { count: 'exact', head: true }).eq('org_id', orgId).is('deleted_at', null)
  if (since) q = q.gte('created_at', since)
  const { count: n } = await q
  return n || 0
}

async function orgHealth(sb, orgId, now) {
  const items = []       // { level: 'fix' | 'look', text }
  const facts = []       // plain lines for the summary
  const { data: settings } = await sb.from('org_settings').select('data').eq('org_id', orgId).maybeSingle()
  const s = settings?.data || {}

  // ── County inspection check ───────────────────────────────────────────────
  const pulse = s.permitPulse || {}
  if (pulse.lastRunAt) {
    const hours = Math.round((now - new Date(pulse.lastRunAt)) / 3_600_000)
    facts.push(`County inspection check last finished ${hours < 1 ? 'within the hour' : `${hours} hour${hours === 1 ? '' : 's'} ago`}`)
    if (hours > 30) items.push({ level: 'fix', text: `The county inspection check hasn't finished in ${hours} hours (it runs while an office screen is open).` })
  }
  for (const [county, h] of Object.entries(pulse.health || {})) {
    if (h?.down) items.push({ level: 'fix', text: `${county} County site marked down since ${new Date(h.since || h.checkedAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}: ${h.lastError || 'no detail'}` })
  }
  const { data: tracked } = await sb.from('proposals').select('id, status, pm_id, countyPermit:data->countyPermit, stages:data->jobData->completedStages')
    .eq('org_id', orgId).is('deleted_at', null).in('status', ['Won', 'Imported']).not('data->countyPermit', 'is', null)
  const open = (tracked || []).filter(p => !(p.stages || []).includes('closed'))
  const busy = open.filter(p => p.countyPermit?.siteError).length
  const stale = open.filter(p => p.countyPermit?.checkedAt && now - new Date(p.countyPermit.checkedAt) > 2 * DAY).length
  const noPm = open.filter(p => !p.pm_id).length
  facts.push(`${open.length} open jobs tracked with the county${noPm ? `, ${noPm} with no PM (their inspection alerts go to every PM)` : ''}`)
  if (busy >= 10) items.push({ level: 'look', text: `${busy} jobs got "county site busy" on their last check. They're retried automatically; if this stays high for days, the county is limiting us.` })
  if (stale >= 10) items.push({ level: 'look', text: `${stale} open jobs haven't been read from the county in 2 days.` })

  // ── Time clock ───────────────────────────────────────────────────────────
  const yesterday = addDaysStr(todayET(now), -1)
  const since = new Date(now - 2 * DAY).toISOString()
  const { data: shifts } = await sb.from('time_shifts').select('clock_in_at, clock_out_at, auto_out, worker').eq('org_id', orgId).gte('clock_in_at', since)
  const { data: refused } = await sb.from('time_pings').select('kind, at').eq('org_id', orgId).in('kind', ['in_refused', 'out_refused']).gte('at', since)
  if (shifts) {
    const onDay = (iso) => todayET(new Date(iso)) === yesterday
    const y = shifts.filter(x => onDay(x.clock_in_at))
    const autos = y.filter(x => x.auto_out).length
    const refusedY = (refused || []).filter(x => onDay(x.at)).length
    if (y.length) facts.push(`Time clock yesterday: ${y.length} shift${y.length === 1 ? '' : 's'}${autos ? `, ${autos} ended at 4:30` : ''}${refusedY ? `, ${refusedY} punch${refusedY === 1 ? '' : 'es'} refused away from a job` : ''}`)
    if (autos >= 3) items.push({ level: 'look', text: `${autos} shifts yesterday ended at 4:30 because nobody clocked out at the job.` })
  }
  const { data: tc } = await sb.from('tc_settings').select('payroll_to, last_payroll_week').eq('org_id', orgId).maybeSingle()
  // Monday: the week's hours should have gone out this morning
  if (tc?.payroll_to?.length && new Date(`${todayET(now)}T12:00:00Z`).getUTCDay() === 1 && tc.last_payroll_week !== addDaysStr(todayET(now), -7)) {
    items.push({ level: 'fix', text: `This week's payroll hours email didn't go out to ${tc.payroll_to.join(', ')}.` })
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  const week = new Date(now - 7 * DAY).toISOString()
  const [props, propsNew, pos, posNew, invs, invsNew] = await Promise.all([
    count(sb, 'proposals', orgId), count(sb, 'proposals', orgId, week),
    count(sb, 'purchases', orgId), count(sb, 'purchases', orgId, week),
    count(sb, 'invoices', orgId), count(sb, 'invoices', orgId, week),
  ])
  facts.push(`Records: ${props.toLocaleString()} proposals (+${propsNew} this week), ${pos.toLocaleString()} purchase orders (+${posNew}), ${invs.toLocaleString()} invoices (+${invsNew})`)

  return { items, facts, ownerUserId: s.ownerUserId }
}

export async function dailyHealth(now = new Date()) {
  const out = { sent: [] }
  try {
    const sb = db()
    const today = todayET(now)
    const monday = new Date(`${today}T12:00:00Z`).getUTCDay() === 1
    const { data: orgs } = await sb.from('org_settings').select('org_id, ownerUserId:data->>ownerUserId')
    for (const o of orgs || []) {
      if (!o.ownerUserId) continue
      try {
        const h = await orgHealth(sb, o.org_id, now)
        if (!h.items.length && !monday) continue
        // Once a day: claim the day before sending
        const key = `health:sent:${o.org_id}`
        const { data: prev } = await sb.from('app_kv').select('value').eq('key', key).maybeSingle()
        if (prev?.value === today) continue
        await sb.from('app_kv').upsert({ key, value: today })
        const { data: owner } = await sb.from('org_members').select('email, display_name').eq('org_id', o.org_id).eq('user_id', o.ownerUserId).maybeSingle()
        if (!owner?.email) continue
        const needs = h.items.length
        const li = (t, c) => `<li style="margin:0 0 6px;${c ? `color:${c};` : ''}">${esc(t)}</li>`
        const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827">
<p style="margin:0 0 10px"><strong>${needs ? `${needs} thing${needs === 1 ? '' : 's'} to look at in the app` : 'The app is running normally'}</strong></p>
${needs ? `<ul style="padding-left:18px;margin:0 0 14px">${h.items.map(i => li(i.text, i.level === 'fix' ? '#b91c1c' : '#b45309')).join('')}</ul>` : ''}
<ul style="padding-left:18px;margin:0 0 14px;color:#374151">${h.facts.map(f => li(f)).join('')}</ul>
<p style="margin:0;font-size:12px;color:#6b7280">From the daily check at ${esc(APP_URL.replace(/^https?:\/\//, ''))}. It emails when something needs a look, and every Monday.</p></div>`
        const text = [needs ? `${needs} thing(s) to look at:` : 'The app is running normally.', ...h.items.map(i => `- ${i.text}`), '', ...h.facts.map(f => `- ${f}`)].join('\n')
        const r = await sendMail({ to: [owner.email], fromName: 'Deck Plus App', subject: needs ? `App check: ${needs} thing${needs === 1 ? '' : 's'} to look at` : 'App check: running normally', html, text })
        if (r?.error) { await sb.from('app_kv').upsert({ key, value: prev?.value || '' }); throw new Error(r.error) }
        out.sent.push({ org: o.org_id, items: needs })
      } catch (err) { console.error('health email:', o.org_id, err.message) }
    }
  } catch (err) { console.error('health email:', err.message) }
  return out
}
