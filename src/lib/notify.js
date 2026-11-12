// ── Alerts about a sub's job ────────────────────────────────────────────────
// Tells the server something happened on a booking or an invoice; the server
// works out who to email (and text) and what to say (api/_notify.js). The
// app only ever sends the kind and the id, a few seconds after the change so
// it has been saved first. Never blocks or fails the action that caused it.
import { getAccessToken } from '../supabase'
import { DEMO } from '../demo'

const wait = (ms) => new Promise(r => setTimeout(r, ms))

async function post(kind, id) {
  const token = await getAccessToken()
  if (!token) return null
  return fetch('/api/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'notify', kind, id: String(id) }),
  })
}

export function notify(kind, id, delay = 2500) {
  if (DEMO || !kind || id == null || typeof window === 'undefined') return
  ;(async () => {
    try {
      await wait(delay)
      const r = await post(kind, id)
      // Not saved yet (slow connection): one more try
      if (r && r.status === 404) { await wait(5000); await post(kind, id) }
    } catch { /* an alert never gets in the way */ }
  })()
}

// Which alert a change to a booking calls for, if any (store: updateSubTask).
export function alertForTaskChange(prev, changes) {
  if (!prev || !changes) return null
  if ('crewUserId' in changes && changes.crewUserId && changes.crewUserId !== prev.crewUserId) return 'assigned'
  if (changes.changedAt) {
    if (changes.changeNote === 'inspection date') return changes.inspectionDate ? 'inspection' : null
    return 'changed'
  }
  return null
}
