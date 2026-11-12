// ── Sub invoices waiting for the office (Money › Bills) ─────────────────────
// Invoices subs send from the sub app (lib/subDraws): the same questions as
// the office's Google Form, plus the invoice photo / PDF. Approve → a bill to
// the sub on that job, so it sits in the Bills list like any other bill and
// counts toward job cost. Send back → the sub sees the reason and can send a
// corrected invoice for the same job and week.
import { useState } from 'react'
import { FileText, Paperclip } from 'lucide-react'
import { useStore } from '../../store'
import { todayISO, jobIndex, jobLabel } from '../../lib/books'
import { money, weekLabel, drawnOn, agreedOf, drawsAllowed } from '../../lib/subDraws'
import { usePhotoUrl } from '../../lib/taskPhotos'
import { Modal, inputCls, btnPrimary, btnGhost } from './ui'

export default function SubDrawsReview() {
  const draws = useStore(s => s.subDraws)
  const [open, setOpen] = useState(null)
  const waiting = (draws || []).filter(d => d && d.status === 'submitted')
    .sort((a, b) => String(a.submittedAt || '').localeCompare(String(b.submittedAt || '')))
  if (!waiting.length) return null
  return (
    <div className="bg-white border border-amber-300 rounded-2xl shadow-sm">
      <p className="px-4 pt-3 text-sm font-semibold text-amber-800 flex items-center gap-2"><FileText size={16} /> Sub invoices to review ({waiting.length})</p>
      <ul className="divide-y divide-gray-100">
        {waiting.map(d => (
          <li key={d.id}>
            <button onClick={() => setOpen(d.id)} className="w-full px-4 py-2.5 flex items-center gap-4 text-left hover:bg-gray-50">
              <span className="flex-1 min-w-0 truncate text-gray-900 font-medium">{d.subName || 'Sub'}</span>
              <span className="text-gray-600 text-sm hidden sm:inline">{d.date ? dateLabel(d.date) : weekLabel(d.weekOf)}</span>
              <span className="text-gray-600 text-sm">{(d.lines || []).length} job{(d.lines || []).length === 1 ? '' : 's'}</span>
              <span className="w-28 text-right font-semibold text-gray-900">{money(d.total)}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && <ReviewModal id={open} onClose={() => setOpen(null)} />}
    </div>
  )
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
        <div className="border border-gray-200 rounded-xl overflow-x-auto">
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
                    <td className="px-3 text-right">{draw ? money(agreed) : '—'}</td>
                    <td className="px-3 text-right">{draw ? money(before) : '—'}</td>
                    <td className="px-3 text-right font-semibold">{money(l.amount)}</td>
                    <td className={`px-3 text-right ${draw && agreed - before - l.amount < 0 ? 'text-red-600 font-semibold' : ''}`}>{draw ? money(agreed - before - l.amount) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
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
