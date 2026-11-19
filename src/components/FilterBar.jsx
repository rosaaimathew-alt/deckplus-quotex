import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check, Search, X } from 'lucide-react'

// ── Quiet filter controls ────────────────────────────────────────────────────
// One flat line instead of walls of buttons: plain text choices with an
// underline on the one that's on (no boxes), everything else tucked into a
// small menu, and on/off choices as a switch. Used by the proposal list,
// the dashboard, Insights and Profit.

// Small dropdown "chip": shows the current choice, opens a short menu.
//   <MenuChip label="Period" value={v} options={[{ value, label, count? }]} onChange={setV} />
export function MenuChip({ label, value, options, onChange, placeholder, active, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  const current = options.find(o => o.value === value)
  const isActive = active ?? !!current
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        className={`flex items-center gap-1.5 h-9 text-sm font-medium transition-colors whitespace-nowrap ${
          isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-800'
        }`}>
        {label && <span className="text-gray-400">{label}</span>}
        <span>{current ? current.label : placeholder}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''} opacity-60`} />
      </button>
      {open && (
        <div role="listbox" className={`absolute z-40 mt-1.5 min-w-[180px] max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-xl py-1 ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {options.map(o => (
            <button key={o.value} role="option" aria-selected={o.value === value} type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 ${o.value === value ? 'text-[var(--brand-700)] font-medium' : 'text-gray-700'}`}>
              <span className="w-4 shrink-0">{o.value === value && <Check size={14} />}</span>
              <span className="flex-1">{o.label}</span>
              {o.count != null && <span className="text-xs text-gray-400 tabular-nums">{o.count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// The one search box: a quiet outlined box at the right end of the filter line
// (the choices read left to right first, as in the rebuild). On a phone it
// takes the whole first row.
//   <SearchLine value={q} onChange={setQ} placeholder="Search clients" />
export function SearchLine({ value, onChange, placeholder = 'Search', label, autoFocus = false }) {
  return (
    <label className="flex items-center gap-2 h-9 mb-1.5 px-2.5 w-64 max-w-full min-w-0 text-sm rounded-lg border border-gray-300 bg-white
      sm:order-last sm:ml-auto max-sm:w-full max-sm:basis-full">
      <Search size={14} className="text-gray-400 shrink-0" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={label || placeholder} autoFocus={autoFocus}
        className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none" />
      {value && <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="shrink-0 text-gray-300 hover:text-gray-500"><X size={13} /></button>}
    </label>
  )
}

// A handful of everyday choices as a compact segmented control.
//   <QuickPicks value={v} options={[{ value, label, count? }]} onChange={setV} />
export function QuickPicks({ value, options, onChange }) {
  return (
    <div className="inline-flex flex-wrap items-center gap-x-5" role="radiogroup">
      {options.map(o => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={`h-9 -mb-px border-b-2 text-sm font-medium transition-colors whitespace-nowrap ${on ? 'border-[var(--brand-600)] text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {o.label}{o.count != null && <span className="ml-1 tabular-nums text-gray-400">{o.count}</span>}
          </button>
        )
      })}
    </div>
  )
}

// On/off choice as a small switch with a label.
export function SwitchChip({ label, checked, onChange, title }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} title={title}
      className="flex items-center gap-2 h-9 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors whitespace-nowrap">
      <span className={`relative w-7 h-4 rounded-full transition-colors ${checked ? 'bg-[var(--brand-600)]' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${checked ? 'left-3.5' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  )
}

// Whose deals: Everyone, or one sales rep (first names; the full name shows on hover).
export function RepToggle({ reps, repId, setRep }) {
  const firsts = reps.map(r => String(r.name || '').trim().split(/\s+/)[0])
  const short = (r, i) => (firsts.indexOf(firsts[i]) === firsts.lastIndexOf(firsts[i]) ? firsts[i] : r.name)
  const cls = (on) => `h-9 -mb-px border-b-2 text-sm font-medium transition-colors whitespace-nowrap ${on ? 'border-[var(--brand-600)] text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'}`
  return (
    <div className="inline-flex flex-wrap items-center gap-4" role="group" aria-label="Sales rep">
      <span className="h-9 flex items-center text-sm font-medium text-gray-400 -mr-1.5">Sales rep</span>
      <button type="button" onClick={() => setRep(null)} aria-pressed={!repId} className={cls(!repId)}>Everyone</button>
      {reps.map((r, i) => (
        <button key={r.id} type="button" onClick={() => setRep(repId === r.id ? null : r.id)} aria-pressed={repId === r.id}
          title={`Only ${r.name}'s deals`} className={cls(repId === r.id)}>
          {short(r, i) || r.name}
        </button>
      ))}
    </div>
  )
}
