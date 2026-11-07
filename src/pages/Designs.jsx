// ── Sales → Designs ──────────────────────────────────────────────────────────
// Every proposal that has a porch, deck or patio built in QuoteX, with its
// 3D model and 2D floor plan one click away. The model is drawn from the
// proposal's own builder inputs (see src/lib/designLink.js).
import { useMemo, useState } from 'react'
import { Search, PenTool } from 'lucide-react'
import { useScopedProposals } from '../lib/proposalScope'
import { RepToggle } from '../components/FilterBar'
import { designSummary, editorUrl, hasDesign } from '../lib/designLink'

const STATUS_TONE = {
  won: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  signed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  lost: 'bg-gray-100 text-gray-500 border-gray-200',
}

export default function Designs() {
  // Office / admin pick whose designs: one sales rep, or All (same choice as
  // the other Sales tabs).
  const { proposals, canChoose, reps, repId, setRep } = useScopedProposals({ includeImported: true })
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


  return (
    <div className="p-4 sm:p-6 max-w-7xl space-y-4">
      {/* One flat line like every other list: whose designs and search on the left, the editor on the right */}
      <div className="flex items-center gap-x-5 gap-y-1 flex-wrap border-b border-gray-200">
        {canChoose && <RepToggle reps={reps} repId={repId} setRep={setRep} />}
        <label className="flex items-center gap-2 h-9 text-sm min-w-0">
          <Search size={14} className="text-gray-400 shrink-0" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search client or address" aria-label="Search designs"
            className="w-48 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none" />
        </label>
        {/* Free-form editor: draw decks, stair runs and landings anywhere, with live 3D */}
        <a href="/design-editor.html" target="_blank" rel="noopener"
          className="ml-auto flex items-center gap-1.5 px-3 h-8 my-0.5 rounded-lg text-sm font-medium text-white bg-[var(--brand-600)] hover:bg-[var(--brand-700)] whitespace-nowrap">
          <PenTool size={15} /> Design editor
        </a>
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
                <button type="button" onClick={() => window.open(editorUrl(p), '_blank', 'noopener')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--brand-600)] hover:bg-[var(--brand-700)]"
                  title="Floor plan and 3D in one place; saved on this proposal">
                  <PenTool size={15} /> Open design
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
