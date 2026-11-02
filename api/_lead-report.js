/**
 * Lead reports for the booking calendar, emailed to rr_settings.report_to.
 *   Every Monday     → the previous week, Monday through Sunday
 *   1st of the month → the whole previous month
 * A Vercel cron calls GET /api/booking?report=1 daily; a report stays due for
 * three days (Mon–Wed, or the 1st–3rd) so a failed send is retried the next
 * day. rr_settings.report_week_sent_for / report_sent_for record the last
 * report of each kind, so each one goes out exactly once however often the
 * URL is hit.
 */
import { db, zonedToUtc, sendAsRep } from './_round-robin.js'
import { sendMail } from './_mailer.js'

const TZ = 'America/New_York'
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const pad = (v) => String(v).padStart(2, '0')
const SHORT = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })

// The reports due today (Eastern). Each names the rr_settings column that records it.
export function dueReports(now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now).split('-').map(Number)
  const out = []
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()   // 0 = Sunday
  if (weekday >= 1 && weekday <= 3) {
    const mon = new Date(Date.UTC(y, m - 1, d - (weekday - 1) - 7))   // last week's Monday
    const sun = new Date(mon.getTime() + 6 * 86_400_000)
    const end = new Date(mon.getTime() + 7 * 86_400_000)
    const [a, b] = [mon, sun].map(x => [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()])
    out.push({ column: 'report_week_sent_for', kind: 'week', key: `${a[0]}-${pad(a[1])}-${pad(a[2])}`,
      title: `Week of ${SHORT(...a)}–${SHORT(...b)}, ${b[0]}`,
      from: zonedToUtc(...a, 0, 0, TZ), to: zonedToUtc(end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), 0, 0, TZ) })
  }
  if (d <= 3) {
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1
    out.push({ column: 'report_sent_for', kind: 'month', key: `${py}-${pad(pm)}`, title: `${MONTHS[pm - 1]} ${py}`,
      from: zonedToUtc(py, pm, 1, 0, 0, TZ), to: zonedToUtc(y, m, 1, 0, 0, TZ) })
  }
  return out
}

