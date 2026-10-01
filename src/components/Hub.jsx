import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

// ── Hub: one destination, several focused views ──────────────────────────────
// Pages that belong together (e.g. Contracts, Jobs and the Schedule) live under
// one destination with a row of tabs. Only the open tab is rendered, so each
// screen shows just what that task needs. The open tab lives in the URL
// (?tab=jobs) so links, the back button and refreshes land on the same view.
//
//   <Hub title="Projects" subtitle="…" tabs={[{ key, label, icon, count, render }]} />

export function useHubTab(tabs, fallback) {
  const [params, setParams] = useSearchParams()
  const keys = tabs.map(t => t.key)
  const requested = params.get('tab')
  const active = keys.includes(requested) ? requested : (fallback && keys.includes(fallback) ? fallback : keys[0])
  const setActive = (key) => {
    const next = new URLSearchParams(params)
    next.set('tab', key)
    // Tab-specific query params (search text, ids) don't carry over to another tab
    for (const k of [...next.keys()]) if (k !== 'tab') next.delete(k)
    setParams(next, { replace: false })
  }
  return [active, setActive]
}

export default function Hub({ title, subtitle, tabs, actions = null, defaultTab, rememberKey }) {
  const visible = tabs.filter(t => !t.hidden)
  const storageKey = rememberKey ? `qx-hub-${rememberKey}` : null
  let remembered = null
  if (storageKey) { try { remembered = localStorage.getItem(storageKey) } catch { /* private mode */ } }
  const [active, setActive] = useHubTab(visible, remembered || defaultTab)
  const current = visible.find(t => t.key === active) || visible[0]

  useEffect(() => {
    if (storageKey && current) { try { localStorage.setItem(storageKey, current.key) } catch { /* ignore */ } }
  }, [storageKey, current])

  if (!current) return null
  return (
    <div className="min-h-full flex flex-col">
      <div className="no-print px-4 sm:px-6 lg:px-8 pt-5 sm:pt-6 bg-white/70 border-b border-gray-200 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </div>
        {visible.length > 1 && (
          <nav className="flex gap-1 mt-4 -mb-px overflow-x-auto qx-scroll-x" aria-label={`${title} views`}>
            {visible.map(t => {
              const on = t.key === current.key
              const Icon = t.icon
              return (
                <button key={t.key} onClick={() => setActive(t.key)} aria-current={on ? 'page' : undefined}
                  className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    on ? 'border-[var(--brand-600)] text-[var(--brand-700)]' : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                  }`}>
                  {Icon && <Icon size={15} className={on ? '' : 'opacity-70'} />}
                  {t.label}
                  {t.count ? (
                    <span className={`ml-0.5 text-[11px] font-semibold rounded-full px-1.5 min-w-[18px] text-center ${t.countTone === 'alert' ? 'bg-amber-400 text-white' : on ? 'bg-[var(--brand-100)] text-[var(--brand-700)]' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
                  ) : null}
                </button>
              )
            })}
          </nav>
        )}
      </div>
      <div className="flex-1 qx-hub-body" key={current.key}>
        {current.render()}
      </div>
    </div>
  )
}
