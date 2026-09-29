import { useMemo, useState, useRef, useEffect } from 'react'
import { useStore } from '../store'
import { wonRevenueOf } from '../contractTotal'
import { TrendingUp, DollarSign, Award, XCircle, Target, Plus, ChevronDown, ChevronUp, Trash2, Clock, MapPin, Settings2, Pencil, Check, X, MoreHorizontal, BarChart3 } from 'lucide-react'

// ── Sales Heat Map ────────────────────────────────────────────────────────────
const GEO_CACHE_KEY = 'quotex-geo-cache'
function geoCache() { try { return JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || '{}') } catch { return {} } }
function saveGeo(c) { try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(c)) } catch {} }
function extractZip(addr) { return addr?.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? null }
function extractCity(addr) {
  if (!addr?.trim()) return null
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean)
  let candidate = parts.length >= 3 ? parts[parts.length - 2] : parts.length === 2 ? parts[1] : null
  if (!candidate) return null
  // Strip trailing ZIP and state abbreviation
  candidate = candidate.replace(/\b\d{5}(?:-\d{4})?\b/, '').replace(/\b[A-Z]{2}\b/, '').trim()
  // Reject if it's empty or still just a 2-letter state code
  if (!candidate || /^[A-Z]{2}$/.test(candidate)) return null
  return candidate
}

const REGION_BOUNDS = [[32.0, -85.0], [36.6, -75.4]]

function areaColor(ratio) {
  if (ratio <= 0.2)  return '#c7d2fe'
  if (ratio <= 0.45) return '#818cf8'
  if (ratio <= 0.7)  return '#4f46e5'
  return '#1e1b4b'
}

