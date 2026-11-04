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
    // Only the drawing itself: shapes, heights, angles and the decking color.
    return { ...snapshot, design: { els: d.els, color: d.color || null, nextId: d.nextId || d.els.length + 1 } }
  } catch {
    return snapshot      // never block sending a proposal over the drawing
  }
}
