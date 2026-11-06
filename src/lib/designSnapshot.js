// ── The saved design travels with the proposal the customer receives ────────
// When a proposal link is created or sent, the drawing saved in the design
// editor (proposal_designs, see supabase/designs.sql) is copied into the
// customer's snapshot. The customer then sees exactly what was sent: later
// edits in the editor don't change it until the proposal is sent again.
import { supabase } from '../supabase'

export async function withSavedDesign(snapshot, proposalId) {
  if (!supabase || proposalId == null) return snapshot
  try {
    const { data, error } = await supabase.from('proposal_designs').select('data').eq('proposal_id', String(proposalId)).maybeSingle()
    const d = !error && data?.data
    if (!d || !Array.isArray(d.els) || !d.els.length) return snapshot
    // Off by default: the customer gets just the proposal unless the rep ticked
    // "Show on proposal" in the design editor.
    if (d.share !== true) return snapshot
    // Only the drawing itself: shapes, heights, angles, porch/patio options, finishes and
    // the customer's house as matched from a photo (numbers and colors; no photo).
    return { ...snapshot, design: { els: d.els, color: d.color || null, build: d.build || null, nextId: d.nextId || d.els.length + 1, house: d.house || null } }
  } catch {
    return snapshot      // never block sending a proposal over the drawing
  }
}

// Whether this proposal has a saved design, and whether it goes on the customer's link.
export async function designShareState(proposalId) {
  if (!supabase || proposalId == null) return { exists: false, share: false }
  try {
    const { data, error } = await supabase.from('proposal_designs').select('data').eq('proposal_id', String(proposalId)).maybeSingle()
    const d = !error && data?.data
    return { exists: !!(d && Array.isArray(d.els) && d.els.length), share: d?.share === true }
  } catch {
    return { exists: false, share: false }
  }
}

// Turn the design on or off for the customer's link (the same switch as "Show on proposal"
// in the design editor). Takes effect the next time the link is made or refreshed.
export async function setDesignShare(proposalId, share) {
  if (!supabase || proposalId == null) throw new Error('Not available')
  const { data, error } = await supabase.from('proposal_designs').select('data').eq('proposal_id', String(proposalId)).maybeSingle()
  if (error || !data?.data) throw new Error(error?.message || 'No saved design')
  const { error: e2 } = await supabase.from('proposal_designs').update({ data: { ...data.data, share: !!share } }).eq('proposal_id', String(proposalId))
  if (e2) throw new Error(e2.message)
}
