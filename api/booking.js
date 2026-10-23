/**
 * Public round-robin booking API (used by /book and the website embed).
 *   GET  /api/booking            → whose turn it is + their open slots
 *   POST /api/booking            → book { repId, start, firstName, lastName, street, city, state, zip, phone, email, notes? }
 *
 * The visitor only ever sees the turn-holder's times. rr_book() re-checks the
 * turn under a lock, so the order is strict even with simultaneous visitors.
 */
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import dotenv from 'dotenv'
import { db, loadTurn, repBusy, computeSlots, repRules, createGoogleEvent, buildIcs } from './_round-robin.js'
import { sendMail } from './_mailer.js'

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })

const COMPANY = process.env.COMPANY_NAME || 'Your Company'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))
const clean = (s, max) => String(s ?? '').trim().slice(0, max)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
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

async function getSlots(res) {
  const { rep, settings } = await loadTurn()
  if (!rep) return res.status(200).json({ rep: null, slots: [] })
  const busy = await repBusy(rep, settings)
  const slots = computeSlots(rep, settings, busy).map(ms => new Date(ms).toISOString())
  return res.status(200).json({
    rep: { id: rep.id, name: rep.name.split(' ')[0] },
    meetingTitle: settings.meeting_title,
    slotMinutes: repRules(rep, settings).minutes,
    slots,
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
    const code = ['turn_changed', 'slot_taken', 'no_active_reps'].find(c => error.message?.includes(c))
    if (code) return res.status(409).json({ error: 'That time was just taken — here are the latest openings.', code })
    throw error
  }

  // Calendar + emails are best-effort: the booking (and the turn) is already committed.
  let event = null
  try {
    event = await createGoogleEvent(rep, booking, settings)
    if (event) await db().from('rr_bookings').update({ google_event_id: event.id }).eq('id', booking.id)
  } catch (err) {
    console.error('Google event insert failed:', err.message)
  }

  // Only attach an .ics where Google didn't already put it on their calendar.
  const icsFile = [{ filename: 'invite.ics', content: buildIcs(rep, booking, settings), contentType: 'text/calendar; method=REQUEST' }]
  const leadIcs = event?.invited ? undefined : icsFile
  const repIcs  = event ? undefined : icsFile
  const leadWhen = fmtWhen(booking.starts_at, clean(body.timeZone, 64) || rep.timezone, rep.timezone)
  const repWhen  = fmtWhen(booking.starts_at, rep.timezone, 'UTC')
  await Promise.all([
    sendMail({
      to: email,
      subject: `Confirmed: ${settings.meeting_title} with ${rep.name} — ${leadWhen}`,
      html: `<p>Hi ${esc(name)},</p>
        <p>You're booked for a <strong>${esc(settings.meeting_title)}</strong> with <strong>${esc(rep.name)}</strong>
        on <strong>${esc(leadWhen)}</strong>.</p>
        <p>Need to change it? Just reply to this email or contact ${esc(rep.name)} at ${esc(rep.email)}.</p>
        <p>— ${esc(COMPANY)}</p>`,
      attachments: leadIcs,
    }),
    sendMail({
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

  return res.status(200).json({
    ok: true,
    booking: { start: booking.starts_at, end: booking.ends_at, repName: rep.name },
  })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(200).end()
  try {
    if (req.method === 'GET')  return await getSlots(res)
    if (req.method === 'POST') return await book(req, res)
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    console.error('Booking error:', err)
    return res.status(500).json({ error: 'Something went wrong — please try again.' })
  }
}
