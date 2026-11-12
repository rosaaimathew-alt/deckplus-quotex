// ── Sub app: invoices ────────────────────────────────────────────────────────
// A sub invoices the office one job at a time, answering the same questions
// as the office's Google Form "Deckplus Subcontractor Invoice" (English with
// Spanish): company, date, job name / address, work type, invoice amount,
// notes, and (optionally) a photo or PDF of the invoice. Carpenters draw any
// amount up to what's left on the job, once per job per week; every other
// trade sends one invoice per job (lib/subDraws drawsAllowed). The office
// approves it or sends it back with a reason.
import { useEffect, useMemo, useRef, useState } from 'react'
import { tr, getLang } from '../lib/lang'
import { useNavigate } from 'react-router-dom'
import { FileText, Send, Paperclip, X, Check } from 'lucide-react'
import { useStore } from '../store'
import { submitSubDraw } from '../supabase'
import { DEMO } from '../demo'
import { Card, BackButton, todayStr } from '../field/shared'
import { DRAW_STATUS, money, round2, weekOf, remainingOn, agreedOf, newDrawId, WORK_TYPES, MAX_FILES, invoiceWindowOpen, nextInvoiceMonday, tradeOf, tradeEs, drawsAllowed, canInvoice } from '../lib/subDraws'
import { uploadInvoiceFile } from '../lib/taskPhotos'

// Only tasks booked with this login carry money. An outside company's crew
// member sees tasks they were put on, but invoicing is their company PM's.
const useMine = () => {
  const tasks = useStore(s => s.subTasks)
  const draws = useStore(s => s.subDraws)
  const terms = useStore(s => s.subTerms)
  const me = useStore(s => s.me)
  return {
    tasks: (tasks || []).filter(t => t && (DEMO || !me?.id || t.subUserId === me.id)),
    draws: (draws || []).filter(Boolean),
    terms: terms || [],
  }
}
// Jobs that can be invoiced now: a carpenter's with money left and no draw yet
// this week; any other trade's that hasn't been invoiced yet (lib/subDraws).
const invoiceable = (tasks, terms, draws) => tasks.filter(t => canInvoice(t, terms, draws))

const jobName = (l) => [l.client, l.address].filter(Boolean).join(' · ') || l.title || 'Job'
const dateLabel = (ymd) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')

function StatusPill({ d }) {
  const st = DRAW_STATUS[d.status] || DRAW_STATUS.submitted
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
}

// Outside Monday–Thursday: when they can send next, instead of the button.
function WindowClosed() {
  const next = new Date(`${nextInvoiceMonday()}T12:00:00`)
    .toLocaleDateString(getLang() === 'es' ? 'es-US' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  return (
    <div className="rounded-xl bg-amber-50 px-4 py-3 text-base text-amber-900">
      <p className="font-semibold">{tr('Invoices can be sent Monday through Thursday.')}</p>
      <p>{tr('Next:')} {next}</p>
    </div>
  )
}

function SendButton() {
  const navigate = useNavigate()
  if (!invoiceWindowOpen()) return <WindowClosed />
  return (
    <div className="space-y-1.5">
      <button onClick={() => navigate('/invoices/new')}
        className="w-full h-14 rounded-xl bg-[var(--brand-600)] text-white text-base font-bold flex items-center justify-center gap-2">
        <Send size={20} /> {tr('Send an invoice')}
      </button>
      <p className="text-sm text-gray-500 text-center">{tr('Send by Thursday at midnight.')}</p>
    </div>
  )
}

// On the task list: this week's invoices, and the button to send one.
export function WeekInvoiceCard() {
  const navigate = useNavigate()
  const { tasks, draws, terms } = useMine()
  const monday = weekOf()
  const sent = draws.filter(d => d.status !== 'rejected' && d.weekOf === monday)
  const open = invoiceable(tasks, terms, draws)
  if (!sent.length && !open.length && !draws.length) return null
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText size={18} className="text-gray-500" />
        <p className="flex-1 text-base font-semibold text-gray-900">{tr('Invoices')}</p>
        <button onClick={() => navigate('/invoices')} className="text-sm font-semibold text-[var(--brand-700)]">{tr('All invoices')}</button>
      </div>
      {sent.map(d => (
        <button key={d.id} onClick={() => navigate('/invoices')} className="w-full flex items-center gap-3 text-left">
          <span className="flex-1 min-w-0 truncate text-base text-gray-800">{money(d.total)} · {jobName((d.lines || [])[0] || {})}</span>
          <StatusPill d={d} />
        </button>
      ))}
      {open.length > 0 ? <SendButton /> : !sent.length && <p className="text-sm text-gray-500">{tr('Nothing left to invoice on your jobs this week.')}</p>}
    </Card>
  )
}

