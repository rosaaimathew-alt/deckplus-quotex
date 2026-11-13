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

// 'edit' (Office / Admin), 'view' (PMs and sales reps) or null (everyone else)
export function usePermitAccess() {
  const me = useStore(s => s.me)
  // The admin switched Inspections off for this person (Settings › Team › Access).
  if (!DEMO && me?.permissions?.['projects.inspections'] === false) return null
  if (DEMO || me?.role === 'office' || me?.role === 'admin') return 'edit'
  // PMs and sales reps see where their jobs' inspections stand; only the office changes them.
  if (me?.role === 'pm' || me?.role === 'rep') return 'view'
  return null
}

// Counties whose permit site the inspection check reads. Jobs in any other
// county are still on the board; the office records their results by hand.
export const CONNECTED_COUNTIES = ['Mecklenburg', 'Cabarrus', 'Union', 'York', 'Lancaster', 'Rock Hill']

// The job's county (and, where a city runs its own inspections, that city).
export const jobCounty = (p) => p.imported?.county || locateAddress(p.address).county || ''
export const jobJurisdiction = (p) => p.imported?.jurisdiction || ''
// A city that inspects its own jobs (Rock Hill, Tega Cay, Waxhaw) is connected
// on its own, not through its county.
export const countyConnected = (p) => CONNECTED_COUNTIES.includes(jobJurisdiction(p) || jobCounty(p))

// Every ongoing job in a county we work in is on the inspections board.
export function permitTracked(proposal) {
  if ((proposal.jobData?.completedStages || []).includes('closed')) return false
  return !!jobCounty(proposal)
}

// Electrical / mechanical / plumbing permit, by its number:
// "RES-ELC-26-…" (Mecklenburg) or "EL2026-…" (Cabarrus).
export function tradeKind(record) {
  const r = String(record || '').toUpperCase()
  if (/-ELC-|^EL\d/.test(r)) return 'ELC'
  if (/-MEC-|^(ME|MC)\d/.test(r)) return 'MEC'
  if (/-PLM-|^PL\d/.test(r)) return 'PLM'
  return ''
}

