// ── County connection health ─────────────────────────────────────────────────
// After every full inspection check, each county's connection is graded: did
// we actually read its permit site? A county is "down" when none of its jobs
// could be read, or when at least 2 jobs and 30%+ of them failed — the site is
// down, blocking us, or its pages changed so inspections can't be read. One
// slow answer in a county with only a few jobs isn't an outage (that job is
// simply tried again on the next 10-minute tick). A job with no permit at its
// address doesn't count against the county: the site answered.
//
// Kept in the shared settings (permitPulse.health) so every office screen sees
// the same state (the banner shows right away). An email goes to office /
// admin only when a county is STILL down on the next check — one busy morning
// clears itself on the 10-minute re-check and emails nobody — and again when
// it comes back after such an email. Never on every check.
import { locateAddress } from './permitFees'

const DOWN_SHARE = 0.3
const DOWN_MIN_FAILED = 2
const STALE_MS = 26 * 3600 * 1000   // checks run at 8 AM and 1 PM — a day+ without one is a problem
const REALERT_MS = 12 * 3600 * 1000

// A city that inspects its own jobs (Rock Hill) has its own connection
export const countyOf = (p) => p.imported?.jurisdiction || p.imported?.county || locateAddress(p.address).county || 'Unknown'

// stats: { [county]: { ok, failed, lastError } } from one run
export function gradeRun(prevHealth = {}, stats = {}, now = new Date().toISOString()) {
  const health = { ...prevHealth }
  const changes = []
  for (const [county, s] of Object.entries(stats)) {
    const total = s.ok + s.failed
    if (!total) continue
    const down = s.failed > 0 && (s.ok === 0 || (s.failed >= DOWN_MIN_FAILED && s.failed / total >= DOWN_SHARE))
    const prev = prevHealth[county] || {}
    // Checks in a row that found it down (older saved states have no count)
    const downRuns = down ? (prev.down ? (prev.downRuns || 1) + 1 : 1) : 0
    const next = {
      ...prev,
      down,
      downRuns,
      checkedAt: now,
      lastOk: s.ok, lastFailed: s.failed,
      ...(s.ok ? { lastOkAt: now } : {}),
      ...(down ? { lastError: s.lastError || prev.lastError || 'Unknown error', since: prev.down ? prev.since : now } : { since: null }),
    }
    const emailedDown = prev.alertedState === 'down'
    const recently = (state) => prev.alertedAt && prev.alertedState === state && Date.now() - new Date(prev.alertedAt) < REALERT_MS
    // Down twice in a row and nobody told yet → email. Back up after a "down"
    // email → email that it's resolved.
    const tell = down
      ? (downRuns >= 2 && !(emailedDown && prev.down) && !recently('down') ? 'down' : null)
      : (prev.down && emailedDown ? 'up' : null)
    if (tell) {
      changes.push({ county, state: tell, error: next.lastError, failed: s.failed, total })
      next.alertedAt = now
      next.alertedState = tell
    }
    health[county] = next
  }
  return { health, changes }
}

// What to show the office: counties that are down, and checks that stopped.
export function connectionAlerts(permitPulse, { hasJobs = true, now = Date.now() } = {}) {
  const out = []
  for (const [county, h] of Object.entries(permitPulse?.health || {})) {
    if (h.down) out.push({ key: `down-${county}`, county, since: h.since, error: h.lastError, failed: h.lastFailed, total: (h.lastOk || 0) + (h.lastFailed || 0) })
  }
  const last = permitPulse?.lastRunAt ? new Date(permitPulse.lastRunAt).getTime() : null
  if (hasJobs && last && now - last > STALE_MS) out.push({ key: 'stale', stale: true, since: permitPulse.lastRunAt })
  return out
}

// Tell office / admin by email (the server finds their addresses). Best effort.
export async function sendConnectionAlert(change) {
  try {
    await fetch('/api/permit-pulse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert: change }),
    })
  } catch { /* the banner still shows; the daily self-test also raises an alert */ }
}
