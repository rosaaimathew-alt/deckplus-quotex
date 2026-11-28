// ── Paint PM › Crew › Hours ──────────────────────────────────────────────────
// The paint PM's look at the crew's time clock: who is clocked in right now
// and at which job, each painter's hours for the pay week (Monday through
// Sunday), their shifts, and the map of where they clocked in and out. The
// same week the office sees (Money › Time clock), read-only: no fixing a
// shift, no payroll email or download. The database lets the paint role read
// the week (timeclock_week) and nothing more (supabase/time_clock.sql).
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, MapPin } from 'lucide-react'
import { timeclockWeek, mapJobSites } from '../supabase'
import { DEMO } from '../demo'
import { todayET, weekStartOf, addDaysStr, weekDays, dayName, clockTime, hm, summarize, gapsOf, offSitePings } from '../lib/timeClock'
import ClockMap from '../components/ClockMap'
import { Card, mapsUrl } from './shared'

const H2 = ({ children }) => <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">{children}</h2>

// What the office would look at on a painter's week
const flags = (w) => [
  w.autoOuts && `${w.autoOuts}× ended at 4:30`,
  w.gaps && `${w.gaps} gap${w.gaps > 1 ? 's' : ''} in location`,
  w.offSite && `${w.offSite} check${w.offSite > 1 ? 's' : ''} away from the job`,
  w.refusedOuts && `${w.refusedOuts} clock out${w.refusedOuts > 1 ? 's' : ''} refused`,
].filter(Boolean)

function Shift({ s }) {
  const g = gapsOf(s), off = offSitePings(s)
  return (
    <div className="py-2.5 text-sm">
      <p className="text-gray-900"><span className="font-semibold">{dayName(s.day)}</span> · {s.client || 'Job'}</p>
      {s.address && <p className="text-gray-500 truncate">{s.address}</p>}
      <p className="text-gray-800 tabular-nums">
        {clockTime(s.in)} – {s.out ? clockTime(s.out) : 'now'} · <strong>{hm(s.hours)}</strong>
        {s.autoOut && <span className="text-amber-700"> · ended at 4:30</span>}
      </p>
      {(off.length > 0 || g.length > 0 || s.note) && (
        <p className="text-xs text-gray-500">
          {off.length > 0 && <span className="text-red-600">{off.length} away from the job</span>}
          {g.length > 0 && <span className="text-amber-700">{off.length ? ' · ' : ''}no location {g.map(x => `${clockTime(x.from)}–${clockTime(x.to)}`).join(', ')}</span>}
          {s.note && <span>{off.length || g.length ? ' · ' : ''}{s.note}</span>}
        </p>
      )}
    </div>
  )
}

