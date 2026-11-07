// ── Paint view ───────────────────────────────────────────────────────────────
// Field mode for the paint PM. Three tabs and a paint-only job page:
//
//   Queue      — jobs ready for paint now, and the ones a few steps away
//   Schedule   — paint dates and crews for the next two weeks
//   Touch-ups  — every open touch-up, across jobs
//   Paint job  — date + crew, Mark paint done, paint details (product,
//                color, sheen, areas), touch-ups, the Pre-Paint payment
//                they collect, notes
//
// Only jobs where Deck Plus does the paint are shown: a job is skipped when
// its contract marks painting as the client's responsibility.
//
// Data (all on the job, so the office sees it too):
//   jobData.stageDates.paint      paint date (same as the PM calendar)
//   jobData.paint                 { crew, product, color, sheen, areas, notes }
//   jobData.touchUps              [{ id, text, done, createdAt, doneAt, by }]
//   jobData.paymentsReceived      the Pre-Paint payment, when collected
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Check, CheckCircle2, Circle, CalendarDays, Users, Phone, MessageSquare, Navigation,
  PaintRoller, Plus, Wallet, ChevronRight,
} from 'lucide-react'
import { useStore } from '../store'
import { isJob, isJobClosed } from '../lib/attention'
import { jobFinancials } from '../lib/finance'
import {
  todayStr, addDays, dayLabel, mapsUrl, telUrl, smsUrl, describeJob,
  Card, BackButton, QuickAction, QuickNote, RecentNotes, useUndo,
} from './shared'

const money = (v) => '$' + Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const H2 = ({ children }) => <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">{children}</h2>

// Contract says the client paints → not ours.
function clientPaints(p) {
  const c = p.contractDraft?.dp?.checks || {}
  return (c.pd_no || c.paint_client) && !(c.pd_yes || c.paint_deckplus)
}

// Every open job we paint, with its paint facts.
function usePaintJobs() {
  const proposals = useStore(s => s.proposals)
  return useMemo(() => proposals
    .filter(p => isJob(p) && !isJobClosed(p) && !clientPaints(p))
    .map(p => describeJob(p, null))
    .filter(j => j.stages.some(s => s.key === 'paint'))
    .map(j => {
      const jd = j.p.jobData || {}
      return {
        ...j,
        painted: j.done.has('paint'),
        crew: jd.paint?.crew || '',
        touchUps: (jd.touchUps || []).filter(t => !t.done),
      }
    })
    .sort((a, b) => (a.p.client || '').localeCompare(b.p.client || '')), [proposals])
}

function PaintRow({ j, sub, tone }) {
  const navigate = useNavigate()
  const toneCls = { green: 'border-l-green-500', amber: 'border-l-amber-400', blue: 'border-l-[var(--brand-600)]' }[tone] || 'border-l-transparent'
  return (
    <button onClick={() => navigate(`/field/job/${j.p.id}`)}
      className={`w-full text-left bg-white rounded-2xl border border-gray-200 border-l-4 ${toneCls} shadow-sm px-4 py-3.5 flex items-center gap-3 active:bg-gray-50`}>
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-gray-900 truncate">{j.p.client || 'Unnamed job'}</p>
        {j.p.address && <p className="text-sm text-gray-500 truncate">{j.p.address}</p>}
        <p className="text-sm font-medium text-gray-800 truncate">{sub}</p>
      </div>
      <ChevronRight size={20} className="text-gray-300 shrink-0" />
    </button>
  )
}

const whenLine = (j) => [
  j.paintDate ? dayLabel(j.paintDate) : 'Not scheduled',
  j.crew || null,
].filter(Boolean).join(' · ')

