import { useStore } from '../store'

// ── Whose deals: one rep, or the whole organization ─────────────────────────
// A rep's store only ever holds their own deals (the database decides). Office
// and admin see everyone's, and pick here whose deals the dashboard and
// pipeline show: one rep's, or everyone's ('everyone', the default).
// includeImported: keep jobs imported from the office's sheet (no sales rep);
// they show under All only, since no rep owns them.
export function useScopedProposals({ includeImported = false } = {}) {
  const all        = useStore(s => s.proposals)
  const role       = useStore(s => s.role || 'manager')
  const me         = useStore(s => s.me)
  const members    = useStore(s => s.members)
  const officeView = useStore(s => s.officeView || 'everyone')
  const setOfficeView = useStore(s => s.setOfficeView)
  const canChoose  = role === 'manager' && !!me
  // The people to choose from: every sales rep, plus anyone who has written a proposal.
  const owners = new Set(all.map(p => p.ownerId))
  const reps = (members || [])
    .filter(m => m.role === 'rep' || owners.has(m.id))
    .map(m => ({ id: m.id, name: m.displayName || (m.email || '').split('@')[0] || 'Unnamed' }))
    .sort((a, b) => a.name.localeCompare(b.name))
  // 'mine' (the old default) means the signed-in person.
  const wanted = officeView === 'mine' ? me?.id : officeView
  const repId  = !canChoose || wanted === 'everyone' ? null : (reps.some(r => r.id === wanted) || wanted === me?.id ? wanted : null)
  return {
    // Jobs imported from the office's sheet aren't proposals — keep them out of sales views
    proposals: (repId ? all.filter(p => p.ownerId === repId) : all).filter(p => includeImported || p.status !== 'Imported'),
    canChoose, reps, repId, me,
    mineOnly: !!repId && repId === me?.id,
    repName: repId ? (reps.find(r => r.id === repId)?.name || '') : '',
    setRep: (id) => setOfficeView(id || 'everyone'),
  }
}

// One proposal per client — see src/lib/proposalGroups.js
export { latestIterations } from './proposalGroups'
