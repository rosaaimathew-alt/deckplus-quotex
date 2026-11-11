// ── Sub app: the signed-in sub's company crew ────────────────────────────────
// Shared by the crew screens (SubCrew) and the task screen (SubApp): is this
// login a company's PM, who is on their crew, and may they put crew on a task.
import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../store'
import { myCrew } from '../supabase'
import { DEMO } from '../demo'

let _cache = null
// { hasCrew, company, crew: [{ name, email, userId }] } for the signed-in sub.
export function useCrew() {
  const subs = useStore(s => s.subcontractors)
  const [data, setData] = useState(_cache)
  const reload = useCallback(() => {
    if (DEMO) return
    myCrew().then(d => { _cache = d; setData(d) }).catch(() => { /* offline: keep what we had */ })
  }, [])
  useEffect(() => { reload() }, [reload])
  if (DEMO) {
    const c = (subs || []).find(s => s?.hasCrew)
    return { hasCrew: !!c, company: c?.name, companyId: c?.id, crew: c?.crew || [], reload }
  }
  return { ...(data || { hasCrew: false, crew: [] }), reload }
}

// Is this task one the signed-in company PM can put their crew on?
export function useCanAssign(task) {
  const me = useStore(s => s.me)
  const crew = useCrew()
  if (!crew.hasCrew || !task) return null
  if (DEMO ? String(task.subId) !== String(crew.companyId) : task.subUserId !== me?.id) return null
  return crew
}
