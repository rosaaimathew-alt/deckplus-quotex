import { PenTool } from 'lucide-react'

// "Draw it" in a builder's header: opens the design editor linked to that builder.
export function DrawButton({ onClick, title = 'Draw it: the drawing fills this builder', label = 'Draw it' }) {
  return (
    <button type="button" onClick={onClick} title={title}
      className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-semibold text-white bg-[var(--brand-600)] hover:bg-[var(--brand-700)] rounded-full px-3 py-1.5">
      <PenTool size={13} /> {label}
    </button>
  )
}

// One line under the header while the builder is linked to a drawing: what the drawing
// says, and a switch to stop following it (the builder then keeps its own numbers).
export default function DrawingStrip({ draw, summary, note, idle = 'Linked to the drawing. Change it there and this fills in.' }) {
  if (!draw.link) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[var(--brand-50)] border border-[var(--brand-200)] px-3 py-2 text-sm">
      <PenTool size={14} className="shrink-0 text-[var(--brand-700)]" />
      <span className="min-w-0 text-gray-800">
        {summary ? <>From the drawing: <b className="font-semibold">{summary}</b></> : idle}
      </span>
      <label className="ml-auto flex items-center gap-1.5 text-xs font-medium text-gray-600 cursor-pointer select-none">
        <input type="checkbox" checked={draw.follow} onChange={e => (e.target.checked ? draw.resume() : draw.setFollow(false))} className="accent-[var(--brand-600)]" />
        Follow the drawing
      </label>
      {note && <p className="basis-full text-xs text-amber-700">{note}</p>}
    </div>
  )
}
