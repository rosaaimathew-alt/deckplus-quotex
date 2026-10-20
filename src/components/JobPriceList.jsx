import { useMemo, useState } from 'react'
import { FileDown, Sheet, Loader, AlertTriangle } from 'lucide-react'
import { useStore } from '../store'
import { jobPriceList, priceListRows, TOOL_LABELS } from '../lib/priceList'

// ── Price list for the office ────────────────────────────────────────────────
// Every item on the won job with the calculator breakdown behind its price —
// each price-list line, quantity, rate and amount, plus the JIC built in — laid
// out like a spreadsheet, with PDF and Excel downloads.

const money = (v) => `${Number(v) < 0 ? '−' : ''}$${Math.abs(Number(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const qtyFmt = (v) => (Math.round((Number(v) || 0) * 100) / 100).toLocaleString('en-US')
// The PDF's built-in font only has basic Latin characters: swap the rest for
// plain equivalents (′ → ', × → x, − → -, — → -) so nothing prints garbled.
const pdfSafe = (t) => String(t ?? '')
  .replace(/[′’‘]/g, "'").replace(/[″“”]/g, '"').replace(/×/g, 'x').replace(/[−–—]/g, '-').replace(/•/g, '*').replace(/…/g, '...')
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
const fileBase = (pl) => `Price-list-${(pl.client || 'job').replace(/[^\w]+/g, '-')}${pl.contractNum ? `-${pl.contractNum}` : ''}`

export default function JobPriceList({ proposal }) {
  const catalog = useStore(s => s.catalog)
  const porchRates = useStore(s => s.porchBuildRates)
  const deckCustomComponents = useStore(s => s.deckCustomComponents)
  const branding = useStore(s => s.branding)
  const [busy, setBusy] = useState('')

  // Only what's in the contract (an à la carte job covers a subset of lines).
  const pl = useMemo(() => {
    const all = proposal.lines || []
    const ids = Array.isArray(proposal.contractDraft?.scopeLines) && proposal.contractDraft.scopeLines.length
      ? new Set(proposal.contractDraft.scopeLines.map(l => String(l.id))) : null
    const scoped = ids ? all.filter(l => ids.has(String(l.id))) : all
    return jobPriceList({ ...proposal, lines: scoped.length ? scoped : all }, { catalog, porchRates, deckCustomComponents })
  }, [proposal, catalog, porchRates, deckCustomComponents])

  const company = branding?.companyName && branding.companyName.toUpperCase() !== 'QUOTEX' ? branding.companyName : 'Deck Plus'
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const downloadExcel = async () => {
    setBusy('xlsx')
    try {
      const XLSX = await import('xlsx')
      const head = [[`${company} — Job price list`], [`Customer: ${pl.client}`], [`Address: ${pl.address}`], [`Contract #: ${pl.contractNum || '—'}`], [`Printed: ${today}`], []]
      const ws = XLSX.utils.aoa_to_sheet(head)
      XLSX.utils.sheet_add_json(ws, priceListRows(pl), { origin: head.length })
      ws['!cols'] = [{ wch: 58 }, { wch: 9 }, { wch: 7 }, { wch: 12 }, { wch: 14 }, { wch: 40 }]
      // Money columns as currency
      const range = XLSX.utils.decode_range(ws['!ref'])
      for (let r = head.length + 1; r <= range.e.r; r++) for (const c of [3, 4]) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]
        if (cell && typeof cell.v === 'number') cell.z = '"$"#,##0.00'
      }
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Price list')
      XLSX.writeFile(wb, `${fileBase(pl)}.xlsx`)
    } finally { setBusy('') }
  }

  const downloadPdf = async () => {
    setBusy('pdf')
    try {
      const { default: jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
      const rawText = pdf.text.bind(pdf)
      pdf.text = (t, ...rest) => rawText(Array.isArray(t) ? t.map(pdfSafe) : pdfSafe(t), ...rest)
      const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 40
      // Columns: Item | Qty | Unit | Rate | Amount
      const X = { item: M + 4, qty: 370, unit: 410, rate: 490, amount: W - M - 4 }
      let y = M
      const newPage = () => { pdf.addPage(); y = M; header(true) }
      const need = (h) => { if (y + h > H - M) newPage() }
      const header = (cont) => {
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(cont ? 10 : 15); pdf.setTextColor(17)
        pdf.text(`${company} — Job price list${cont ? ' (continued)' : ''}`, M, y); y += cont ? 16 : 20
        if (!cont) {
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(70)
          pdf.text(`Customer: ${pl.client || '—'}`, M, y); pdf.text(`Contract #: ${pl.contractNum || '—'}`, W - M, y, { align: 'right' }); y += 13
          pdf.text(`Address: ${pl.address || '—'}`, M, y); pdf.text(`Printed: ${today}`, W - M, y, { align: 'right' }); y += 18
        }
        pdf.setFillColor(30, 41, 59); pdf.rect(M, y - 11, W - 2 * M, 16, 'F')
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(255)
        pdf.text('ITEM', X.item, y); pdf.text('QTY', X.qty, y, { align: 'right' }); pdf.text('UNIT', X.unit, y)
        pdf.text('RATE', X.rate, y, { align: 'right' }); pdf.text('AMOUNT', X.amount, y, { align: 'right' }); y += 14
      }
      const row = (cells, { bold, fill, color = 40, size = 9, italic } = {}) => {
        const label = pdf.splitTextToSize(pdfSafe(cells.item), X.qty - X.item - 40)
        const h = 12 * label.length + 3
        need(h)
        if (fill) { pdf.setFillColor(...fill); pdf.rect(M, y - 10, W - 2 * M, h, 'F') }
        pdf.setFont('helvetica', bold ? 'bold' : italic ? 'italic' : 'normal'); pdf.setFontSize(size); pdf.setTextColor(color)
        pdf.text(label, X.item, y)
        if (cells.qty !== undefined && cells.qty !== '') pdf.text(String(cells.qty), X.qty, y, { align: 'right' })
        if (cells.unit) pdf.text(String(cells.unit), X.unit, y)
        if (cells.rate !== undefined && cells.rate !== '') pdf.text(String(cells.rate), X.rate, y, { align: 'right' })
        if (cells.amount !== undefined && cells.amount !== '') pdf.text(String(cells.amount), X.amount, y, { align: 'right' })
        y += h
        pdf.setDrawColor(226); pdf.line(M, y - 9, W - M, y - 9)
      }
      header(false)
      for (const s of pl.sections) {
        y += 4
        row({ item: `${s.name}${s.tool ? `   (${TOOL_LABELS[s.tool] || s.tool})` : ''}`, amount: money(s.sold) }, { bold: true, fill: [241, 245, 249], color: 17, size: 9.5 })
        for (const it of s.breakdown.items) row({ item: `   ${it.label}${it.note ? ` — ${it.note}` : ''}`, qty: qtyFmt(it.qty), unit: it.unit, rate: money(it.rate), amount: money(it.amount) })
        if (s.breakdown.jic) row({ item: '   JIC (built into price, not shown to the customer)', amount: money(s.breakdown.jic) }, { italic: true, color: 120 })
        if (s.drift) row({ item: `   Note: recalculated with today's rates — differs from the sold price by ${money(s.drift)}`, amount: '' }, { italic: true, color: 150, size: 8 })
      }
      y += 6
      if (pl.discount) row({ item: pl.discount.label, amount: money(-pl.discount.amount) }, { bold: true })
      row({ item: 'CONTRACT TOTAL', amount: money(pl.contract) }, { bold: true, fill: [226, 232, 240], color: 17, size: 10 })
      for (const co of pl.changeOrders) row({ item: `Change order: ${co.label}`, amount: money(co.amount) })
      if (pl.changeOrders.length) row({ item: 'TOTAL WITH CHANGE ORDERS', amount: money(pl.grandTotal) }, { bold: true, fill: [226, 232, 240], color: 17, size: 10 })
      pdf.save(`${fileBase(pl)}.pdf`)
    } finally { setBusy('') }
  }

  const th = 'px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 border-b border-gray-200'
  const td = 'px-3 py-1.5 border-b border-gray-100 text-sm'
  const drifted = pl.sections.filter(s => s.drift)

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-gray-900">Price list for the office</p>
          <p className="text-xs text-gray-500">What each item was priced at in the calculators — every line, quantity and rate, plus the JIC built in.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadPdf} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50">
            {busy === 'pdf' ? <Loader size={14} className="animate-spin" /> : <FileDown size={14} />} Download PDF
          </button>
          <button onClick={downloadExcel} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            {busy === 'xlsx' ? <Loader size={14} className="animate-spin" /> : <Sheet size={14} />} Download Excel
          </button>
        </div>
      </div>

      {drifted.length > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          {drifted.length === 1 ? 'One item was' : `${drifted.length} items were`} quoted before price lists were saved with each item, so {drifted.length === 1 ? 'its' : 'their'} breakdown is recalculated with today's rates and doesn't exactly match the sold price (noted on the line). Items added from now on keep the exact breakdown.
        </p>
      )}

      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className={`${th} text-left`}>Item</th>
              <th className={`${th} text-right w-20`}>Qty</th>
              <th className={`${th} text-left w-16`}>Unit</th>
              <th className={`${th} text-right w-28`}>Rate</th>
              <th className={`${th} text-right w-32`}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {pl.sections.map((s, si) => [
              <tr key={`h${si}`} className="bg-slate-100">
                <td className={`${td} font-semibold text-gray-900`} colSpan={4}>
                  {s.name}
                  {s.tool && <span className="ml-2 text-[10px] font-medium text-gray-500 bg-white border border-gray-200 rounded px-1.5 py-0.5">{TOOL_LABELS[s.tool] || s.tool}</span>}
                  {s.hidden && <span className="ml-1.5 text-[10px] text-gray-500">(hidden on proposal)</span>}
                </td>
                <td className={`${td} text-right font-semibold text-gray-900`}>{money(s.sold)}</td>
              </tr>,
              ...s.breakdown.items.map((it, ii) => (
                <tr key={`r${si}-${ii}`}>
                  <td className={`${td} pl-7 text-gray-700`}>{it.label}{it.note && <span className="text-xs text-gray-400"> · {it.note}</span>}</td>
                  <td className={`${td} text-right tabular-nums`}>{qtyFmt(it.qty)}</td>
                  <td className={`${td} text-gray-500`}>{it.unit}</td>
                  <td className={`${td} text-right tabular-nums`}>{money(it.rate)}</td>
                  <td className={`${td} text-right tabular-nums`}>{money(it.amount)}</td>
                </tr>
              )),
              s.breakdown.jic ? (
                <tr key={`j${si}`}>
                  <td className={`${td} pl-7 italic text-amber-800`} colSpan={4}>JIC (built into price, not shown to the customer)</td>
                  <td className={`${td} text-right italic text-amber-800 tabular-nums`}>{money(s.breakdown.jic)}</td>
                </tr>
              ) : null,
              s.drift ? (
                <tr key={`d${si}`}><td className={`${td} pl-7 text-xs text-gray-400 italic`} colSpan={5}>Recalculated with today's rates — {money(Math.abs(s.drift))} {s.drift > 0 ? 'more' : 'less'} than the sold price.</td></tr>
              ) : null,
            ])}
            {pl.discount && (
              <tr><td className={`${td} font-semibold text-green-800`} colSpan={4}>{pl.discount.label}</td><td className={`${td} text-right font-semibold text-green-800`}>{money(-pl.discount.amount)}</td></tr>
            )}
            <tr className="bg-slate-200">
              <td className={`${td} font-bold text-gray-900`} colSpan={4}>Contract total</td>
              <td className={`${td} text-right font-bold text-gray-900`}>{money(pl.contract)}</td>
            </tr>
            {pl.changeOrders.map((co, i) => (
              <tr key={`co${i}`}><td className={`${td} text-gray-700`} colSpan={4}>Change order: {co.label}</td><td className={`${td} text-right`}>{money(co.amount)}</td></tr>
            ))}
            {pl.changeOrders.length > 0 && (
              <tr className="bg-slate-200"><td className={`${td} font-bold`} colSpan={4}>Total with change orders</td><td className={`${td} text-right font-bold`}>{money(pl.grandTotal)}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
