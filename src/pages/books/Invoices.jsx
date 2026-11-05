// ── Invoices ─────────────────────────────────────────────────────────────────
// What we've billed customers. Payments recorded here land on the job as
// payments received (tagged with the invoice), so the job's "collected" and
// the invoice's "paid" are the same money.
import { useMemo, useState } from 'react'
import { Plus, CheckSquare, Printer, Trash2 } from 'lucide-react'
import { useStore } from '../../store'
import {
  INVOICE_KINDS, money, shortDate, todayISO, addDays, jobIndex, jobLabel, invoiceTotal, invoicePaid,
  invoiceBalance, invoiceStatus, invoicePayments, nextInvoiceNumber, dueSummary, downloadCsv,
} from '../../lib/books'
import { contractTotalOf } from '../../contractTotal'
import {
  StatusPill, DueBanner, SearchBox, DateRange, ExportButton, usePaged, Th, sortRows, Modal, Field, Combo,
  useJobOptions, PaymentsEditor, Empty, inputCls, btnPrimary, btnGhost,
} from './ui'

const STATUS_FILTERS = [
  ['open', 'Unpaid'], ['outstanding', 'Outstanding'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['draft', 'Draft'], ['all', 'All'],
]
const TERMS = [[0, 'Due on receipt'], [7, 'Net 7'], [15, 'Net 15'], [30, 'Net 30']]
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export function printInvoice(inv, job, branding = {}) {
  const lines = (inv.lines || []).length ? inv.lines : [{ description: inv.memo || 'Services', amount: invoiceTotal(inv) }]
  const paid = invoicePaid(inv, job)
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${esc(inv.number)}</title>
  <style>body{font:14px/1.45 system-ui,sans-serif;color:#111;margin:40px;max-width:760px}h1{font-size:28px;margin:0}
  table{width:100%;border-collapse:collapse;margin-top:24px}td,th{padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:left}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}.r{text-align:right}.muted{color:#6b7280}
  .top{display:flex;justify-content:space-between;gap:24px}.tot td{border:0;padding:4px 6px}</style></head><body>
  <div class="top"><div>${branding.logo ? `<img src="${esc(branding.logo)}" style="height:56px"><br>` : ''}<strong>${esc(branding.companyName || '')}</strong><br>
  <span class="muted">${esc(branding.address || '')}${branding.phone ? `<br>${esc(branding.phone)}` : ''}${branding.email ? `<br>${esc(branding.email)}` : ''}</span></div>
  <div style="text-align:right"><h1>Invoice</h1><div class="muted">#${esc(inv.number)}</div>
  <div>Date: ${esc(shortDate(inv.date))}</div><div>Due: ${esc(shortDate(inv.dueDate))}</div></div></div>
  <p style="margin-top:28px"><span class="muted">Bill to</span><br><strong>${esc(job?.client || '')}</strong><br>${esc(job?.address || '')}</p>
  <table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead><tbody>
  ${lines.map(l => `<tr><td>${esc(l.description)}</td><td class="r">${esc(money(l.amount))}</td></tr>`).join('')}
  </tbody></table>
  <table class="tot" style="width:280px;margin-left:auto;margin-top:12px">
  <tr><td>Total</td><td class="r"><strong>${esc(money(invoiceTotal(inv)))}</strong></td></tr>
  <tr><td>Paid</td><td class="r">${esc(money(paid))}</td></tr>
  <tr><td>Balance due</td><td class="r"><strong>${esc(money(invoiceTotal(inv) - paid))}</strong></td></tr></table>
  ${inv.notes ? `<p class="muted" style="margin-top:28px;white-space:pre-wrap">${esc(inv.notes)}</p>` : ''}
  <script>window.onload=()=>window.print()</script></body></html>`)
  w.document.close()
}

// ── Add / edit ───────────────────────────────────────────────────────────────
export function InvoiceModal({ invoice, presetJobId, onClose }) {
  const proposals  = useStore(s => s.proposals)
  const invoices   = useStore(s => s.invoices)
  const addInvoice = useStore(s => s.addInvoice)
  const updateInvoice = useStore(s => s.updateInvoice)
  const deleteInvoice = useStore(s => s.deleteInvoice)
  const addJobPayment = useStore(s => s.addJobPayment)
  const removeJobPayment = useStore(s => s.removeJobPayment)
  const branding = useStore(s => s.branding)
  const jobOptions = useJobOptions()
  const byId = useMemo(() => jobIndex(proposals), [proposals])

  const [f, setF] = useState(() => invoice ? { ...invoice, lines: invoice.lines?.length ? invoice.lines : [{ description: invoice.memo || '', amount: invoice.total || '' }] } : {
    jobId: presetJobId ?? null, kind: 'progress', number: nextInvoiceNumber(invoices, 'progress'),
    date: todayISO(), dueDate: todayISO(), terms: 0, memo: '', notes: '', status: 'sent',
    lines: [{ description: '', amount: '' }],
  })
  const set = (patch) => setF(x => ({ ...x, ...patch }))
  const job = byId.get(String(f.jobId))
  // Payments read the saved invoice (lines being edited don't count until Save).
  const live = invoice ? invoices.find(i => i.id === invoice.id) || invoice : null
  const total = invoiceTotal(f)

  // Quick fills: the contract's payment schedule and approved change orders.
  const milestones = job?.contractDraft?.payments || []
  const billedCos = new Set(invoices.filter(i => i.coId != null && i.status !== 'void').map(i => String(i.coId)))
  const openCos = (job?.jobData?.changeOrders || []).filter(c => c.status === 'Approved' && !billedCos.has(String(c.id)))
  const fillMilestone = (m, i) => set({ kind: /final/i.test(m.label || '') ? 'final' : 'progress', memo: m.label || `Payment ${i + 1}`, lines: [{ description: `${m.label || `Payment ${i + 1}`} — ${jobLabel(job)}`, amount: Number(m.amount) || 0 }] })
  const fillCo = (co) => set({ kind: 'change', coId: co.id, number: invoice ? f.number : nextInvoiceNumber(invoices, 'change'), memo: `Change order ${co.coNumber || ''}`.trim(), lines: [{ description: `Change order ${co.coNumber || ''}${co.description ? ` — ${co.description}` : ''}`.trim(), amount: Number(co.amount) || 0 }] })

  const setLine = (i, patch) => set({ lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const canSave = f.jobId != null && f.number && f.lines.some(l => String(l.description).trim() || Number(l.amount))

  const save = (status = f.status || 'sent') => {
    const lines = f.lines.filter(l => String(l.description).trim() || Number(l.amount)).map(l => ({ description: String(l.description).trim(), amount: Number(l.amount) || 0 }))
    const rec = { jobId: f.jobId, kind: f.kind, number: String(f.number).trim(), date: f.date, dueDate: f.dueDate || f.date, terms: f.terms,
      memo: f.memo || lines[0]?.description || '', notes: f.notes, lines, total: invoiceTotal({ lines }), coId: f.coId ?? null, status }
    if (invoice) updateInvoice(invoice.id, rec)
    else addInvoice(rec)
    onClose()
  }

  return (
    <Modal wide title={invoice ? `Invoice #${invoice.number}` : 'New invoice'} onClose={onClose}
      footer={<>
        {invoice && <button onClick={() => { if (window.confirm('Delete this invoice? Payments recorded on it stay on the job.')) { deleteInvoice(invoice.id); onClose() } }} className="mr-auto inline-flex items-center gap-1 text-sm text-red-600 hover:underline"><Trash2 size={14} /> Delete</button>}
        {invoice && <button onClick={() => printInvoice(live, job, branding)} className={btnGhost}><Printer size={14} /> Print</button>}
        {invoice && f.status !== 'void' && <button onClick={() => save('void')} className={btnGhost}>Void</button>}
        {!invoice && <button onClick={() => save('draft')} disabled={!canSave} className={btnGhost}>Save draft</button>}
        <button onClick={() => save(f.status === 'void' || f.status === 'draft' ? 'sent' : f.status)} disabled={!canSave} className={btnPrimary}>{invoice ? 'Save' : 'Create invoice'}</button>
      </>}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Job *"><Combo options={jobOptions} value={f.jobId} onChange={v => set({ jobId: v })} placeholder="Pick a job…" /></Field>
        <Field label="Kind">
          <select value={f.kind} onChange={e => set({ kind: e.target.value })} className={inputCls}>
            {INVOICE_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="Invoice #"><input value={f.number} onChange={e => set({ number: e.target.value })} className={inputCls} /></Field>
        <Field label="Terms">
          <select value={f.terms ?? 0} onChange={e => { const t = Number(e.target.value); set({ terms: t, dueDate: addDays(f.date, t) }) }} className={inputCls}>
            {TERMS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
          </select>
        </Field>
        <Field label="Invoice date"><input type="date" value={f.date} onChange={e => set({ date: e.target.value, dueDate: addDays(e.target.value, f.terms || 0) })} className={inputCls} /></Field>
        <Field label="Due date"><input type="date" value={f.dueDate} onChange={e => set({ dueDate: e.target.value })} className={inputCls} /></Field>
      </div>

      {job && (milestones.length > 0 || openCos.length > 0) && (
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-3">
          <p className="text-xs font-semibold text-gray-500 mb-2">Fill from the contract ({money(contractTotalOf(job))})</p>
          <div className="flex flex-wrap gap-1.5">
            {milestones.map((m, i) => (
              <button key={`m${i}`} type="button" onClick={() => fillMilestone(m, i)} className="text-xs px-2.5 py-1 rounded-full border border-gray-200 bg-white hover:border-[var(--brand-400)]">
                {m.label || `Payment ${i + 1}`} · {money(m.amount)}
              </button>
            ))}
            {openCos.map(co => (
              <button key={`c${co.id}`} type="button" onClick={() => fillCo(co)} className="text-xs px-2.5 py-1 rounded-full border border-violet-200 bg-violet-50 text-violet-800 hover:border-violet-400">
                CO {co.coNumber || ''} · {money(co.amount)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Lines</p>
        <div className="space-y-2">
          {f.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_130px_auto] gap-2">
              <input value={l.description} onChange={e => setLine(i, { description: e.target.value })} placeholder="Description" className={inputCls} aria-label="Line description" />
              <input type="number" step="0.01" value={l.amount} onChange={e => setLine(i, { amount: e.target.value })} placeholder="0.00" className={inputCls} aria-label="Line amount" />
              <button type="button" onClick={() => set({ lines: f.lines.length > 1 ? f.lines.filter((_, j) => j !== i) : [{ description: '', amount: '' }] })} className="text-gray-300 hover:text-red-500 px-1" aria-label="Remove line"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between mt-2">
          <button type="button" onClick={() => set({ lines: [...f.lines, { description: '', amount: '' }] })} className="text-xs text-[var(--brand-700)] font-semibold hover:underline">+ Add line</button>
          <p className="text-sm">Total <span className="font-bold">{money(total)}</span>{total < 0 && <span className="text-xs text-gray-500"> (credit)</span>}</p>
        </div>
      </div>

      <Field label="Notes on the invoice"><textarea rows={2} value={f.notes || ''} onChange={e => set({ notes: e.target.value })} className={inputCls} /></Field>

      {invoice && job && (
        <PaymentsEditor
          payments={invoicePayments(live, job)}
          balance={invoiceBalance(live, job)}
          onAdd={(p) => addJobPayment(job.id, { ...p, invoiceId: invoice.id, milestone: live.memo || `Invoice ${live.number}` })}
          onRemove={(pid) => removeJobPayment(job.id, pid)} />
      )}
    </Modal>
  )
}

// ── Record payment (the ✓ on a row) ─────────────────────────────────────────
function PayModal({ invoiceId, onClose }) {
  const inv = useStore(s => s.invoices.find(i => i.id === invoiceId))
  const job = useStore(s => s.proposals.find(p => inv && String(p.id) === String(inv.jobId)))
  const addJobPayment = useStore(s => s.addJobPayment)
  const removeJobPayment = useStore(s => s.removeJobPayment)
  if (!inv || !job) return null
  return (
    <Modal title={`Payment · Invoice #${inv.number} · ${jobLabel(job)}`} onClose={onClose} footer={<button onClick={onClose} className={btnPrimary}>Done</button>}>
      <PaymentsEditor payments={invoicePayments(inv, job)} balance={invoiceBalance(inv, job)}
        onAdd={(p) => addJobPayment(job.id, { ...p, invoiceId: inv.id, milestone: inv.memo || `Invoice ${inv.number}` })}
        onRemove={(pid) => removeJobPayment(job.id, pid)} />
    </Modal>
  )
}

// ── The page ─────────────────────────────────────────────────────────────────
export default function Invoices({ jobId = null }) {
  const invoices  = useStore(s => s.invoices)
  const proposals = useStore(s => s.proposals)
  const branding  = useStore(s => s.branding)
  const byId = useMemo(() => jobIndex(proposals), [proposals])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState(jobId ? 'all' : 'open')
  const [range, setRange] = useState({ from: '', to: '' })
  const [sort, setSort] = useState({ key: 'due', dir: 'desc' })
  const [editing, setEditing] = useState(null)   // invoice | 'new'
  const [paying, setPaying] = useState(null)

  const rows = useMemo(() => invoices
    .filter(i => jobId == null || String(i.jobId) === String(jobId))
    .map(i => {
      const job = byId.get(String(i.jobId))
      return { inv: i, job, status: invoiceStatus(i, job), balance: invoiceBalance(i, job), total: invoiceTotal(i), dueDate: i.dueDate }
    }), [invoices, byId, jobId])
  const sum = useMemo(() => dueSummary(rows, 30), [rows])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const out = rows.filter(r => {
      if (status === 'open' && r.status !== 'outstanding' && r.status !== 'overdue') return false
      if (!['open', 'all'].includes(status) && r.status !== status) return false
      if (range.from && (r.inv.date || '') < range.from) return false
      if (range.to && (r.inv.date || '') > range.to) return false
      if (s && ![r.inv.number, r.inv.memo, r.job?.client, r.job?.address].some(v => String(v || '').toLowerCase().includes(s))) return false
      return true
    })
    return sortRows(out, sort, {
      due: r => r.inv.dueDate || '', date: r => r.inv.date || '', balance: r => r.balance, total: r => r.total,
      number: r => parseInt(String(r.inv.number).replace(/\D/g, ''), 10) || 0, for: r => r.job?.client || '',
    })
  }, [rows, q, status, range, sort])
  const { slice, pager } = usePaged(shown)

  const exportCsv = () => downloadCsv(`invoices-${todayISO()}.csv`, [
    ['Status', r => r.status], ['Due date', r => r.inv.dueDate], ['Invoice date', r => r.inv.date], ['Invoice #', r => r.inv.number],
    ['Job', r => r.job?.client], ['Address', r => r.job?.address], ['Kind', r => r.inv.kind], ['Memo', r => r.inv.memo],
    ['Total', r => r.total.toFixed(2)], ['Paid', r => (r.total - r.balance).toFixed(2)], ['Balance', r => r.balance.toFixed(2)],
  ], shown)

  return (
    <div className={jobId ? 'space-y-4' : 'p-4 sm:p-6 max-w-7xl mx-auto space-y-4'}>
      {!jobId && <DueBanner sum={sum} soonLabel="Due within 30 days" />}
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search # or customer" />
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {STATUS_FILTERS.map(([k, l]) => (
            <button key={k} onClick={() => setStatus(k)} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${status === k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
          ))}
        </div>
        {!jobId && <DateRange from={range.from} to={range.to} label="Invoice date" onChange={(from, to) => setRange({ from, to })} />}
        <div className="flex-1" />
        <ExportButton onClick={exportCsv} />
        <button onClick={() => setEditing('new')} className={btnPrimary}><Plus size={15} /> New invoice</button>
      </div>

      {shown.length === 0 ? <Empty>{invoices.length ? 'No invoices match.' : 'No invoices yet. Create one from a job’s payment schedule or a signed change order.'}</Empty> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="border-b border-gray-200 text-left">
              <tr>
                <Th>Status</Th>
                <Th sortKey="due" sort={sort} setSort={setSort}>Due date</Th>
                <Th sortKey="date" sort={sort} setSort={setSort}>Invoice date</Th>
                <Th sortKey="balance" sort={sort} setSort={setSort} className="text-right">Balance</Th>
                <Th sortKey="total" sort={sort} setSort={setSort} className="text-right">Total</Th>
                <Th sortKey="number" sort={sort} setSort={setSort}>Invoice #</Th>
                <Th sortKey="for" sort={sort} setSort={setSort}>For</Th>
                <Th className="text-right">&nbsp;</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {slice.map(r => (
                <tr key={r.inv.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setEditing(r.inv)}>
                  <td className="px-3 py-2.5"><StatusPill status={r.status} /></td>
                  <td className="px-3 py-2.5 text-gray-700">{shortDate(r.inv.dueDate)}</td>
                  <td className="px-3 py-2.5 text-gray-700">{shortDate(r.inv.date)}</td>
                  <td className="px-3 py-2.5 text-right font-medium">{money(r.balance)}</td>
                  <td className="px-3 py-2.5 text-right text-gray-700">{money(r.total)}</td>
                  <td className="px-3 py-2.5 font-mono text-gray-700">{r.inv.number}</td>
                  <td className="px-3 py-2.5"><p className="text-gray-900">{jobLabel(r.job)}</p>{r.inv.memo && <p className="text-xs text-gray-400 truncate max-w-[260px]">{r.inv.memo}</p>}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    {(r.status === 'outstanding' || r.status === 'overdue') && r.job && (
                      <button onClick={() => setPaying(r)} title="Record payment" aria-label="Record payment" className="p-1.5 rounded-lg text-[var(--brand-600)] hover:bg-[var(--brand-50)]"><CheckSquare size={18} /></button>
                    )}
                    <button onClick={() => printInvoice(r.inv, r.job, branding)} title="Print" aria-label="Print invoice" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><Printer size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end px-3 py-2 border-t border-gray-100">{pager}</div>
        </div>
      )}

      {editing && <InvoiceModal invoice={editing === 'new' ? null : editing} presetJobId={jobId} onClose={() => setEditing(null)} />}
      {paying && <PayModal invoiceId={paying.inv.id} onClose={() => setPaying(null)} />}
    </div>
  )
}
