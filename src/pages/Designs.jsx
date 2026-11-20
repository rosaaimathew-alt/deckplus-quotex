// ── Sales → Designs ──────────────────────────────────────────────────────────
// Every proposal that has a porch, deck or patio built in QuoteX, with its
// 3D model and 2D floor plan one click away. The model is drawn from the
// proposal's own builder inputs (see src/lib/designLink.js). Each card's
// little plan is drawn from those same sizes: the house wall on top, then
// every porch, deck and patio side by side, to scale with each other.
//
// A customer's alternatives stay together, like the proposals: one stacked
// card per customer (the same grouping as Sales › Proposals), its newest live
// drawing on top; open the stack to see every alternative side by side.
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { clientGroups } from '../lib/proposalGroups'
import { useScopedProposals } from '../lib/proposalScope'
import { QuickPicks, RepToggle, SearchLine } from '../components/FilterBar'
import { designParts, designSummary, editorUrl, hasDesign } from '../lib/designLink'

const STATUS_TONE = {
  Won: 'bg-emerald-50 text-emerald-700', Lost: 'bg-gray-100 text-gray-500',
}

// A small plan of what's on the proposal (sizes in feet, drawn to one scale).
function PlanThumb({ p }) {
  const d = designParts(p.lines)
  const parts = [
    ...d.porches.map(x => ({ kind: 'porch', w: x.width, h: x.depth })),
    ...d.decks.map(x => ({ kind: 'deck', w: x.width, h: x.depth })),
    ...d.patios.map(x => ({ kind: 'patio', w: x.width, h: x.depth })),
  ].slice(0, 4)
  const W = 220, H = 120, gap = 3
  const total = parts.reduce((s, x) => s + x.w, 0) + gap * (parts.length - 1)
  const deep = Math.max(...parts.map(x => x.h), 1)
  const k = Math.min((W - 40) / total, (H - 36) / deep)
  let x = (W - total * k) / 2
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" role="img" aria-label={designSummary(p)}>
      <rect x="10" y="8" width={W - 20} height="9" fill="#c9d3da" />
      {parts.map((part, i) => {
        const w = part.w * k, h = part.h * k, x0 = x
        x += w + gap * k
        const lines = []
        if (part.kind === 'deck') for (let lx = x0 + 6; lx < x0 + w - 1; lx += 6) lines.push(<line key={lx} x1={lx} y1="17" x2={lx} y2={17 + h} stroke="#9db9e8" strokeWidth=".7" />)
        return (
          <g key={i}>
            {lines}
            {part.kind === 'porch' && <path d={`M${x0} 17 L${x0 + w / 2} ${17 + Math.min(h * 0.5, w * 0.4)} L${x0 + w} 17`} fill="none" stroke="#1e3a8a" strokeWidth="1.1" />}
            <rect x={x0} y="17" width={w} height={h} fill={part.kind === 'patio' ? '#eef1f3' : 'none'} stroke="#16212b" strokeWidth="1.5" strokeDasharray={part.kind === 'patio' ? '4 3' : undefined} />
            <text x={x0 + w / 2} y={17 + h + 11} fontSize="8.5" textAnchor="middle" fill="#4a5560">{`${part.kind.toUpperCase()} ${part.w}×${part.h}`}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function Designs() {
  // Office / admin pick whose designs: one sales rep, or All (same choice as
  // the other Sales tabs).
  const { proposals, canChoose, reps, repId, setRep } = useScopedProposals({ includeImported: true })
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('all')   // all | decks | porches

  const [open, setOpen] = useState(null)   // the stack opened (its top design's id)

  // One stack per customer: every version with a design, newest first; on top
  // the newest one still in play (not archived or lost), else the newest.
  const stacks = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const when = (p) => String(p.sentAt || p.createdAt || '')
    return clientGroups(proposals)
      .map(({ all }) => all.filter(hasDesign).sort((a, b) => when(b).localeCompare(when(a))))
      .filter(list => list.length)
      .filter(list => !needle || list.some(p => `${p.client || ''} ${p.address || ''}`.toLowerCase().includes(needle)))
      .filter(list => kind === 'all' || list.some(p => designParts(p.lines)[kind].length > 0))
      .map(list => {
        const top = list.find(p => !['Archived', 'Lost'].includes(p.status)) || list[0]
        return { top, list: [top, ...list.filter(p => p !== top)] }
      })
      .sort((a, b) => when(b.top).localeCompare(when(a.top)))
  }, [proposals, q, kind])


  return (
    <div className="p-4 sm:p-6 max-w-7xl space-y-4">
      {/* One flat line like every other list: search and whose designs (the Design editor button is in the page header) */}
      <div className="flex items-center gap-x-5 gap-y-1 flex-wrap border-b border-gray-200">
        <SearchLine value={q} onChange={setQ} placeholder="Search client or address" label="Search designs" />
        {canChoose && <RepToggle reps={reps} repId={repId} setRep={setRep} />}
        <QuickPicks value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, { value: 'decks', label: 'Decks' }, { value: 'porches', label: 'Porches' }]} />
      </div>

      {stacks.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center text-sm text-gray-500">
          {q ? 'No designs match that search.' : 'No designs yet. Price a porch, deck or patio with a builder on a quote, and its 3D model and floor plan show up here.'}
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-6">
          {stacks.map(({ top, list }) => {
            const more = list.length - 1
            const isOpen = open === top.id && more > 0
            return (
              <li key={top.id} className={isOpen ? 'col-span-full' : ''}>
                {isOpen ? (
                  <div className="border border-gray-200 rounded-xl bg-gray-50 p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 truncate">{top.client || 'Unnamed client'}</span>
                      <span className="text-xs text-gray-500">{list.length} alternatives</span>
                      <button type="button" onClick={() => setOpen(null)} className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900">
                        Stack them <ChevronUp size={14} />
                      </button>
                    </div>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {list.map((p, i) => <li key={p.id}><DesignCard p={p} label={i === 0 ? 'Latest' : `Alternative ${i}`} /></li>)}
                    </ul>
                  </div>
                ) : (
                  <div className="relative">
                    {/* the cards underneath, peeking out like a stack */}
                    {more > 1 && <span aria-hidden className="absolute inset-x-4 -bottom-3 h-6 rounded-b-xl border border-gray-200 bg-gray-100" />}
                    {more > 0 && <span aria-hidden className="absolute inset-x-2 -bottom-1.5 h-6 rounded-b-xl border border-gray-200 bg-gray-50" />}
                    <div className="relative">
                      <DesignCard p={top} />
                      {more > 0 && (
                        <button type="button" onClick={() => setOpen(top.id)}
                          className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/95 border border-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700 shadow-sm hover:bg-white">
                          +{more} alternative{more > 1 ? 's' : ''} <ChevronDown size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// One drawing: its little plan, the client and what's on it. Opens the design editor.
function DesignCard({ p, label }) {
  return (
    <button type="button" onClick={() => window.open(editorUrl(p), '_blank', 'noopener')}
      title="Open the design: floor plan and 3D in one place, saved on this proposal"
      className="w-full text-left bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-[var(--brand-300)] hover:shadow-sm transition-all">
      <span className="block h-36 bg-gray-50 border-b border-gray-200 p-2"><PlanThumb p={p} /></span>
      <span className="block px-3 py-2.5">
        <span className="flex items-center gap-2">
          <span className="font-semibold text-gray-900 truncate">{label || p.client || 'Unnamed client'}</span>
          {p.status && <span className={`ml-auto shrink-0 text-[11px] font-semibold rounded px-1.5 py-0.5 ${STATUS_TONE[p.status] || 'bg-[var(--brand-50)] text-[var(--brand-700)]'}`}>{p.status}</span>}
        </span>
        <span className="block text-xs text-gray-500 truncate mt-0.5">{designSummary(p)}</span>
      </span>
    </button>
  )
}
