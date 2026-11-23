// ── Money › Time clock ───────────────────────────────────────────────────────
// The painters' hours for payroll, one pay week (Wednesday through Tuesday) at
// a time: hours by painter and day, every shift, and a map of where each one
// clocked in, clocked out and was every 30 minutes in between. The same week
// is emailed to the office every Wednesday morning (api/_timeclock.js).
//
// What to look at is marked on the painter's line: a day that ended at 4:30
// because they didn't clock out at the job, a stretch with no location (the
// app was closed), a location check away from the job.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import StatCard from '../../components/StatCard'
import { timeclockWeek, timeclockSetPayrollTo, mapJobSites } from '../../supabase'
import { DEMO } from '../../demo'
import { todayET, weekStartOf, addDaysStr, weekDays, dayName, clockTime, hm, summarize, payrollCsv, gapsOf, offSitePings } from '../../lib/timeClock'
import { PageHead, Toolbar, btnHead, inputCls } from './ui'

const feet = (m) => (m == null ? '' : m >= 161 ? `${(m / 1609.34).toFixed(1)} mi` : `${Math.round(m * 3.281)} ft`)

// Leaflet from the CDN, once (the Insights map loads the same copy)
function useLeaflet() {
  const [ready, setReady] = useState(!!window.L)
  useEffect(() => {
    if (window.L) return
    if (!document.getElementById('leaflet-css')) {
      document.head.appendChild(Object.assign(document.createElement('link'), { id: 'leaflet-css', rel: 'stylesheet', href: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css' }))
    }
    let s = document.getElementById('leaflet-js')
    if (!s) { s = Object.assign(document.createElement('script'), { id: 'leaflet-js', src: 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js' }); document.head.appendChild(s) }
    const done = () => setReady(!!window.L)
    s.addEventListener('load', done)
    return () => s.removeEventListener('load', done)
  }, [])
  return ready
}

const COLORS = { in: '#16a34a', out: '#111827', auto: '#d97706', on: '#22c55e', off: '#dc2626', refused: '#f97316', site: '#2563eb' }

function ClockMap({ shifts, sites, refused, radius }) {
  const ready = useLeaflet()
  const box = useRef(null), map = useRef(null), layer = useRef(null)
  useEffect(() => {
    if (!ready || !box.current || map.current) return
    const L = window.L
    map.current = L.map(box.current, { scrollWheelZoom: false })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    map.current.setView([35.22, -80.84], 10)
  }, [ready])
  useEffect(() => {
    const L = window.L
    if (!ready || !map.current || !layer.current) return
    layer.current.clearLayers()
    const pts = []
    const dot = (lat, lng, color, size, html) => {
      if (lat == null || lng == null) return
      pts.push([lat, lng])
      L.circleMarker([lat, lng], { radius: size, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 }).bindPopup(html).addTo(layer.current)
    }
    const jobs = new Set(shifts.map(s => s.proposalId))
    for (const j of sites.filter(x => jobs.has(x.proposalId) && x.lat != null)) {
      pts.push([j.lat, j.lng])
      L.circle([j.lat, j.lng], { radius, color: COLORS.site, weight: 1, fillOpacity: 0.08 }).bindPopup(`<b>Job site</b><br>${j.address}`).addTo(layer.current)
    }
    for (const s of shifts) {
      const who = `<b>${s.worker}</b> · ${s.client || ''}<br>${dayName(s.day)}`
      for (const p of s.pings.filter(p => p.kind === 'ping' || p.kind === 'out_refused')) {
        dot(p.lat, p.lng, p.kind === 'out_refused' ? COLORS.refused : p.onSite === false ? COLORS.off : COLORS.on, 5,
          `${who}<br>${p.kind === 'out_refused' ? 'Tried to clock out away from the job' : 'Location check'} ${clockTime(p.at)}${p.dist != null ? ` · ${feet(p.dist)} from the job` : ''}`)
      }
      dot(s.inLat, s.inLng, COLORS.in, 8, `${who}<br>Clocked in ${clockTime(s.in)}${s.inDist != null ? ` · ${feet(s.inDist)} from the job` : ''}`)
      if (s.out && !s.autoOut) dot(s.outLat, s.outLng, COLORS.out, 8, `${who}<br>Clocked out ${clockTime(s.out)}${s.outDist != null ? ` · ${feet(s.outDist)} from the job` : ''}`)
    }
    for (const r of refused) dot(r.lat, r.lng, COLORS.refused, 5, `<b>${r.worker}</b><br>Tried to clock in away from a job ${clockTime(r.at)}${r.dist != null ? ` · ${feet(r.dist)} from the nearest` : ''}`)
    if (pts.length) map.current.fitBounds(pts, { padding: [30, 30], maxZoom: 17 })
  }, [ready, shifts, sites, refused, radius])
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div ref={box} className="h-[420px] w-full bg-gray-100">{!ready && <p className="p-4 text-sm text-gray-500">Loading the map…</p>}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5 text-xs text-gray-600 border-t border-gray-100">
        {[['in', 'Clock in'], ['out', 'Clock out'], ['on', 'Check at the job'], ['off', 'Check away from the job'], ['refused', 'Refused punch'], ['site', 'Job site']].map(([k, l]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COLORS[k] }} />{l}</span>
        ))}
      </div>
    </div>
  )
}

function PayrollTo({ emails, onSaved }) {
  const [edit, setEdit] = useState(false)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  if (!edit) {
    return (
      <p className="text-sm text-gray-600">Emailed Wednesdays to <strong className="text-gray-900">{emails.length ? emails.join(', ') : 'nobody yet'}</strong>{' '}
        <button className="text-[var(--brand-700)] font-semibold hover:underline" onClick={() => { setText(emails.join(', ')); setErr(''); setEdit(true) }}>Change</button></p>
    )
  }
  const save = async () => {
    try { onSaved(await timeclockSetPayrollTo(text.split(/[\s,;]+/).filter(Boolean))); setEdit(false) } catch (e) { setErr(e.message) }
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input className={`${inputCls} w-72`} value={text} onChange={e => setText(e.target.value)} placeholder="name@deck.plus" autoFocus />
      <button className={btnHead} onClick={save}>Save</button>
      <button className="text-sm text-gray-500" onClick={() => setEdit(false)}>Cancel</button>
      {err && <span className="text-sm text-red-600">{err}</span>}
    </div>
  )
}

export default function TimeClock() {
  const [params, setParams] = useSearchParams()
  const start = weekStartOf(/^\d{4}-\d{2}-\d{2}$/.test(params.get('week') || '') ? params.get('week') : todayET())
  const [res, setRes] = useState({ key: null })   // { key: the week it is for, data | error }
  const [who, setWho] = useState(null)   // a painter's userId: the map and shifts show only theirs
  const [day, setDay] = useState('')

  const setWeek = (d) => { const p = new URLSearchParams(params); p.set('week', d); setParams(p, { replace: true }); setWho(null); setDay('') }

  useEffect(() => {
    let live = true
    const load = DEMO ? Promise.resolve({ start, shifts: [], sites: [], refused: [], payrollTo: [], radius: 300 }) : timeclockWeek(start)
    load.then(d => { if (live) setRes({ key: start, data: d }) }).catch(e => { if (live) setRes({ key: start, error: e.message }) })
    return () => { live = false }
  }, [start])
  const data = res.key === start ? res.data : null
  const error = res.key === start ? res.error || '' : ''
  // Get the paint jobs with painters on them onto the map ahead of time
  useEffect(() => { if (!DEMO) mapJobSites() }, [])

  const rows = useMemo(() => (data ? summarize(data.shifts, start) : []), [data, start])
  const shown = useMemo(() => (data?.shifts || []).filter(s => (!who || s.userId === who) && (!day || s.day === day)), [data, who, day])
  const refused = useMemo(() => (data?.refused || []).filter(r => (!who || r.userId === who) && (!day || r.at && todayET(new Date(r.at)) === day)), [data, who, day])
  const days = weekDays(start)
  const total = rows.reduce((a, w) => a + w.total, 0)
  const autoOuts = rows.reduce((a, w) => a + w.autoOuts, 0)
  const gaps = rows.reduce((a, w) => a + w.gaps, 0)
  const thisWeek = weekStartOf(todayET())

  const download = () => {
    const blob = new Blob([payrollCsv(rows, start)], { type: 'text/csv' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `painters-hours-${start}.csv` })
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <div className="space-y-5">
      <PageHead title="Time clock">
        <button className={btnHead} onClick={download} disabled={!rows.length}><Download size={16} /> Download for payroll</button>
      </PageHead>

      <Toolbar
        left={
          <div className="flex items-center gap-1">
            <button className="p-2 rounded-lg hover:bg-gray-100" onClick={() => setWeek(addDaysStr(start, -7))} aria-label="Week before"><ChevronLeft size={18} /></button>
            <span className="text-[15px] font-semibold text-gray-900 tabular-nums">{dayName(start)} – {dayName(addDaysStr(start, 6))}</span>
            <button className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30" disabled={start >= thisWeek} onClick={() => setWeek(addDaysStr(start, 7))} aria-label="Week after"><ChevronRight size={18} /></button>
            {start !== thisWeek && <button className="ml-2 text-sm text-[var(--brand-700)] font-semibold hover:underline" onClick={() => setWeek(thisWeek)}>This week</button>}
          </div>
        }
        right={data && <PayrollTo emails={data.payrollTo || []} onSaved={(to) => setRes(r => ({ ...r, data: { ...r.data, payrollTo: to } }))} />}
      />

      {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{/does not exist|schema cache/i.test(error) ? "The time clock isn't set up in the database yet (supabase/time_clock.sql)." : error}</p>}
      {!data && !error && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Hours" value={hm(total)} sub={start === thisWeek ? 'so far this week' : 'for the week'} />
            <StatCard label="Painters" value={rows.length} />
            <StatCard label="Days ended at 4:30" value={autoOuts} tone={autoOuts ? 'text-amber-700' : 'text-gray-900'} sub="didn't clock out at the job" />
            <StatCard label="Gaps in location" value={gaps} tone={gaps ? 'text-amber-700' : 'text-gray-900'} sub="45+ minutes, app closed" />
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 border-b border-gray-200">
                  <th className="px-4 py-3">Painter</th>
                  {days.map(d => (
                    <th key={d} className="px-2 py-3 text-right whitespace-nowrap">
                      <button onClick={() => setDay(day === d ? '' : d)} className={`hover:text-gray-900 ${day === d ? 'text-[var(--brand-700)] underline' : ''}`}>{dayName(d)}</button>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">Nobody clocked in this week.</td></tr>}
                {rows.map(w => {
                  const notes = [w.open && 'clocked in now', w.autoOuts && `${w.autoOuts}× ended at 4:30`, w.gaps && `${w.gaps} gap${w.gaps > 1 ? 's' : ''}`,
                    w.offSite && `${w.offSite} check${w.offSite > 1 ? 's' : ''} away`, w.refusedOuts && `${w.refusedOuts} clock out${w.refusedOuts > 1 ? 's' : ''} refused`].filter(Boolean)
                  return (
                    <tr key={w.userId || w.worker} onClick={() => setWho(who === w.userId ? null : w.userId)}
                      className={`border-b border-gray-100 cursor-pointer ${who === w.userId ? 'bg-[var(--brand-50)]' : 'hover:bg-gray-50'}`}>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{w.worker}</p>
                        {notes.length > 0 && <p className="text-xs text-amber-700">{notes.join(' · ')}</p>}
                      </td>
                      {days.map(d => <td key={d} className="px-2 py-3 text-right tabular-nums text-gray-700">{w.days[d] ? hm(w.days[d]) : <span className="text-gray-300">–</span>}</td>)}
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">{hm(w.total)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="grid lg:grid-cols-5 gap-4 items-start">
            <div className="lg:col-span-3">
              <ClockMap shifts={shown} sites={data.sites || []} refused={refused} radius={data.radius || 300} />
            </div>
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-[460px] overflow-y-auto">
              <p className="px-4 py-3 text-sm font-semibold text-gray-900">
                {who ? rows.find(r => r.userId === who)?.worker : 'Every painter'}{day ? ` · ${dayName(day)}` : ''}
                {(who || day) && <button className="ml-2 text-xs font-medium text-[var(--brand-700)] hover:underline" onClick={() => { setWho(null); setDay('') }}>Show all</button>}
              </p>
              {shown.length === 0 && <p className="px-4 py-6 text-sm text-gray-500">No shifts.</p>}
              {shown.map(s => {
                const g = gapsOf(s), off = offSitePings(s), checks = s.pings.filter(p => p.kind === 'ping').length
                return (
                  <div key={s.id} className="px-4 py-3 text-sm">
                    <p className="font-semibold text-gray-900">{s.worker} · {dayName(s.day)}</p>
                    <p className="text-gray-600 truncate">{s.client}{s.address ? ` · ${s.address}` : ''}</p>
                    <p className="text-gray-800 tabular-nums">
                      {clockTime(s.in)} – {s.out ? clockTime(s.out) : 'now'} · <strong>{hm(s.hours)}</strong>
                      {s.autoOut && <span className="text-amber-700"> · didn't clock out at the job, ended at 4:30</span>}
                    </p>
                    <p className="text-xs text-gray-500">{checks} location check{checks === 1 ? '' : 's'}{off.length ? <span className="text-red-600"> · {off.length} away from the job</span> : ''}
                      {g.length > 0 && <span className="text-amber-700"> · no location {g.map(x => `${clockTime(x.from)}–${clockTime(x.to)}`).join(', ')}</span>}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
