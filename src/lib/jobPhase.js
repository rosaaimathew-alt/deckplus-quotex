// ── Where a sold job is ──────────────────────────────────────────────────────
// Projects › Jobs (its All / Permitting / Ready to start / Active / Closed
// filter) and the owner's Today page both ask this, so they always agree.
import { getStages } from '../pages/Jobs'
import { PERMIT_KEYS } from './permitTracking'

// Steps that come before building starts
const PRE_BUILD = new Set(['hoa', 'zoning', 'building', 'precon', 'start', 'materials', 'measurements'])
const APPROVALS = ['hoa', ...PERMIT_KEYS]
// Knowify's own stage for a job it had under way (the import kept it on the job)
const KNOWIFY_BUILDING = /ongoing|punch|final payment|paint|starting this week|starting tomorrow/i

// Where a sold job is: 'permitting' (an approval — HOA, zoning, building permit —
// still open), 'ready' (approved or none needed, building not begun), 'active'
// (building: the start date has come, a building step is checked off, or a sub
// has started on it), or 'closed'. subStarted: ids of jobs a sub has started on.
export function jobPhaseOf(p, subStarted = new Set(), today = new Date().toISOString().slice(0, 10)) {
  const cs = p.jobData?.completedStages || []
  if (cs.includes('closed')) return 'closed'
  const stages = getStages(p) || []
  const building = (p.jobData?.startDate && p.jobData.startDate <= today) || subStarted.has(String(p.id))
    || stages.some(s => cs.includes(s.key) && !PRE_BUILD.has(s.key))
    // finals passed (ready for close-out), or a job brought over from Knowify that was already under way there
    || !!p.jobData?.finalsPassed || KNOWIFY_BUILDING.test(String(p.knowify?.pmStage || ''))
  if (building) return 'active'
  return stages.some(s => APPROVALS.includes(s.key) && !cs.includes(s.key)) ? 'permitting' : 'ready'
}
export const subStartedIds = (subTasks) => new Set((subTasks || []).filter(t => t && ['started', 'near', 'done'].includes(t.status)).map(t => String(t.proposalId)))
