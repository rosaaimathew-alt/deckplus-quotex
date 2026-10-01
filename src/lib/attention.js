// ── What needs attention ─────────────────────────────────────────────────────
// One place that decides "what should someone look at next". Home lists these
// as a short to-do; the sidebar and tabs show the same counts as badges, so the
// numbers always agree wherever you see them.
import { getStages } from '../pages/Jobs'

const DAY = 86400000
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

// Same rule the Proposal Tracker uses for recurring follow-ups
export function nextReminderDate(reminder) {
  if (!reminder || reminder.dismissed) return null
  const base = new Date(reminder.date + 'T00:00:00')
  const today = startOfToday()
  if (base >= today || reminder.frequency === 'once') return reminder.date
  const step = { '3d': 3, weekly: 7, biweekly: 14, monthly: 30 }[reminder.frequency] || 0
  if (!step) return reminder.date
  const next = new Date(base)
  while (next < today) next.setDate(next.getDate() + step)
  return next.toISOString().split('T')[0]
}
const isDue = (dateStr) => !!dateStr && new Date(dateStr + 'T00:00:00') <= new Date()
const daysSince = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null)

export const contractStatusOf = (p) => (!p.contractDraft ? 'not-started' : p.contractDraft.signed ? 'signed' : 'in-progress')
export const isJobClosed = (p) => (p.jobData?.completedStages || []).includes('closed')

