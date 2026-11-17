// ── Reminders to sign a contract: what the screens read ─────────────────────
// (supabase/contract_reminders.sql; set in components/SendContract.jsx)
import { supabase } from '../supabase'

// "Reminders daily · 1 of 10 sent", for a contract row.
export const reminderLine = (r) => (r?.everyDays
  ? `Reminders ${r.everyDays === 1 ? 'daily' : `every ${r.everyDays} days`} · ${r.sentCount || 0} of ${r.maxCount || 3} sent`
  : '')

// The reminders on the contracts this person can see, by proposal id.
export async function loadContractReminders() {
  if (!supabase) return {}
  const { data } = await supabase.rpc('contract_reminders_mine')
  return Object.fromEntries((Array.isArray(data) ? data : []).map(r => [String(r.proposalId), r]))
}
