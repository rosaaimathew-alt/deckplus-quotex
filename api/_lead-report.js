/**
 * Lead reports for the booking calendar, emailed to rr_settings.report_to.
 *   1st of the month  → the whole previous month
 *   16th of the month → month to date (the 1st through the 15th)
 * A Vercel cron calls GET /api/booking?report=1 on days 1–3 and 16–18 (so a
 * failed send is retried the next day). rr_settings.report_sent_for records
 * the last report sent, so each one goes out exactly once however often the
 * URL is hit.
 */
import { db, zonedToUtc, sendAsRep } from './_round-robin.js'
import { sendMail } from './_mailer.js'

const TZ = 'America/New_York'
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// Which report is due today (Eastern), if any.
export function dueReport(now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now).split('-').map(Number)
  if (d <= 3) {
    const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1
    return { key: `${py}-${String(pm).padStart(2, '0')}`, kind: 'month', title: `${MONTHS[pm - 1]} ${py}`,
      from: zonedToUtc(py, pm, 1, 0, 0, TZ), to: zonedToUtc(y, m, 1, 0, 0, TZ) }
  }
  if (d >= 16 && d <= 18) {
    return { key: `${y}-${String(m).padStart(2, '0')}-mid`, kind: 'mid', title: `${MONTHS[m - 1]} 1–15, ${y}`,
      from: zonedToUtc(y, m, 1, 0, 0, TZ), to: zonedToUtc(y, m, 16, 0, 0, TZ) }
  }
  return null
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
  const label = period.kind === 'mid' ? 'month-to-date lead report' : 'lead report'

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;max-width:720px">
<h2 style="color:#0e6e80;margin:0 0 4px">Deck Plus booking calendar: ${esc(period.title)} ${label}</h2>
<p style="color:#6b7280;margin:0 0 18px">Appointments booked through the website calendar${period.kind === 'mid' ? ' so far this month' : ''}.</p>
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

  const slug = period.key.replace('-mid', '-1-15')
  return {
    subject: `${period.title} ${label}: Deck Plus booking calendar`,
    html, text,
    attachments: [{ filename: `deckplus-leads-${slug}.csv`, content: csv, contentType: 'text/csv' }],
  }
}

// GET /api/booking?report=1 — send the report that's due, once.
export async function sendDueReport(res) {
  const period = dueReport()
  if (!period) return res.status(200).json({ sent: false, reason: 'no report due today' })
  const sb = db()
  const { data: settings, error } = await sb.from('rr_settings').select('report_to, report_sent_for').eq('id', true).single()
  if (error) throw error
  const to = settings.report_to || []
  if (!to.length) return res.status(200).json({ sent: false, reason: 'no report_to addresses' })

  // Claim this report so concurrent or repeated calls can't send it twice.
  const { data: claimed, error: cErr } = await sb.from('rr_settings').update({ report_sent_for: period.key })
    .eq('id', true).or(`report_sent_for.is.null,report_sent_for.neq.${period.key}`).select('id')
  if (cErr) throw cErr
  if (!claimed?.length) return res.status(200).json({ sent: false, reason: `already sent ${period.key}` })

  try {
    const msg = { to, ...(await buildReport(period)) }
    // From the first recipient's Gmail (a Deck Plus Workspace address); else the shared mailer.
    let ok = false
    try { ok = await sendAsRep({ name: 'Booking Calendar', email: to[0] }, msg) } catch (err) { console.error('Report via Gmail failed:', err.message) }
    if (!ok) {
      const r = await sendMail({ ...msg, fromName: 'Deck Plus Booking Calendar' })
      if (r?.error) throw new Error(r.error)
    }
    return res.status(200).json({ sent: true, report: period.key, to })
  } catch (err) {
    // Give the claim back so tomorrow's cron run retries.
    await sb.from('rr_settings').update({ report_sent_for: settings.report_sent_for }).eq('id', true)
    throw err
  }
}
