// ── The saved design travels with the proposal the customer receives ────────
// When a proposal link is created or sent, the drawing saved in the design
// editor (proposal_designs, see supabase/designs.sql) is copied into the
// customer's snapshot. The customer then sees exactly what was sent: later
// edits in the editor don't change it until the proposal is sent again.
//
// It goes out on its own: a saved drawing is on the proposal unless the rep
// unticked "Show on proposal" (share === false). And a new version of a
// proposal (a revision) carries the drawing of the customer's earlier versions
// when it has none of its own: the latest one saved.
import { supabase } from '../supabase'
import { clientGroups } from './proposalGroups'

const usable = (d) => !!(d && Array.isArray(d.els) && d.els.length)
const shown = (d) => usable(d) && d.share !== false

// The ids of every version of this customer's proposal (this one first)
async function versionIds(proposalId) {
  try {
    const { useStore } = await import('../store')
    const all = useStore.getState().proposals || []
    const g = clientGroups(all).find(x => x.all.some(p => String(p.id) === String(proposalId)))
    const ids = g ? g.all.map(p => String(p.id)) : []
    return [String(proposalId), ...ids.filter(id => id !== String(proposalId))]
  } catch {
    return [String(proposalId)]
  }
}

// The saved row for this proposal's drawing: its own, else the latest saved on another version.
async function designRow(proposalId) {
  const ids = await versionIds(proposalId)
  const { data, error } = await supabase.from('proposal_designs').select('proposal_id, data, updated_at').in('proposal_id', ids)
  if (error || !data?.length) return null
  const own = data.find(r => String(r.proposal_id) === String(proposalId))
  if (own && usable(own.data)) return own
  return data.filter(r => usable(r.data)).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0] || null
}
const designFor = async (proposalId) => (await designRow(proposalId))?.data || null

export async function withSavedDesign(snapshot, proposalId) {
  if (!supabase || proposalId == null) return snapshot
  try {
    const d = await designFor(proposalId)
    if (!shown(d)) return snapshot
    // Only the drawing itself: shapes, heights, angles, porch/patio options, finishes and
    // the customer's house as matched from a photo (numbers and colors; no photo).
    return { ...snapshot, design: { els: d.els, color: d.color || null, build: d.build || null, nextId: d.nextId || d.els.length + 1, house: d.house || null } }
  } catch {
    return snapshot      // never block sending a proposal over the drawing
  }
}

// Whether this proposal has a saved design (its own or an earlier version's), and whether it goes on the customer's link.
export async function designShareState(proposalId) {
  if (!supabase || proposalId == null) return { exists: false, share: false }
  try {
    const d = await designFor(proposalId)
    return { exists: usable(d), share: shown(d) }
  } catch {
    return { exists: false, share: false }
  }
}

// Turn the design on or off for the customer's link (the same switch as "Show on proposal"
// in the design editor). Takes effect the next time the link is made or refreshed.
export async function setDesignShare(proposalId, share) {
  if (!supabase || proposalId == null) throw new Error('Not available')
  const row = await designRow(proposalId)      // the drawing may be saved on an earlier version
  if (!row?.data) throw new Error('No saved design')
  const { error: e2 } = await supabase.from('proposal_designs').update({ data: { ...row.data, share: !!share } }).eq('proposal_id', String(row.proposal_id))
  if (e2) throw new Error(e2.message)
}
