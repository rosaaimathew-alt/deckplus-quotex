// ── A table that never scrolls sideways ──────────────────────────────────────
// The box a table sits in. While the table fits its box it is an ordinary
// table. When the box is too narrow for it (a phone, a small window, a side
// panel), every row turns into a card: each cell on its own line with its
// column's heading beside it, so nothing has to be dragged sideways.
//
//   <FitTable className="border rounded-xl">   <table>…</table>   </FitTable>
//
// min:   cards below this box width (px). Without it the table's own natural
//        width decides: cards as soon as it would not fit.
// cols:  the Money pages, which keep every column on a laptop. Each column's
//        width: a number is pixels (status, dates, amounts, buttons), 'Nfr'
//        is a share of what is left (names get more than PO numbers). The
//        table then always fills its box exactly and long text ends in "…"
//        instead of the table growing. On a mid-size screen it goes compact
//        (smaller type, tighter fixed columns) before giving up any column;
//        cards only once a share would drop below MIN_SHARE pixels.
// card:  a list (invoices, bills, change orders…) whose rows are short cards on
//        a phone instead of one line per column: the name and the amount on
//        the first line, the rest small on the next. `card` alone works it out
//        (first column is the name, a column with no heading holds the row's
//        buttons); or say what each column is, in order:
//        'title' · 'amount' · 'status' · 'sub' (small, with its heading) ·
//        'plain' (small, no heading) · 'long' (a name: small, ends in "…" when
//        the line is full) · 'hide' (not on a phone) · 'act' (buttons).
//        Said this way the card is always two lines (up to four small parts on
//        the second). 'sub:Due' gives the part a shorter heading than the column's.
// The headings beside the cells are read from the table's own header row, so a
// table needs nothing extra to work here (styles: index.css, .qx-fit).
import { Children, cloneElement, isValidElement, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

const MIN_SHARE = 58   // px per 1fr below which a Money table turns into cards
const ROOMY = 86       // px per 1fr below which it goes compact first
const COMPACT = 0.86   // how much the fixed columns shrink when compact
const isShare = (c) => typeof c === 'string' && c.endsWith('fr')
const sums = (cols) => ({ px: cols.reduce((n, c) => n + (isShare(c) ? 0 : Number(c) || 0), 0), fr: cols.reduce((n, c) => n + (isShare(c) ? parseFloat(c) || 0 : 0), 0) })

const clean = (s) => String(s || '').replace(/[↑↓]/g, '').replace(/\s+/g, ' ').trim()

// Give every body cell its column's heading (data-label), for the card layout.
function label(box, card) {
  for (const table of box.querySelectorAll('table')) {
    const head = table.tHead?.rows[table.tHead.rows.length - 1]
    const names = []
    for (const th of head?.cells || []) for (let i = 0; i < (th.colSpan || 1); i++) names.push(clean(th.textContent))
    for (const body of [...table.tBodies, ...(table.tFoot ? [table.tFoot] : [])]) {
      for (const row of body.rows) {
        let col = 0
        for (const cell of row.cells) {
          const span = cell.colSpan || 1
          const text = span > 1 ? '' : (names[col] || '')
          const [part, short] = !card ? [] : span > 1 ? ['wide'] : Array.isArray(card) && card[col] ? card[col].split(':') : [col === 0 ? 'title' : text ? 'sub' : 'act']
          const heading = short ?? text
          if (cell.dataset.label !== heading) cell.dataset.label = heading
          if (part && cell.dataset.m !== part) cell.dataset.m = part
          col += span
        }
      }
    }
  }
}

export default function FitTable({ className = '', min = 0, cols = null, card = null, children, ...rest }) {
  const ref = useRef(null)
  const cardKey = Array.isArray(card) ? card.join(',') : card ? 'auto' : ''
  const [stacked, setStacked] = useState(false)
  const [width, setWidth] = useState(0)
  const need = cols ? Math.round(sums(cols).px * COMPACT + sums(cols).fr * MIN_SHARE) : min
  useLayoutEffect(() => {
    const box = ref.current
    if (!box || typeof ResizeObserver === 'undefined') return
    const parts = cardKey === 'auto' ? true : cardKey ? cardKey.split(',') : null
    let needs = 0   // the width the table needs as a table, measured while it is one
    let printing = false
    const measure = () => {
      const table = box.querySelector('table')
      const width = box.clientWidth
      if (!table || !width || printing) return
      if (need) { setStacked(width < need); setWidth(width); return }
      if (!box.hasAttribute('data-stacked')) {
        needs = Math.max(table.scrollWidth, table.offsetWidth)
        if (needs > width + 1) setStacked(true)
      } else if (needs && width >= needs) setStacked(false)
    }
    const sizes = new ResizeObserver(measure)
    sizes.observe(box)
    const rows = new MutationObserver(() => { label(box, parts); measure() })
    rows.observe(box, { childList: true, subtree: true })
    // Printing: paper gets the table, whatever the screen is showing.
    const paper = () => { if (need) return; printing = true; flushSync(() => setStacked(false)) }
    const screen = () => { printing = false; measure() }
    window.addEventListener('beforeprint', paper)
    window.addEventListener('afterprint', screen)
    label(box, parts); measure()
    return () => { sizes.disconnect(); rows.disconnect(); window.removeEventListener('beforeprint', paper); window.removeEventListener('afterprint', screen) }
  }, [need, cardKey])
  // Money tables: the column widths, worked out from the box's width
  let body = children, compact = false
  if (cols && !stacked && width) {
    const { px, fr } = sums(cols)
    compact = (width - px) / (fr || 1) < ROOMY
    const scale = compact ? COMPACT : 1
    const share = Math.max(0, width - px * scale) / (fr || 1)
    const group = <colgroup key="qx-cols">{cols.map((c, i) => <col key={i} style={{ width: `${Math.floor(isShare(c) ? parseFloat(c) * share : c * scale)}px` }} />)}</colgroup>
    body = Children.map(children, (child) => (isValidElement(child) && child.type === 'table'
      ? cloneElement(child, {}, group, ...Children.toArray(child.props.children))
      : child))
  }
  return (
    <div ref={ref} data-stacked={stacked ? '' : undefined} data-compact={compact ? '' : undefined} data-card={card ? (Array.isArray(card) ? 'lines' : 'flow') : undefined} className={`qx-fit ${cols ? 'qx-fixed' : ''} ${className}`} {...rest}>
      {body}
    </div>
  )
}
