import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

// ── Hub: one destination, several focused views ──────────────────────────────
// Pages that belong together (e.g. Contracts, Jobs and the Schedule) live under
// one destination with a row of tabs. Only the open tab is rendered, so each
// screen shows just what that task needs. The open tab lives in the URL
// (?tab=jobs) so links, the back button and refreshes land on the same view.
//
//   <Hub title="Projects" tabs={[{ key, label, icon, count, render }]} />

function useHubTab(tabs, fallback) {
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

// layout="rail": a vertical toolbar on the left instead of the tab row (the
// Money section, laid out like Knowify); each page shows its own title.
export default function Hub({ title, subtitle, tabs, actions = null, defaultTab, rememberKey, layout = 'tabs' }) {
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
  if (layout === 'rail') return (
    <div className="min-h-full flex flex-col sm:flex-row">
      <nav aria-label={`${title} views`}
        className="no-print shrink-0 bg-white border-b sm:border-b-0 sm:border-r border-gray-200 flex sm:flex-col gap-1 p-2 overflow-x-auto sm:overflow-visible sm:w-[96px] sm:sticky sm:top-0 sm:self-start sm:h-[calc(100dvh-3.5rem)]">
        {visible.map(t => {
          const on = t.key === current.key
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setActive(t.key)} aria-current={on ? 'page' : undefined} title={t.hint || t.label}
              className={`relative shrink-0 w-[80px] flex flex-col items-center gap-1 px-1 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                on ? 'bg-[var(--brand-50)] text-[var(--brand-700)]' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}>
              {Icon && <Icon size={24} strokeWidth={on ? 2.1 : 1.8} />}
              {t.label}
              {t.count ? <span className={`absolute top-1 right-2 text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center ${t.countTone === 'alert' ? 'qx-badge' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span> : null}
            </button>
          )
        })}
      </nav>
      <div className="flex-1 min-w-0 qx-embedded" key={current.key}>
        {current.render()}
      </div>
    </div>
  )
  return (
    <div className="min-h-full flex flex-col">
      <div className="no-print bg-white/80 border-b border-gray-200 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 sm:pt-6">
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
                    <span className={`ml-0.5 text-[11px] font-semibold rounded-full px-1.5 min-w-[18px] text-center ${t.countTone === 'alert' ? 'qx-badge' : on ? 'bg-[var(--brand-100)] text-[var(--brand-700)]' : 'bg-gray-100 text-gray-500'}`}>{t.count}</span>
                  ) : null}
                </button>
              )
            })}
          </nav>
        )}
        {visible.length <= 1 && <div className="h-4" />}
        </div>
      </div>
      <div className="flex-1 qx-embedded" key={current.key}>
        {current.render()}
      </div>
    </div>
  )
}
