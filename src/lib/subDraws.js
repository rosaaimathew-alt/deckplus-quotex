// ── Sub invoices ─────────────────────────────────────────────────────────────
// The owner / office sets an agreed amount on each sub booking (subTerms,
// see agreedOf below). A sub invoices one job at a time, answering the same
// questions as the office's Google Form "Deckplus Subcontractor Invoice":
// company, date, job name / address, work type, invoice amount, notes, and
// the invoice itself (photo or PDF, optional). Any amount up to what's left
// on the job; one invoice per job per week. Only carpenters draw like that:
// every other trade sends one invoice per job (drawsAllowed). A photo or PDF
// of the invoice is optional. The office approves it (it
// becomes a bill on that job in Money › Bills, the same layout as every
// other bill) or sends it back with a reason.
//
// One record per invoice (store.subDraws, table sub_draws):
//   { id, subId, subName, subUserId, email, date: 'yyyy-mm-dd',
//     weekOf: Monday 'yyyy-mm-dd' (the week it was sent),
//     workTypes: [the booking's trade] (or ['Carpentry' | 'Masonry', ...] picked when it has none),
//     lines: [{ taskId, proposalId, client, address, title, amount, stage }]  (one job),
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
// Subs send invoices Monday 12:00 AM through Thursday 11:59 PM, Charlotte
// time. The database refuses one sent any other day (supabase/sub_draws.sql).
const TZ = 'America/New_York'
const DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
const easternDay = (d) => DOW[new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(d)]
export const invoiceWindowOpen = (d = new Date()) => easternDay(d) <= 4
// The Monday the window opens next, as a date ('2026-11-16') for display
export function nextInvoiceMonday(d = new Date()) {
  const ahead = 8 - easternDay(d)   // Friday (5) → 3 days, Sunday (7) → 1
  const x = new Date(d.getTime() + ahead * 86400e3)
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x)
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

// Carpenters draw against an agreed amount, as often as once a week. Every
// other trade sends one invoice per stage of the job (a sub sent back for the
// next stage, lib/subTasks, can invoice again): no agreed amount, no cap.
// (The database follows the same rule: supabase/sub_draws.sql.)
export const drawsAllowed = (task) => /carpent|framing/i.test(String(task?.trade || ''))
const stageOfTask = (task) => Math.max(1, Number(task?.stage) || 1)
// The live invoice already sent for this stage of the job, if any.
export const sentOnStage = (draws, task) =>
  (draws || []).find(d => live(d) && (d.lines || []).some(l => String(l.taskId) === String(task?.id)
    && Math.max(1, Number(l.stage) || 1) === stageOfTask(task))) || null
export const canInvoice = (task, terms, draws) => (drawsAllowed(task)
  ? remainingOn(task.id, terms, draws) > 0 && !sentThisWeek(draws, task.id)
  : !sentOnStage(draws, task))

// The live invoice already sent for this job this week, if any.
export const sentThisWeek = (draws, taskId, monday = weekOf()) =>
  (draws || []).find(d => live(d) && d.weekOf === monday && (d.lines || []).some(l => String(l.taskId) === String(taskId))) || null

// The kinds of work on the form (Tipo de trabajo).
export const WORK_TYPES = [
  { key: 'Carpentry', es: 'Carpintería' },
  { key: 'Masonry',   es: 'Albañilería' },
]
export const MAX_FILES = 10

// The work type comes from the sub's trade, stamped on each booking when the
// office books it (JobSubsTab), so the sub doesn't pick it. Spanish beside it,
// like the form's other questions.
const TRADE_ES = {
  Carpentry: 'Carpintería', Masonry: 'Albañilería', Electrical: 'Eléctrico', Plumbing: 'Plomería',
  Painting: 'Pintura', HVAC: 'HVAC', Mechanical: 'Mecánico', Roofing: 'Techado', Concrete: 'Concreto',
  Gutters: 'Canaletas', Framing: 'Estructura', Drywall: 'Tablaroca', Landscaping: 'Jardinería',
}
export const tradeOf = (task) => {
  const t = String(task?.trade || '').trim()
  return t && t.toLowerCase() !== 'other' ? t : ''
}
export const tradeEs = (trade) => TRADE_ES[trade] || ''

export const newDrawId = () => `dr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
