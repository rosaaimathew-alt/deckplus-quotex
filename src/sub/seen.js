// ── Sub app: what this phone has already opened ──────────────────────────────
// So the job list can mark a job "New" (never opened here) or "Updated" (the
// PM changed it since it was last opened). Kept on the phone only: a sub's
// login can't write anything on a job except its status and photos.
const KEY = 'qx_sub_seen'

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}

export const seenAt = (taskId) => read()[String(taskId)] || null

export function markSeen(taskId) {
  try {
    const all = read()
    all[String(taskId)] = new Date().toISOString()
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch { /* private window: the markers just stay */ }
}

// 'new' | 'updated' | null for a job on the list.
export function freshness(task) {
  if (!task || task.status === 'done') return null
  const seen = seenAt(task.id)
  // A job already under way isn't "new", even on a phone that never opened it
  if (!seen) return task.status && task.status !== 'booked' ? null : 'new'
  return task.changedAt && task.changedAt > seen ? 'updated' : null
}
