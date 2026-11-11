// ── The paint PM's painters ──────────────────────────────────────────────────
// { id, name, crew: [{ name, email, phone, userId }] }: the painters the paint
// PM added (supabase/paint_crew.sql). userId is set once a painter has signed
// up; only then can they be put on a job.
import { useCallback, useEffect, useState } from 'react'
import { paintCrew } from '../supabase'
import { DEMO } from '../demo'

let _cache = null
const EMPTY = { id: null, name: 'Paint crew', crew: [] }

export function usePaintCrew() {
  const [data, setData] = useState(_cache)
  const reload = useCallback(() => {
    if (DEMO) return
    paintCrew().then(d => { _cache = d; setData(d) }).catch(() => { /* offline: keep what we had */ })
  }, [])
  useEffect(() => { reload() }, [reload])
  return { ...EMPTY, ...(data || {}), crew: data?.crew || [], loaded: !!data, reload }
}
