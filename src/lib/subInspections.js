// ── Inspection results a sub sees ────────────────────────────────────────────
// A sub only hears about the inspections of their own trade on the job:
//   Electrical           → the electrical permit's inspections
//   Carpentry / Framing  → the building permit's (footing, framing, final)
//   Plumbing / HVAC      → the mechanical / plumbing permit's
// Everyone else (painters, landscapers…) gets none: they hear from their PM.
// The results are copied onto the sub's booking (task.inspections) when the
// county check or the office records them, because a sub's login can't read
// the job itself.
import { allPermits, tradeKind, inspectionLabel, isPassResult, isFailResult } from './permitTracking'

export function tradeGroup(trade) {
  const t = String(trade || '').toLowerCase()
  if (/electric/.test(t)) return 'electrical'
  if (/carpent|framing/.test(t)) return 'carpentry'
  if (/plumb|hvac|mechanic/.test(t)) return 'mechanical'
  return null
}

const OFFICE_CODES = { ER: 'electrical', EF: 'electrical', MI: 'mechanical', MF: 'mechanical', FT: 'carpentry', SL: 'carpentry', FF: 'carpentry', FR: 'carpentry', FI: 'carpentry' }

// Which trades an inspection belongs to.
function tradesOf(permit, ins) {
  if (permit.manual) return OFFICE_CODES[ins.code] ? [OFFICE_CODES[ins.code]] : []
  const kind = permit.kind || tradeKind(permit.record)
  if (kind === 'ELC') return ['electrical']
  if (kind === 'MEC' || kind === 'PLM') return ['mechanical']
  // The building permit; a few counties file the electrical rough on it too
  if (ins.code === 'ER') return ['electrical']
  if (ins.code === 'FE') return ['carpentry', 'electrical']
  return ['carpentry']
}

const NAMES = { electrical: { RF: 'Electrical rough', ER: 'Electrical rough', FI: 'Electrical final', EF: 'Electrical final', SL: 'Electrical slab' },
  mechanical: { RF: 'Mechanical rough', MI: 'Mechanical rough', FI: 'Mechanical final', MF: 'Mechanical final' },
  carpentry: { FT: 'Footing', SL: 'Slab', FF: 'Floor framing', FR: 'Framing', RF: 'Framing', FE: 'Framing + electrical', FI: 'Building final' } }

// The finished inspections of one trade on a job, oldest first (the last 8).
// → [{ id, name, date, result, state: 'pass' | 'fail' | 'other', inspector, note }]
export function inspectionsForTrade(proposal, trade) {
  const group = tradeGroup(trade)
  if (!group || !proposal) return []
  const out = []
  for (const p of allPermits(proposal)) {
    for (const ins of p.completed || []) {
      if (!tradesOf(p, ins).includes(group)) continue
      const notes = (ins.notes || []).map(n => String(n?.text || '').trim()).filter(Boolean)
      out.push({
        id: `${p.record || ''}:${ins.id || `${ins.code}-${ins.date}`}`,
        name: NAMES[group][ins.code] || ins.name || inspectionLabel(ins.code),
        date: ins.date || '', result: String(ins.result || '').trim(),
        state: isPassResult(ins.result) ? 'pass' : isFailResult(ins.result) ? 'fail' : 'other',
        inspector: ins.inspector || '',
        note: (notes[notes.length - 1] || '').slice(0, 500),
      })
    }
  }
  return out.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.id.localeCompare(b.id)).slice(-8)
}

// Bring every booking on a job up to date with the job's results.
// → { tasks (new list, or the same array when nothing changed), alert: [taskId] }
// `alert` holds one booking per sub that has a pass / fail it hasn't seen
// from the last few days (older results arriving late don't email anyone).
export function stampInspections(tasks, proposal, subs, { since } = {}) {
  let changed = false
  const alertBySub = new Map()
  const next = (tasks || []).map(t => {
    if (!t || t.paint || String(t.proposalId) !== String(proposal?.id)) return t
    const sub = (subs || []).find(s => String(s.id) === String(t.subId))
    const list = inspectionsForTrade(proposal, sub?.trade)
    const before = t.inspections || []
    if (JSON.stringify(list) === JSON.stringify(before)) return t
    changed = true
    const had = new Set(before.map(i => i.id))
    const news = list.some(i => !had.has(i.id) && i.state !== 'other' && (!since || (i.date || '') >= since))
    if (news) {
      const prev = alertBySub.get(String(t.subId))
      if (!prev || (t.createdAt || '') > (prev.createdAt || '')) alertBySub.set(String(t.subId), t)
    }
    return { ...t, inspections: list }
  })
  return { tasks: changed ? next : tasks, alert: [...alertBySub.values()].map(t => t.id) }
}

// The latest pass / fail on a booking (what an alert talks about).
export const latestResult = (task) => [...(task?.inspections || [])].reverse().find(i => i.state !== 'other') || null
