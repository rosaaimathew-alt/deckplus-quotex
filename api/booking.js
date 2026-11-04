/**
 * Public round-robin booking API (used by /book and the website embed).
 *   GET  /api/booking            → whose turn it is + their open slots
 *   GET  /api/booking?report=1   → email the lead report that's due (cron; see _lead-report.js)
 *   POST /api/booking            → book { repId, start, firstName, lastName, street, city, state, zip, phone, email, notes? }
 *
 * The visitor only ever sees the turn-holder's times. rr_book() re-checks the
 * turn under a lock, so the order is strict even with simultaneous visitors.
 */
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import dotenv from 'dotenv'
import { db, loadTurn, repBusy, computeSlots, repRules, createGoogleEvent, buildIcs, sendAsRep, googleBusyStrict, calendarMode, googleCalendarLink } from './_round-robin.js'
import { sendMail } from './_mailer.js'
import { sendDueReport } from './_lead-report.js'

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })

const COMPANY = process.env.COMPANY_NAME || 'Deck Plus'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))
const clean = (s, max) => String(s ?? '').trim().slice(0, max)
const EMAIL_RE = /^[^\s@",()\\]+@[^\s@",()\\]+\.[^\s@",()\\]+$/   // no quotes/commas/parens: the value goes into a PostgREST filter
const STREET_RE = /^\d+[A-Za-z]?(-\d+)?\s+\S.*$/          // "123 Main St", "12B Oak Ave", "10-12 Elm Rd"
const ZIP_RE = /^\d{5}(-\d{4})?$/
const US_STATES = new Set(('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV ' +
  'NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR').split(' '))

// Every field is required except notes. Returns { lead } or { errors: { field: message } }.
function validateLead(body) {
  const digits = clean(body.phone, 40).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')
  const lead = {
    first_name: clean(body.firstName, 60),
    last_name:  clean(body.lastName, 60),
    email:      clean(body.email, 200).toLowerCase(),
    phone:      digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : '',
    street:     clean(body.street, 160),
    city:       clean(body.city, 80),
    state:      clean(body.state, 2).toUpperCase(),
    zip:        clean(body.zip, 10),
    notes:      clean(body.notes, 2000),
  }
  const errors = {}
  if (!lead.first_name)               errors.firstName = 'Enter your first name.'
  if (!lead.last_name)                errors.lastName  = 'Enter your last name.'
  if (!STREET_RE.test(lead.street))   errors.street    = 'Enter your street number and street name.'
  if (!lead.city)                     errors.city      = 'Enter your city.'
  if (!US_STATES.has(lead.state))     errors.state     = 'Choose your state.'
  if (!ZIP_RE.test(lead.zip))         errors.zip       = 'Enter a 5-digit ZIP code.'
  if (!lead.phone)                    errors.phone     = 'Enter a 10-digit phone number.'
  if (!EMAIL_RE.test(lead.email))     errors.email     = 'Enter a valid email address.'
  return Object.keys(errors).length ? { errors } : { lead }
}

const fmtWhen = (iso, timeZone, fallbackZone) => {
  const opts = { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }
  try {
    return new Date(iso).toLocaleString('en-US', { ...opts, timeZone })
  } catch {
    return new Date(iso).toLocaleString('en-US', { ...opts, timeZone: fallbackZone })
  }
}

// Customer confirmation: the appointment, what happens next, and their consultant's direct contact.
function leadEmailHtml({ name, rep, settings, when, address, calendarUrl }) {
  const contact = [
    rep.phone && `<a href="tel:${esc(rep.phone.replace(/[^\d+]/g, ''))}" style="color:#1392ae;text-decoration:none;">${esc(rep.phone)}</a>`,
    `<a href="mailto:${esc(rep.email)}" style="color:#1392ae;text-decoration:none;">${esc(rep.email)}</a>`,
  ].filter(Boolean).join('<br>')
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#2f3943;font-size:15px;line-height:1.55;max-width:560px;">
    <p>Hi ${esc(name)},</p>
    <p>Thank you for choosing ${esc(COMPANY)}! Your <strong>${esc(settings.meeting_title)}</strong> is confirmed.</p>
    <table cellpadding="0" cellspacing="0" style="border:1px solid #e3e8ed;border-radius:8px;width:100%;margin:16px 0;">
      <tr><td style="padding:12px 16px;color:#6b7682;width:90px;">When</td><td style="padding:12px 16px;font-weight:bold;color:#1f2b38;">${esc(when)}</td></tr>
      <tr><td style="padding:12px 16px;color:#6b7682;border-top:1px solid #e3e8ed;">Where</td><td style="padding:12px 16px;font-weight:bold;color:#1f2b38;border-top:1px solid #e3e8ed;">${esc(address)}</td></tr>
      <tr><td style="padding:12px 16px;color:#6b7682;border-top:1px solid #e3e8ed;">With</td><td style="padding:12px 16px;font-weight:bold;color:#1f2b38;border-top:1px solid #e3e8ed;">${esc(rep.name)}</td></tr>
    </table>
    <p style="margin:0 0 20px;"><a href="${esc(calendarUrl)}" style="display:inline-block;background:#ea7d25;color:#ffffff;font-weight:bold;padding:12px 22px;border-radius:4px;text-decoration:none;">Add to Google Calendar</a>
      <span style="color:#6b7682;font-size:13px;">&nbsp;or open the attached invite.ics</span></p>
    <p style="margin:20px 0 6px;font-weight:bold;color:#1f2b38;">What happens next</p>
    <p style="margin:0 0 16px;"><strong>I'll call you within 24 hours</strong> to go over a few preliminary
      questions about your project, so we can make the most of our appointment.</p>
    <table cellpadding="0" cellspacing="0" style="background:#eef7fa;border-radius:8px;width:100%;margin:0 0 16px;">
      <tr><td style="padding:14px 16px;">
        <div style="font-weight:bold;color:#1f2b38;font-size:16px;margin:0 0 4px;">${esc(rep.name)}</div>
        ${contact}
      </td></tr>
    </table>
    <p>Need to reschedule or have a question before then? Reach out to me directly, or just reply to this email.</p>
  </div>`
}

// POST /api/booking?step=1 — one anonymous funnel step from the booking page.
// (Not called 'track': ad blockers drop URLs containing it, which undercounted.)
const TRACK_EVENTS = new Set(['view', 'day', 'time', 'form', 'booked'])
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BOT_RE = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|monitor/i
async function trackEvent(req, res) {
  const { v, s, e, d, page } = req.body || {}
  if (!TRACK_EVENTS.has(e) || !UUID_RE.test(v) || !UUID_RE.test(s)) return res.status(400).json({ error: 'bad event' })
  if (BOT_RE.test(req.headers?.['user-agent'] || '')) return res.status(204).end()
  // Which day ("2026-11-06|8" = date | times offered) or time (ISO) was picked.
  const detail = typeof d === 'string' && /^[0-9TZ:.|-]{1,40}$/.test(d) ? d : null
  const { error } = await db().from('rr_events').insert({ visitor_id: v, session_id: s, event: e, detail, page: clean(page, 200) || null })
  if (error) console.error('Tracking insert failed:', error.message)
  return res.status(204).end()
}

// GET /api/booking?check=google — is each rep's calendar reachable? (read-only)
async function checkGoogle(res) {
  const out = { mode: calendarMode(), googleKey: 'missing', reps: [] }
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (raw) {
    try { out.googleKey = JSON.parse(raw).client_email ? 'ok' : 'not a service-account key' }
    catch { out.googleKey = 'not valid JSON — paste the whole file, from { to }' }
  }
  out.database = process.env.SUPABASE_SERVICE_KEY ? 'ok' : 'SUPABASE_SERVICE_KEY missing'
  if (out.database === 'ok') {
    const { data } = await db().from('rr_reps').select('*').eq('active', true).order('position')
    for (const rep of data || []) {
      try {
        const busy = await googleBusyStrict(rep, Date.now(), Date.now() + 86_400_000)
        out.reps.push({ rep: rep.name, calendar: busy ? 'ok' : 'skipped (no key)' })
      } catch (err) {
        out.reps.push({ rep: rep.name, calendar: String(err?.response?.data?.error_description || err?.message || err).slice(0, 200) })
      }
    }
  }
  return res.status(200).json(out)
}

async function getSlots(res) {
  const { rep, settings } = await loadTurn()
  if (!rep) return res.status(200).json({ rep: null, slots: [] })
  const busy = await repBusy(rep, settings)
  const slots = computeSlots(rep, settings, busy).map(ms => new Date(ms).toISOString())
  return res.status(200).json({
    rep: { id: rep.id, name: rep.name },
    meetingTitle: settings.meeting_title,
    slotMinutes: repRules(rep, settings).minutes,
    slots,
  })
}

// A person's upcoming live booking, matched by email or phone (either one is enough).
// validateLead stores every phone as (555) 555-5555, so an exact match works.
async function existingBooking({ email, phone }) {
  const { data, error } = await db().from('rr_bookings')
    .select('starts_at, ends_at, rr_reps(name, phone, email)')
    .eq('status', 'booked').gt('ends_at', new Date().toISOString())
    .or(`lead_email.eq."${email}",lead_phone.eq."${phone}"`)
    .order('starts_at').limit(1)
  if (error) throw error
  return data?.[0] || null
}

function alreadyBooked(res, b) {
  return res.status(409).json({
    code: 'already_booked',
    error: 'You already have an appointment with us.',
    existing: { start: b.starts_at, end: b.ends_at, repName: b.rr_reps?.name, repPhone: b.rr_reps?.phone || null, repEmail: b.rr_reps?.email },
  })
}

async function book(req, res) {
  const body = req.body || {}
  if (body.website) return res.status(200).json({ ok: true })   // honeypot: bots fill every field

  const startMs = Date.parse(body.start)
  if (!body.repId || Number.isNaN(startMs)) return res.status(400).json({ error: 'Please pick a time.' })
  const { lead, errors } = validateLead(body)
  if (errors) return res.status(400).json({ error: 'Please complete the highlighted fields.', fields: errors })
  const name = `${lead.first_name} ${lead.last_name}`
  const { email, phone } = lead
  const notes = lead.notes || null
  const address = `${lead.street}, ${lead.city}, ${lead.state} ${lead.zip}`

  // One upcoming appointment per person: don't take a second one (or use up a turn).
  const prior = await existingBooking(lead)
  if (prior) return alreadyBooked(res, prior)

  const { rep, settings } = await loadTurn()
  if (!rep) return res.status(409).json({ error: 'No one is taking bookings right now.', code: 'no_active_reps' })
  if (rep.id !== body.repId) {
    return res.status(409).json({ error: 'That time was just taken — here are the latest openings.', code: 'turn_changed' })
  }

  // The chosen start must still be one of the turn-holder's open slots.
  const busy = await repBusy(rep, settings)
  if (!computeSlots(rep, settings, busy).includes(startMs)) {
    return res.status(409).json({ error: 'That time is no longer available — please pick another.', code: 'slot_taken' })
  }

  const endMs = startMs + repRules(rep, settings).minutes * 60_000
  const { data: booking, error } = await db().rpc('rr_book', {
    p_expected_rep: rep.id,
    p_start: new Date(startMs).toISOString(),
    p_end:   new Date(endMs).toISOString(),
    p_lead:  lead,
  })
  if (error) {
    if (error.message?.includes('already_booked')) {
      const b = await existingBooking(lead)
      if (b) return alreadyBooked(res, b)
    }
    const code = ['turn_changed', 'slot_taken', 'no_active_reps'].find(c => error.message?.includes(c))
    if (code) return res.status(409).json({ error: 'That time was just taken — here are the latest openings.', code })
    throw error
  }

  // Calendar + emails are best-effort: the booking (and the turn) is already committed.
  // Why Google/email didn't happen is saved on the booking (google_error / email_error)
  // so it can be diagnosed from the database without server logs.
  const why = (err) => String(err?.response?.data?.error_description || err?.response?.data?.error?.message
    || err?.response?.data?.error || err?.message || err).slice(0, 500)
  let event = null
  let googleError = null
  try {
    event = await createGoogleEvent(rep, booking, settings)
    if (!event) googleError = 'not attempted: GOOGLE_SERVICE_ACCOUNT_JSON is not set'
  } catch (err) {
    googleError = why(err)
    console.error('Google event insert failed:', googleError)
  }

  // Only attach an .ics where Google didn't already put it on their calendar.
  const icsFile = [{ filename: 'invite.ics', content: buildIcs(rep, booking, settings), contentType: 'text/calendar; method=REQUEST' }]
  const leadIcs = icsFile
  const repIcs  = event ? undefined : icsFile
  const leadWhen = fmtWhen(booking.starts_at, clean(body.timeZone, 64) || rep.timezone, rep.timezone)
  const repWhen  = fmtWhen(booking.starts_at, rep.timezone, 'UTC')
  // Prefer sending from the rep's own Gmail (replies reach them); fall back to the shared mailer.
  const emailErrors = []
  const send = async (msg) => {
    try {
      if (await sendAsRep(rep, msg)) return { success: true }
    } catch (err) {
      emailErrors.push(`gmail as ${rep.email}: ${why(err)}`)
      console.error(`Gmail send as ${rep.email} failed, falling back:`, why(err))
    }
    const r = await sendMail(msg)
    if (r?.error) emailErrors.push(`fallback mailer: ${r.error}`)
    return r
  }
  await Promise.all([
    send({
      to: email,
      bcc: settings.office_bcc?.length ? settings.office_bcc : undefined,   // the office gets a copy of every confirmation
      subject: `Confirmed: ${settings.meeting_title} with ${rep.name} — ${leadWhen}`,
      html: leadEmailHtml({ name: lead.first_name, rep, settings, when: leadWhen, address, calendarUrl: googleCalendarLink(rep, booking, settings) }),
      attachments: leadIcs,
    }),
    send({
      to: rep.email,
      subject: `New lead #${booking.turn}: ${name} — ${repWhen}`,
      html: `<p>You're up — a new ${esc(settings.meeting_title)} was booked with you.</p>
        <p><strong>When:</strong> ${esc(repWhen)}<br>
        <strong>Name:</strong> ${esc(name)}<br>
        <strong>Email:</strong> ${esc(email)}<br>
        <strong>Phone:</strong> ${esc(phone)}<br>
        <strong>Address:</strong> ${esc(address)}<br>
        ${notes ? `<strong>Notes:</strong> ${esc(notes)}` : ''}</p>`,
      attachments: repIcs,
    }),
  ]).then(results => results.forEach(r => r?.error && console.error('Booking email failed:', r.error)))

  await db().from('rr_bookings').update({
    google_event_id: event?.id || null,
    google_error: googleError,
    email_error: emailErrors.length ? emailErrors.join(' | ').slice(0, 1000) : null,
  }).eq('id', booking.id)

  return res.status(200).json({
    ok: true,
    booking: { start: booking.starts_at, end: booking.ends_at, repName: rep.name, repPhone: rep.phone || null, repEmail: rep.email },
  })
}

