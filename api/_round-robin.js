/**
 * Strict round-robin scheduling helpers (see supabase/round_robin.sql).
 * - Availability = rep's weekly hours, minus their live bookings, minus their
 *   Google Calendar busy time when a service account is configured.
 * - Google is optional: set GOOGLE_SERVICE_ACCOUNT_JSON (see docs/ROUND_ROBIN.md
 *   for the Workspace domain-wide delegation setup).
 */
import { createClient } from '@supabase/supabase-js'

let _db = null
export function db() {
  if (_db) return _db
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Booking not configured: SUPABASE_URL and SUPABASE_SERVICE_KEY are required')
  _db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _db
}

export async function loadTurn() {
  const sb = db()
  const [{ data: rep, error: repErr }, { data: settings, error: setErr }] = await Promise.all([
    sb.rpc('rr_next_rep'),
    sb.from('rr_settings').select('*').eq('id', true).single(),
  ])
  if (repErr) throw repErr
  if (setErr) throw setErr
  return { rep: rep?.id ? rep : null, settings }
}

// ── Timezones (no library: Intl gives us the offset for any instant) ────────
function tzOffsetMs(ts, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ts))
  const p = Object.fromEntries(parts.map(x => [x.type, Number(x.value)]))
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000
}

// Wall-clock time in `timeZone` → UTC epoch ms (DST-safe).
export function zonedToUtc(y, m, d, hh, mm, timeZone) {
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const first = guess - tzOffsetMs(guess, timeZone)
  return guess - tzOffsetMs(first, timeZone)
}

function todayIn(timeZone, now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(now)).map(x => [x.type, Number(x.value)]))
  return { y: p.year, m: p.month, d: p.day }
}

const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + (m || 0)
}

// Per-rep overrides fall back to the shared rr_settings row.
export function repRules(rep, settings) {
  return {
    minutes: rep.appointment_minutes ?? settings.slot_minutes,        // appointment length
    buffer:  rep.buffer_after_minutes ?? settings.buffer_minutes,     // kept free after each appointment
    every:   settings.start_every_minutes ?? 30,                      // start times offered every N minutes
  }
}

/**
 * Every bookable slot start (epoch ms) for `rep` from now through days_ahead.
 * `busy` is a list of [startMs, endMs, isBooking]: our own bookings get the
 * buffer after them; other calendar events only block their own time (plus the
 * new appointment's buffer, so it never runs into them).
 */
export function computeSlots(rep, settings, busy, now = Date.now()) {
  const rules  = repRules(rep, settings)
  const length = rules.minutes * 60_000
  const buffer = rules.buffer * 60_000
  const earliest = now + settings.min_notice_hours * 3_600_000
  const { y, m, d } = todayIn(rep.timezone, now)
  const slots = []

  for (let i = 0; i <= settings.days_ahead; i++) {
    const day = new Date(Date.UTC(y, m - 1, d + i))
    const ranges = rep.hours?.[String(day.getUTCDay())] || []
    // Latest time an appointment may begin: a range's own third value
    // (["08:00","17:00","14:00"]) or else rep.last_start. When set it wins,
    // even if that appointment runs past the end of the hours; otherwise every
    // appointment has to finish within them.
    for (const [from, to, rangeLast] of ranges) {
      const endMin = toMinutes(to)
      const last = rangeLast || rep.last_start
      const lastStart = last ? toMinutes(last) : Infinity
      const fits = (min) => last ? min < endMin && min <= lastStart : min + rules.minutes <= endMin
      for (let min = toMinutes(from); fits(min); min += rules.every) {
        const start = zonedToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(),
          Math.floor(min / 60), min % 60, rep.timezone)
        const end = start + length
        if (start < earliest) continue
        if (busy.some(([bs, be, isBooking]) => start < be + (isBooking ? buffer : 0) && end + buffer > bs)) continue
        slots.push(start)
      }
    }
  }
  return slots
}

// ── Google Calendar (optional) ──────────────────────────────────────────────
// GOOGLE_CALENDAR_MODE:
//   'workspace' (default) — domain-wide delegation: the service account acts as
//                each rep, so nothing is shared by hand and leads get a real
//                Google invite from the rep.
//   'shared'    — each rep shares their calendar with the service account.
export const calendarMode = () => (process.env.GOOGLE_CALENDAR_MODE || 'workspace').toLowerCase()
export const repCalendarId = (rep) => rep.google_calendar_id || rep.email

let _key
const _clients = new Map()
export async function calendarFor(rep) {
  if (_key === undefined) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
    _key = raw ? JSON.parse(raw) : null
  }
  if (!_key) return null
  const subject = calendarMode() === 'workspace' ? repCalendarId(rep) : null
  if (_clients.has(subject)) return _clients.get(subject)
  const { google } = await import('googleapis')
  const auth = new google.auth.JWT({
    email: _key.client_email,
    key: _key.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: subject || undefined,
  })
  const cal = google.calendar({ version: 'v3', auth })
  _clients.set(subject, cal)
  return cal
}

