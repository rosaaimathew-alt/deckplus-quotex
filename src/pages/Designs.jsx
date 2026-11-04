// ── Sales → Designs ──────────────────────────────────────────────────────────
// Every proposal that has a porch, deck or patio built in QuoteX, with its
// 3D model and 2D floor plan one click away. The model is drawn from the
// proposal's own builder inputs (see src/lib/designLink.js).
import { useMemo, useState } from 'react'
import { Box, Ruler, Search, PenTool } from 'lucide-react'
import { useStore } from '../store'
import { designSummary, designUrl, hasDesign } from '../lib/designLink'

const STATUS_TONE = {
  won: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  signed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  lost: 'bg-gray-100 text-gray-500 border-gray-200',
}

export default function Designs() {
  const proposals = useStore(s => s.proposals)
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    // Latest version of each proposal only: skip any that a newer revision replaced.
    const replaced = new Set(proposals.map(p => p.parentId).filter(Boolean))
    const needle = q.trim().toLowerCase()
    return proposals
      .filter(p => !replaced.has(p.id) && hasDesign(p))
      .filter(p => !needle || `${p.client || ''} ${p.address || ''}`.toLowerCase().includes(needle))
      .sort((a, b) => String(b.sentAt || b.createdAt || '').localeCompare(String(a.sentAt || a.createdAt || '')))
  }, [proposals, q])

  const open = (p, mode) => window.open(designUrl(p, mode), '_blank', 'noopener')

  return (
    <div className="p-4 sm:p-6 max-w-7xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">3D renderings and floor plans for every porch, deck and patio quoted in QuoteX.</p>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search client or address"
              aria-label="Search designs" className="pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg w-64 max-w-full" />
          </label>
          {/* Free-form editor: draw decks, stair runs and landings anywhere, with live 3D */}
          <a href="/design-editor.html" target="_blank" rel="noopener"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--brand-600)] hover:bg-[var(--brand-700)]">
            <PenTool size={15} /> Design editor
          </a>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-xl p-8 text-center text-sm text-gray-500">
          {q ? 'No designs match that search.' : 'No designs yet. Price a porch, deck or patio with a builder on a quote, and its 3D model and floor plan show up here.'}
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl bg-white">
          {rows.map(p => (
            <li key={p.id} className="flex items-center gap-3 flex-wrap px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900">{p.client || 'Unnamed client'}</span>
                  {p.status && <span className={`text-[11px] font-medium uppercase tracking-wide border rounded-full px-2 py-0.5 ${STATUS_TONE[p.status] || 'bg-[var(--brand-50)] text-[var(--brand-700)] border-[var(--brand-200)]'}`}>{p.status}</span>}
                </div>
                <div className="text-xs text-gray-500 truncate">{p.address || 'No address'}</div>
                <div className="text-sm text-gray-700 mt-0.5">{designSummary(p)}</div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => open(p, '3d')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--brand-600)] hover:bg-[var(--brand-700)]">
                  <Box size={15} /> 3D rendering
                </button>
                <button type="button" onClick={() => open(p, '2d')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-[var(--brand-700)] border border-[var(--brand-200)] hover:bg-[var(--brand-50)]">
                  <Ruler size={15} /> Floor plan
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
