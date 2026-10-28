import { useEffect } from 'react'
import { useStore } from '../store'
import { DEMO } from '../demo'
import { startPulse } from '../lib/permitPulse'

// Runs the inspection pulse in the background for office / admin: the first
// screen open after 7 AM, and again after 1 PM (see lib/permitTracking.js).
export default function PermitPulse() {
  const me = useStore(s => s.me)
  const orgLoaded = useStore(s => s.orgLoaded)
  const canRun = !DEMO && orgLoaded && (me?.role === 'office' || me?.role === 'admin')

  useEffect(() => {
    if (!canRun) return
    const tick = () => { startPulse(me.displayName || me.email).catch(e => console.warn('[permit pulse]', e.message)) }
    const first = setTimeout(tick, 5000)            // let the app settle first
    const every = setInterval(tick, 10 * 60 * 1000) // and look again every 10 minutes
    return () => { clearTimeout(first); clearInterval(every) }
  }, [canRun, me?.displayName, me?.email])

  return null
}
