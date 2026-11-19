// ── One bill or card charge shared by several jobs ──────────────────────────
// A dump run for three jobs, one load each: the charge keeps its full amount
// and `splits` says how much of it goes to each job → [{ jobId, amount }].
// Without splits it belongs wholly to its jobId (as before). `jobId` stays the
// first job of a split, so anything that only knows one job still finds one.
const n = (v) => Number(v) || 0

export function splitsOf(rec, total) {
  if (Array.isArray(rec?.splits) && rec.splits.length) return rec.splits.filter(s => s && s.jobId != null && s.jobId !== '')
  return rec?.jobId != null && rec.jobId !== '' ? [{ jobId: rec.jobId, amount: n(total) }] : []
}
// This job's share of it (0 when it isn't on it)
export const shareFor = (rec, total, jobId) =>
  Math.round(splitsOf(rec, total).filter(s => String(s.jobId) === String(jobId)).reduce((t, s) => t + n(s.amount), 0) * 100) / 100
export const isSplit = (rec) => Array.isArray(rec?.splits) && rec.splits.length > 1

// What to save from the editor's rows: one job → plain jobId; several → splits too.
export function splitPatch(rows) {
  const clean = (rows || []).filter(r => r && r.jobId != null && r.jobId !== '').map(r => ({ jobId: r.jobId, amount: Math.round(n(r.amount) * 100) / 100 }))
  if (clean.length <= 1) return { jobId: clean[0]?.jobId ?? null, splits: null }
  return { jobId: clean[0].jobId, splits: clean }
}
// Equal shares that still add up to the cent (the last one takes the rounding)
export function evenSplit(rows, total) {
  const k = rows.length || 1, each = Math.floor((n(total) / k) * 100) / 100
  return rows.map((r, i) => ({ ...r, amount: i === k - 1 ? Math.round((n(total) - each * (k - 1)) * 100) / 100 : each }))
}
// The rows add up to the total (to the cent)
export const splitAddsUp = (rows, total) => rows.length < 2 || Math.abs(rows.reduce((t, r) => t + n(r.amount), 0) - n(total)) < 0.01
// Ready to save: two or more jobs, each picked once, adding up to the total
export const splitReady = (rows, total) => rows.length > 1 && rows.every(r => r.jobId != null) && new Set(rows.map(r => String(r.jobId))).size === rows.length && splitAddsUp(rows, total)