function SalesHeatMap({ proposals }) {
  const mapRef      = useRef(null)
  const instanceRef = useRef(null)
  const layersRef   = useRef([])
  const [leafletLoaded, setLeafletLoaded] = useState(false)
  const [mapMounted,    setMapMounted]    = useState(false)
  const [points,   setPoints]   = useState([])
  const [mapping,  setMapping]  = useState(false)
  const [view,     setView]     = useState('map')
  const [filter,   setFilter]   = useState('all')

  // Step 1: load Leaflet scripts/css into the page
  useEffect(() => {
    if (window.L) { setLeafletLoaded(true); return }
    if (!document.getElementById('leaflet-css')) {
      const l = document.createElement('link')
      l.id = 'leaflet-css'; l.rel = 'stylesheet'
      l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(l)
    }
    if (!document.getElementById('leaflet-js')) {
      const s = document.createElement('script'); s.id = 'leaflet-js'
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      s.onload = () => setLeafletLoaded(true)
      document.head.appendChild(s)
    }
  }, [])

  // Step 2: init map only after BOTH Leaflet is loaded AND the div is in the DOM
  useEffect(() => {
    if (!leafletLoaded || !mapMounted || !mapRef.current || instanceRef.current) return
    const L = window.L
    instanceRef.current = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(instanceRef.current)
    instanceRef.current.fitBounds(REGION_BOUNDS)
  }, [leafletLoaded, mapMounted])

  // Step 3: geocode addresses (lat/lng + ZIP extracted from response)
  useEffect(() => {
    const withAddr = proposals.filter(p => (p.address || p.contractDraft?.address)?.trim())
    if (!withAddr.length) return
    const cache = geoCache()
    const toPoint = p => {
      const addr = p.address || p.contractDraft?.address
      const c = cache[addr]
      if (!c) return null
      return { lat: c.lat, lng: c.lng, zip: c.zip || extractZip(addr), city: extractCity(addr), revenue: p.status === 'Won' ? wonRevenueOf(p) : Number(p.total||0), status: p.status, isHistorical: !!p.isHistorical, client: p.client || p.contractDraft?.client || '' }
    }
    setPoints(withAddr.map(toPoint).filter(Boolean))
    const uncached = withAddr.filter(p => !cache[p.address || p.contractDraft?.address])
    if (!uncached.length) return
    setMapping(true)
    ;(async () => {
      for (const p of uncached) {
        const addr = (p.address || p.contractDraft?.address).trim()
        try {
          const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&addressdetails=1&viewbox=-85.0,32.0,-75.4,36.6&bounded=1&q=${encodeURIComponent(addr)}`)
          const data = await res.json()
          if (data[0]) {
            const zip = data[0].address?.postcode?.slice(0,5) || extractZip(addr)
            cache[addr] = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), zip }
            saveGeo(cache)
            setPoints(prev => [...prev, { lat: cache[addr].lat, lng: cache[addr].lng, zip, city: extractCity(addr), revenue: p.status === 'Won' ? wonRevenueOf(p) : Number(p.total||0), status: p.status, isHistorical: !!p.isHistorical, client: p.client || p.contractDraft?.client || '' }])
          }
        } catch {}
        await new Promise(r => setTimeout(r, 1100))
      }
      setMapping(false)
    })()
  }, [proposals])

  // Step 4: draw circle markers grouped by ZIP whenever points or filter changes
  const activePoints = filter === 'won' ? points.filter(p => p.status === 'Won') : points

  useEffect(() => {
    if (!instanceRef.current) return
    const L = window.L; const map = instanceRef.current
    layersRef.current.forEach(l => { try { map.removeLayer(l) } catch {} })
    layersRef.current = []
    if (!activePoints.length) return

    const groups = {}
    activePoints.forEach(p => {
      // Group by ~1km grid square — works regardless of address format
      const key = `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`
      const safeCity = (p.city && p.city.length > 2 && !/^[A-Z]{2}$/.test(p.city.trim())) ? p.city : null
      const label = p.zip ? `ZIP ${p.zip}` : (safeCity || 'Unknown area')
      if (!groups[key]) groups[key] = { lat: 0, lng: 0, n: 0, count: 0, revenue: 0, label, clients: [] }
      groups[key].lat += p.lat; groups[key].lng += p.lng
      groups[key].count++; groups[key].n++; groups[key].revenue += p.revenue
      groups[key].clients.push(p.client || p.address || '(no name on file)')
    })
    const max = Math.max(...Object.values(groups).map(g => g.count), 1)

    Object.values(groups).forEach(g => {
      const ratio  = g.count / max
      const color  = areaColor(ratio)
      const lat    = g.lat / g.n; const lng = g.lng / g.n
      const radius = 10 + ratio * 26
      const clientLines = g.clients.length
        ? `<div style="margin-top:4px;border-top:1px solid #e5e7eb;padding-top:4px">${g.clients.map(c => `· ${c}`).join('<br>')}</div>`
        : ''
      const layer  = L.circleMarker([lat, lng], {
        radius, fillColor: color, fillOpacity: 0.78, color: '#fff', weight: 2,
      }).bindPopup(
        `<div style="font-family:sans-serif;font-size:13px;line-height:1.7;min-width:160px">` +
        `<b>${g.label}</b><br>${g.count} proposal${g.count !== 1 ? 's' : ''} · $${(g.revenue/1000).toFixed(0)}k` +
        clientLines + `</div>`,
        { maxWidth: 240 }
      ).addTo(map)
      layersRef.current.push(layer)
    })
  }, [activePoints, mapMounted])

  useEffect(() => () => { instanceRef.current?.remove(); instanceRef.current = null }, [])

  // List view
  const listProposals = filter === 'won' ? proposals.filter(p => p.status === 'Won') : proposals
  const cityMap = {}
  listProposals.forEach(p => {
    const raw  = extractCity(p.address || p.contractDraft?.address)
    const city = (raw && raw.length > 2 && !/^[A-Z]{2}$/.test(raw)) ? raw : '— Address needs city —'
    if (!cityMap[city]) cityMap[city] = { city, count: 0, won: 0, revenue: 0, active: 0 }
    cityMap[city].count++
    if (p.status === 'Won') { cityMap[city].won++; cityMap[city].revenue += wonRevenueOf(p) }
    else if (p.status !== 'Lost' && p.status !== 'MIA' && !p.closedAt) cityMap[city].active++
  })
  const cities   = Object.values(cityMap).sort((a, b) => b.count - a.count)
  const maxCount = cities[0]?.count || 1
  const withAddr = proposals.filter(p => (p.address || p.contractDraft?.address)?.trim()).length
  if (withAddr === 0) return null

  const tabBtn = (setter, val, cur, label) => (
    <button onClick={() => setter(val)}
      className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${cur === val ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
      {label}
    </button>
  )

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <MapPin size={15} className="text-gray-400" />
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Sales by Area — NC &amp; SC</h2>
            <p className="text-xs text-gray-400 mt-0.5">Circle size &amp; color show where you do the most business</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mapping && <span className="text-xs text-gray-400 animate-pulse mr-1">Mapping…</span>}
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            {tabBtn(setFilter, 'all', filter, 'All Jobs')}
            {tabBtn(setFilter, 'won', filter, 'Won Only')}
          </div>
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            {tabBtn(setView, 'map', view, 'Map')}
            {tabBtn(setView, 'list', view, 'List')}
          </div>
        </div>
      </div>

      {/* Map div is ALWAYS mounted so mapRef is never null; hidden in list mode */}
      <div style={{ display: view === 'map' ? 'block' : 'none' }}>
        {!leafletLoaded && (
          <div className="h-[440px] bg-gray-50 flex items-center justify-center text-sm text-gray-400">
            Loading map…
          </div>
        )}
        <div
          ref={el => { mapRef.current = el; if (el && !mapMounted) setMapMounted(true) }}
          style={{ height: leafletLoaded ? '440px' : '0px', visibility: leafletLoaded ? 'visible' : 'hidden' }}
        />
      </div>

      {view === 'list' && (
        <div className="px-5 py-4 space-y-3 max-h-[440px] overflow-y-auto">
          {cities.length === 0
            ? <p className="text-sm text-gray-400 text-center py-10">No addresses on file</p>
            : cities.map((c, i) => {
                const ratio = c.count / maxCount
                return (
                  <div key={c.city} className="flex items-center gap-3">
                    <span className="text-xs text-gray-300 w-4 text-right shrink-0">{i+1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-800 truncate">{c.city}</span>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          {c.revenue > 0 && <span className="text-xs font-semibold text-gray-600">${(c.revenue/1000).toFixed(0)}k</span>}
                          {c.won > 0 && <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded-full">{c.won} won</span>}
                          {c.active > 0 && <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-full">{c.active} active</span>}
                        </div>
                      </div>
                      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${ratio*100}%`, background: areaColor(ratio) }} />
                      </div>
                    </div>
                  </div>
                )
              })
          }
        </div>
      )}

      <div className="px-5 py-2.5 flex items-center justify-between border-t border-gray-100">
        <div className="flex items-center gap-1.5">
          {['#c7d2fe','#818cf8','#4f46e5','#1e1b4b'].map(c => (
            <span key={c} className="inline-block w-3 h-3 rounded-sm" style={{ background: c }} />
          ))}
          <span className="text-[10px] text-gray-400 ml-1">Low → High</span>
        </div>
        <div className="flex items-center gap-3">
          {view === 'map' && (
            <button
              onClick={() => { localStorage.removeItem(GEO_CACHE_KEY); setPoints([]); setMapping(false) }}
              className="text-[10px] text-red-400 hover:text-red-600 underline"
            >
              Reset cache
            </button>
          )}
          <span className="text-[10px] text-gray-400">
            {view === 'map' ? `${activePoints.length} of ${withAddr} mapped · © OpenStreetMap` : `${cities.length} locations`}
          </span>
        </div>
      </div>
    </div>
  )
}

const PROJECT_TYPES = ['Open Deck','Screen Porches','Eze-Breeze Porches','Open Porches','Porch Conversions','Sunrooms','Hardscapes']

const EMPTY_FORM = { client: '', address: '', saleDate: '', total: '', projectType: 'Open Deck' }

const BULK_EMPTY = { count: '70', status: 'Lost', startDate: '2026-01-01', endDate: '2026-04-30' }

