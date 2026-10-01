import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'

// ── Quiet filter controls ────────────────────────────────────────────────────
// One row instead of walls of buttons: a few quick picks for what people use
// every day, everything else tucked into a small menu, and on/off choices as
// a switch. Used by the proposal list, Insights and Profit.

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
        className={`flex items-center gap-1.5 h-8 pl-3 pr-2 rounded-full border text-xs font-medium transition-colors whitespace-nowrap ${
          isActive ? 'border-[var(--brand-300)] bg-[var(--brand-50)] text-[var(--brand-800)]' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
        }`}>
        {label && <span className={isActive ? 'text-[var(--brand-600)]' : 'text-gray-400'}>{label}</span>}
        <span>{current ? current.label : placeholder}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''} opacity-60`} />
      </button>
      {open && (
        <div role="listbox" className={`absolute z-40 mt-1.5 min-w-[180px] bg-white rounded-xl border border-gray-200 shadow-xl py-1 ${align === 'right' ? 'right-0' : 'left-0'}`}>
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

// A handful of everyday choices as a compact segmented control.
//   <QuickPicks value={v} options={[{ value, label, count? }]} onChange={setV} />
export function QuickPicks({ value, options, onChange }) {
  return (
    <div className="inline-flex items-center bg-gray-100 rounded-full p-0.5" role="radiogroup">
      {options.map(o => {
        const on = o.value === value
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.value)}
            className={`h-7 px-3 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${on ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
            {o.label}{o.count != null && <span className={`ml-1 tabular-nums ${on ? 'text-gray-400' : 'text-gray-400/80'}`}>{o.count}</span>}
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
      className="flex items-center gap-2 h-8 px-2.5 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors whitespace-nowrap">
      <span className={`relative w-7 h-4 rounded-full transition-colors ${checked ? 'bg-[var(--brand-600)]' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${checked ? 'left-3.5' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  )
}
