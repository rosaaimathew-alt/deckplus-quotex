// ── Sub invoices ─────────────────────────────────────────────────────────────
// The owner / office sets an agreed amount on each sub booking (subTerms,
// see agreedOf below). A sub invoices one job at a time, answering the same
// questions as the office's Google Form "Deckplus Subcontractor Invoice":
// company, date, job name / address, work type, invoice amount, notes, and
// the invoice itself (photo or PDF, required). Any amount up to what's left
// on the job; one invoice per job per week. The office approves it (it
// becomes a bill on that job in Money › Bills, the same layout as every
// other bill) or sends it back with a reason.
//
// One record per invoice (store.subDraws, table sub_draws):
//   { id, subId, subName, subUserId, email, date: 'yyyy-mm-dd',
//     weekOf: Monday 'yyyy-mm-dd' (the week it was sent),
//     workTypes: ['Carpentry' | 'Masonry', ...],
//     lines: [{ taskId, proposalId, client, address, title, amount }]  (one job),
//     total, notes, files: [{ id, name, type: 'photo' | 'pdf', path }],
//     status: 'submitted' | 'approved' | 'rejected',
//     submittedAt, submittedBy, decidedAt, decidedBy, reason, billIds }
// The database refuses an invoice that would take a job past its agreed
// amount, a second live invoice for the same job in the same week, or one
// with no invoice file (supabase/sub_draws.sql).

export const round2 = (x) => Math.round((Number(x) || 0) * 100) / 100
export const money = (x) => `$${round2(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const DRAW_STATUS = {
  submitted: { label: 'Waiting on the office', cls: 'bg-amber-100 text-amber-800' },
  approved:  { label: 'Approved',              cls: 'bg-green-100 text-green-700' },
  rejected:  { label: 'Sent back',             cls: 'bg-red-100 text-red-700' },
}

// Monday of the week a date falls in (local), as yyyy-mm-dd.
export function weekOf(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
export const weekLabel = (monday) => {
  const a = new Date(`${monday}T12:00:00`); const b = new Date(a); b.setDate(b.getDate() + 6)
  const f = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `Week of ${f(a)} – ${f(b)}`
}

// Invoices still counting against the agreed amount (not sent back).
const live = (d) => d && d.status !== 'rejected'

// How much has been asked for / approved on one task so far.
export function drawnOn(taskId, draws, { exceptId = null } = {}) {
  let s = 0
  for (const d of draws || []) {
    if (!live(d) || (exceptId != null && d.id === exceptId)) continue
    for (const l of d.lines || []) if (String(l.taskId) === String(taskId)) s += Number(l.amount) || 0
  }
  return round2(s)
}
// The agreed amount lives apart from the task (store.subTerms, table
// sub_task_terms) so an outside company's crew, who can see the task, never
// sees what their company is paid.
export const agreedOf = (taskId, terms) => Number((terms || []).find(t => t && String(t.id) === String(taskId))?.agreedAmount) || 0
export const remainingOn = (taskId, terms, draws, opts) => round2(agreedOf(taskId, terms) - drawnOn(taskId, draws, opts))

// The live invoice already sent for this job this week, if any.
export const sentThisWeek = (draws, taskId, monday = weekOf()) =>
  (draws || []).find(d => live(d) && d.weekOf === monday && (d.lines || []).some(l => String(l.taskId) === String(taskId))) || null

// The kinds of work on the form (Tipo de trabajo).
export const WORK_TYPES = [
  { key: 'Carpentry', es: 'Carpintería' },
  { key: 'Masonry',   es: 'Albañilería' },
]
export const MAX_FILES = 10

export const newDrawId = () => `dr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
