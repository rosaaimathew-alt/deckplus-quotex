/**
 * Public round-robin booking API (used by /book and the website embed).
 *   GET  /api/booking            → whose turn it is + their open slots
 *   POST /api/booking            → book { repId, start, name, email, phone?, notes? }
 *
 * The visitor only ever sees the turn-holder's times. rr_book() re-checks the
 * turn under a lock, so the order is strict even with simultaneous visitors.
 */
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import dotenv from 'dotenv'
import { db, loadTurn, repBusy, computeSlots, createGoogleEvent, buildIcs } from './_round-robin.js'
import { sendMail } from './_mailer.js'

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })

const COMPANY = process.env.COMPANY_NAME || 'Your Company'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))
const clean = (s, max) => String(s ?? '').trim().slice(0, max)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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
    slotMinutes: settings.slot_minutes,
    slots,
  })
}

async function book(req, res) {
  const body = req.body || {}
  if (body.website) return res.status(200).json({ ok: true })   // honeypot: bots fill every field

  const name  = clean(body.name, 120)
  const email = clean(body.email, 200).toLowerCase()
  const phone = clean(body.phone, 40) || null
  const notes = clean(body.notes, 2000) || null
  const startMs = Date.parse(body.start)
  if (!name || !EMAIL_RE.test(email) || !body.repId || Number.isNaN(startMs)) {
    return res.status(400).json({ error: 'Please fill in your name, a valid email and pick a time.' })
  }

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

  const endMs = startMs + settings.slot_minutes * 60_000
  const { data: booking, error } = await db().rpc('rr_book', {
    p_expected_rep: rep.id,
    p_start: new Date(startMs).toISOString(),
    p_end:   new Date(endMs).toISOString(),
    p_name:  name,
    p_email: email,
    p_phone: phone,
    p_notes: notes,
  })
  if (error) {
    const code = ['turn_changed', 'slot_taken', 'no_active_reps'].find(c => error.message?.includes(c))
    if (code) return res.status(409).json({ error: 'That time was just taken — here are the latest openings.', code })
    throw error
  }

  // Calendar + emails are best-effort: the booking (and the turn) is already committed.
  try {
    const eventId = await createGoogleEvent(rep, booking, settings)
    if (eventId) await db().from('rr_bookings').update({ google_event_id: eventId }).eq('id', booking.id)
  } catch (err) {
    console.error('Google event insert failed:', err.message)
  }

  const ics = buildIcs(rep, booking, settings)
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
      attachments: [{ filename: 'invite.ics', content: ics, contentType: 'text/calendar; method=REQUEST' }],
    }),
    sendMail({
      to: rep.email,
      subject: `New lead #${booking.turn}: ${name} — ${repWhen}`,
      html: `<p>You're up — a new ${esc(settings.meeting_title)} was booked with you.</p>
        <p><strong>When:</strong> ${esc(repWhen)}<br>
        <strong>Name:</strong> ${esc(name)}<br>
        <strong>Email:</strong> ${esc(email)}<br>
        ${phone ? `<strong>Phone:</strong> ${esc(phone)}<br>` : ''}
        ${notes ? `<strong>Notes:</strong> ${esc(notes)}` : ''}</p>`,
      attachments: [{ filename: 'invite.ics', content: ics, contentType: 'text/calendar; method=REQUEST' }],
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