export default function CrewHours() {
  const thisWeek = weekStartOf(todayET())
  const [start, setStart] = useState(thisWeek)
  const [res, setRes] = useState({ key: null })   // { key: the week it is for, data | error }
  const [open, setOpen] = useState(null)          // a painter's line opened to their shifts

  useEffect(() => {
    let live = true
    const load = DEMO ? Promise.resolve({ start, shifts: [], sites: [], refused: [], radius: 300 }) : timeclockWeek(start)
    load.then(d => {
      // a shift still running: its hours so far
      const at = Date.now()
      const shifts = (d?.shifts || []).map(s => (s.out ? s : { ...s, hours: Math.max(0, (at - new Date(s.in)) / 3_600_000) }))
      if (live) setRes({ key: start, data: { ...d, shifts } })
    }).catch(e => { if (live) setRes({ key: start, error: e.message }) })
    return () => { live = false }
  }, [start])
  useEffect(() => { if (!DEMO) mapJobSites() }, [])

  const data = res.key === start ? res.data : null
  const error = res.key === start ? res.error || '' : ''
  const rows = useMemo(() => (data ? summarize(data.shifts, start) : []), [data, start])
  const now = useMemo(() => (data?.shifts || []).filter(s => !s.out), [data])
  const total = rows.reduce((a, w) => a + w.total, 0)
  const days = weekDays(start)
  const openRow = rows.find(w => (w.userId || w.worker) === open)
  const mapShifts = openRow ? openRow.shifts : (data?.shifts || [])
  const mapRefused = (data?.refused || []).filter(r => !openRow || r.userId === openRow.userId)
  const setWeek = (d) => { setStart(d); setOpen(null) }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        <button className="p-2 -ml-2 rounded-lg active:bg-gray-100" onClick={() => setWeek(addDaysStr(start, -7))} aria-label="Week before"><ChevronLeft size={22} /></button>
        <span className="flex-1 text-center text-base font-semibold text-gray-900 tabular-nums">{dayName(start)} – {dayName(addDaysStr(start, 6))}</span>
        <button className="p-2 -mr-2 rounded-lg active:bg-gray-100 disabled:opacity-30" disabled={start >= thisWeek} onClick={() => setWeek(addDaysStr(start, 7))} aria-label="Week after"><ChevronRight size={22} /></button>
      </div>
      {start !== thisWeek && <button className="text-sm text-[var(--brand-700)] font-semibold" onClick={() => setWeek(thisWeek)}>Back to this week</button>}

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>}
      {!data && !error && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</p>}

      {data && (
        <>
          {start === thisWeek && (
            <div className="space-y-2.5">
              <H2>Clocked in now ({now.length})</H2>
              {now.length === 0 && <p className="text-sm text-gray-500 px-1">Nobody is clocked in.</p>}
              {now.length > 0 && (
                <Card className="divide-y divide-gray-100 overflow-hidden">
                  {now.map(s => (
                    <div key={s.id} className="px-4 py-3 flex items-center gap-3">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-base font-medium text-gray-900 truncate">{s.worker}</span>
                        <span className="block text-sm text-gray-500 truncate">{s.client || 'Job'} · since {clockTime(s.in)}</span>
                      </span>
                      {s.address && <a href={mapsUrl(s.address)} target="_blank" rel="noreferrer" aria-label={`Map of ${s.client || 'the job'}`} className="p-2 text-[var(--brand-700)]"><MapPin size={20} /></a>}
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}

          <div className="space-y-2.5">
            <H2>Hours · {hm(total)}</H2>
            {rows.length === 0 && <p className="text-sm text-gray-500 px-1">Nobody clocked in this week.</p>}
            {rows.length > 0 && (
              <Card className="divide-y divide-gray-100 overflow-hidden">
                {rows.map(w => {
                  const key = w.userId || w.worker
                  const isOpen = open === key
                  const notes = flags(w)
                  return (
                    <div key={key}>
                      <button onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen}
                        className={`w-full px-4 py-3 flex items-center gap-3 text-left ${isOpen ? 'bg-[var(--brand-50)]' : 'active:bg-gray-50'}`}>
                        <span className="flex-1 min-w-0">
                          <span className="block text-base font-medium text-gray-900 truncate">{w.worker}{w.open && <span className="ml-2 text-xs font-semibold text-green-700">clocked in</span>}</span>
                          {notes.length > 0 && <span className="block text-xs text-amber-700">{notes.join(' · ')}</span>}
                        </span>
                        <span className="text-base font-bold text-gray-900 tabular-nums">{hm(w.total)}</span>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3">
                          <div className="grid grid-cols-7 gap-1 py-2 text-center">
                            {days.map(d => (
                              <div key={d}>
                                <p className="text-[11px] text-gray-500">{dayName(d, { weekday: 'short' })}</p>
                                <p className="text-sm tabular-nums text-gray-800">{w.days[d] ? hm(w.days[d]) : <span className="text-gray-300">–</span>}</p>
                              </div>
                            ))}
                          </div>
                          <div className="divide-y divide-gray-100 border-t border-gray-100">
                            {w.shifts.map(s => <Shift key={s.id} s={s} />)}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </Card>
            )}
          </div>

          {(data.shifts || []).length > 0 && (
            <div className="space-y-2.5">
              <H2>{openRow ? `Where ${openRow.worker} clocked in` : 'Where they clocked in'}</H2>
              <ClockMap shifts={mapShifts} sites={data.sites || []} refused={mapRefused} radius={data.radius || 300} height="h-[320px]" />
            </div>
          )}
        </>
      )}
    </div>
  )
}