// ── Alerts: tell the office when the calendar breaks ────────────────────────
// A failed booking emails the customer's details right away (it's a lead to
// call back). A calendar that won't load alerts at most once an hour. Sent to
// rr_settings.report_to; if the database itself is down, to ALERT_FALLBACK.
const ALERT_FALLBACK = ['matt@deck.plus', 'marcelo@deck.plus']
let lastLoadAlert = 0
async function alertOffice({ subject, html, throttle }) {
  try {
    if (throttle && Date.now() - lastLoadAlert < 3_600_000) return
    let to = ALERT_FALLBACK
    try {
      const sb = db()
      if (throttle) {
        const since = new Date(Date.now() - 3_600_000).toISOString()
        const { data, error } = await sb.from('rr_settings').update({ alert_sent_at: new Date().toISOString() })
          .eq('id', true).or(`alert_sent_at.is.null,alert_sent_at.lt.${since}`).select('report_to')
        if (error) throw error
        if (!data?.length) { lastLoadAlert = Date.now(); return }   // another instance already alerted this hour
        if (data[0].report_to?.length) to = data[0].report_to
      } else {
        const { data } = await sb.from('rr_settings').select('report_to').eq('id', true).single()
        if (data?.report_to?.length) to = data.report_to
      }
    } catch { /* database down: use the fallback list */ }
    if (throttle) lastLoadAlert = Date.now()
    const msg = { to, subject, html }
    let ok = false
    try { ok = await sendAsRep({ name: 'Booking Calendar', email: to[0] }, msg) } catch (err) { console.error('Alert via Gmail failed:', err.message) }
    if (!ok) await sendMail({ ...msg, fromName: 'Deck Plus Booking Calendar' })
  } catch (err) {
    console.error('Alert failed:', err.message)
  }
}

