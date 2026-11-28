// ── Permit & inspection tracking ─────────────────────────────────────────────
// The rules (which permits and inspections a job has, the county results,
// when the pulse runs, finished jobs) live in lib/permitRules.js, which the
// server's county check shares; they are all passed on from here, so the app
// keeps importing them from this file. Only what needs the app's store is
// written here.
import { useStore } from '../store'
import { DEMO } from '../demo'

export * from './permitRules.js'

// 'edit' (Office / Admin), 'view' (PMs and sales reps) or null (everyone else)
export function usePermitAccess() {
  const me = useStore(s => s.me)
  // The admin switched Inspections off for this person (Settings › Team › Access).
  if (!DEMO && me?.permissions?.['projects.inspections'] === false) return null
  if (DEMO || me?.role === 'office' || me?.role === 'admin') return 'edit'
  // PMs and sales reps see where their jobs' inspections stand; only the office changes them.
  if (me?.role === 'pm' || me?.role === 'rep') return 'view'
  return null
}