// The county's permits plus the results the office recorded by hand (for
// counties not connected yet, or anything the county site is slow to post),
// as one more "permit" so every view treats them alike.
export function allPermits(proposal) {
  const permits = proposal.countyPermit?.permits || []
  const office = proposal.jobData?.officeInspections || []
  if (!office.length) return permits
  return [...permits, {
    record: 'Office entry', role: 'office', manual: true, upcoming: [],
    completed: office.map(o => ({ ...o, name: o.name || inspectionTitle(o.code), notes: o.note ? [{ by: o.inspector || 'Office', at: o.date, text: o.note }] : [] })),
  }]
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
  const { byStage, other } = countyByStage(proposal, keys)
  // County inspections no stage covers (e.g. a job with no type set yet):
  // grouped by permit + inspection code, failing if the latest failed and
  // none has passed.
  const groups = {}
  for (const i of other) (groups[`${i.record}:${i.code}`] ||= []).push(i)
  const otherFailed = Object.values(groups).filter(g => {
    g.sort((a, b) => (a.date || '').localeCompare(b.date || '') || Number(a.id) - Number(b.id))
    return !countyPassed(g) && isFailResult(countyLast(g)?.result)
  }).length
  const failed = otherFailed + keys.filter(isInspectionKey)
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
  if (permit.manual) {
    // Office entries carry the board's own codes
    if (ins.code === 'ER') return pick('rough_elec_insp')
    if (ins.code === 'EF') return pick('final_elec_insp')
    if (ins.code === 'MI') return pick('rough_mech_insp')
    if (ins.code === 'MF') return null
  } else if (permit.role === 'trade') {
    // The electrical permit's rough (and final) inspections have stages of their own
    if ((permit.kind || tradeKind(permit.record)) === 'ELC' && (ins.code === 'RF' || ins.code === 'ER')) return pick('rough_elec_insp')
    // …and its final, on jobs whose checklist has one
    if ((permit.kind || tradeKind(permit.record)) === 'ELC' && (ins.code === 'FI' || ins.code === 'EF')) return pick('final_elec_insp')
    // A gas fireplace's mechanical rough (the gas line, at the framing inspection)
    if (['MEC', 'PLM'].includes(permit.kind || tradeKind(permit.record)) && ['RF', 'MI'].includes(ins.code)) return pick('rough_mech_insp')
    return null
  }
  switch (ins.code) {
    case 'FT': return pick('footing_insp')
    case 'FF': return pick('floor_framing_insp', 'rough_building_insp')
    case 'FR':
    case 'RF': return pick('rough_building_insp', 'floor_framing_insp')
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
  for (const p of allPermits(proposal)) {
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
// Twice a day: the first office/admin screen open after 8 AM, and again after
// 1 PM. Returns the start of the slot we're in (or the last one, if before 8 AM).
export const PULSE_HOURS = [8, 13]
export function currentPulseSlot(now = new Date()) {
  const at = (d, h) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x }
  for (const h of [...PULSE_HOURS].reverse()) { const s = at(now, h); if (s <= now) return s }
  const y = new Date(now); y.setDate(y.getDate() - 1)
  return at(y, PULSE_HOURS[PULSE_HOURS.length - 1])
}
export function pulseDue(lastRunAt, now = new Date()) {
  return !lastRunAt || new Date(lastRunAt) < currentPulseSlot(now)
}

// ── Inspections board columns ────────────────────────────────────────────────
// One column per inspection, the way the office's Inspection Track sheet
// reads. The county files building inspections on the building permit and
// electrical / mechanical ones on their own trade permits.
export const BOARD_COLUMNS = [
  { key: 'FT', label: 'FT', title: 'Footing' },
  { key: 'SL', label: 'SL', title: 'Slab' },
  { key: 'FR', label: 'FR', title: 'Framing' },
  { key: 'ER', label: 'ER', title: 'Electrical rough' },
  { key: 'MI', label: 'MI', title: 'Mechanical rough' },
  { key: 'EF', label: 'EF', title: 'Electrical final' },
  { key: 'MF', label: 'MF', title: 'Mechanical final' },
  { key: 'FI', label: 'FI', title: 'Building final' },
]

function boardColumnOf(permit, ins) {
  const code = ins.code
  if (permit.manual) return BOARD_COLUMNS.some(c => c.key === code) ? code : null
  // Evolve permits carry every trade, split by `kind`; others by permit number
  const kind = permit.kind || tradeKind(permit.record)
  if (kind === 'ELC') return code === 'RF' ? 'ER' : code === 'FI' ? 'EF' : code === 'SL' ? 'SL' : null
  if (kind === 'MEC' || kind === 'PLM') return code === 'RF' ? 'MI' : code === 'FI' ? 'MF' : null
  if (code === 'FT' || /footing/i.test(ins.name || '')) return 'FT'
  if (code === 'SL' || code === 'MS') return 'SL'
  if (code === 'FR' || code === 'FF' || code === 'RF') return 'FR'   // a building permit's "rough" is its framing
  if (code === 'FI') return 'FI'
  return null
}

// { FT: { state: 'pass'|'fail'|'sched'|'void', result, date, list }, … }
export function boardCells(proposal) {
  const cols = {}
  for (const p of allPermits(proposal)) {
    for (const ins of p.completed || []) {
      const k = boardColumnOf(p, ins); if (!k) continue
      ;(cols[k] ||= { list: [], upcoming: [] }).list.push({ ...ins, record: p.record })
    }
    for (const ins of p.upcoming || []) {
      const k = boardColumnOf(p, ins); if (!k) continue
      ;(cols[k] ||= { list: [], upcoming: [] }).upcoming.push({ ...ins, record: p.record })
    }
  }
  for (const c of Object.values(cols)) {
    c.list.sort((a, b) => (a.date || '').localeCompare(b.date || '') || Number(a.id) - Number(b.id))
    const last = c.list[c.list.length - 1]
    const passed = c.list.filter(i => isPassResult(i.result)).pop()
    if (passed) Object.assign(c, { state: 'pass', result: passed.result, date: passed.date })
    else if (c.upcoming.length) Object.assign(c, { state: 'sched', result: 'Scheduled', date: c.upcoming[0].date })
    else if (last && isFailResult(last.result)) Object.assign(c, { state: 'fail', result: last.result, date: last.date })
    else if (last) Object.assign(c, { state: 'void', result: last.result, date: last.date })
  }
  return cols
}

const inspectionTitle = (code) => BOARD_COLUMNS.find(c => c.key === code)?.title || code

export const countyFinaled = (proposal) =>
  (proposal.countyPermit?.permits || []).some(p => p.role === 'building' && /closed|final/i.test(p.recordStatus || p.status || ''))

// ── Finished jobs ────────────────────────────────────────────────────────────
// A job is done with inspections when the building final has passed and every
// county permit on it is finished too: its own final passed, or the county
// shows it finaled / complete. Such a job leaves the board and moves to
// Closed in Job Management (see closeIfFinaled).
const PERMIT_DONE = /closed|complete|finaled|^final|c\.?c\.? issued/i
function permitFinished(permit) {
  if (PERMIT_DONE.test(permit.recordStatus || permit.status || '')) return true
  return (permit.completed || []).some(i => i.code === 'FI' && isPassResult(i.result))
}

// Returns the date the last final passed (YYYY-MM-DD), or '' if not finished.
export function allFinalsPassed(proposal) {
  const fi = boardCells(proposal).FI
  if (fi?.state !== 'pass') return ''
  const county = (proposal.countyPermit?.permits || []).filter(p => !p.manual)
  if (!county.every(permitFinished)) return ''
  let last = fi.date || ''
  for (const p of allPermits(proposal)) {
    for (const i of p.completed || []) if (i.code === 'FI' && isPassResult(i.result) && (i.date || '') > last) last = i.date
  }
  return last || today()
}

// Close a job whose finals have all passed — the same "Job Closed" stage the
// PM's close-out sets, without the customer email or the profit entry.
export function closeIfFinaled(proposalId, getState) {
  const { proposals, updateJobData, toggleJobStage } = getState()
  const p = proposals.find(x => x.id === proposalId)
  if (!p || (p.jobData?.completedStages || []).includes('closed')) return false
  const finalDate = allFinalsPassed(p)
  if (!finalDate) return false
  updateJobData(p.id, {
    completionDate: p.jobData?.completionDate || finalDate,
    closedAt: new Date().toISOString(),
    autoClosed: { at: new Date().toISOString(), reason: 'All final inspections passed' },
  })
  toggleJobStage(p.id, 'closed')
  return true
}
