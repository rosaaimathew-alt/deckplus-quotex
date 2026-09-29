import { useState, useEffect } from 'react'
import { supabase } from './supabase'

// Tracks the current Supabase auth session. { loading, session }.
export function useSession() {
  const [state, setState] = useState({ loading: true, session: null })

  useEffect(() => {
    if (!supabase) { setState({ loading: false, session: null }); return }
    let alive = true
    supabase.auth.getSession().then(({ data }) => { if (alive) setState({ loading: false, session: data.session }) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive) setState({ loading: false, session })
    })
    return () => { alive = false; sub.subscription.unsubscribe() }
  }, [])

  return state
}
