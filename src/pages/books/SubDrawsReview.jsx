// ── Sub invoices waiting for the office (Money › Bills) ─────────────────────
// Invoices subs send from the sub app (lib/subDraws): the same questions as
// the office's Google Form, plus the invoice photo / PDF. Approve → a bill to
// the sub on that job, so it sits in the Bills list like any other bill and
// counts toward job cost. Send back → the sub sees the reason and can send a
// corrected invoice for the same job and week.
import FitTable from '../../components/FitTable'
import { useState } from 'react'
import { FileText, Paperclip, Printer } from 'lucide-react'
import { useStore } from '../../store'
import { todayISO, jobIndex, jobLabel } from '../../lib/books'
import { money, weekLabel, drawnOn, agreedOf, drawsAllowed } from '../../lib/subDraws'
import { usePhotoUrl, photoUrl } from '../../lib/taskPhotos'
import { Modal, inputCls, btnPrimary, btnGhost, RowIcon } from './ui'

export default function SubDrawsReview() {
  const draws = useStore(s => s.subDraws)
  const terms = useStore(s => s.subTerms)
  const tasks = useStore(s => s.subTasks)
  const proposals = useStore(s => s.proposals)
  const branding = useStore(s => s.branding)
  const [open, setOpen] = useState(null)
  const waiting = (draws || []).filter(d => d && d.status === 'submitted')
    .sort((a, b) => String(a.submittedAt || '').localeCompare(String(b.submittedAt || '')))
  if (!waiting.length) return null
  return (
    <div className="bg-white border border-amber-300 rounded-2xl shadow-sm">
      <p className="px-4 pt-3 text-sm font-semibold text-amber-800 flex items-center gap-2"><FileText size={16} /> Sub invoices to review ({waiting.length})</p>
      <ul className="divide-y divide-gray-100">
        {waiting.map(d => (
          <li key={d.id} className="flex items-center pr-3">
            <button onClick={() => setOpen(d.id)} className="flex-1 min-w-0 px-4 py-2.5 flex items-center gap-4 text-left hover:bg-gray-50">
              <span className="flex-1 min-w-0 truncate text-gray-900 font-medium">{d.subName || 'Sub'}</span>
              <span className="text-gray-600 text-sm hidden sm:inline">{d.date ? dateLabel(d.date) : weekLabel(d.weekOf)}</span>
              <span className="text-gray-600 text-sm">{(d.lines || []).length} job{(d.lines || []).length === 1 ? '' : 's'}</span>
              <span className="w-28 text-right font-semibold text-gray-900">{money(d.total)}</span>
            </button>
            <RowIcon icon={Printer} title="Print this invoice" onClick={() => printSubInvoice(d, { draws, terms, tasks, proposals, branding })} />
          </li>
        ))}
      </ul>
      {open && <ReviewModal id={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// A sub's invoice on paper, to look over (or file) before approving it: each job with
// what was agreed, drawn before, this invoice and what's left, the sub's notes, and the
// photo of their own invoice. Opens the print dialog in a new tab.
async function printSubInvoice(d, { draws, terms, tasks, proposals, branding = {} }) {
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write('<p style="font:14px system-ui,sans-serif;margin:40px">Getting the invoice ready…</p>')
  const jobs = jobIndex(proposals || [])
  const rows = (d.lines || []).map(l => {
    const agreed = agreedOf(l.taskId, terms), before = drawnOn(l.taskId, draws, { exceptId: d.id })
    const draw = drawsAllowed((tasks || []).find(t => t && String(t.id) === String(l.taskId)))
    const job = jobs.get(String(l.proposalId))
    return { l, job, draw, agreed, before }
  })
  const files = d.files || []
  const urls = await Promise.all(files.map(f => photoUrl(f).catch(() => null)))
  const pics = files.map((f, i) => ({ f, url: urls[i] })).filter(x => x.url && x.f.type !== 'pdf')
  const pdfs = files.map((f, i) => ({ f, url: urls[i] })).filter(x => x.f.type === 'pdf')
  const when = d.date ? dateLabel(d.date) : weekLabel(d.weekOf)
  w.document.open()
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Sub invoice ${esc(d.subName || '')}${d.number ? ` #${esc(d.number)}` : ''}</title>
  <style>body{font:14px/1.45 system-ui,sans-serif;color:#111;margin:40px;max-width:820px}h1{font-size:26px;margin:0}
  table{width:100%;border-collapse:collapse;margin-top:20px}td,th{padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}.r{text-align:right}.muted{color:#6b7280}.red{color:#b91c1c;font-weight:600}
  .top{display:flex;justify-content:space-between;gap:24px}img.inv{max-width:100%;margin-top:18px;border:1px solid #e5e7eb;break-inside:avoid}</style></head><body>
  <div class="top"><div>${branding.logo ? `<img src="${esc(branding.logo)}" style="height:56px"><br>` : ''}<strong>${esc(branding.companyName || '')}</strong></div>
  <div style="text-align:right"><h1>Sub invoice</h1><div class="muted">Waiting for approval</div>
  <div>${esc(when)}</div>${d.number ? `<div>Invoice #${esc(d.number)}</div>` : ''}</div></div>
  <p style="margin-top:24px"><span class="muted">From</span><br><strong>${esc(d.subName || 'Sub')}</strong>${d.email ? `<br>${esc(d.email)}` : ''}
  ${(d.workTypes || []).length ? `<br><span class="muted">${esc(d.workTypes.join(', '))}</span>` : ''}
  ${d.submittedAt ? `<br><span class="muted">Sent ${esc(new Date(d.submittedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }))}</span>` : ''}</p>
  <table><thead><tr><th>Job</th><th class="r">Agreed</th><th class="r">Drawn before</th><th class="r">This invoice</th><th class="r">Left after</th></tr></thead><tbody>
  ${rows.map(({ l, job, draw, agreed, before }) => `<tr><td><strong>${esc(l.title)}</strong><br><span class="muted">${esc(job ? jobLabel(job) : [l.client, l.address].filter(Boolean).join(' · '))}</span>${l.note ? `<br><em class="muted">${esc(l.note)}</em>` : ''}</td>
    <td class="r">${!draw ? '—' : agreed > 0 ? esc(money(agreed)) : 'Not set'}</td><td class="r">${draw ? esc(money(before)) : '—'}</td>
    <td class="r"><strong>${esc(money(l.amount))}</strong></td><td class="r ${draw && agreed > 0 && agreed - before - l.amount < 0 ? 'red' : ''}">${draw && agreed > 0 ? esc(money(agreed - before - l.amount)) : '—'}</td></tr>`).join('')}
  </tbody></table>
  <table style="width:280px;margin-left:auto;margin-top:10px"><tr><td style="border:0">Total</td><td class="r" style="border:0"><strong>${esc(money(d.total))}</strong></td></tr></table>
  ${d.notes ? `<p style="margin-top:20px"><strong>Notes from the sub:</strong> ${esc(d.notes)}</p>` : ''}
  ${pdfs.length ? `<p class="muted">Attached PDF${pdfs.length > 1 ? 's' : ''} (print separately): ${pdfs.map(x => esc(x.f.name || 'Invoice.pdf')).join(', ')}</p>` : ''}
  ${pics.map(x => `<img class="inv" src="${esc(x.url)}" alt="">`).join('')}
  <script>window.onload=()=>{const im=[...document.images];Promise.all(im.map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r}))).then(()=>window.print())}</script></body></html>`)
  w.document.close()
}

const dateLabel = (ymd) => new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

// The sub's invoice file: opens the photo / PDF in a new tab.
function FileLink({ file }) {
  const url = usePhotoUrl(file)
  return (
    <a href={url || undefined} target="_blank" rel="noreferrer"
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm ${url ? 'text-[var(--brand-700)] hover:bg-gray-50' : 'text-gray-400 pointer-events-none'}`}>
      <Paperclip size={14} /> {file.name || (file.type === 'pdf' ? 'Invoice.pdf' : 'Invoice photo')}
    </a>
  )
}

function ReviewModal({ id, onClose }) {
  const d = useStore(s => (s.subDraws || []).find(x => x.id === id))
  const draws = useStore(s => s.subDraws)
  const terms = useStore(s => s.subTerms)
  const tasks = useStore(s => s.subTasks)
  const proposals = useStore(s => s.proposals)
  const me = useStore(s => s.me)
  const addBill = useStore(s => s.addBill)
  const updateSubDraw = useStore(s => s.updateSubDraw)
  const branding = useStore(s => s.branding)
  const [reason, setReason] = useState('')
  const [sendingBack, setSendingBack] = useState(false)
  if (!d) return null
  const jobs = jobIndex(proposals)
  const who = me?.displayName || me?.email || ''

  const approve = () => {
    if (!window.confirm(`Approve ${money(d.total)} for ${d.subName || 'this sub'}? It becomes ${(d.lines || []).length > 1 ? 'one bill per job' : 'a bill'} in Bills.`)) return
    const today = todayISO()
    const billIds = (d.lines || []).map(l => addBill({
      vendorRef: d.subId != null ? `s:${d.subId}` : null, vendorName: d.subName || 'Sub',
      number: d.number || `Sub invoice ${d.date || d.weekOf}`, date: d.date || today, dueDate: today, total: Number(l.amount) || 0,
      jobId: l.proposalId ?? null, type: 'sub', poId: null, poNumber: null, bucket: null, category: '',
      notes: [l.title, (d.workTypes || []).join(', '), l.note, d.notes].filter(Boolean).join(' — '), subDrawId: d.id,
    }).id)
    updateSubDraw(d.id, { status: 'approved', decidedAt: new Date().toISOString(), decidedBy: who, billIds })
    onClose()
  }
  const sendBack = () => {
    if (!reason.trim()) return
    updateSubDraw(d.id, { status: 'rejected', decidedAt: new Date().toISOString(), decidedBy: who, reason: reason.trim() })
    onClose()
  }

  return (
    <Modal wide title={`${d.subName || 'Sub'} · ${money(d.total)}`} onClose={onClose}
      footer={sendingBack ? <>
        <button onClick={() => setSendingBack(false)} className={btnGhost}>Cancel</button>
        <button onClick={sendBack} disabled={!reason.trim()} className={btnPrimary}>Send back</button>
      </> : <>
        <button onClick={() => printSubInvoice(d, { draws, terms, tasks, proposals, branding })} className={`${btnGhost} mr-auto inline-flex items-center gap-1.5`}><Printer size={14} /> Print</button>
        <button onClick={() => setSendingBack(true)} className={btnGhost}>Send back</button>
        <button onClick={approve} className={btnPrimary}>Approve</button>
      </>}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          {d.date ? dateLabel(d.date) : weekLabel(d.weekOf)}{d.number ? ` · Invoice #${d.number}` : ''}
          {(d.workTypes || []).length ? ` · ${d.workTypes.join(', ')}` : ''}
          {d.email ? ` · ${d.email}` : ''}
          {' · '}sent {d.submittedAt ? new Date(d.submittedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
        </p>
        <FitTable card className="border border-gray-200 rounded-xl">
          <table className="w-full text-sm min-w-[620px]">
            <thead className="text-left text-gray-500 border-b border-gray-200">
              <tr><th className="px-3 py-2 font-medium">Job</th><th className="px-3 py-2 font-medium text-right">Agreed</th><th className="px-3 py-2 font-medium text-right">Drawn before</th><th className="px-3 py-2 font-medium text-right">This invoice</th><th className="px-3 py-2 font-medium text-right">Left after</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(d.lines || []).map(l => {
                const agreed = agreedOf(l.taskId, terms)
                const before = drawnOn(l.taskId, draws, { exceptId: d.id })
                // only a carpenter's draw is against an agreed amount
                const draw = drawsAllowed((tasks || []).find(t => t && String(t.id) === String(l.taskId)))
                const job = jobs.get(String(l.proposalId))
                return (
                  <tr key={l.taskId}>
                    <td className="px-3 py-2.5"><p className="font-semibold text-gray-900">{l.title}</p><p className="text-gray-600">{job ? jobLabel(job) : [l.client, l.address].filter(Boolean).join(' · ')}</p>{l.note && <p className="text-gray-500 italic">{l.note}</p>}</td>
                    <td className={`px-3 text-right ${draw && !(agreed > 0) ? 'text-amber-700 font-semibold' : ''}`}>{!draw ? '—' : agreed > 0 ? money(agreed) : 'Not set'}</td>
                    <td className="px-3 text-right">{draw ? money(before) : '—'}</td>
                    <td className="px-3 text-right font-semibold">{money(l.amount)}</td>
                    <td className={`px-3 text-right ${draw && agreed > 0 && agreed - before - l.amount < 0 ? 'text-red-600 font-semibold' : ''}`}>{draw && agreed > 0 ? money(agreed - before - l.amount) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </FitTable>
        {d.notes && <p className="text-sm text-gray-700"><span className="font-semibold">Notes from the sub:</span> {d.notes}</p>}
        {(d.files || []).length > 0 && <div className="flex flex-wrap gap-2">{d.files.map(f => <FileLink key={f.id} file={f} />)}</div>}
        {sendingBack && (
          <label className="block">
            <span className="block text-sm font-medium text-gray-700 mb-1">Why it's going back (the sub sees this)</span>
            <input autoFocus value={reason} onChange={e => setReason(e.target.value)} className={inputCls} placeholder="e.g. Footings aren't finished yet" />
          </label>
        )}
      </div>
    </Modal>
  )
}
