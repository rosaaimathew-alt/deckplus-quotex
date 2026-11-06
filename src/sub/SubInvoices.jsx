// ── Sub app: weekly draw invoices ────────────────────────────────────────────
// Once a week a sub asks the office to draw part of the agreed amount on
// their jobs (lib/subDraws). Any amount up to what's left on each job; no
// draw schedule. The office approves or sends it back with a reason.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, ChevronRight, Send } from 'lucide-react'
import { useStore } from '../store'
import { submitSubDraw } from '../supabase'
import { DEMO } from '../demo'
import { Card, BackButton } from '../field/shared'
import { DRAW_STATUS, money, round2, weekOf, weekLabel, remainingOn, agreedOf, thisWeeksDraw, newDrawId } from '../lib/subDraws'

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
// Jobs with money left to draw.
const drawable = (tasks, terms, draws) => tasks.filter(t => remainingOn(t.id, terms, draws) > 0)

function StatusPill({ d }) {
  const st = DRAW_STATUS[d.status] || DRAW_STATUS.submitted
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${st.cls}`}>{st.label}</span>
}

// On the task list: this week's invoice, or the button to send it.
export function WeekInvoiceCard() {
  const navigate = useNavigate()
  const { tasks, draws, terms } = useMine()
  const sent = thisWeeksDraw(draws)
  const open = drawable(tasks, terms, draws)
  if (!sent && !open.length && !draws.length) return null
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText size={18} className="text-gray-500" />
        <p className="flex-1 text-base font-semibold text-gray-900">This week's invoice</p>
        <button onClick={() => navigate('/invoices')} className="text-sm font-semibold text-[var(--brand-700)]">All invoices</button>
      </div>
      {sent ? (
        <button onClick={() => navigate('/invoices')} className="w-full flex items-center gap-3 text-left">
          <span className="flex-1 text-base text-gray-800">{money(sent.total)} sent</span>
          <StatusPill d={sent} />
        </button>
      ) : open.length ? (
        <button onClick={() => navigate('/invoices/new')}
          className="w-full h-14 rounded-xl bg-[var(--brand-600)] text-white text-base font-bold flex items-center justify-center gap-2">
          <Send size={20} /> Send this week's invoice
        </button>
      ) : (
        <p className="text-sm text-gray-500">Nothing left to draw on your jobs.</p>
      )}
    </Card>
  )
}

// Every invoice this sub has sent, newest first.
export function InvoicesScreen() {
  const navigate = useNavigate()
  const { tasks, draws, terms } = useMine()
  const list = [...draws].sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))
  const canSend = !thisWeeksDraw(draws) && drawable(tasks, terms, draws).length > 0
  return (
    <div className="space-y-4">
      <BackButton />
      <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
      {canSend && (
        <button onClick={() => navigate('/invoices/new')}
          className="w-full h-14 rounded-xl bg-[var(--brand-600)] text-white text-base font-bold flex items-center justify-center gap-2">
          <Send size={20} /> Send this week's invoice
        </button>
      )}
      {list.length === 0 && <p className="text-sm text-gray-500 px-1">No invoices sent yet.</p>}
      {list.map(d => (
        <Card key={d.id} className="p-4 space-y-2">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-gray-900">{money(d.total)}</p>
              <p className="text-sm text-gray-500">{weekLabel(d.weekOf)}{d.number ? ` · #${d.number}` : ''}</p>
            </div>
            <StatusPill d={d} />
          </div>
          <ul className="text-sm text-gray-700 space-y-0.5">
            {(d.lines || []).map(l => <li key={l.taskId} className="flex gap-2"><span className="flex-1 truncate">{l.title} · {l.client}</span><span>{money(l.amount)}</span></li>)}
          </ul>
          {d.status === 'rejected' && d.reason && <p className="text-sm text-red-700">Sent back: {d.reason}</p>}
        </Card>
      ))}
    </div>
  )
}

