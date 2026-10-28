// ── Permit & inspection tracking ─────────────────────────────────────────────
// For now this only covers ongoing jobs in Mecklenburg County. Office and
// Admin record permits and inspection results; project managers can see
// where each inspection stands but can't change it. Twice a day the pulse
// reads each job's permit off the county site (lib/permitPulse.js).
//
// Which permits and inspections a job has comes from its stage checklist:
// the "zoning" / "building" stages are permits, every "*_insp" stage is an
// inspection. Details live on jobData:
//
//   permits:     { [stageKey]: { number, jurisdiction, submitted, approved, expires, fee, notes } }
//   inspections: { [stageKey]: { attempts: [{ id, date, result, inspector, notes }] } }
//   nextInspection: { code, date }   — what the office has scheduled next
//   countyPick: [capID1, capID2, capID3] — the permit the office chose when
//                the county had more than one at the job's address
//
// An inspection's scheduled date is the stage's date on the PM calendar
// (jobData.stageDates), so scheduling it here puts it on the calendar too.
// Recording an approval or a passed inspection checks the stage off.
import { useStore } from '../store'
import { DEMO } from '../demo'
import { locateAddress } from './permitFees'

// 'edit' (Office / Admin), 'view' (PMs) or null (everyone else)
export function usePermitAccess() {
  const me = useStore(s => s.me)
  if (DEMO || me?.role === 'office' || me?.role === 'admin') return 'edit'
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

// Things to look at on this job, for the card badges: a stage whose latest
// result (ours or the county's) failed and hasn't passed since, and permits
// expiring within 30 days.
export function permitAlerts(proposal, stages) {
  const jobData = proposal.jobData || {}
  const completed = jobData.completedStages || []
  const keys = stages.map(s => s.key)
  const { byStage } = countyByStage(proposal, keys)
  const failed = keys.filter(isInspectionKey)
    .filter(k => !completed.includes(k))
    .filter(k => {
      const ours = lastAttempt(jobData.inspections?.[k])
      const county = countyLast(byStage[k])
      const latest = [ours, county].filter(Boolean).sort((a, b) => (a.date || '').localeCompare(b.date || '')).pop()
      return latest && isFailResult(latest.result)
    }).length
  const expiring = completed.includes('final_insp') ? 0 : keys.filter(k => PERMIT_KEYS.includes(k))
    .filter(k => { const e = jobData.permits?.[k]?.expires; return e && daysUntil(e) <= 30 }).length
  return { failed, expiring, needsPick: !!proposal.countyPermit?.needsPick }
}

// ── County results (filled in by the pulse, see lib/permitPulse.js) ─────────
// proposal.countyPermit = { checkedAt, error, needsPick, candidates,
//   permits: [{ record, type, role: 'building'|'trade', recordStatus, url,
//               upcoming: [...], completed: [{ id, code, name, result, date, inspector, notes }] }] }
// It's a top-level key of its own so the pulse and people editing jobData
// never overwrite each other.

// The inspection types the office schedules (same codes as the county).
export const INSPECTION_TYPES = [
  { code: 'FT', label: 'FT - Footing' },
  { code: 'SL', label: 'SL - Slab' },
  { code: 'FF', label: 'FF - Framing / Floor' },
  { code: 'FR', label: 'FR - Framing / Rough' },
  { code: 'ER', label: 'ER - Electrical Rough' },
  { code: 'FE', label: 'FE - Framing + Electrical' },
  { code: 'MI', label: 'MI - Mechanical' },
  { code: 'MF', label: 'MF - Mechanical Final' },
  { code: 'IN', label: 'Insulation' },
  { code: 'FI', label: 'FI - Final Inspection' },
]
export const inspectionLabel = (code) => INSPECTION_TYPES.find(t => t.code === code)?.label || code

// Which stage a county inspection checks off. FR is "Framing" on the county
// site whether it's a deck's floor framing or a porch's rough framing, so it
// lands on whichever of those stages the job has.
export function countyStageKey(ins, permit, stageKeys) {
  const has = (k) => stageKeys.includes(k)
  const pick = (...ks) => ks.find(has) || null
  if (permit.role === 'trade') {
    // Only the electrical permit's rough inspection has a stage of its own
    if (/-ELC-/.test(permit.record || '') && (ins.code === 'RF' || ins.code === 'ER')) return pick('rough_elec_insp')
    return null
  }
  switch (ins.code) {
    case 'FT': return pick('footing_insp')
    case 'FF': return pick('floor_framing_insp', 'rough_building_insp')
    case 'FR': return pick('rough_building_insp', 'floor_framing_insp')
    case 'ER': return pick('rough_elec_insp')
    case 'FE': return pick('rough_building_insp')
    case 'FI': return pick('final_insp')
    default:   return null
  }
}

const PASSED = /^pass/i
const FAILED = /fail|partial|inaccessible|not ready|disapprov/i

// County inspections grouped by job stage, plus the ones no stage covers.
export function countyByStage(proposal, stageKeys) {
  const byStage = {}, other = [], upcoming = []
  for (const p of proposal.countyPermit?.permits || []) {
    for (const ins of p.completed || []) {
      const key = countyStageKey(ins, p, stageKeys)
      const item = { ...ins, record: p.record, role: p.role }
      if (key) (byStage[key] ||= []).push(item); else other.push(item)
    }
    for (const ins of p.upcoming || []) upcoming.push({ ...ins, record: p.record, role: p.role, stage: countyStageKey(ins, p, stageKeys) })
  }
  for (const k in byStage) byStage[k].sort((a, b) => (a.date || '').localeCompare(b.date || '') || Number(a.id) - Number(b.id))
  return { byStage, other, upcoming }
}

export const countyPassed = (list = []) => list.some(i => PASSED.test(i.result))
export const countyLast = (list = []) => list[list.length - 1] || null
export const isFailResult = (r) => FAILED.test(r || '')
export const isPassResult = (r) => PASSED.test(r || '')

// Stages the county has passed — the pulse checks these off.
export function countyPassedStages(proposal, stageKeys) {
  const { byStage } = countyByStage(proposal, stageKeys)
  return Object.keys(byStage).filter(k => countyPassed(byStage[k]))
}

// ── When the pulse runs ──────────────────────────────────────────────────────
// Twice a day: the first office/admin screen open after 7 AM, and again after
// 1 PM. Returns the start of the slot we're in (or the last one, if before 7 AM).
export const PULSE_HOURS = [7, 13]
export function currentPulseSlot(now = new Date()) {
  const at = (d, h) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x }
  for (const h of [...PULSE_HOURS].reverse()) { const s = at(now, h); if (s <= now) return s }
  const y = new Date(now); y.setDate(y.getDate() - 1)
  return at(y, PULSE_HOURS[PULSE_HOURS.length - 1])
}
export function pulseDue(lastRunAt, now = new Date()) {
  return !lastRunAt || new Date(lastRunAt) < currentPulseSlot(now)
}