// ── Queue ───────────────────────────────────────────────────────────────────
export function PaintQueue() {
  const jobs = usePaintJobs()
  const ready = jobs.filter(j => !j.painted && j.paintIndex === 0)
  const soon = jobs.filter(j => !j.painted && j.paintIndex > 0 && j.paintIndex <= 3)
    .sort((a, b) => a.paintIndex - b.paintIndex)
  const unscheduled = ready.filter(j => !j.paintDate).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paint queue</h1>
        <p className="text-sm text-gray-500">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4"><p className="text-3xl font-bold text-gray-900">{ready.length}</p><p className="text-sm text-gray-500">ready to paint</p></Card>
        <Card className={`p-4 ${unscheduled ? 'border-amber-300' : ''}`}>
          <p className={`text-3xl font-bold ${unscheduled ? 'text-amber-600' : 'text-green-600'}`}>{unscheduled}</p>
          <p className="text-sm text-gray-500">need a date</p>
        </Card>
      </div>
      <div className="space-y-2.5">
        <H2>Ready for paint</H2>
        {ready.length === 0 && <p className="text-sm text-gray-500 px-1">Nothing is waiting on paint.</p>}
        {ready.map(j => <PaintRow key={j.p.id} j={j} tone={j.paintDate ? 'blue' : 'amber'} sub={whenLine(j)} />)}
      </div>
      <div className="space-y-2.5">
        <H2>Coming up</H2>
        {soon.length === 0 && <p className="text-sm text-gray-500 px-1">Nothing lined up behind those.</p>}
        {soon.map(j => (
          <PaintRow key={j.p.id} j={j}
            sub={`${j.paintIndex} step${j.paintIndex > 1 ? 's' : ''} before paint · now: ${j.next?.label || ''}`} />
        ))}
      </div>
    </div>
  )
}

// ── Schedule ────────────────────────────────────────────────────────────────
export function PaintSchedule() {
  const jobs = usePaintJobs()
  const today = todayStr()
  const end = addDays(14)
  const dated = jobs.filter(j => !j.painted && j.paintDate && j.paintDate < end)
    .sort((a, b) => a.paintDate.localeCompare(b.paintDate))
  const byDay = []
  for (const j of dated) {
    const key = j.paintDate < today ? 'late' : j.paintDate
    const last = byDay[byDay.length - 1]
    if (last?.key === key) last.jobs.push(j)
    else byDay.push({ key, jobs: [j] })
  }
  const unscheduled = jobs.filter(j => !j.painted && !j.paintDate && j.paintIndex === 0)

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Paint schedule</h1>
      {byDay.length === 0 && <p className="text-sm text-gray-500 px-1">No paint dates in the next two weeks.</p>}
      {byDay.map(d => (
        <div key={d.key} className="space-y-2.5">
          <H2>{d.key === 'late' ? 'Past date — not marked done' : dayLabel(d.key)}</H2>
          {d.jobs.map(j => <PaintRow key={j.p.id} j={j} tone={d.key === 'late' ? 'amber' : 'blue'} sub={j.crew || 'No crew set'} />)}
        </div>
      ))}
      <div className="space-y-2.5">
        <H2>Ready, no date yet ({unscheduled.length})</H2>
        {unscheduled.length === 0 && <p className="text-sm text-gray-500 px-1">Every ready job has a date.</p>}
        {unscheduled.map(j => <PaintRow key={j.p.id} j={j} tone="amber" sub="Tap to set a date and crew" />)}
      </div>
    </div>
  )
}