function PastJobPanel() {
  const { proposals, projectTypes: PROJECT_TYPES, importHistoricalJob, bulkImportHistoricalProposals, deleteProposal,
          importHistory2024_2025, clearHistory2024_2025, historyImported } = useStore()
  const [open, setOpen] = useState(false)
  const [tab, setTab]   = useState('won')   // 'won' | 'nonwon'
  const [form, setForm] = useState(EMPTY_FORM)
  const [bulk, setBulk] = useState(BULK_EMPTY)
  const [error, setError] = useState('')
  const [bulkDone, setBulkDone] = useState(false)

  const historical = proposals
    .filter(p => p.isHistorical)
    .sort((a, b) => new Date(b.closedAt || b.createdAt) - new Date(a.closedAt || a.createdAt))

  const wonHistorical  = historical.filter(p => p.status === 'Won')
  const lostHistorical = historical.filter(p => p.status !== 'Won')

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setB = (k, v) => { setBulk(f => ({ ...f, [k]: v })); setBulkDone(false) }

  const submitWon = () => {
    if (!form.client.trim()) { setError('Client name is required.'); return }
    if (!form.saleDate)       { setError('Sale date is required.'); return }
    if (!form.total || isNaN(Number(form.total))) { setError('Enter a valid dollar amount.'); return }
    setError('')
    importHistoricalJob({
      client: form.client.trim(),
      address: form.address.trim(),
      projectTypes: [form.projectType],
      total: Number(form.total),
      saleDate: form.saleDate,
    })
    setForm(f => ({ ...EMPTY_FORM, projectType: f.projectType, saleDate: f.saleDate }))
  }

  const submitBulk = () => {
    const n = parseInt(bulk.count)
    if (!n || n < 1 || n > 500) { setError('Enter a count between 1 and 500.'); return }
    if (!bulk.startDate || !bulk.endDate) { setError('Both dates are required.'); return }
    if (new Date(bulk.startDate) > new Date(bulk.endDate)) { setError('Start date must be before end date.'); return }
    setError('')
    bulkImportHistoricalProposals({ count: n, status: bulk.status, startDate: bulk.startDate, endDate: bulk.endDate })
    setBulkDone(true)
  }

  const totalLogged = historical.length

  return (
    <div className="bg-white rounded-xl border border-gray-200 mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left"
      >
        <div className="flex items-center gap-2">
          <Clock size={15} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-800">Log Past Jobs</span>
          {totalLogged > 0 && (
            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full font-medium">
              {totalLogged} logged
            </span>
          )}
        </div>
        {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 px-5 py-4">
          {/* One-click load of the real 2024–2025 history */}
          {!historyImported ? (
            <div className="mb-4 flex items-center justify-between gap-3 bg-[var(--brand-50)] border border-[var(--brand-200)] rounded-xl px-4 py-3 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-gray-800">Load 2024–2025 history</p>
                <p className="text-xs text-gray-500 mt-0.5">One click: imports your <strong>93 real won jobs ($3.62M)</strong> and <strong>783 logged appointments</strong> (488 in 2024, 295 in 2025).</p>
              </div>
              <button onClick={importHistory2024_2025}
                className="shrink-0 flex items-center gap-1.5 px-4 py-2 bg-[var(--brand-600)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-700)] transition-colors">
                <Plus size={14} /> Import history
              </button>
            </div>
          ) : (
            <div className="mb-4 flex items-center justify-between gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex-wrap">
              <p className="text-sm text-green-800">✓ 2024–2025 history loaded — 93 jobs and 783 appointments are in your analytics.</p>
              <button onClick={() => { if (window.confirm('Remove ALL imported 2024–2025 history (jobs + appointments)? This can’t be undone.')) clearHistory2024_2025() }}
                className="text-xs text-gray-500 hover:text-red-600 shrink-0">Undo import</button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4 w-fit">
            <button onClick={() => { setTab('won'); setError('') }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'won' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Won Jobs
            </button>
            <button onClick={() => { setTab('nonwon'); setError('') }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === 'nonwon' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              Non-Wins (Bulk)
            </button>
          </div>

          {tab === 'won' && (
            <>
              <p className="text-xs text-gray-400 mb-3">
                Enter jobs sold before you started using QuoteX. They'll count toward revenue totals and the trendline.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                <input placeholder="Client name *" value={form.client}
                  onChange={e => setF('client', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitWon()}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <input placeholder="Address (optional)" value={form.address}
                  onChange={e => setF('address', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitWon()}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <select value={form.projectType} onChange={e => setF('projectType', e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  {PROJECT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                <input type="date" value={form.saleDate} onChange={e => setF('saleDate', e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <input type="number" placeholder="Total $" value={form.total}
                  onChange={e => setF('total', e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitWon()}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              {error && tab === 'won' && <p className="text-xs text-red-600 mt-2">{error}</p>}
              <div className="flex justify-end mt-2">
                <button onClick={submitWon}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[var(--brand-600)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-700)] transition-colors">
                  <Plus size={14} /> Add job
                </button>
              </div>

              {wonHistorical.length > 0 && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    {wonHistorical.length} won job{wonHistorical.length !== 1 ? 's' : ''} logged
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {wonHistorical.map(p => (
                      <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 rounded-lg group">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-sm font-medium text-gray-800 truncate">{p.client || <span className="text-gray-400 italic">No name</span>}</span>
                          {p.projectTypes?.[0] && (
                            <span className="text-xs px-1.5 py-0.5 bg-white border border-gray-200 rounded text-gray-500 shrink-0">{p.projectTypes[0]}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-gray-400">
                            {new Date(p.closedAt || p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <span className="text-sm font-semibold text-gray-700">${Number(p.total).toLocaleString()}</span>
                          <button onClick={() => deleteProposal(p.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Total: <strong className="text-gray-700">${wonHistorical.reduce((s, p) => s + wonRevenueOf(p), 0).toLocaleString()}</strong>
                  </p>
                </div>
              )}
            </>
          )}

          {tab === 'nonwon' && (
            <>
              <p className="text-xs text-gray-400 mb-4">
                Add proposals you sent but didn't close on. These count in your <strong>win rate denominator</strong> to bring the percentage down to its real number. They show in the Proposal Tracker as Lost/MIA with no client name.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">How many?</label>
                  <input type="number" min="1" max="500" value={bulk.count}
                    onChange={e => setB('count', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">Status</label>
                  <select value={bulk.status} onChange={e => setB('status', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                    <option value="Lost">Lost</option>
                    <option value="MIA">MIA (no response)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">From date</label>
                  <input type="date" value={bulk.startDate} onChange={e => setB('startDate', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium block mb-1">To date</label>
                  <input type="date" value={bulk.endDate} onChange={e => setB('endDate', e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
              </div>
              {error && tab === 'nonwon' && <p className="text-xs text-red-600 mb-2">{error}</p>}
              {bulkDone && (
                <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-2">
                  {bulk.count} proposals added. Win rate updated. You can re-run if needed — each run adds on top.
                </p>
              )}
              <button onClick={submitBulk}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
                <Plus size={14} /> Add {bulk.count || '?'} {bulk.status} Proposals
              </button>

              {lostHistorical.length > 0 && (
                <div className="mt-4 border-t border-gray-100 pt-4 flex items-center justify-between">
                  <p className="text-xs text-gray-500">
                    <strong className="text-gray-700">{lostHistorical.length}</strong> non-win historical proposals logged
                  </p>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete all ${lostHistorical.length} bulk-added non-win proposals? This can't be undone.`)) {
                        lostHistorical.forEach(p => deleteProposal(p.id))
                      }
                    }}
                    className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                  >
                    <Trash2 size={11} /> Remove all
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Project Type Manager Modal ────────────────────────────────────────────────
function ProjectTypeModal({ onClose }) {
  const { projectTypes, addProjectType, renameProjectType, deleteProjectType, proposals } = useStore()
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')

  const usageCount = name =>
    proposals.filter(p => (p.projectTypes || []).concat(p.contractDraft?.projectTypes || []).includes(name)).length

  const startEdit = (name) => { setEditing(name); setEditVal(name) }
  const saveEdit  = () => {
    if (editVal.trim() && editVal.trim() !== editing) renameProjectType(editing, editVal.trim())
    setEditing(null)
  }
  const handleAdd = () => { if (!newName.trim()) return; addProjectType(newName.trim()); setNewName('') }
  const handleDelete = (name) => {
    const n = usageCount(name)
    if (window.confirm(n > 0 ? `"${name}" appears on ${n} proposal${n !== 1 ? 's' : ''}. Delete it from the list? (existing proposals are unaffected)` : `Delete "${name}"?`))
      deleteProjectType(name)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-semibold text-gray-900 text-sm">Manage Service Types</p>
            <p className="text-xs text-gray-400 mt-0.5">Used in analytics breakdowns &amp; the Log Past Jobs dropdown</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={17} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1">
          {projectTypes.map(type => (
            <div key={type} className="flex items-center gap-2 group px-3 py-2 rounded-xl hover:bg-gray-50">
              {editing === type ? (
                <>
                  <input autoFocus value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }}
                    className="flex-1 text-sm border border-blue-300 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-200" />
                  <button onClick={saveEdit} className="p-1 text-green-600 hover:text-green-800"><Check size={14} /></button>
                  <button onClick={() => setEditing(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={14} /></button>
                </>
              ) : (
                <>
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: typeStroke(type, projectTypes) }} />
                  <span className="flex-1 text-sm text-gray-800 font-medium">{type}</span>
                  <span className="text-xs text-gray-400 mr-1">{usageCount(type)}</span>
                  <button onClick={() => startEdit(type)} className="p-1 text-gray-300 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"><Pencil size={12} /></button>
                  <button onClick={() => handleDelete(type)} className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 shrink-0 flex gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="New service type…"
            className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          <button onClick={handleAdd} disabled={!newName.trim()}
            className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors">
            <Plus size={13} /> Add
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Remap Projects Modal ──────────────────────────────────────────────────────
function RemapProjectsModal({ onClose }) {
  const { proposals, projectTypes, saveProposal } = useStore()

  const getTypes = (p) => {
    if (p.contractDraft?.projectTypes?.length) return p.contractDraft.projectTypes
    if (p.projectTypes?.length) return p.projectTypes
    return []
  }

  const reassign = (p, newType) => {
    saveProposal({
      id: p.id,
      projectTypes: newType ? [newType] : [],
      contractDraft: { ...(p.contractDraft || {}), projectTypes: newType ? [newType] : [] },
    })
  }

  const relevant = proposals
    .filter(p => p.client || p.address || p.contractDraft?.client || p.contractDraft?.address || getTypes(p).length > 0)
    .sort((a, b) => {
      const ta = getTypes(a)[0] || 'zzz'
      const tb = getTypes(b)[0] || 'zzz'
      return ta.localeCompare(tb) || (a.client || '').localeCompare(b.client || '')
    })

  const groups = {}
  relevant.forEach(p => {
    const key = getTypes(p)[0] || 'Unassigned'
    ;(groups[key] = groups[key] || []).push(p)
  })
  const groupKeys = Object.keys(groups).sort((a, b) =>
    a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b)
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-semibold text-gray-900 text-sm">Reassign Project Types</p>
            <p className="text-xs text-gray-400 mt-0.5">Change which category each project is counted under</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={17} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-5">
          {groupKeys.map(group => (
            <div key={group}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: typeStroke(group, projectTypes) }} />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{group}</p>
                <span className="text-xs text-gray-400">({groups[group].length})</span>
              </div>
              <div className="space-y-1">
                {groups[group].map(p => {
                  const name = p.client || p.contractDraft?.client || '(no name)'
                  const addr = p.address || p.contractDraft?.address || '—'
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                        <p className="text-xs text-gray-400 truncate">{addr}</p>
                      </div>
                      <select
                        value={getTypes(p)[0] || ''}
                        onChange={e => reassign(p, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300 shrink-0 max-w-[150px]"
                      >
                        <option value="">— Unassigned —</option>
                        {projectTypes.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
          {relevant.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-10">No proposals found</p>
          )}
        </div>
        <div className="px-5 py-3 border-t border-gray-100 shrink-0">
          <button onClick={onClose} className="w-full py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors">Done</button>
        </div>
      </div>
    </div>
  )
}

const fmt  = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtK = n => n >= 1000 ? `$${(n / 1000).toFixed(0)}k` : `$${fmt(n)}`

// Color palette cycles through for types not explicitly mapped
const COLOR_PALETTE = [
  '#3b82f6','#10b981','#f59e0b','#a855f7','#f43f5e','#06b6d4',
  '#ea580c','#0d9488','#84cc16','#ec4899','#6366f1','#9ca3af',
]
const TYPE_STROKE_MAP = {
  'Total':              '#6366f1',
  'Open Deck':          '#3b82f6',
  'Screen Porches':     '#10b981',
  'Eze-Breeze Porches': '#0d9488',
  'Open Porches':       '#06b6d4',
  'Porch Conversions':  '#a855f7',
  'Sunrooms':           '#f59e0b',
  'Hardscapes':         '#ea580c',
  'Other':              '#9ca3af',
}
function typeStroke(type, allTypes) {
  return TYPE_STROKE_MAP[type] || COLOR_PALETTE[allTypes.indexOf(type) % COLOR_PALETTE.length] || '#9ca3af'
}
const TYPE_BG = {
  'Total':              'bg-indigo-100 text-indigo-700 border-indigo-300',
  'Open Deck':          'bg-blue-100 text-blue-700 border-blue-300',
  'Screen Porches':     'bg-emerald-100 text-emerald-700 border-emerald-300',
  'Eze-Breeze Porches': 'bg-teal-100 text-teal-700 border-teal-300',
  'Open Porches':       'bg-cyan-100 text-cyan-700 border-cyan-300',
  'Porch Conversions':  'bg-purple-100 text-purple-700 border-purple-300',
  'Sunrooms':           'bg-amber-100 text-amber-700 border-amber-300',
  'Hardscapes':         'bg-orange-100 text-orange-700 border-orange-300',
  'Other':              'bg-gray-100 text-gray-600 border-gray-300',
}
const TYPE_COLORS_BAR = {
  'Open Deck':          'bg-blue-500',
  'Screen Porches':     'bg-emerald-500',
  'Eze-Breeze Porches': 'bg-teal-500',
  'Open Porches':       'bg-cyan-500',
  'Porch Conversions':  'bg-purple-500',
  'Sunrooms':           'bg-amber-500',
  'Hardscapes':         'bg-orange-500',
  'Other':              'bg-gray-400',
}
const TYPE_LIGHT = {
  'Open Deck':          'bg-blue-50 text-blue-700',
  'Screen Porches':     'bg-emerald-50 text-emerald-700',
  'Eze-Breeze Porches': 'bg-teal-50 text-teal-700',
  'Open Porches':       'bg-cyan-50 text-cyan-700',
  'Porch Conversions':  'bg-purple-50 text-purple-700',
  'Sunrooms':           'bg-amber-50 text-amber-700',
  'Hardscapes':         'bg-orange-50 text-orange-700',
  'Other':              'bg-gray-100 text-gray-600',
}

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-2xl font-bold text-gray-900 leading-tight">{value}</p>
        <div className="p-2 rounded-lg bg-gray-100 text-gray-500 shrink-0"><Icon size={16} /></div>
      </div>
      <p className="text-xs text-gray-500 font-semibold mt-2">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{sub}</p>}
    </div>
  )
}

// Reusable collapsible card — used for secondary analytics kept off the calm default view
function Collapsible({ icon: Icon, title, subtitle, badge, open, onToggle, children }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-5">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-3.5 text-left">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon size={15} className="text-gray-400 shrink-0" />}
          <div className="min-w-0">
            <span className="text-sm font-semibold text-gray-800">{title}</span>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          {badge}
        </div>
        {open ? <ChevronUp size={15} className="text-gray-400 shrink-0" /> : <ChevronDown size={15} className="text-gray-400 shrink-0" />}
      </button>
      {open && <div className="border-t border-gray-100 px-5 py-4">{children}</div>}
    </div>
  )
}

function Bar({ pct, color, label, count, revenue }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-xs text-gray-600 font-medium text-right shrink-0">{label}</div>
      <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%` }} />
        {pct > 8 && <span className="absolute left-2 top-0 h-full flex items-center text-white text-xs font-semibold">{pct.toFixed(0)}%</span>}
      </div>
      <div className="w-16 text-xs text-gray-500 shrink-0">{count} job{count !== 1 ? 's' : ''}</div>
      <div className="w-14 text-xs text-gray-500 text-right shrink-0">{fmtK(revenue)}</div>
    </div>
  )
}

// SVG line chart with hover tooltip
const APPT_COLOR = '#0d9488' // teal — appointments line (right axis)

function TrendChart({ months, activeTypes, allTypes }) {
  const svgRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)

  const showAppts = activeTypes.has('Appointments')
  const W = 700, H = 220
  const PAD = { top: 16, right: showAppts ? 44 : 20, bottom: 40, left: 56 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const maxVal = useMemo(() => {
    let max = 0
    months.forEach(m => {
      if (activeTypes.has('Total')) max = Math.max(max, m.total)
      allTypes.forEach(t => { if (activeTypes.has(t)) max = Math.max(max, m.byType[t] || 0) })
    })
    return max || 1
  }, [months, activeTypes, allTypes])

  // Appointments use their own (right-hand) axis since they're a count, not $.
  const maxAppt = useMemo(() => Math.max(1, ...months.map(m => m.apptCount || 0)), [months])

  const xScale = i => PAD.left + (months.length <= 1 ? chartW / 2 : (i / (months.length - 1)) * chartW)
  const yScale = v => PAD.top + chartH - (v / maxVal) * chartH
  const yScaleAppt = v => PAD.top + chartH - (v / maxAppt) * chartH

  const linePoints = type =>
    months.map((m, i) => `${xScale(i)},${yScale(type === 'Total' ? m.total : (m.byType[type] || 0))}`).join(' ')
  const apptPoints = months.map((m, i) => `${xScale(i)},${yScaleAppt(m.apptCount || 0)}`).join(' ')

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(f => ({ val: maxVal * f, y: yScale(maxVal * f), appt: Math.round(maxAppt * f) }))

  const handleMouseMove = e => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const mx = (e.clientX - rect.left) * (W / rect.width) - PAD.left
    const idx = Math.max(0, Math.min(months.length - 1, Math.round((mx / chartW) * (months.length - 1))))
    setTooltip({ idx, x: xScale(idx), y: rect.top })
  }

  if (months.length === 0) return <p className="text-sm text-gray-400 py-8 text-center">No data yet</p>

  const tip = tooltip ? months[tooltip.idx] : null

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Y grid + labels ($ on left; appointment count on right) */}
        {yTicks.map(({ val, y, appt }) => (
          <g key={val}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#f3f4f6" strokeWidth="1" />
            <text x={PAD.left - 6} y={y + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{fmtK(val)}</text>
            {showAppts && (
              <text x={W - PAD.right + 6} y={y + 4} textAnchor="start" fontSize="9" fill={APPT_COLOR}>{appt}</text>
            )}
          </g>
        ))}
        {showAppts && (
          <text x={W - PAD.right + 6} y={PAD.top - 4} textAnchor="start" fontSize="8" fill={APPT_COLOR} fontWeight="600">appts</text>
        )}

        {/* X labels */}
        {months.map((m, i) => (
          <text key={i} x={xScale(i)} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="9" fill="#9ca3af">
            {m.label}
          </text>
        ))}

        {/* Year change markers */}
        {months.map((m, i) => i > 0 && months[i - 1].year !== m.year ? (
          <g key={`yr-${i}`}>
            <line x1={xScale(i)} y1={PAD.top} x2={xScale(i)} y2={H - PAD.bottom} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3,3" />
            <text x={xScale(i) + 3} y={PAD.top + 8} fontSize="8" fill="#d1d5db">{m.year}</text>
          </g>
        ) : null)}

        {/* Lines */}
        {['Total', ...allTypes].map(type => {
          if (!activeTypes.has(type)) return null
          const color = typeStroke(type, allTypes)
          const isTotal = type === 'Total'
          return (
            <g key={type}>
              <polyline
                points={linePoints(type)}
                fill="none"
                stroke={color}
                strokeWidth={isTotal ? 2.5 : 1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={isTotal ? 1 : 0.85}
              />
              {months.map((m, i) => {
                const val = type === 'Total' ? m.total : (m.byType[type] || 0)
                if (val === 0) return null
                return (
                  <circle key={i} cx={xScale(i)} cy={yScale(val)} r={isTotal ? 3.5 : 2.5}
                    fill="white" stroke={color} strokeWidth={isTotal ? 2 : 1.5} />
                )
              })}
            </g>
          )
        })}

        {/* Appointments line — dashed, on the right-hand count axis */}
        {showAppts && (
          <g>
            <polyline
              points={apptPoints}
              fill="none"
              stroke={APPT_COLOR}
              strokeWidth={2}
              strokeDasharray="5,4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {months.map((m, i) => (m.apptCount || 0) > 0 ? (
              <circle key={i} cx={xScale(i)} cy={yScaleAppt(m.apptCount)} r={3}
                fill="white" stroke={APPT_COLOR} strokeWidth={1.8} />
            ) : null)}
          </g>
        )}

        {/* Hover vertical line */}
        {tooltip && (
          <line x1={tooltip.x} y1={PAD.top} x2={tooltip.x} y2={H - PAD.bottom}
            stroke="#9ca3af" strokeWidth="1" strokeDasharray="3,3" />
        )}
      </svg>

      {/* Tooltip */}
      {tooltip && tip && (
        <div className="absolute left-1/2 -translate-x-1/2 top-0 pointer-events-none z-10 bg-white border border-gray-200 rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[140px]"
          style={{ transform: `translateX(calc(${tooltip.x / W * 100}% - 50%))`, top: 0 }}>
          <p className="font-semibold text-gray-800 mb-1.5">{tip.labelFull}</p>
          {activeTypes.has('Total') && <p className="text-blue-600 font-medium">Total: {fmtK(tip.total)}</p>}
          {allTypes.filter(t => activeTypes.has(t) && tip.byType[t] > 0).map(t => (
            <p key={t} style={{ color: typeStroke(t, allTypes) }}>{t}: {fmtK(tip.byType[t])}</p>
          ))}
          {showAppts && <p style={{ color: APPT_COLOR }} className="font-medium">{tip.apptCount || 0} appointment{(tip.apptCount || 0) !== 1 ? 's' : ''}</p>}
          {tip.jobCount > 0 && <p className="text-gray-400 mt-1">{tip.jobCount} job{tip.jobCount !== 1 ? 's' : ''} won</p>}
        </div>
      )}
    </div>
  )
}

export default function Analytics() {
  const proposals    = useStore(s => s.proposals)
  const PROJECT_TYPES = useStore(s => s.projectTypes)
  const CURRENT_YEAR = new Date().getFullYear()
  // Stat-card period: month / quarter / last-quarter / this-year (YTD) / a prior
  // year / all time. Defaults to this year.
  const [statsPeriod, setStatsPeriod]   = useState('this-year')
  const statsPeriods = useMemo(() => {
    const priorYears = new Set()
    proposals.forEach(p => { const y = new Date(p.closedAt || p.createdAt || p.sentAt).getFullYear(); if (!Number.isNaN(y) && y !== CURRENT_YEAR) priorYears.add(y) })
    return [
      { id: 'this-month',   label: 'This Month' },
      { id: 'this-quarter', label: 'This Quarter' },
      { id: 'last-quarter', label: 'Last Quarter' },
      { id: 'this-year',    label: `${CURRENT_YEAR} YTD` },
      ...[...priorYears].sort((a, b) => b - a).map(y => ({ id: y, label: String(y) })),
      { id: 'all',          label: 'All time' },
    ]
  }, [proposals])
  const periodLabel = statsPeriods.find(p => p.id === statsPeriod)?.label || 'All time'
  const [activeTypes, setActiveTypes]   = useState(new Set(['Total', 'Appointments']))
  const [managingTypes, setManagingTypes] = useState(false)
  const [remapping, setRemapping] = useState(false)
  const [showTrendMenu, setShowTrendMenu] = useState(false)
  const [showHeatMap, setShowHeatMap] = useState(false)
  const [showTypeBreakdown, setShowTypeBreakdown] = useState(false)
  const [showReasons, setShowReasons] = useState(false)

  const { stats, trendMonths, allTypes } = useMemo(() => {
    // Period scope: revenue counts the year a deal WON (closedAt); win-rate &
    // appointments count the year the estimate was DONE (createdAt). 'all' = all time.
    const now = new Date()
    const matchesPeriod = (dateStr) => {
      if (statsPeriod === 'all') return true
      const d = new Date(dateStr || Date.now())
      const y = d.getFullYear(), q = Math.floor(d.getMonth() / 3)
      if (statsPeriod === 'this-month')   return y === now.getFullYear() && d.getMonth() === now.getMonth()
      if (statsPeriod === 'this-quarter') return y === now.getFullYear() && q === Math.floor(now.getMonth() / 3)
      if (statsPeriod === 'last-quarter') { let ly = now.getFullYear(), lq = Math.floor(now.getMonth() / 3) - 1; if (lq < 0) { lq = 3; ly-- } return y === ly && q === lq }
      if (statsPeriod === 'this-year')    return y === now.getFullYear()
      return y === statsPeriod   // a specific prior year
    }
    // Revenue counts by WON date (closedAt); win-rate & appointments by the date
    // the estimate was DONE (createdAt).
    const won  = proposals.filter(p => p.status === 'Won' && matchesPeriod(p.closedAt || p.sentAt || p.createdAt))
    // 'Archived' is a superseded revision — neutral, never counted as a loss.
    const lost = proposals.filter(p => p.status !== 'Won' && p.status !== 'Archived' && matchesPeriod(p.createdAt || p.sentAt || p.closedAt))

    // Win rate = deals won ÷ APPOINTMENTS completed (not proposals sent). An
    // appointment = one estimate/opportunity (a root proposal, revisions excluded);
    // it's "won" if any version of it closed. e.g. 3 won / 12 appointments = 25%.
    const ids     = new Set(proposals.map(p => p.id))
    const rootGroups = proposals
      .filter(p => !p.parentId || !ids.has(p.parentId))
      .map(root => [root, ...proposals.filter(p => p.parentId === root.id)])
      .filter(group => group.some(p => p.status !== 'Archived'))   // drop fully-archived opportunities

    // Appointments completed in the period = estimates DONE in the period (root date).
    // A never-sent Draft isn't a completed appointment, so require at least one
    // version that actually left Draft (sent/lost/won/etc.) — this keeps forgotten
    // drafts from inflating the denominator.
    const apptGroups = rootGroups.filter(group =>
      matchesPeriod(group[0].createdAt || group[0].sentAt || group[0].closedAt) &&
      group.some(p => p.status !== 'Archived' && p.status !== 'Draft'))
    const apptCount = apptGroups.length

    // A deal counts as WON the moment the client commits — either it's tagged 'Won'
    // OR its contract is signed (even if the status wasn't manually flipped yet).
    // "Whether they sign it today or tomorrow, it's a win."
    const isWon   = (p) => p.status === 'Won' || p.contractDraft?.signed === true
    const wonDate = (p) => p.closedAt || p.contractDraft?.signedAt || p.sentAt || p.createdAt
    // Deals WON in the period = the win landed in the period (closedAt), counted once
    // per opportunity — INDEPENDENT of when the estimate was done, so a deal estimated
    // last month but signed this month still counts as this month's win. This matches
    // the trend chart (which also counts wins by closedAt) so card and graph reconcile.
    const wonAppts = rootGroups.filter(group =>
      group.some(p => isWon(p) && matchesPeriod(wonDate(p)))).length
    const winRate  = apptCount > 0 ? (wonAppts / apptCount) * 100 : 0

    // Use the actual contract value (à la carte = items sold), not the full
    // proposal menu, so declined options don't inflate won revenue.
    const totalRevenue = won.reduce((s, p) => s + wonRevenueOf(p), 0)
    const avgDeal = won.length ? totalRevenue / won.length : 0

    // Project type breakdown (all time)
    const typeMap = {}
    won.forEach(p => {
      const types = p.contractDraft?.projectTypes?.length
        ? p.contractDraft.projectTypes
        : p.projectTypes?.length ? p.projectTypes : ['Other']
      types.forEach(t => {
        if (!typeMap[t]) typeMap[t] = { count: 0, revenue: 0 }
        typeMap[t].count += 1
        typeMap[t].revenue += wonRevenueOf(p) / types.length
      })
    })
    const typeRows = Object.entries(typeMap)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([type, { count, revenue }]) => ({ type, count, revenue, pct: won.length ? (count / won.length) * 100 : 0 }))

    const allTypes = typeRows.map(r => r.type)

    // Win/loss reasons
    const winReasons = {}, lossReasons = {}
    won.forEach(p => { const r = p.winLossReason?.category; if (r) winReasons[r] = (winReasons[r] || 0) + 1 })
    lost.forEach(p => { const r = p.winLossReason?.category; if (r) lossReasons[r] = (lossReasons[r] || 0) + 1 })

    const pipelineValue = proposals
      .filter(p => ['Sent', 'Followed Up', 'Negotiating'].includes(p.status) && matchesPeriod(p.createdAt || p.sentAt || p.closedAt))
      .reduce((s, p) => s + Number(p.total || 0), 0)

    return {
      stats: { won, lost, apptCount, wonAppts, totalRevenue, avgDeal, winRate, typeRows, winReasons, lossReasons, pipelineValue },
      trendMonths: [],
      allTypes,
    }
  }, [proposals, statsPeriod])

  // Trend months span the SELECTED period, and count won/appointments the same
  // way the cards do — so the chart totals reconcile with the cards exactly.
  const trendData = useMemo(() => {
    const now = new Date()
    const list = []
    if (statsPeriod === 'this-month') list.push([now.getFullYear(), now.getMonth()])
    else if (statsPeriod === 'this-quarter') { const q = Math.floor(now.getMonth() / 3); for (let m = q * 3; m <= now.getMonth(); m++) list.push([now.getFullYear(), m]) }
    else if (statsPeriod === 'last-quarter') { let y = now.getFullYear(), lq = Math.floor(now.getMonth() / 3) - 1; if (lq < 0) { lq = 3; y-- } for (let m = lq * 3; m < lq * 3 + 3; m++) list.push([y, m]) }
    else if (statsPeriod === 'this-year') { for (let m = 0; m <= now.getMonth(); m++) list.push([now.getFullYear(), m]) }
    else if (statsPeriod === 'all') {
      let min = now
      proposals.forEach(p => { const d = new Date(p.closedAt || p.createdAt || p.sentAt); if (!Number.isNaN(d.getTime()) && d < min) min = d })
      let y = min.getFullYear(), m = min.getMonth()
      while (y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth())) { list.push([y, m]); if (++m > 11) { m = 0; y++ } }
    } else { for (let m = 0; m < 12; m++) list.push([statsPeriod, m]) }  // a specific prior year

    const months = list.map(([y, m]) => {
      const d = new Date(y, m, 1)
      return { label: d.toLocaleDateString('en-US', { month: 'short' }), labelFull: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), year: y, month: m, total: 0, byType: {}, jobCount: 0, apptCount: 0 }
    })
    const find = (d) => months.find(mm => mm.year === d.getFullYear() && mm.month === d.getMonth())

    // Win COUNT = tagged Won OR signed (matches the win-rate card). REVENUE, though,
    // only counts realized Won contracts — a signed-but-not-yet-tagged deal is a win
    // but not recognized revenue yet — so the graph's sales total matches the cards.
    proposals.filter(p => p.status === 'Won' || p.contractDraft?.signed === true).forEach(p => {
      const m = find(new Date(p.closedAt || p.contractDraft?.signedAt || p.sentAt || p.createdAt || Date.now()))
      if (!m) return
      m.jobCount += 1
      if (p.status !== 'Won') return   // signed-only deals: count as a win, not revenue
      const rev = wonRevenueOf(p)
      m.total += rev
      const types = p.contractDraft?.projectTypes?.length ? p.contractDraft.projectTypes : p.projectTypes?.length ? p.projectTypes : ['Other']
      types.forEach(t => { m.byType[t] = (m.byType[t] || 0) + rev / types.length })
    })
    // Appointments = root opportunities that were actually sent (archived + never-
    // sent drafts excluded), by created date — matches the card's denominator.
    const ids = new Set(proposals.map(p => p.id))
    proposals.filter(p => !p.parentId || !ids.has(p.parentId)).forEach(root => {
      const group = [root, ...proposals.filter(p => p.parentId === root.id)]
      if (!group.some(p => p.status !== 'Archived' && p.status !== 'Draft')) return
      const m = find(new Date(root.createdAt || root.sentAt || root.closedAt || Date.now()))
      if (m) m.apptCount += 1
    })
    return months
  }, [proposals, statsPeriod])

  const toggleType = type => {
    setActiveTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) { if (next.size > 1) next.delete(type) }
      else next.add(type)
      return next
    })
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-400 mt-0.5">Business performance &amp; seasonality across all proposals</p>
      </div>

      {/* Summary cards — scoped to the selected period (defaults to this year) */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Performance · {periodLabel}</p>
        <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 flex-wrap">
          {statsPeriods.map(p => (
            <button key={p.id} onClick={() => setStatsPeriod(p.id)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${statsPeriod === p.id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={DollarSign} label="Total Revenue"  value={`$${fmt(stats.totalRevenue)}`} sub={`${stats.won.length} jobs won · ${periodLabel}`} color="green" />
        <StatCard icon={Target}     label="Win Rate"       value={`${stats.winRate.toFixed(0)}%`} sub={`${stats.wonAppts} won / ${stats.apptCount} appointment${stats.apptCount !== 1 ? 's' : ''} · ${periodLabel}`} color="blue" />
        <StatCard icon={Award}      label="Avg Deal Size"  value={`$${fmt(stats.avgDeal)}`}       sub={`per won job · ${periodLabel}`} color="amber" />
        <StatCard icon={TrendingUp} label="Pipeline"       value={`$${fmt(stats.pipelineValue)}`} sub={`open proposals · ${periodLabel}`} color="blue" />
      </div>

      {/* Revenue Trend */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
          <div>
            <h2 className="font-semibold text-gray-900 text-sm">Revenue Trend &amp; Seasonality</h2>
            <p className="text-xs text-gray-400 mt-0.5">{periodLabel} · revenue by month (left, $) vs. appointments done (right, teal). Matches the cards above.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={() => setShowTrendMenu(o => !o)}
                aria-label="More actions"
                className="flex items-center justify-center w-8 h-8 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition-colors">
                <MoreHorizontal size={16} />
              </button>
              {showTrendMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowTrendMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                    <button onClick={() => { setRemapping(true); setShowTrendMenu(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 text-left transition-colors">
                      <Pencil size={12} /> Reassign
                    </button>
                    <button onClick={() => { setManagingTypes(true); setShowTrendMenu(false) }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 text-left transition-colors">
                      <Settings2 size={12} /> Service Types
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Type toggles */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {['Total', ...allTypes].map(type => {
            const on = activeTypes.has(type)
            const base = TYPE_BG[type] || 'bg-gray-100 text-gray-600 border-gray-300'
            return (
              <button key={type} onClick={() => toggleType(type)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all ${on ? base : 'bg-white text-gray-400 border-gray-200'}`}>
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle"
                  style={{ background: on ? typeStroke(type, allTypes) : '#d1d5db' }} />
                {type}
              </button>
            )
          })}
          {/* Appointments — plotted on the right-hand axis (a count, not dollars) */}
          <button onClick={() => toggleType('Appointments')}
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-all ${activeTypes.has('Appointments') ? 'bg-teal-50 text-teal-700 border-teal-300' : 'bg-white text-gray-400 border-gray-200'}`}>
            <span className="inline-block w-2 h-1.5 mr-1 align-middle rounded-sm"
              style={{ background: activeTypes.has('Appointments') ? APPT_COLOR : '#d1d5db' }} />
            Appointments
          </button>
        </div>

        <TrendChart months={trendData} activeTypes={activeTypes} allTypes={allTypes} />
      </div>

      {managingTypes && <ProjectTypeModal onClose={() => setManagingTypes(false)} />}
      {remapping && <RemapProjectsModal onClose={() => setRemapping(false)} />}

      {/* Sales Heat Map — collapsed by default; expands to the full Leaflet map card */}
      <div className="mb-5">
        <button onClick={() => setShowHeatMap(o => !o)}
          className="w-full flex items-center justify-between bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3.5 text-left">
          <div className="flex items-center gap-2">
            <MapPin size={15} className="text-gray-400" />
            <div>
              <span className="text-sm font-semibold text-gray-800">Sales Heat Map</span>
              <p className="text-xs text-gray-400 mt-0.5">Where your business comes from across NC &amp; SC</p>
            </div>
          </div>
          {showHeatMap ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
        </button>
        {showHeatMap && <div className="mt-3"><SalesHeatMap proposals={proposals} /></div>}
      </div>

      {/* Won Jobs by Project Type — collapsed by default */}
      <Collapsible
        icon={BarChart3}
        title="Won Jobs by Project Type"
        subtitle="Which services drive your closed business"
        open={showTypeBreakdown}
        onToggle={() => setShowTypeBreakdown(o => !o)}
      >
        {stats.typeRows.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No won proposals yet</p>
        ) : (
          <div className="space-y-2.5">
            {stats.typeRows.map(r => (
              <Bar key={r.type} label={r.type} pct={r.pct} count={r.count} revenue={r.revenue}
                color={TYPE_COLORS_BAR[r.type] || 'bg-gray-400'} />
            ))}
          </div>
        )}
      </Collapsible>

      {/* Win / loss reasons — collapsible */}
      <Collapsible icon={Award} title="Why You Win / Lose" open={showReasons} onToggle={() => setShowReasons(o => !o)}>
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Award size={14} className="text-emerald-500" />
              <h2 className="font-semibold text-gray-900 text-sm">Why You Win</h2>
            </div>
            {Object.keys(stats.winReasons).length === 0 ? (
              <p className="text-xs text-gray-400">No reasons logged yet.</p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(stats.winReasons).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
                  <div key={r} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{r}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full">{n}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center gap-2 mb-2">
              <XCircle size={14} className="text-red-400" />
              <h2 className="font-semibold text-gray-900 text-sm">Why You Lose</h2>
            </div>
            {Object.keys(stats.lossReasons).length === 0 ? (
              <p className="text-xs text-gray-400">No reasons logged yet.</p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(stats.lossReasons).sort((a, b) => b[1] - a[1]).map(([r, n]) => (
                  <div key={r} className="flex items-center justify-between">
                    <span className="text-sm text-gray-700">{r}</span>
                    <span className="text-xs font-semibold px-2 py-0.5 bg-red-50 text-red-600 rounded-full">{n}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Collapsible>

      {/* Log Past Jobs — moved to the bottom (infrequently used) */}
      <PastJobPanel />
    </div>
  )
}