// Sends an email from the rep's own Gmail (workspace mode only). Needs the
// gmail.send scope on the same domain-wide delegation entry; a separate client
// so a missing Gmail grant never breaks the calendar. Returns false when not
// available so the caller can fall back to the shared mailer.
const _gmail = new Map()
export async function sendAsRep(rep, { to, subject, html, attachments }) {
  if (calendarMode() !== 'workspace' || !(await calendarFor(rep))) return false
  const from = repCalendarId(rep)
  const { google } = await import('googleapis')
  if (!_gmail.has(from)) {
    const auth = new google.auth.JWT({
      email: _key.client_email,
      key: _key.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: from,
    })
    _gmail.set(from, google.gmail({ version: 'v1', auth }))
  }
  const { default: MailComposer } = await import('nodemailer/lib/mail-composer/index.js')
  const raw = await new MailComposer({
    from: `"${rep.name} | ${process.env.COMPANY_NAME || 'Deck Plus'}" <${from}>`,
    to, subject, html, attachments,
  }).compile().build()
  await _gmail.get(from).users.messages.send({ userId: 'me', requestBody: { raw: raw.toString('base64url') } })
  return true
}

export async function googleBusyStrict(rep, fromMs, toMs) {
  const cal = await calendarFor(rep)
  if (!cal) return null
  const id = repCalendarId(rep)
  const { data } = await cal.freebusy.query({
    requestBody: { timeMin: new Date(fromMs).toISOString(), timeMax: new Date(toMs).toISOString(), items: [{ id }] },
  })
  const entry = data.calendars?.[id]
  if (entry?.errors?.length) throw new Error(entry.errors.map(e => e.reason).join(', '))
  return (entry?.busy || []).map(x => [Date.parse(x.start), Date.parse(x.end)])
}

async function googleBusy(rep, fromMs, toMs) {
  try {
    return (await googleBusyStrict(rep, fromMs, toMs)) || []
  } catch (err) {
    // Keep taking leads on a Google outage; our own bookings still block overlaps.
    console.error(`Google free/busy failed for ${rep.email}:`, err.message)
    return []
  }
}

export async function repBusy(rep, settings, now = Date.now()) {
  const fromMs = now
  const toMs = now + (settings.days_ahead + 2) * 86_400_000
  const [{ data, error }, gBusy] = await Promise.all([
    db().from('rr_bookings').select('starts_at, ends_at')
      .eq('rep_id', rep.id).eq('status', 'booked')
      .gte('ends_at', new Date(fromMs).toISOString())
      .lte('starts_at', new Date(toMs).toISOString()),
    googleBusy(rep, fromMs, toMs),
  ])
  if (error) throw error
  return [...data.map(b => [Date.parse(b.starts_at), Date.parse(b.ends_at), true]), ...gBusy]
}

// Puts the meeting on the rep's calendar. In workspace mode the lead is added
// as a guest and Google emails them a real invite (returns invited: true); in
// shared mode service accounts can't invite guests, so we email an .ics instead.
export async function createGoogleEvent(rep, booking, settings) {
  const cal = await calendarFor(rep)
  if (!cal) return null
  const invite = calendarMode() === 'workspace'
  const address = `${booking.address_street}, ${booking.address_city}, ${booking.address_state} ${booking.address_zip}`
  const { data } = await cal.events.insert({
    calendarId: invite ? 'primary' : repCalendarId(rep),
    sendUpdates: invite ? 'all' : 'none',
    requestBody: {
      summary: invite ? `${settings.meeting_title}: ${booking.lead_name} & ${rep.name}` : `${settings.meeting_title}: ${booking.lead_name}`,
      description: [
        `Lead #${booking.turn} (round robin)`,
        `Name: ${booking.lead_name}`,
        `Email: ${booking.lead_email}`,
        `Phone: ${booking.lead_phone}`,
        `Address: ${address}`,
        booking.notes && `Notes: ${booking.notes}`,
        '',
        `Your design consultant: ${[rep.name, rep.phone, rep.email].filter(Boolean).join(' · ')}`,
        `${rep.name} will call within 24 hours to go over a few preliminary questions about the project.`,
      ].filter(v => v !== false && v != null).join('\n'),
      location: address,
      start: { dateTime: booking.starts_at },
      end:   { dateTime: booking.ends_at },
      attendees: invite ? [{ email: booking.lead_email, displayName: booking.lead_name }] : undefined,
    },
  })
  return { id: data.id, invited: invite }
}

const icsDate = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const icsText = (s) => String(s || '').replace(/[\\;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n')

export function buildIcs(rep, booking, settings) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//QuoteX//Round Robin//EN', 'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${booking.id}@quotex`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(booking.starts_at)}`,
    `DTEND:${icsDate(booking.ends_at)}`,
    `SUMMARY:${icsText(`${settings.meeting_title} with ${rep.name}`)}`,
    `ORGANIZER;CN=${icsText(rep.name)}:mailto:${rep.email}`,
    `ATTENDEE;CN=${icsText(booking.lead_name)};RSVP=TRUE:mailto:${booking.lead_email}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}
