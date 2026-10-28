// ── Permit & inspection tracking ─────────────────────────────────────────────
// For now this only covers ongoing jobs in Mecklenburg County. The Office
// profile records permits and inspection results; project managers can see
// where each inspection stands but can't change it.
//
// Which permits and inspections a job has comes from its stage checklist:
// the "zoning" / "building" stages are permits, every "*_insp" stage is an
// inspection. Details live on jobData:
//
//   permits:     { [stageKey]: { number, jurisdiction, submitted, approved, expires, fee, notes } }
//   inspections: { [stageKey]: { attempts: [{ id, date, result, inspector, notes }] } }
//
// An inspection's scheduled date is the stage's date on the PM calendar
// (jobData.stageDates), so scheduling it here puts it on the calendar too.
// Recording an approval or a passed inspection checks the stage off.
import { useStore } from '../store'
import { DEMO } from '../demo'
import { locateAddress } from './permitFees'

// 'edit' (Office), 'view' (PMs) or null (everyone else)
export function usePermitAccess() {
  const me = useStore(s => s.me)
  if (DEMO || me?.role === 'office') return 'edit'
  if (me?.role === 'pm') return 'view'
  return null
}

export function permitTracked(proposal) {
  if ((proposal.jobData?.completedStages || []).includes('closed')) return false
  return locateAddress(proposal.address).county === 'Mecklenburg'
}

export const PERMIT_KEYS = ['zoning', 'building']
export const isInspectionKey = (key) => key.endsWith('_insp')

export const today = () => new Date().toISOString().split('T')[0]
export const daysUntil = (d) => Math.round((new Date(`${d}T12:00:00`) - new Date(`${today()}T12:00:00`)) / 86400000)

export function lastAttempt(inspection) {
  const attempts = inspection?.attempts || []
  return attempts.length ? attempts[attempts.length - 1] : null
}

// Things to look at on this job, for the card badges.
export function permitAlerts(proposal, stages) {
  const jobData = proposal.jobData || {}
  const completed = jobData.completedStages || []
  const keys = stages.map(s => s.key)
  const failed = keys.filter(isInspectionKey)
    .filter(k => !completed.includes(k))
    .filter(k => ['Failed', 'Partial'].includes(lastAttempt(jobData.inspections?.[k])?.result)).length
  const expiring = completed.includes('final_insp') ? 0 : keys.filter(k => PERMIT_KEYS.includes(k))
    .filter(k => { const e = jobData.permits?.[k]?.expires; return e && daysUntil(e) <= 30 }).length
  return { failed, expiring }
}