// Every invoice this sub has sent, newest first.
export function InvoicesScreen() {
  const { tasks, draws, terms } = useMine()
  const list = [...draws].sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))
  return (
    <div className="space-y-4">
      <BackButton />
      <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
      {invoiceable(tasks, terms, draws).length > 0 && <SendButton />}
      {list.length === 0 && <p className="text-sm text-gray-500 px-1">No invoices sent yet.</p>}
      {list.map(d => (
        <Card key={d.id} className="p-4 space-y-1.5">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-gray-900">{money(d.total)}</p>
              <p className="text-sm text-gray-500">{dateLabel(d.date || d.weekOf)}{(d.workTypes || []).length ? ` · ${d.workTypes.join(', ')}` : ''}</p>
            </div>
            <StatusPill d={d} />
          </div>
          {(d.lines || []).map(l => <p key={l.taskId} className="text-sm text-gray-700 truncate">{jobName(l)}</p>)}
          {d.status === 'rejected' && d.reason && <p className="text-sm text-red-700">Sent back: {d.reason}</p>}
        </Card>
      ))}
    </div>
  )
}

// One question, worded like the Google Form: ENGLISH (Español) *
function Q({ en, es, required, children }) {
  return (
    <Card className="p-4 space-y-3">
      <p className="text-base text-gray-900 leading-snug">
        <span className="font-bold uppercase">{en}</span> <span className="text-gray-600">({es})</span>
        {required && <span className="text-red-600"> *</span>}
      </p>
      {children}
    </Card>
  )
}
const field = 'w-full h-12 px-3 rounded-xl border border-gray-300 bg-white text-base text-gray-900 outline-none focus:border-[var(--brand-600)]'
const fixed = 'w-full min-h-12 px-3 py-3 rounded-xl bg-gray-100 text-base text-gray-800'

function PickedFile({ f, onRemove }) {
  const url = useMemo(() => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null), [f])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return (
    <li className="flex items-center gap-3">
      {url ? <img src={url} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-200 shrink-0" />
        : <span className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">PDF</span>}
      <span className="flex-1 min-w-0 truncate text-sm text-gray-800">{f.name}</span>
      <button type="button" onClick={onRemove} className="h-10 w-10 rounded-full flex items-center justify-center text-gray-500 active:bg-gray-100" aria-label={`Remove ${f.name}`}><X size={18} /></button>
    </li>
  )
}

