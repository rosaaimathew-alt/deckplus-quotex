#!/usr/bin/env node
// Checks every active round-robin rep's Google Calendar connection before you
// go live. Read-only: it never creates, changes or deletes events.
//
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_KEY=eyJ... \
//   GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)" \
//   node scripts/check-calendar.mjs
//
// (Or put those in .env.) Exits non-zero if any rep fails.
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import dotenv from 'dotenv'

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })
const { db, calendarFor, calendarMode, repCalendarId, googleBusyStrict } = await import('../api/_round-robin.js')

const HINTS = [
  [/unauthorized_client/i, 'Domain-wide delegation is not set up for this service account, or the scope is wrong. In Admin Console → Security → API controls → Domain-wide delegation, add the service account\'s Client ID with scope https://www.googleapis.com/auth/calendar (can take up to 24h to apply).'],
  [/invalid_grant|valid email or user ID/i, 'Google does not recognise this email as a user in your Workspace. Check the rep\'s email / google_calendar_id.'],
  [/notFound|Not Found/i, 'Calendar not found. In shared mode, the rep must share the calendar with the service account email.'],
  [/accessNotConfigured|has not been used in project|disabled/i, 'The Google Calendar API is not enabled in the service account\'s Google Cloud project.'],
  [/private_key|PEM|DECODER/i, 'GOOGLE_SERVICE_ACCOUNT_JSON is not a valid service-account key file.'],
]
const hint = (msg) => HINTS.find(([re]) => re.test(msg))?.[1] || ''

if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  console.error('GOOGLE_SERVICE_ACCOUNT_JSON is not set — the booking page is running without Google Calendar.')
  process.exit(1)
}

const { data: reps, error } = await db().from('rr_reps').select('*').eq('active', true).order('position')
if (error) { console.error('Could not read rr_reps:', error.message); process.exit(1) }
if (!reps.length) { console.error('No active reps in rr_reps.'); process.exit(1) }

console.log(`Mode: ${calendarMode()}   Service account: ${JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON).client_email}\n`)
let failed = 0
for (const rep of reps) {
  const id = repCalendarId(rep)
  try {
    const now = Date.now()
    const busy = await googleBusyStrict(rep, now, now + 7 * 86_400_000)
    // Free/busy alone can succeed with "no access"; reading an event proves we really act as the rep.
    const cal = await calendarFor(rep)
    await cal.events.list({ calendarId: calendarMode() === 'workspace' ? 'primary' : id, maxResults: 1, timeMin: new Date(now).toISOString() })
    console.log(`  OK    #${rep.position} ${rep.name} <${id}> — ${busy.length} busy block(s) in the next 7 days`)
  } catch (err) {
    failed++
    const msg = err.response?.data?.error_description || err.response?.data?.error?.message || err.message
    console.log(`  FAIL  #${rep.position} ${rep.name} <${id}> — ${msg}`)
    const h = hint(String(msg) + ' ' + String(err.response?.data?.error || ''))
    if (h) console.log(`        → ${h}`)
  }
}
console.log(failed ? `\n${failed} rep(s) need attention.` : '\nAll reps connected. Their Google Calendar busy times will block the booking page.')
process.exit(failed ? 1 : 0)
