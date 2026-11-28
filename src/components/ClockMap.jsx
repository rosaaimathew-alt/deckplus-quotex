// ── Painters' time clock map ─────────────────────────────────────────────────
// Where each shift clocked in, clocked out and was every 30 minutes in
// between, with the job sites. Used by Money › Time clock and the paint PM's
// Crew › Hours (read-only there).
import { useEffect, useRef, useState } from 'react'
import { dayName, clockTime } from '../lib/timeClock'

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

export default function ClockMap({ shifts, sites, refused, radius, height = 'h-[420px]' }) {
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
      <div ref={box} className={`${height} w-full bg-gray-100`}>{!ready && <p className="p-4 text-sm text-gray-500">Loading the map…</p>}</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5 text-xs text-gray-600 border-t border-gray-100">
        {[['in', 'Clock in'], ['out', 'Clock out'], ['on', 'Check at the job'], ['off', 'Check away from the job'], ['refused', 'Refused punch'], ['site', 'Job site']].map(([k, l]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: COLORS[k] }} />{l}</span>
        ))}
      </div>
    </div>
  )
}