// ── Touch-ups ───────────────────────────────────────────────────────────────
export function PaintTouchUps() {
  const jobs = usePaintJobs().filter(j => j.touchUps.length)
  const updateJobData = useStore(s => s.updateJobData)
  const navigate = useNavigate()
  const [toast, showToast] = useUndo()
  const setDone = (j, id, done) => {
    const list = (j.p.jobData?.touchUps || []).map(t => t.id === id ? { ...t, done, doneAt: done ? new Date().toISOString() : null } : t)
    updateJobData(j.p.id, { touchUps: list })
  }
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Touch-ups</h1>
      {jobs.length === 0 && (
        <Card className="p-5 flex items-center gap-3">
          <CheckCircle2 size={26} className="text-green-500 shrink-0" />
          <p className="text-base font-medium text-gray-800">No open touch-ups.</p>
        </Card>
      )}
      {jobs.map(j => (
        <Card key={j.p.id} className="overflow-hidden">
          <button onClick={() => navigate(`/field/job/${j.p.id}`)} className="w-full text-left px-4 pt-3.5 pb-2 flex items-center gap-2">
            <span className="flex-1 min-w-0">
              <span className="block text-base font-semibold text-gray-900 truncate">{j.p.client || 'Unnamed job'}</span>
              {j.p.address && <span className="block text-sm text-gray-500 truncate">{j.p.address}</span>}
            </span>
            <ChevronRight size={20} className="text-gray-300 shrink-0" />
          </button>
          <ul className="divide-y divide-gray-100 border-t border-gray-100">
            {j.touchUps.map(t => (
              <li key={t.id}>
                <button onClick={() => { setDone(j, t.id, true); showToast('Touch-up done', () => setDone(j, t.id, false)) }}
                  className="w-full px-4 py-3 min-h-14 flex items-center gap-3 text-left active:bg-gray-50">
                  <Circle size={24} className="text-gray-300 shrink-0" />
                  <span className="flex-1 text-base text-gray-900">{t.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {toast}
    </div>
  )
}

// ── One paint job ───────────────────────────────────────────────────────────
const PRODUCTS = ['Paint', 'Solid stain', 'Semi-transparent stain', 'Clear sealer']
const SHEENS = ['Flat', 'Satin', 'Semi-gloss', 'Gloss']

export function PaintJob() {
  const { id } = useParams()
  const proposal = useStore(s => s.proposals.find(p => String(p.id) === String(id)))
  const toggleJobStage = useStore(s => s.toggleJobStage)
  const setJobStageDate = useStore(s => s.setJobStageDate)
  const updateJobData = useStore(s => s.updateJobData)
  const allProposals = useStore(s => s.proposals)
  const [toast, showToast] = useUndo()

  // Crews used on other jobs, offered as suggestions
  const crews = useMemo(() => [...new Set(allProposals.map(p => p.jobData?.paint?.crew).filter(Boolean))].sort(), [allProposals])

  if (!proposal) return <div className="space-y-4"><BackButton /><p className="text-base text-gray-600">That job isn't here anymore.</p></div>

  const jd = proposal.jobData || {}
  const paint = jd.paint || {}
  const painted = (jd.completedStages || []).includes('paint')
  const setPaint = (changes) => updateJobData(proposal.id, { paint: { ...paint, ...changes } })
  const togglePaint = () => {
    toggleJobStage(proposal.id, 'paint')
    showToast(painted ? 'Paint marked not done' : 'Paint done', () => toggleJobStage(proposal.id, 'paint'))
  }

  return (
    <div className="space-y-4">
      <BackButton />
      <div>
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">{proposal.client || 'Unnamed job'}</h1>
        {proposal.address && <p className="text-base text-gray-600 mt-0.5">{proposal.address}</p>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <QuickAction href={proposal.phone ? telUrl(proposal.phone) : null} icon={Phone} label="Call" />
        <QuickAction href={proposal.phone ? smsUrl(proposal.phone) : null} icon={MessageSquare} label="Text" />
        <QuickAction href={proposal.address ? mapsUrl(proposal.address) : null} icon={Navigation} label="Directions" external />
      </div>

      {/* Date, crew, done */}
      <Card className="p-4 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1.5"><PaintRoller size={14} /> Paint</p>
        {painted ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 size={28} className="text-green-600 shrink-0" />
            <p className="flex-1 text-lg font-bold text-green-800">Paint done</p>
            <button onClick={togglePaint} className="text-sm font-semibold text-gray-500 px-2 py-1">Undo</button>
          </div>
        ) : (
          <>
            <label className="flex items-center gap-3 h-12 px-3 rounded-xl border border-gray-200">
              <CalendarDays size={18} className="text-gray-500 shrink-0" />
              <span className="text-sm text-gray-600 shrink-0">Paint date</span>
              <input id="paint-date" type="date" value={jd.stageDates?.paint || ''}
                onChange={e => setJobStageDate(proposal.id, 'paint', e.target.value || null)}
                className="flex-1 min-w-0 bg-transparent text-base text-gray-900 text-right outline-none" />
            </label>
            <label className="flex items-center gap-3 h-12 px-3 rounded-xl border border-gray-200">
              <Users size={18} className="text-gray-500 shrink-0" />
              <span className="text-sm text-gray-600 shrink-0">Crew</span>
              <input id="paint-crew" list="paint-crews" defaultValue={paint.crew || ''} key={paint.crew || ''}
                onBlur={e => e.target.value.trim() !== (paint.crew || '') && setPaint({ crew: e.target.value.trim() })}
                placeholder="Who's painting?" className="flex-1 min-w-0 bg-transparent text-base text-gray-900 text-right outline-none" />
              <datalist id="paint-crews">{crews.map(c => <option key={c} value={c} />)}</datalist>
            </label>
            <button onClick={togglePaint}
              className="w-full h-16 rounded-xl bg-green-600 active:bg-green-700 text-white text-lg font-bold flex items-center justify-center gap-2 shadow-sm">
              <Check size={24} /> Mark paint done
            </button>
          </>
        )}
      </Card>

      <PaintDetails paint={paint} onSave={setPaint} />
      <TouchUps proposal={proposal} onToast={showToast} />
      <PrePaintPayment proposal={proposal} onToast={showToast} />
      <QuickNote proposalId={proposal.id} onSaved={() => showToast('Note saved')} />
      <RecentNotes proposal={proposal} />
      {toast}
    </div>
  )
}

function PaintDetails({ paint, onSave }) {
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({})
  const has = paint.product || paint.color || paint.sheen || paint.areas || paint.notes
  const start = () => { setF({ product: paint.product || '', color: paint.color || '', sheen: paint.sheen || '', areas: paint.areas || '', notes: paint.notes || '' }); setEditing(true) }
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))
  const input = 'w-full h-12 px-3 rounded-xl border border-gray-300 bg-white text-base text-gray-900'

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold text-gray-900">Paint details</p>
        {!editing && <button onClick={start} className="text-sm font-semibold text-[var(--brand-700)] px-2 py-1">{has ? 'Edit' : 'Add'}</button>}
      </div>
      {editing ? (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <select id="pd-product" aria-label="Product" className={input} value={f.product} onChange={set('product')}>
              <option value="">Product…</option>{PRODUCTS.map(x => <option key={x}>{x}</option>)}
            </select>
            <select id="pd-sheen" aria-label="Sheen" className={input} value={f.sheen} onChange={set('sheen')}>
              <option value="">Sheen…</option>{SHEENS.map(x => <option key={x}>{x}</option>)}
            </select>
          </div>
          <input id="pd-color" className={input} value={f.color} onChange={set('color')} placeholder="Color (brand, name, code)" />
          <input id="pd-areas" className={input} value={f.areas} onChange={set('areas')} placeholder="What gets painted (rails, ceiling, trim…)" />
          <textarea id="pd-notes" rows={2} value={f.notes} onChange={set('notes')} placeholder="Notes for the painter"
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base text-gray-900 bg-white resize-none" />
          <div className="flex gap-2">
            <button onClick={() => { onSave(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()]))); setEditing(false) }}
              className="flex-1 h-12 rounded-xl text-base font-bold text-white bg-[var(--brand-600)]">Save</button>
            <button onClick={() => setEditing(false)} className="h-12 px-5 rounded-xl text-base font-semibold text-gray-600 border border-gray-200">Cancel</button>
          </div>
        </div>
      ) : has ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-base">
          {[['Product', paint.product], ['Color', paint.color], ['Sheen', paint.sheen], ['Areas', paint.areas], ['Notes', paint.notes]]
            .filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-sm text-gray-500 pt-0.5">{k}</dt>
                <dd className="text-gray-900 font-medium whitespace-pre-wrap">{v}</dd>
              </div>
            ))}
        </dl>
      ) : <p className="text-sm text-gray-500">No color or product set yet.</p>}
    </Card>
  )
}

