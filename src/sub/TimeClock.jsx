// ── Time clock (painters) ────────────────────────────────────────────────────
// The first thing a painter sees in the sub app. One big button:
//
//   Clock in    the phone's location goes to the database, which clocks them
//               in at the nearest of their paint jobs, but only when they are
//               there (supabase/time_clock.sql)
//   Clock out   the same: only at the job. Away from it they're told the day
//               will end at 4:30 PM, which is what happens if they never do.
//
// While they're clocked in, the app sends the phone's location every 30
// minutes, and whenever it's opened again. A phone only shares its location
// while the app is open, so the office sees any stretch without one.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock, LogIn, LogOut, Loader2 } from 'lucide-react'
import { useStore } from '../store'
import { timeclockMe, timeclockIn, timeclockOut, timeclockPing, mapJobSites } from '../supabase'
import { DEMO } from '../demo'
import { tr, useLang } from '../lib/lang'
import { PING_MINUTES, hm } from '../lib/timeClock'

const fill = (s, vars) => Object.entries(vars).reduce((a, [k, v]) => a.replace(`{${k}}`, v ?? ''), s)

// 1609 m → "1 mile", 80 m → "260 feet"
function distance(m) {
  if (m == null) return ''
  const mi = m / 1609.34
  if (mi >= 0.1) return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} ${tr(mi >= 0.95 && mi < 1.05 ? 'mile' : 'miles')}`
  return `${Math.round(m * 3.281 / 10) * 10} ${tr('feet')}`
}

const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '')
const dayEndText = (hhmm) => { const [h, m] = String(hhmm || '16:30').split(':').map(Number); return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }

// The phone's location, or a reason it couldn't be had. A punch always asks
// for a fresh one (fresh = 0): a location from a minute ago could be from
// before they walked up to the job.
function locate(fresh = 0) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ error: 'unsupported' })
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }),
      (e) => resolve({ error: e.code === 1 ? 'denied' : e.code === 3 ? 'timeout' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: fresh })
  })
}

// What a refusal means, in the painter's words.
function why(r, dayEnd, action) {
  switch (r?.reason || r?.error) {
    case 'denied': return tr("Location is off for this app. Turn it on in your phone's settings (Location: While using the app), then try again.")
    case 'unsupported': return tr("This phone can't share its location.")
    case 'timeout': case 'unavailable': case 'no_location': return tr("Couldn't find your location. Step outside and try again.")
    case 'weak_gps': return fill(tr("Your phone's location isn't exact enough right now (about {d}). Step outside and try again."), { d: distance(r.acc) })
    case 'no_jobs': return tr("You're not on a paint job yet. Your paint PM puts you on jobs.")
    case 'not_mapped': return tr("Your job isn't on the map yet. Try again in a minute.")
    case 'off_site': return action === 'out'
      ? fill(tr("You're {d} from the job. Clock out at a job site (this one or your next job). If you don't, your day ends at {t}."), { d: distance(r.distance), t: dayEndText(dayEnd) })
      : fill(tr("You're {d} from your nearest paint job{job}. Clock in when you get there."), { d: distance(r.distance), job: r.client ? ` (${r.client})` : '' })
    case 'not_clocked_in': return tr("You're not clocked in.")
    default: return tr('Something went wrong. Try again.')
  }
}

// Put every job they can clock in at on the map, a few at a time (the paint
// PM has every open job; the first time can take a couple of minutes).
async function mapAll() {
  for (let i = 0; i < 30; i++) {
    const r = await mapJobSites()
    if (!r?.missing) return
  }
}

// demo: a fake clock that lets every punch through
const demoClock = { open: null, today: [], week: 0, lastPing: null, dayEnd: '16:30', jobs: [{ client: 'Demo job', mapped: true }] }

export default function TimeClock() {
  useLang()
  const tasks = useStore(s => s.subTasks)
  const me = useStore(s => s.me)
  // A painter on paint jobs, or the paint PM (who clocks in at any open job)
  const isPainter = me?.role === 'paint' || (tasks || []).some(t => t && t.paint && (!me?.id || t.crewUserId === me.id || t.subUserId === me.id))
  const [st, setSt] = useState(DEMO ? demoClock : null)
  const [busy, setBusy] = useState('')     // 'in' | 'out' while finding the location / saving
  const [msg, setMsg] = useState(null)     // { tone: 'bad' | 'ok', text }
  const [confirmOut, setConfirmOut] = useState(false)   // Clock out asks first: one stray tap shouldn't end the day
  const [, tick] = useState(0)
  const mapped = useRef(false)

  // off: the time clock isn't in the database yet (supabase/time_clock.sql),
  // so the card stays hidden instead of loading forever
  const [off, setOff] = useState(false)
  const load = useCallback(async () => {
    if (DEMO) return null
    try { const s = await timeclockMe(); setSt(s); return s } catch (err) {
      if (/does not exist|schema cache|Could not find the function/i.test(String(err?.message))) setOff(true)
      return null
    }
  }, [])

  // Load, and get any of their jobs onto the map first if they aren't yet
  useEffect(() => {
    if (!isPainter || DEMO) return
    load().then(s => {
      if (s?.jobs?.some(j => !j.mapped) && !mapped.current) { mapped.current = true; mapAll().then(load) }
    })
  }, [isPainter, load])

  // While clocked in: the location every 30 minutes, and on opening the app
  const open = st?.open
  const pinging = useRef(false)
  const ping = useCallback(async (force) => {
    if (DEMO || !open || pinging.current) return
    const last = st?.lastPing ? new Date(st.lastPing).getTime() : new Date(open.in).getTime()
    if (!force && Date.now() - last < PING_MINUTES * 60_000) return
    pinging.current = true
    try {
      const pos = await locate(60_000)
      if (pos.error) return
      const r = await timeclockPing(pos)
      if (r?.ok) setSt(s => (s ? { ...s, lastPing: r.lastPing || new Date().toISOString() } : s))
    } catch { /* next round */ } finally { pinging.current = false }
  }, [open, st?.lastPing])
  useEffect(() => {
    if (!open) return
    const every = setInterval(() => { tick(n => n + 1); ping(false) }, 60_000)
    const back = () => { if (document.visibilityState === 'visible') { load(); ping(Date.now() - new Date(st?.lastPing || open.in).getTime() > 10 * 60_000) } }
    document.addEventListener('visibilitychange', back)
    ping(false)
    return () => { clearInterval(every); document.removeEventListener('visibilitychange', back) }
  }, [open, ping, load, st?.lastPing])

  // Nothing until it has loaded: no flash of an empty card on opening the app
  if (!isPainter || off || !st) return null

  const punch = async (action) => {
    setBusy(action); setMsg(null)
    try {
      let pos = await locate()
      // The paint PM clocks in and out wherever they are, with or without a location
      if (pos.error && me?.role === 'paint') pos = { lat: null, lng: null, acc: null }
      if (pos.error) { setMsg({ tone: 'bad', text: why(pos, st?.dayEnd, action) }); return }
      if (DEMO) {
        const now = new Date().toISOString()
        setSt(s => action === 'in' ? { ...s, open: { in: now, client: 'Demo job', hours: 0 }, lastPing: now } : { ...s, open: null, today: [...s.today, { ...s.open, out: now }] })
        return
      }
      let r = await (action === 'in' ? timeclockIn(pos) : timeclockOut(pos))
      // A job not on the map yet: map what's left, then try once more
      if (!r?.ok && action === 'in' && (r?.reason === 'not_mapped' || (r?.reason === 'off_site' && r?.unmapped > 0))) { await mapAll(); r = await timeclockIn(pos) }
      if (!r?.ok) { setMsg({ tone: 'bad', text: why(r, st?.dayEnd, action) }); return }
      // Clocked in shows on the card itself; clocking out gets a line
      setMsg(action === 'out' ? { tone: 'ok', text: fill(tr('Clocked out at {t}. {h} hours on this job.'), { t: time(r.shift?.out), h: hm(r.shift?.hours) }) } : null)
      await load()
    } catch (err) {
      setMsg({ tone: 'bad', text: String(err?.message || '') || tr('Something went wrong. Try again.') })
    } finally { setBusy('') }
  }

  const todayHours = (st?.today || []).reduce((a, s) => a + Number(s.hours || 0), 0)
  const autoToday = (st?.today || []).some(s => s.autoOut)

  return (
    <section className={`rounded-2xl border shadow-sm p-4 space-y-3 ${open ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center gap-2">
        <Clock size={20} className={open ? 'text-green-700' : 'text-gray-500'} />
        <h2 className="text-base font-bold text-gray-900 flex-1">{tr('Time clock')}</h2>
        {st && <span className="text-sm text-gray-600">{tr('This week')} <strong className="text-gray-900">{hm(st.week)}</strong></span>}
      </div>

      {open ? (
        <div>
          <p className="text-3xl font-bold text-gray-900 tabular-nums">{hm((Date.now() - new Date(open.in)) / 3_600_000)}</p>
          <p className="text-sm text-gray-700">{fill(tr('Clocked in at {t}'), { t: time(open.in) })}{open.client ? ` · ${open.client}` : ''}</p>
        </div>
      ) : (
        <p className="text-sm text-gray-700">{todayHours > 0 ? fill(tr('Today: {h} hours. Not clocked in now.'), { h: hm(todayHours) }) : tr('Not clocked in.')}</p>
      )}
      {autoToday && !open && <p className="text-sm text-amber-700">{fill(tr("You didn't clock out at the job, so your day ended at {t}."), { t: dayEndText(st?.dayEnd) })}</p>}

      {msg && <p role="status" className={`text-sm rounded-xl px-3 py-2 ${msg.tone === 'bad' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-white text-green-800 border border-green-200'}`}>{msg.text}</p>}

      {st && open && confirmOut && !busy ? (
        <div className="rounded-xl border border-gray-300 bg-white p-3 space-y-2">
          <p className="text-base font-semibold text-gray-900">{tr('Clock out now?')}</p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setConfirmOut(false)} className="min-h-[52px] rounded-xl border border-gray-300 bg-white text-base font-semibold text-gray-800 active:bg-gray-50">{tr('Keep working')}</button>
            <button onClick={() => { setConfirmOut(false); punch('out') }} className="min-h-[52px] rounded-xl bg-gray-900 text-white text-base font-bold active:bg-black">{tr('Yes, clock out')}</button>
          </div>
        </div>
      ) : st && (
        <button onClick={() => (open ? setConfirmOut(true) : punch('in'))} disabled={!!busy}
          className={`w-full min-h-[56px] rounded-xl text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-70 ${open ? 'bg-gray-900 text-white active:bg-black' : 'bg-[var(--brand-600)] text-white active:bg-[var(--brand-700)]'}`}>
          {busy ? <><Loader2 size={20} className="animate-spin" /> {tr('Finding your location…')}</>
            : open ? <><LogOut size={20} /> {tr('Clock out')}</> : <><LogIn size={20} /> {tr('Clock in')}</>}
        </button>
      )}
      {!open && st && <p className="text-xs text-gray-500">{tr('You can only clock in and out at the job site.')}</p>}
    </section>
  )
}
