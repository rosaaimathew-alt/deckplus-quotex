import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle2, ArrowRight, ChevronDown } from 'lucide-react'

// ── "Needs your attention" ───────────────────────────────────────────────────
// The first thing on Home: a short, ranked list of what to do next, each with
// one button that goes straight to the right place. Nothing to do → a calm
// "all caught up". Items come from src/lib/attention.js.

const DOT = { alert: 'bg-red-500', warn: 'bg-amber-500', info: 'bg-[var(--brand-400)]' }

export default function NeedsAttention({ items, limit = 5, title = 'Needs your attention' }) {
  const navigate = useNavigate()
  const [showAll, setShowAll] = useState(false)
  const [open, setOpen] = useState(null)
  const shown = showAll ? items : items.slice(0, limit)

  if (!items.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-3">
        <span className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><CheckCircle2 size={18} /></span>
        <div>
          <p className="text-sm font-semibold text-gray-900">You’re all caught up</p>
          <p className="text-xs text-gray-500">No follow-ups due, nothing waiting on you. Nice.</p>
        </div>
      </div>
    )
  }

  return (
    <section className="bg-white rounded-xl border border-gray-200 overflow-hidden" aria-label={title}>
      <div className="px-5 py-3.5 flex items-center gap-2">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <span className="text-[11px] font-semibold rounded-full px-1.5 min-w-[18px] text-center bg-amber-400 text-white">{items.length}</span>
      </div>
      <ul className="border-t border-gray-100 divide-y divide-gray-100">
        {shown.map(it => {
          const expanded = open === it.key
          const names = it.people || []
          const toggle = () => setOpen(expanded ? null : it.key)
          return (
            <li key={it.key}>
              <div className="flex items-center gap-3 px-5 py-3">
                <span className={`w-2 h-2 rounded-full shrink-0 self-start mt-2 ${DOT[it.tone] || DOT.info}`} />
                <button className="flex-1 min-w-0 text-left group" onClick={() => names.length ? toggle() : navigate(it.to)}>
                  <p className="text-sm font-medium text-gray-900 leading-snug flex items-center gap-1">
                    <span>{it.title}</span>
                    {names.length > 0 && <ChevronDown size={14} className={`shrink-0 text-gray-300 group-hover:text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {names.length ? names.slice(0, 3).map(n => n.name).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '') : it.detail}
                  </p>
                </button>
                <button onClick={() => navigate(it.to)}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--brand-700)] bg-[var(--brand-50)] hover:bg-[var(--brand-100)] transition-colors">
                  {it.cta} <ArrowRight size={12} />
                </button>
              </div>
              {expanded && (
                <div className="px-5 pb-3 -mt-1 pl-10">
                  <p className="text-xs text-gray-400 mb-1.5">{it.detail}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {names.slice(0, 12).map((n, i) => (
                      <span key={`${n.id}-${i}`} className="text-xs bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1 text-gray-700">
                        {n.name}{n.note ? <span className="text-gray-400"> · {n.note}</span> : null}
                      </span>
                    ))}
                    {names.length > 12 && <span className="text-xs text-gray-400 px-1 py-1">+{names.length - 12} more</span>}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {items.length > limit && (
        <button onClick={() => setShowAll(v => !v)} className="w-full px-5 py-2.5 text-xs font-medium text-[var(--brand-700)] hover:bg-gray-50 border-t border-gray-100">
          {showAll ? 'Show less' : `Show ${items.length - limit} more`}
        </button>
      )}
    </section>
  )
}