function failedBookingAlert(body, err) {
  const b = body || {}
  const row = (k, v) => v ? `<tr><td style="padding:3px 14px 3px 0;color:#6b7280">${k}</td><td><b>${esc(clean(v, 300))}</b></td></tr>` : ''
  const when = Date.parse(b.start) ? new Date(b.start).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
  return {
    subject: `Booking failed: ${clean(b.firstName, 60)} ${clean(b.lastName, 60)} needs a call back`.trim(),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<p>Someone tried to book on the website calendar and it failed, so <b>no appointment was created</b>. Please call them back:</p>
<table style="border-collapse:collapse">${row('Name', `${b.firstName || ''} ${b.lastName || ''}`.trim())}${row('Phone', b.phone)}${row('Email', b.email)}${row('Address', [b.street, b.city, b.state, b.zip].filter(Boolean).join(', '))}${row('Wanted', when)}${row('Notes', b.notes)}</table>
<p style="color:#6b7280;font-size:12px">Error: ${esc(String(err?.message || err).slice(0, 300))}</p></div>`,
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    if (req.method === 'POST' && (req.query?.step || req.query?.track)) return await trackEvent(req, res)
    if (req.method === 'GET' && req.query?.check === 'google') return await checkGoogle(res)
    if (req.method === 'GET' && req.query?.report)             return await sendDueReport(res)
    if (req.method === 'GET' && req.query?.check === 'alert') {
      // Sends a sample "booking failed" alert through the real path; at most once an hour.
      await alertOffice({ throttle: true, ...failedBookingAlert({ firstName: 'TEST', lastName: 'Customer', phone: '(704) 555-0100',
        email: 'test@example.com', street: '123 Sample St', city: 'Charlotte', state: 'NC', zip: '28202',
        start: new Date(Date.now() + 86_400_000).toISOString(), notes: 'This is a test alert. No action needed.' }, new Error('test alert')) })
      return res.status(200).json({ ok: true, note: 'test alert sent (at most once an hour)' })
    }
    if (req.method === 'GET')  return await getSlots(res)
    if (req.method === 'POST') return await book(req, res)
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('Booking error:', err)
    if (req.method === 'POST' && !req.query?.step && !req.query?.track) await alertOffice(failedBookingAlert(req.body, err))
    else if (req.method === 'GET' && !req.query?.check && !req.query?.report) {
      await alertOffice({ throttle: true, subject: 'The website booking calendar is not loading',
        html: `<p style="font-family:Arial,Helvetica,sans-serif">Visitors can't see any times on the website calendar right now, so nobody can book.</p><p style="font-family:Arial,Helvetica,sans-serif;color:#6b7280;font-size:12px">Error: ${esc(String(err?.message || err).slice(0, 300))}. You'll get at most one of these an hour.</p>` })
    }
    return res.status(500).json({ error: 'Something went wrong — please try again.' })
  }
}