const fmt = (iso, opts) => new Date(iso).toLocaleString('en-US', { timeZone: TZ, ...opts })
const appt = (iso) => fmt(iso, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const digits = (p) => String(p || '').replace(/\D/g, '').slice(-10)
const csvCell = (v) => /[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '')

export async function buildReport(period, sb = db()) {
  const [{ data: rows, error }, { data: funnel, error: fErr }] = await Promise.all([
    sb.from('rr_bookings')
      .select('turn, created_at, starts_at, status, lead_name, lead_phone, lead_email, address_street, address_city, address_state, address_zip, notes, rr_reps(name)')
      .gte('created_at', new Date(period.from).toISOString()).lt('created_at', new Date(period.to).toISOString())
      .order('turn'),
    sb.rpc('rr_month_funnel', { p_from: new Date(period.from).toISOString(), p_to: new Date(period.to).toISOString() }),
  ])
  if (error) throw error
  if (fErr) throw fErr

  const live = rows.filter(b => b.status === 'booked')
  const cancelled = rows.length - live.length

  // Same person = same email or same phone.
  const people = []
  for (const b of live) {
    const p = people.find(p => p.emails.has(b.lead_email?.toLowerCase()) || p.phones.has(digits(b.lead_phone)))
    if (p) { p.bookings.push(b); p.emails.add(b.lead_email?.toLowerCase()); p.phones.add(digits(b.lead_phone)) }
    else people.push({ emails: new Set([b.lead_email?.toLowerCase()]), phones: new Set([digits(b.lead_phone)]), bookings: [b] })
  }
  const dupes = people.filter(p => p.bookings.length > 1)
  const flag = new Map(dupes.flatMap(p => p.bookings.map(b => [b.turn, `Same person as #${p.bookings.filter(x => x !== b).map(x => x.turn).join(', #')}`])))

  const byRep = {}
  for (const b of live) byRep[b.rr_reps?.name || 'Unknown'] = (byRep[b.rr_reps?.name || 'Unknown'] || 0) + 1
  const address = (b) => `${b.address_street}, ${b.address_city}, ${b.address_state} ${b.address_zip}`
  const n = (v) => Number(v || 0).toLocaleString('en-US')

  const card = (big, label) => `<td style="padding:10px 18px;background:#f1f5f9;text-align:center"><div style="font-size:26px;font-weight:bold">${big}</div><div style="color:#6b7280;font-size:12px">${label}</div></td>`
  const h3 = (t) => `<h3 style="margin:18px 0 6px;color:#0e6e80">${t}</h3>`
  const trackedFrom = funnel?.tracking_from && Date.parse(funnel.tracking_from) > period.from + 86_400_000
    ? ` (tracking started ${fmt(funnel.tracking_from, { month: 'short', day: 'numeric' })})` : ''
  const label = period.kind === 'week' ? 'weekly lead report' : 'monthly lead report'

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:720px">
<h2 style="color:#0e6e80;margin:0 0 4px">Deck Plus booking calendar: ${esc(period.title)} ${label}</h2>
<p style="color:#6b7280;margin:0 0 18px">Appointments booked through the website calendar ${period.kind === 'week' ? 'last week (Monday–Sunday)' : 'last month'}.</p>
<table style="border-collapse:collapse"><tr>${card(live.length, 'appointments booked')}${card(people.length, 'unique customers')}${card(n(funnel?.visitors), 'unique visitors')}</tr></table>
${h3('By rep (strict rotation)')}
<table style="border-collapse:collapse">${Object.entries(byRep).sort().map(([r, c]) => `<tr><td style="padding:4px 16px 4px 0">${esc(r)}</td><td><b>${c}</b></td></tr>`).join('') || '<tr><td>No bookings yet.</td></tr>'}</table>
${h3('Visitor funnel' + trackedFrom)}
<p style="margin:0 0 4px">${n(funnel?.visitors)} unique visitors (${n(funnel?.visits)} visits) &rarr; ${n(funnel?.picked_day)} picked a day &rarr; ${n(funnel?.picked_time)} picked a time &rarr; ${n(funnel?.started_form)} opened the form &rarr; <b>${live.length} booked</b>.</p>
<p style="color:#6b7280;font-size:12px;margin:0">"Unique visitors" counts browsers that loaded the deck.plus page the calendar sits on, so it is an upper bound on people. Ad blockers hide some steps; the booking count is exact.</p>
${dupes.length ? h3('Booked more than once') + dupes.map(p => `<p style="margin:0 0 4px"><b>${esc(p.bookings[0].lead_name)}</b>: ${p.bookings.map(b => `#${b.turn} with ${esc(b.rr_reps?.name)} (${esc(appt(b.starts_at))})`).join(', ')}</p>`).join('') : ''}
${h3('All leads')}
${live.length ? `<table style="border-collapse:collapse;width:100%;font-size:13px"><tr style="text-align:left;color:#6b7280"><th style="padding:8px">#</th><th style="padding:8px">Appointment</th><th style="padding:8px">Rep</th><th style="padding:8px">Customer</th></tr>${live.map(b => `<tr style="border-top:1px solid #e5e7eb${flag.has(b.turn) ? ';background:#fff7ed' : ''}"><td style="padding:8px">${b.turn}</td><td style="padding:8px">${esc(appt(b.starts_at))}</td><td style="padding:8px">${esc(b.rr_reps?.name)}</td><td style="padding:8px"><b>${esc(b.lead_name)}</b><br><span style="color:#6b7280">${esc(b.lead_phone)} · ${esc(b.lead_email)}</span><br><span style="color:#6b7280">${esc(address(b))}</span>${b.notes ? `<br><i>${esc(b.notes)}</i>` : ''}${flag.has(b.turn) ? `<br><b style="color:#c2410c">${esc(flag.get(b.turn))}</b>` : ''}</td></tr>`).join('')}</table>` : '<p>No bookings in this period.</p>'}
${cancelled ? `<p style="color:#6b7280;font-size:12px;margin-top:18px">${cancelled} cancelled or test booking${cancelled === 1 ? '' : 's'} left out.</p>` : ''}
<p style="color:#6b7280;font-size:12px">The full list is attached as a spreadsheet (CSV).</p></div>`

  const text = `Deck Plus booking calendar: ${period.title} ${label}\n\n${live.length} appointments booked, ${people.length} unique customers, ${n(funnel?.visitors)} unique visitors.\n\nBy rep:\n${Object.entries(byRep).sort().map(([r, c]) => `  ${r}: ${c}`).join('\n') || '  No bookings yet.'}\n\nThe full list is in the attached spreadsheet.`

  const csv = [['Lead #', 'Booked on', 'Appointment', 'Rep', 'Customer', 'Phone', 'Email', 'Address', 'Notes', 'Flag'],
    ...live.map(b => [b.turn, fmt(b.created_at, { month: 'short', day: 'numeric' }), appt(b.starts_at), b.rr_reps?.name, b.lead_name,
      b.lead_phone, b.lead_email, address(b), b.notes || '', flag.get(b.turn) || ''])]
    .map(r => r.map(csvCell).join(',')).join('\r\n')

  const slug = period.kind === 'week' ? `week-of-${period.key}` : period.key
  return {
    subject: `${period.title} ${label}: Deck Plus booking calendar`,
    html, text,
    attachments: [{ filename: `deckplus-leads-${slug}.csv`, content: csv, contentType: 'text/csv' }],
  }
}

// GET /api/booking?report=1 — send whatever reports are due, each once.
export async function sendDueReport(res) {
  const due = dueReports()
  if (!due.length) return res.status(200).json({ sent: [], reason: 'no report due today' })
  const sb = db()
  const { data: settings, error } = await sb.from('rr_settings').select('report_to, report_sent_for, report_week_sent_for').eq('id', true).single()
  if (error) throw error
  const to = settings.report_to || []
  if (!to.length) return res.status(200).json({ sent: [], reason: 'no report_to addresses' })

  const sent = [], skipped = []
  for (const period of due) {
    const col = period.column
    // Claim this report so concurrent or repeated calls can't send it twice.
    const { data: claimed, error: cErr } = await sb.from('rr_settings').update({ [col]: period.key })
      .eq('id', true).or(`${col}.is.null,${col}.neq.${period.key}`).select('id')
    if (cErr) throw cErr
    if (!claimed?.length) { skipped.push(period.key); continue }

    try {
      const msg = { to, ...(await buildReport(period)) }
      // From the first recipient's Gmail (a Deck Plus Workspace address); else the shared mailer.
      let ok = false
      try { ok = await sendAsRep({ name: 'Booking Calendar', email: to[0] }, msg) } catch (err) { console.error('Report via Gmail failed:', err.message) }
      if (!ok) {
        const r = await sendMail({ ...msg, fromName: 'Deck Plus Booking Calendar' })
        if (r?.error) throw new Error(r.error)
      }
      sent.push(period.key)
    } catch (err) {
      // Give the claim back so tomorrow's cron run retries.
      await sb.from('rr_settings').update({ [col]: settings[col] }).eq('id', true)
      throw err
    }
  }
  return res.status(200).json({ sent, skipped, to })
}
