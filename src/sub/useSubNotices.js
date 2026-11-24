// The office's notices to every sub showing now (supabase/sub_notices.sql)
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { DEMO } from '../demo'

let ask = null
// The notices showing now (one ask a minute, however many screens use it)
export function useSubNotices() {
  const [list, setList] = useState([])
  useEffect(() => {
    if (DEMO || !supabase) return
    if (!ask) {
      ask = supabase.from('sub_notices').select('id, title, body, title_es, body_es, expires_at')
        .gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false })
        .then(({ data }) => data || [], () => [])
      setTimeout(() => { ask = null }, 60_000)
    }
    let live = true
    ask.then(d => { if (live) setList(d) })
    return () => { live = false }
  }, [])
  const now = new Date()
  return list.filter(n => new Date(n.expires_at) > now)
}