// Each item: { key, tone, title, detail, count, people: [{ id, name, note }], to, cta }
export function attentionItems({ proposals = [], jobCosts = {}, can = () => true, unread = 0, role = 'manager' }) {
  const items = []
  const live = proposals.filter(p => p.status !== 'Archived')

  if (can('/tracker')) {
    // Follow-ups due today or earlier
    const due = []
    for (const p of live) for (const r of p.reminders || []) {
      const nd = nextReminderDate(r)
      if (isDue(nd)) due.push({ id: p.id, name: p.client || 'Unnamed', note: r.note || 'Follow up', date: nd })
    }
    due.sort((a, b) => a.date.localeCompare(b.date))
    if (due.length) items.push({
      key: 'followups', tone: 'alert', title: `${due.length} follow-up${due.length !== 1 ? 's' : ''} due`,
      detail: 'Reminders you set on proposals', count: due.length, people: due, to: '/sales?tab=proposals', cta: 'Open proposals',
    })

    // Quotes sent a week+ ago with no answer
    const waiting = live
      .filter(p => ['Sent', 'Followed Up'].includes(p.status) && (daysSince(p.sentAt) ?? 0) >= 7)
      .sort((a, b) => new Date(a.sentAt) - new Date(b.sentAt))
    if (waiting.length) items.push({
      key: 'waiting', tone: 'warn', title: `${waiting.length} quote${waiting.length !== 1 ? 's' : ''} waiting on the customer`,
      detail: 'Sent 7+ days ago with no decision — a follow-up usually helps', count: waiting.length,
      people: waiting.map(p => ({ id: p.id, name: p.client || 'Unnamed', note: `${daysSince(p.sentAt)}d since sent` })),
      to: '/sales?tab=proposals&status=Sent', cta: 'Follow up',
    })

    // Drafts that were never sent
    const drafts = live.filter(p => p.status === 'Draft' && (daysSince(p.createdAt) ?? 0) >= 2)
    if (drafts.length) items.push({
      key: 'drafts', tone: 'info', title: `${drafts.length} draft${drafts.length !== 1 ? 's' : ''} not sent yet`,
      detail: 'Built but never sent to the customer', count: drafts.length,
      people: drafts.map(p => ({ id: p.id, name: p.client || 'Unnamed', note: `started ${daysSince(p.createdAt)}d ago` })),
      to: '/sales?tab=proposals&status=Draft', cta: 'Review drafts',
    })
  }

  const won = proposals.filter(p => p.status === 'Won')

  if (can('/contracts')) {
    const toStart = won.filter(p => contractStatusOf(p) === 'not-started')
    if (toStart.length) items.push({
      key: 'contracts', tone: 'warn', title: `${toStart.length} won job${toStart.length !== 1 ? 's' : ''} need${toStart.length === 1 ? 's' : ''} a contract`,
      detail: 'Won, but the contract hasn’t been started', count: toStart.length,
      people: toStart.map(p => ({ id: p.id, name: p.client || 'Unnamed', note: 'not started' })),
      to: '/projects?tab=contracts&filter=Not+Started', cta: 'Start contracts',
    })
    const outForSig = won.filter(p => contractStatusOf(p) === 'in-progress')
    if (outForSig.length) items.push({
      key: 'signing', tone: 'info', title: `${outForSig.length} contract${outForSig.length !== 1 ? 's' : ''} in progress`,
      detail: 'Prepared or sent, not fully signed yet', count: outForSig.length,
      people: outForSig.map(p => ({ id: p.id, name: p.client || 'Unnamed', note: p.contractDraft?.linksSentAt ? 'sent for signature' : 'draft' })),
      to: '/projects?tab=contracts&filter=In+Progress', cta: 'Check signatures',
    })
  }

  if (can('/scheduler') || can('/jobs')) {
    const open = won.filter(p => !isJobClosed(p))
    const unscheduled = open.filter(p => !p.jobData?.startDate)
    if (unscheduled.length) items.push({
      key: 'unscheduled', tone: role === 'pm' ? 'alert' : 'warn', title: `${unscheduled.length} job${unscheduled.length !== 1 ? 's' : ''} need${unscheduled.length === 1 ? 's' : ''} a start date`,
      detail: 'Won work that isn’t on the calendar yet', count: unscheduled.length,
      people: unscheduled.map(p => ({ id: p.id, name: p.client || 'Unnamed', note: 'no start date' })),
      to: can('/scheduler') ? '/projects?tab=calendar' : '/projects?tab=jobs', cta: 'Schedule',
    })
    const noType = open.filter(p => !getStages(p))
    if (noType.length && can('/jobs')) items.push({
      key: 'setup', tone: 'info', title: `${noType.length} job${noType.length !== 1 ? 's' : ''} need${noType.length === 1 ? 's' : ''} a job type`,
      detail: 'Pick the job type to load its stage checklist', count: noType.length,
      people: noType.map(p => ({ id: p.id, name: p.client || 'Unnamed', note: 'needs setup' })),
      to: '/projects?tab=jobs', cta: 'Set up jobs',
    })
    const warranty = won
      .filter(p => (p.jobData?.warrantyItems || []).some(w => w.status !== 'Resolved'))
    if (warranty.length && can('/jobs')) items.push({
      key: 'warranty', tone: 'warn', title: `${warranty.length} job${warranty.length !== 1 ? 's' : ''} with open warranty items`,
      detail: 'Callbacks still to resolve', count: warranty.length,
      people: warranty.map(p => ({ id: p.id, name: p.client || 'Unnamed', note: `${(p.jobData.warrantyItems || []).filter(w => w.status !== 'Resolved').length} open` })),
      to: '/projects?tab=jobs', cta: 'Open jobs',
    })
  }

  if (can('/profitability')) {
    const noCosts = won.filter(p => isJobClosed(p) && !jobCosts[p.id])
    if (noCosts.length) items.push({
      key: 'costs', tone: 'info', title: `${noCosts.length} finished job${noCosts.length !== 1 ? 's' : ''} without costs`,
      detail: 'Enter actual costs to see real margins', count: noCosts.length,
      people: noCosts.map(p => ({ id: p.id, name: p.client || 'Unnamed', note: 'closed, no costs' })),
      to: '/insights?tab=profit', cta: 'Enter costs',
    })
  }

  if (unread > 0 && can('/inbox')) items.push({
    key: 'inbox', tone: 'info', title: `${unread} unread message${unread !== 1 ? 's' : ''}`,
    detail: 'Customer replies in your inbox', count: unread, people: [], to: '/inbox', cta: 'Open inbox',
  })

  const order = { alert: 0, warn: 1, info: 2 }
  return items.sort((a, b) => order[a.tone] - order[b.tone])
}