// The invoice form.
export function NewInvoiceScreen() {
  const navigate = useNavigate()
  const { tasks, draws, terms } = useMine()
  const me = useStore(s => s.me)
  const orgId = useStore(s => s.orgId)
  const addSubDraw = useStore(s => s.addSubDraw)
  const jobs = useMemo(() => invoiceable(tasks, terms, draws), [tasks, terms, draws])
  const company = tasks.find(t => t.subName)?.subName || ''
  const [taskId, setTaskId] = useState(() => (jobs.length === 1 ? jobs[0].id : ''))
  const [date, setDate] = useState(todayStr())
  const [workTypes, setWorkTypes] = useState([])
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState([])        // File objects; uploaded on Submit
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const pickRef = useRef(null)

  const task = jobs.find(t => String(t.id) === String(taskId)) || null
  // The trade booked for this job fills in the work type; picked only when there's none
  const trade = tradeOf(task) || (jobs.length && jobs.every(t => tradeOf(t) && tradeOf(t) === tradeOf(jobs[0])) ? tradeOf(jobs[0]) : '')
  const work = trade ? [trade] : workTypes
  const draw = drawsAllowed(task)   // carpenters draw against the agreed amount
  const left = task && draw ? remainingOn(task.id, terms, draws) : 0
  const amt = round2(amount)
  const over = task && draw && amt > left
  const missing = {
    job: !task, date: !date, work: !work.length, amount: !(amt > 0),
  }
  const ready = !Object.values(missing).some(Boolean) && !over

  const toggleWork = (k) => setWorkTypes(w => (w.includes(k) ? w.filter(x => x !== k) : [...w, k]))
  const addFiles = (list) => {
    const picked = [...(list || [])]
    setFiles(f => [...f, ...picked].slice(0, MAX_FILES))
    if (pickRef.current) pickRef.current.value = ''
  }

  const send = async () => {
    setTried(true)
    if (!ready || busy) return
    if (!window.confirm(`Send the office an invoice for ${money(amt)}?`)) return
    setBusy(true); setErr('')
    try {
      const uploaded = []
      for (const f of files) uploaded.push(await uploadInvoiceFile({ orgId, taskId: task.id, file: f }))
      const draw = {
        id: newDrawId(),
        subId: task.subId, subName: task.subName || company, subUserId: me?.id || null, email: me?.email || '',
        date, weekOf: weekOf(), workTypes: work, status: 'submitted', notes: notes.trim(), total: amt, files: uploaded,
        lines: [{ taskId: task.id, proposalId: task.proposalId, client: task.client || '', address: task.address || '', title: task.title || '', amount: amt }],
      }
      if (!DEMO) await submitSubDraw(draw)
      addSubDraw(draw)
      navigate('/invoices', { replace: true })
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const need = (k) => tried && missing[k] && <p className="text-sm text-red-600">This is a required question (Esta pregunta es obligatoria)</p>

  if (!invoiceWindowOpen()) {
    return (
      <div className="space-y-4">
        <BackButton />
        <WindowClosed />
      </div>
    )
  }
  if (!jobs.length) {
    return (
      <div className="space-y-4">
        <BackButton />
        <p className="text-base text-gray-700">Nothing left to invoice on your jobs this week.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-6">
      <BackButton />
      <h1 className="text-2xl font-bold text-gray-900">Subcontractor invoice</h1>

      <Q en="Email" es="Correo">
        <p className={fixed}>{me?.email || '—'}</p>
      </Q>

      <Q en="Company name" es="Nombre de Empresa" required>
        <p className={fixed}>{company || '—'}</p>
      </Q>

      <Q en="Date" es="Fecha" required>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className={field} aria-label="Date" />
        {need('date')}
      </Q>

      <Q en="Job name / address" es="Nombre del trabajo / Dirección" required>
        <select value={taskId} onChange={e => setTaskId(e.target.value)} className={field} aria-label="Job">
          <option value="">Choose</option>
          {jobs.map(t => <option key={t.id} value={t.id}>{jobName(t)}{t.title ? ` — ${t.title}` : ''}</option>)}
        </select>
        {need('job')}
      </Q>

      <Q en="Work type" es="Tipo de trabajo" required>
        {trade ? <p className={fixed}>{trade}{tradeEs(trade) && tradeEs(trade) !== trade ? ` (${tradeEs(trade)})` : ''}</p> : <>
        <div className="space-y-1">
          {WORK_TYPES.map(w => {
            const on = workTypes.includes(w.key)
            return (
              <button key={w.key} type="button" onClick={() => toggleWork(w.key)} aria-pressed={on}
                className="w-full h-12 flex items-center gap-3 text-left text-base text-gray-900">
                <span className={`h-6 w-6 rounded-md border-2 flex items-center justify-center ${on ? 'bg-[var(--brand-600)] border-[var(--brand-600)] text-white' : 'border-gray-400'}`}>{on && <Check size={16} />}</span>
                {w.key} ({w.es})
              </button>
            )
          })}
        </div>
        {need('work')}
        </>}
      </Q>

      <Q en="Invoice amount" es="Total de la factura" required>
        <label className={`flex items-center gap-2 h-12 px-3 rounded-xl border bg-white ${over ? 'border-red-400' : 'border-gray-300'}`}>
          <span className="text-base text-gray-500">$</span>
          <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            className="flex-1 min-w-0 bg-transparent text-base text-gray-900 outline-none" aria-label="Invoice amount" />
        </label>
        {task && draw && <p className={`text-sm ${over ? 'text-red-600' : 'text-gray-500'}`}>{over ? `That's more than the ${money(left)} left on this job.` : `${money(left)} left on this job (of ${money(agreedOf(task.id, terms))}).`}</p>}
        {need('amount')}
      </Q>

      <Q en="Notes/comments" es="Notas/Comentarios">
        <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-white text-base text-gray-900 outline-none resize-none" aria-label="Notes" />
      </Q>

      <Q en="Invoice upload file/photo" es="Carga de archivo/foto de factura">
        <p className="text-sm text-gray-500">Up to {MAX_FILES} photos or PDFs.</p>
        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((f, i) => <PickedFile key={`${f.name}-${i}`} f={f} onRemove={() => setFiles(list => list.filter((_, j) => j !== i))} />)}
          </ul>
        )}
        {files.length < MAX_FILES && (
          <label className="inline-flex items-center gap-2 h-12 px-4 rounded-xl border border-gray-300 text-base font-semibold text-[var(--brand-700)] active:bg-gray-50 cursor-pointer">
            <Paperclip size={18} /> Add file
            <input ref={pickRef} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={e => addFiles(e.target.files)} />
          </label>
        )}
      </Q>

      {err && <p className="text-sm text-red-600 px-1">{err}</p>}
      <button onClick={send} disabled={busy}
        className="w-full h-14 rounded-xl bg-green-600 active:bg-green-700 text-white text-lg font-bold flex items-center justify-center gap-2 disabled:bg-gray-300">
        <Send size={20} /> {busy ? 'Sending…' : 'Submit (Enviar)'}
      </button>
    </div>
  )
}

// One line on a task: agreed / drawn / left (only when an amount is agreed).
export function TaskMoneyLine({ task }) {
  const draws = useStore(s => s.subDraws)
  const terms = useStore(s => s.subTerms)
  const agreed = agreedOf(task.id, terms)
  if (!drawsAllowed(task) || !(agreed > 0)) return null
  const left = remainingOn(task.id, terms, draws || [])
  return (
    <p className="text-base text-gray-800 flex items-center gap-2">
      <FileText size={18} className="text-gray-500 shrink-0" /> {tr('Agreed')} {money(agreed)} · {money(left)} {tr('left to invoice')}
    </p>
  )
}
