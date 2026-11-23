// ── Painters' time clock: the arithmetic ─────────────────────────────────────
// Shared by the office page (Money › Time clock) and the Wednesday email
// (api/_timeclock.js). The rules themselves (on site to clock in and out, the
// 4:30 clock out) live in the database: supabase/time_clock.sql.
//
// A shift, as timeclock_week() returns it:
//   { id, userId, worker, proposalId, client, address, day, in, out, autoOut,
//     hours, inDist, outDist, inLat, inLng, outLat, outLng,
//     pings: [{ kind: 'in'|'ping'|'out'|'auto_out'|'out_refused', at, lat, lng, acc, dist, onSite }] }

export const TZ = 'America/New_York'
export const PAY_WEEK_START = 3          // Wednesday (Sunday = 0)
export const PING_MINUTES = 30           // how often the app sends the location
export const GAP_MINUTES = 45            // longer than this without one = a gap

const pad = (n) => String(n).padStart(2, '0')
const ymd = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const parse = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)) }

export function addDaysStr(day, n) { const d = parse(day); d.setUTCDate(d.getUTCDate() + n); return ymd(d) }

// Today's date where the crews work, as YYYY-MM-DD.
export function todayET(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

// The Wednesday that starts the pay week a day falls in.
export function weekStartOf(day) {
  const d = parse(day)
  const back = (d.getUTCDay() - PAY_WEEK_START + 7) % 7
  d.setUTCDate(d.getUTCDate() - back)
  return ymd(d)
}

export const weekDays = (start) => Array.from({ length: 7 }, (_, i) => addDaysStr(start, i))

export const dayName = (day, opts = { weekday: 'short', month: 'short', day: 'numeric' }) =>
  parse(day).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' })

export const clockTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }) : '')

// 7.5 → "7:30"
export function hm(hours) {
  const mins = Math.round(Number(hours || 0) * 60)
  return `${Math.floor(mins / 60)}:${pad(mins % 60)}`
}

const hoursBetween = (a, b) => Math.max(0, (new Date(b) - new Date(a)) / 3_600_000)

// Stretches of a shift with no location for longer than GAP_MINUTES (the app
// was closed or the phone was off). Until now for a shift still open.
export function gapsOf(shift, now = new Date()) {
  const marks = [shift.in, ...(shift.pings || []).filter(p => p.lat != null).map(p => p.at)]
  const end = shift.out || now.toISOString()
  const times = [...new Set(marks)].filter(Boolean).map(t => new Date(t).getTime()).sort((a, b) => a - b)
  const out = []
  let last = times[0]
  for (const t of [...times.slice(1), new Date(end).getTime()]) {
    if (t - last > GAP_MINUTES * 60_000) out.push({ from: new Date(last).toISOString(), to: new Date(t).toISOString(), minutes: Math.round((t - last) / 60_000) })
    last = Math.max(last, t)
  }
  return out
}

// Location checks that found them away from the job.
export const offSitePings = (shift) => (shift.pings || []).filter(p => p.kind === 'ping' && p.onSite === false)
export const refusedOuts = (shift) => (shift.pings || []).filter(p => p.kind === 'out_refused')

// One row per painter for the week: hours by day, the total, and what the
// office should look at (4:30 clock outs, gaps, checks away from the job).
export function summarize(shifts, start, now = new Date()) {
  const days = weekDays(start)
  const by = new Map()
  for (const s of shifts || []) {
    const key = s.userId || s.worker
    if (!by.has(key)) by.set(key, { userId: s.userId, worker: s.worker || 'Painter', days: Object.fromEntries(days.map(d => [d, 0])), total: 0, shifts: [], autoOuts: 0, gaps: 0, offSite: 0, refusedOuts: 0, open: false })
    const w = by.get(key)
    const h = hoursBetween(s.in, s.out || now)
    if (s.day in w.days) w.days[s.day] += h
    w.total += h
    w.shifts.push(s)
    if (s.autoOut) w.autoOuts++
    if (!s.out) w.open = true
    w.gaps += gapsOf(s, now).length
    w.offSite += offSitePings(s).length
    w.refusedOuts += refusedOuts(s).length
  }
  return [...by.values()].sort((a, b) => a.worker.localeCompare(b.worker))
}

// The week as a spreadsheet for payroll: one line per shift, then the totals.
export function payrollCsv(rows, start) {
  const cell = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const lines = [['Painter', 'Day', 'Job', 'Address', 'Clock in', 'Clock out', 'Hours', 'Note']]
  for (const w of rows) {
    for (const s of w.shifts) {
      lines.push([w.worker, s.day, s.client || '', s.address || '', clockTime(s.in), s.out ? clockTime(s.out) : 'still clocked in',
        hoursBetween(s.in, s.out || new Date()).toFixed(2), [s.autoOut ? 'Did not clock out at the job: ended at 4:30 PM' : '', s.note || ''].filter(Boolean).join(' · ')])
    }
  }
  lines.push([])
  lines.push(['Painter', ...weekDays(start).map(d => dayName(d)), 'Total hours'])
  for (const w of rows) lines.push([w.worker, ...weekDays(start).map(d => w.days[d].toFixed(2)), w.total.toFixed(2)])
  return lines.map(r => r.map(cell).join(',')).join('\r\n')
}