function TouchUps({ proposal, onToast }) {
  const updateJobData = useStore(s => s.updateJobData)
  const me = useStore(s => s.me)
  const [text, setText] = useState('')
  const list = proposal.jobData?.touchUps || []
  const save = (next) => updateJobData(proposal.id, { touchUps: next })
  const add = () => {
    if (!text.trim()) return
    save([...list, { id: `t${Date.now()}`, text: text.trim(), done: false, createdAt: new Date().toISOString(), by: me?.displayName || '' }])
    setText('')
  }
  const toggle = (t) => {
    const flip = (on) => save((proposal.jobData?.touchUps || list).map(x => x.id === t.id ? { ...x, done: on, doneAt: on ? new Date().toISOString() : null } : x))
    flip(!t.done)
    onToast(t.done ? 'Touch-up reopened' : 'Touch-up done', () => flip(t.done))
  }
  const open = list.filter(t => !t.done), done = list.filter(t => t.done)

  return (
    <Card className="p-4 space-y-3">
      <p className="text-base font-semibold text-gray-900">Touch-ups {open.length ? `(${open.length} open)` : ''}</p>
      {[...open, ...done].map(t => (
        <button key={t.id} onClick={() => toggle(t)} className="w-full min-h-12 flex items-center gap-3 text-left">
          {t.done ? <CheckCircle2 size={24} className="text-green-600 shrink-0" /> : <Circle size={24} className="text-gray-300 shrink-0" />}
          <span className={`flex-1 text-base ${t.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{t.text}</span>
        </button>
      ))}
      <div className="flex gap-2">
        <input id="touchup-new" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add a touch-up" className="flex-1 min-w-0 h-12 px-3 rounded-xl border border-gray-300 bg-white text-base text-gray-900" />
        <button onClick={add} disabled={!text.trim()} aria-label="Add touch-up"
          className="h-12 w-12 shrink-0 rounded-xl text-white bg-[var(--brand-600)] disabled:opacity-40 flex items-center justify-center"><Plus size={22} /></button>
      </div>
    </Card>
  )
}

// The Pre-Paint payment: the paint PM collects it, so they can record it.
// Everything else about money stays read-only here.
const isPrePaint = (label = '') => /pre[\s-]?paint/i.test(label)

function PrePaintPayment({ proposal, onToast }) {
  const addJobPayment = useStore(s => s.addJobPayment)
  const removeJobPayment = useStore(s => s.removeJobPayment)
  const fin = useMemo(() => jobFinancials(proposal, [], null), [proposal])
  const received = proposal.jobData?.paymentsReceived || []
  const milestone = fin.milestones.find(m => isPrePaint(m.label))
  const paid = milestone && received.find(r => r.milestone === milestone.label)
  const [method, setMethod] = useState('Check')
  const [confirming, setConfirming] = useState(false)

  const record = () => {
    addJobPayment(proposal.id, { date: todayStr(), amount: Number(milestone.amount) || 0, method, milestone: milestone.label, note: 'Collected by paint PM' })
    setConfirming(false)
    // Undo removes the payment just added (looked up fresh, by its milestone)
    const undo = () => {
      const now = useStore.getState().proposals.find(x => x.id === proposal.id)
      const r = (now?.jobData?.paymentsReceived || []).filter(x => x.milestone === milestone.label).pop()
      if (r) removeJobPayment(proposal.id, r.id)
    }
    onToast(`Pre-Paint payment recorded · ${money(milestone.amount)}`, undo)
  }

  return (
    <Card className="p-4 space-y-3">
      <p className="text-base font-semibold text-gray-900 flex items-center gap-2"><Wallet size={18} className="text-gray-500" /> Pre-Paint payment</p>
      {!milestone ? (
        <p className="text-sm text-gray-500">This job's payment schedule has no Pre-Paint payment.</p>
      ) : paid ? (
        <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 px-3 py-3">
          <CheckCircle2 size={22} className="text-green-600 shrink-0" />
          <p className="text-base text-green-800"><b>{money(paid.amount)}</b> received {dayLabel(paid.date)}{paid.method ? ` · ${paid.method}` : ''}</p>
        </div>
      ) : confirming ? (
        <div className="space-y-2.5">
          <p className="text-base text-gray-900">Record <b>{money(milestone.amount)}</b> received today?</p>
          <select id="prepaint-method" aria-label="Paid by" value={method} onChange={e => setMethod(e.target.value)}
            className="w-full h-12 px-3 rounded-xl border border-gray-300 bg-white text-base text-gray-900">
            {['Check', 'ACH', 'Card', 'Cash', 'Financing', 'Other'].map(m => <option key={m}>{m}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={record} className="flex-1 h-12 rounded-xl text-base font-bold text-white bg-green-600">Yes, received</button>
            <button onClick={() => setConfirming(false)} className="h-12 px-5 rounded-xl text-base font-semibold text-gray-600 border border-gray-200">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <p className="text-base text-gray-900"><b className="tabular-nums">{money(milestone.amount)}</b> due before paint starts</p>
          <button onClick={() => setConfirming(true)}
            className="w-full h-12 rounded-xl text-base font-bold text-[var(--brand-700)] border-2 border-[var(--brand-300)]">Mark Pre-Paint payment received</button>
        </div>
      )}
      {fin.milestones.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-gray-500 font-semibold py-1">Full payment schedule</summary>
          <ul className="mt-2 space-y-1">
            {fin.milestones.map((m, i) => {
              const done = received.some(r => r.milestone === m.label)
              return (
                <li key={i} className="flex items-center gap-2">
                  <span className={`flex-1 ${done ? 'text-gray-400 line-through' : isPrePaint(m.label) ? 'text-gray-900 font-semibold' : 'text-gray-700'}`}>{m.label || `Payment ${i + 1}`}</span>
                  <span className="tabular-nums text-gray-700">{money(m.amount)}</span>
                  {done && <Check size={14} className="text-green-600" />}
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </Card>
  )
}
