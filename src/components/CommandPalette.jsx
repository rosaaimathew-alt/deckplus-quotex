import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft, ArrowRight, User, Package, Zap } from 'lucide-react'
import { useStore } from '../store'

// ── Command palette (Ctrl/⌘ + K) ─────────────────────────────────────────────
// One box that finds anything: a page or tab ("schedule", "profit"), an action
// ("new quote", "add expense"), a client, or a catalog item. It is the fastest
// way around the app, and the answer to "where is that again?".
//
// `destinations` comes from the navigation config so the palette only offers
// places the signed-in role and plan can actually open.

const STATUS_DOT = {
  Won: 'bg-emerald-500', Lost: 'bg-red-400', Draft: 'bg-gray-400', Sent: 'bg-sky-500',
  'Followed Up': 'bg-violet-500', Negotiating: 'bg-amber-500', MIA: 'bg-slate-400', Archived: 'bg-slate-300',
}
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

function score(text, q) {
  const t = String(text || '').toLowerCase()
  if (!q) return 1
  if (t.startsWith(q)) return 3
  if (t.split(/[\s/&·—-]+/).some(w => w.startsWith(q))) return 2
  if (t.includes(q)) return 1
  return 0
}

// Mounted only while open, so every opening starts with an empty search.
export default function CommandPalette({ onClose, destinations = [], actions = [] }) {
  const navigate  = useNavigate()
  const proposals = useStore(s => s.proposals)
  const catalog   = useStore(s => s.catalog)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)


  const query = q.trim().toLowerCase()
  const results = useMemo(() => {
    const out = []
    // Places — every destination and every tab inside it
    for (const d of destinations) {
      const s = Math.max(score(d.label, query), score(d.keywords, query) ? 1 : 0)
      if (s) out.push({ kind: 'Go to', key: `d:${d.to}`, label: d.label, hint: d.hint, icon: d.icon, to: d.to, s: s + 0.5 })
      for (const t of d.tabs || []) {
        const ts = Math.max(score(t.label, query), score(t.keywords, query) ? 1 : 0)
        if (ts && query && t.label !== d.label) out.push({ kind: 'Go to', key: `t:${d.to}:${t.key}`, label: `${d.label} › ${t.label}`, hint: t.hint, icon: t.icon || d.icon, to: `${d.to}?tab=${t.key}`, s: ts })
      }
    }
    // Actions
    for (const a of actions) {
      const s = Math.max(score(a.label, query), score(a.keywords, query) ? 1 : 0)
      if (s) out.push({ kind: 'Do', key: `a:${a.label}`, label: a.label, hint: a.hint, icon: a.icon || Zap, to: a.to, run: a.run, s: s + (query ? 0.6 : 0) })
    }
    if (query.length >= 2) {
      // Clients / proposals — most recent first, one row per client
      const seen = new Set()
      const props = [...(proposals || [])].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      for (const p of props) {
        const name = p.client || ''
        if (!name || seen.has(name.toLowerCase())) continue
        const s = Math.max(score(name, query), [p.email, p.phone, p.address].some(v => score(v, query)) ? 1 : 0)
        if (!s) continue
        seen.add(name.toLowerCase())
        out.push({ kind: 'Client', key: `p:${p.id}`, label: name, hint: `${p.status || ''} · ${money(p.total)}${p.address ? ' · ' + p.address : ''}`, icon: User, dot: STATUS_DOT[p.status], to: `/sales?tab=clients&q=${encodeURIComponent(name)}`, s })
        if (seen.size >= 6) break
      }
      // Catalog items
      let n = 0
      for (const c of catalog || []) {
        const s = Math.max(score(c.name, query), score(c.category, query) ? 1 : 0)
        if (!s) continue
        out.push({ kind: 'Catalog', key: `c:${c.id}`, label: c.name, hint: `${c.category || 'Item'}${c.unitPrice ? ` · $${c.unitPrice}/${c.unit || 'ea'}` : ''}`, icon: Package, to: `/catalog?q=${encodeURIComponent(c.name)}`, s: s - 0.5 })
        if (++n >= 4) break
      }
    }
    return out.sort((a, b) => b.s - a.s).slice(0, query ? 12 : 9)
  }, [destinations, actions, proposals, catalog, query])

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${sel}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const go = (r) => {
    if (!r) return
    onClose()
    if (r.run) r.run()
    else if (r.to) navigate(r.to)
  }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[sel]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh] no-print" role="dialog" aria-modal="true" aria-label="Search and go">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search size={18} className="text-gray-400 shrink-0" />
          <input ref={inputRef} autoFocus value={q} onChange={e => { setQ(e.target.value); setSel(0) }} onKeyDown={onKey}
            placeholder="Search clients, pages, or type what you want to do…"
            className="flex-1 text-[15px] bg-transparent outline-none placeholder:text-gray-400" aria-label="Search" />
          <kbd className="hidden sm:inline text-[10px] font-semibold text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-400">Nothing matches “{q}”.</p>
          ) : results.map((r, i) => {
            const Icon = r.icon || ArrowRight
            const active = i === sel
            return (
              <button key={r.key} data-idx={i} onMouseEnter={() => setSel(i)} onClick={() => go(r)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${active ? 'bg-[var(--brand-50)]' : ''}`}>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-[var(--brand-600)] text-white' : 'bg-gray-100 text-gray-500'}`}>
                  <Icon size={15} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2">
                    {r.dot && <span className={`w-1.5 h-1.5 rounded-full ${r.dot}`} />}
                    <span className="text-sm font-medium text-gray-900 truncate">{r.label}</span>
                  </span>
                  {r.hint && <span className="block text-xs text-gray-400 truncate">{r.hint}</span>}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-300 shrink-0">{r.kind}</span>
                {active && <CornerDownLeft size={13} className="text-gray-400 shrink-0" />}
              </button>
            )
          })}
        </div>
        <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 text-[11px] text-gray-400">
          <span><kbd className="font-semibold">↑↓</kbd> move</span>
          <span><kbd className="font-semibold">Enter</kbd> open</span>
          <span className="ml-auto">Tip: press <kbd className="font-semibold">Ctrl K</kbd> anywhere</span>
        </div>
      </div>
    </div>
  )
}
