import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, Clock, Info, CheckCircle2, ArrowRight, ChevronDown } from 'lucide-react'

// ── "Needs your attention" ───────────────────────────────────────────────────
// The first thing on Home: a short, ranked list of what to do next, each with
// one button that goes straight to the right place. Nothing to do → a calm
// "all caught up". Items come from src/lib/attention.js.

const TONE = {
  alert: { icon: AlertCircle, dot: 'bg-red-500',   ring: 'text-red-600 bg-red-50' },
  warn:  { icon: Clock,       dot: 'bg-amber-500', ring: 'text-amber-600 bg-amber-50' },
  info:  { icon: Info,        dot: 'bg-sky-500',   ring: 'text-[var(--brand-600)] bg-[var(--brand-50)]' },
}

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
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <span className="text-xs text-gray-400">{items.length} thing{items.length !== 1 ? 's' : ''}</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {shown.map(it => {
          const t = TONE[it.tone] || TONE.info
          const Icon = t.icon
          const expanded = open === it.key
          const names = it.people || []
          return (
            <li key={it.key}>
              <div className="flex items-center gap-3 px-5 py-3">
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${t.ring}`}><Icon size={16} /></span>
                <button className="flex-1 min-w-0 text-left" onClick={() => names.length ? setOpen(expanded ? null : it.key) : navigate(it.to)}>
                  <p className="text-sm font-medium text-gray-900">{it.title}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {names.length ? names.slice(0, 3).map(n => n.name).join(', ') + (names.length > 3 ? ` +${names.length - 3} more` : '') : it.detail}
                  </p>
                </button>
                {names.length > 0 && (
                  <button onClick={() => setOpen(expanded ? null : it.key)} aria-label={expanded ? 'Hide names' : 'Show names'}
                    className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hidden sm:block">
                    <ChevronDown size={15} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>
                )}
                <button onClick={() => navigate(it.to)}
                  className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 hover:border-[var(--brand-400)] hover:text-[var(--brand-700)] transition-colors">
                  {it.cta} <ArrowRight size={12} />
                </button>
              </div>
              {expanded && (
                <div className="px-5 pb-3 -mt-1 pl-16">
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
