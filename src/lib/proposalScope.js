import { useStore } from '../store'

// ── Mine vs. the whole organization ──────────────────────────────────────────
// A rep's store only ever holds their own deals (the database decides). Office
// and admin see everyone's, and choose here whether the dashboard and pipeline
// show just their own deals ('mine', the default) or the organization's.
export function useScopedProposals() {
  const all        = useStore(s => s.proposals)
  const role       = useStore(s => s.role || 'manager')
  const me         = useStore(s => s.me)
  const officeView = useStore(s => s.officeView || 'mine')
  const setOfficeView = useStore(s => s.setOfficeView)
  const canChoose  = role === 'manager' && !!me
  const mineOnly   = canChoose && officeView === 'mine'
  return {
    proposals: mineOnly ? all.filter(p => p.ownerId === me.id) : all,
    canChoose, mineOnly, setMineOnly: (on) => setOfficeView(on ? 'mine' : 'everyone'),
  }
}
