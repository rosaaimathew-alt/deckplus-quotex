// ── Sub tasks ────────────────────────────────────────────────────────────────
// A PM books a subcontractor for one service on one job ("Frame the deck",
// "Rough electrical"). Each booking is its own record (store.subTasks, table
// sub_tasks) so a sub's login can later be given just their own tasks, never
// the job's proposal, prices or contract.
//
// A task moves Booked → Started → Near completion → Completed. Near
// completion and Completed are what the PM acts on: line up the inspection.
// Once the PM sets the inspection date, the task stops asking for attention.

export const SUB_STATUSES = [
  { key: 'booked',  label: 'Booked' },
  { key: 'started', label: 'Started' },
  { key: 'near',    label: 'Near completion' },
  { key: 'done',    label: 'Completed' },
]
const ORDER = SUB_STATUSES.map(s => s.key)

export const statusKey = (t) => (ORDER.includes(t?.status) ? t.status : 'booked')
export const statusLabel = (t) => SUB_STATUSES.find(s => s.key === statusKey(t)).label
export const statusIndex = (t) => ORDER.indexOf(statusKey(t))

// Soft pill colors per status (gray → blue → amber → green).
export const STATUS_PILL = {
  booked:  'bg-gray-100 text-gray-700',
  started: 'bg-blue-100 text-blue-700',
  near:    'bg-amber-100 text-amber-800',
  done:    'bg-green-100 text-green-700',
}

export const newSubTaskId = () => `st_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export const tasksForJob = (tasks, proposalId) =>
  (tasks || []).filter(t => t && String(t.proposalId) === String(proposalId))
    .sort((a, b) => (a.startDate || '9999').localeCompare(b.startDate || '9999') || String(a.createdAt || '').localeCompare(String(b.createdAt || '')))

// Near completion or completed, and no inspection lined up yet.
export const needsInspection = (t) => (statusKey(t) === 'near' || statusKey(t) === 'done') && !t.inspectionDate

// The name to show for a task's sub: the live record if it's still there,
// else the name saved on the task when it was booked.
export const subNameOf = (t, subs) => (subs || []).find(s => String(s.id) === String(t.subId))?.name || t.subName || 'Sub'

// When the PM changes a booking the sub has already been given, stamp when and
// what, so the sub's phone can mark the job "Updated" and say why
// (changedAt / changeNote). Returns {} when nothing the sub reads changed.
const CHANGE_LABELS = [
  ['title', 'service'], ['startDate', 'dates'], ['endDate', 'dates'], ['notes', 'notes'],
  ['electrical', 'electrical items'], ['inspectionDate', 'inspection date'],
]
export function changeStamp(task, changes, now = new Date().toISOString()) {
  // nothing, '' and an empty list all mean "not set"
  const plain = (v) => (v == null || v === '' || (Array.isArray(v) && !v.length) ? 'null' : JSON.stringify(v))
  const what = [...new Set(CHANGE_LABELS.filter(([k]) => k in changes && plain(task?.[k]) !== plain(changes[k])).map(([, label]) => label))]
  return what.length ? { changedAt: now, changeNote: what.join(', ') } : {}
}

// The cell of the technician on a booking, from the sub company's crew list.
export const techPhone = (task, sub) =>
  (task?.crewUserId && (sub?.crew || []).find(c => c && c.userId === task.crewUserId)?.phone) || ''