// The invoice form.
export function NewInvoiceScreen() {
  const navigate = useNavigate()
  const { tasks, draws, terms } = useMine()
  const me = useStore(s => s.me)
  const addSubDraw = useStore(s => s.addSubDraw)
  const jobs = useMemo(() => drawable(tasks, terms, draws), [tasks, terms, draws])
  const [amounts, setAmounts] = useState({})   // taskId → string
  const [notes, setNotes] = useState({})       // taskId → what was done
  const [number, setNumber] = useState('')
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const monday = weekOf()
  const already = thisWeeksDraw(draws, monday)

  const lines = jobs.map(t => ({ t, left: remainingOn(t.id, terms, draws), amt: round2(amounts[t.id]) }))
  const picked = lines.filter(l => l.amt > 0)
  const over = lines.find(l => l.amt > l.left)
  const total = round2(picked.reduce((s, l) => s + l.amt, 0))

  const send = async () => {
    if (!picked.length || over || busy) return
    if (!window.confirm(`Send the office an invoice for ${money(total)}?`)) return
    setBusy(true); setErr('')
    const draw = {
      id: newDrawId(),
      subId: picked[0].t.subId, subName: picked[0].t.subName || '', subUserId: me?.id || null,
      weekOf: monday, status: 'submitted', number: number.trim(), notes: memo.trim(), total,
      lines: picked.map(({ t, amt }) => ({ taskId: t.id, proposalId: t.proposalId, client: t.client || '', title: t.title || '', amount: amt, note: (notes[t.id] || '').trim() })),
    }
    try {
      if (!DEMO) await submitSubDraw(draw)
      addSubDraw(draw)
      navigate('/invoices', { replace: true })
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (already) {
    return (
      <div className="space-y-4">
        <BackButton />
        <p className="text-base text-gray-700">This week's invoice was already sent ({money(already.total)}). You can send the next one on Monday.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-6">
      <BackButton />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">This week's invoice</h1>
        <p className="text-sm text-gray-500">{weekLabel(monday)}</p>
      </div>

      {jobs.length === 0 && <p className="text-base text-gray-600">Nothing left to draw on your jobs.</p>}

      {lines.map(({ t, left, amt }) => (
        <Card key={t.id} className={`p-4 space-y-3 ${amt > left ? 'border-red-300' : ''}`}>
          <div>
            <p className="text-base font-semibold text-gray-900">{t.title}</p>
            <p className="text-sm text-gray-500">{t.client}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <p className="text-gray-500">Agreed <span className="block text-base font-semibold text-gray-900">{money(agreedOf(t.id, terms))}</span></p>
            <p className="text-gray-500">Left to draw <span className="block text-base font-semibold text-gray-900">{money(left)}</span></p>
          </div>
          <label className="flex items-center gap-2 h-12 px-3 rounded-xl border border-gray-300 bg-white">
            <span className="text-base text-gray-500">$</span>
            <input inputMode="decimal" value={amounts[t.id] || ''} placeholder="Amount this week"
              onChange={e => setAmounts(a => ({ ...a, [t.id]: e.target.value.replace(/[^\d.]/g, '') }))}
              className="flex-1 min-w-0 bg-transparent text-base text-gray-900 outline-none" aria-label={`Amount for ${t.title}`} />
            <button type="button" onClick={() => setAmounts(a => ({ ...a, [t.id]: String(left) }))} className="text-sm font-semibold text-[var(--brand-700)] shrink-0">All of it</button>
          </label>
          {amt > left && <p className="text-sm text-red-600">That's more than the {money(left)} left on this job.</p>}
          {amt > 0 && (
            <input value={notes[t.id] || ''} onChange={e => setNotes(n => ({ ...n, [t.id]: e.target.value }))} placeholder="What was done this week"
              className="w-full h-12 px-3 rounded-xl border border-gray-300 bg-white text-base text-gray-900 outline-none" />
          )}
        </Card>
      ))}

      {jobs.length > 0 && (
        <Card className="p-4 space-y-3">
          <input value={number} onChange={e => setNumber(e.target.value)} placeholder="Your invoice # (optional)"
            className="w-full h-12 px-3 rounded-xl border border-gray-300 bg-white text-base text-gray-900 outline-none" />
          <textarea rows={2} value={memo} onChange={e => setMemo(e.target.value)} placeholder="Notes for the office (optional)"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-300 bg-white text-base text-gray-900 outline-none resize-none" />
          <div className="flex items-center justify-between">
            <p className="text-base text-gray-600">Total</p>
            <p className="text-2xl font-bold text-gray-900">{money(total)}</p>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <button onClick={send} disabled={!picked.length || !!over || busy}
            className="w-full h-14 rounded-xl bg-green-600 active:bg-green-700 text-white text-lg font-bold flex items-center justify-center gap-2 disabled:bg-gray-300">
            <Send size={20} /> {busy ? 'Sending…' : 'Send to the office'}
          </button>
        </Card>
      )}
    </div>
  )
}

// One line on a task: agreed / drawn / left (only when an amount is agreed).
export function TaskMoneyLine({ task }) {
  const draws = useStore(s => s.subDraws)
  const terms = useStore(s => s.subTerms)
  const agreed = agreedOf(task.id, terms)
  if (!(agreed > 0)) return null
  const left = remainingOn(task.id, terms, draws || [])
  return (
    <p className="text-base text-gray-800 flex items-center gap-2">
      <FileText size={18} className="text-gray-500 shrink-0" /> Agreed {money(agreed)} · {money(left)} left to draw
    </p>
  )
}
