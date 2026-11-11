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
//   jobData.paint                 { crew, colors: [{ color, areas, product, sheen }], notes }
//                                 (+ the first color in product / color / sheen / areas)
//   jobData.touchUps              [{ id, text, done, createdAt, doneAt, by }]
//   jobData.paymentsReceived      the Pre-Paint payment, when collected
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Check, CheckCircle2, Circle, CalendarDays, Users, Phone, MessageSquare, Navigation,
  PaintRoller, Plus, Wallet, ChevronRight, UserPlus,
} from 'lucide-react'
import { useStore } from '../store'
import { createPaintCrewInvite } from '../supabase'
import { DEMO } from '../demo'
import { blankColor, tidyColor, hasColor, paintColorsOf } from '../lib/paintColors'
import { STATUS_PILL, statusKey, statusLabel } from '../lib/subTasks'
import { PhotoDays } from '../components/TaskPhotos'
import { missingTodaysPhotos } from '../lib/taskPhotos'
import { usePaintCrew } from './usePaintCrew'
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
  const subTasks = useStore(s => s.subTasks)
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
        // The painters put on this job (PaintersOnJob), each with where they stand
        painters: (subTasks || []).filter(t => t && t.paint && t.crewName && String(t.proposalId) === String(j.p.id)),
      }
    })
    .sort((a, b) => (a.p.client || '').localeCompare(b.p.client || '')), [proposals, subTasks])
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
        {(j.painters || []).length > 0 && (
          <p className="text-sm text-gray-600 truncate">{j.painters.map(t => `${t.crewName} · ${statusLabel(t)}`).join(', ')}</p>
        )}
        {(j.painters || []).some(missingTodaysPhotos) && <p className="text-sm font-semibold text-red-600">Photos needed today</p>}
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
const PRODUCTS = ['Paint', 'Solid stain', 'Semi-solid stain', 'Semi-transparent stain', 'Clear coat']
const SHEENS = ['Flat', 'Satin', 'Semi-gloss', 'Gloss', 'High gloss']
// A choice saved before the list changed (e.g. "Clear sealer") stays selectable on that job.
const withSaved = (list, v) => (v && !list.includes(v) ? [...list, v] : list)
const newTouchUpId = () => `t${Date.now()}`

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

      <PaintersOnJob proposal={proposal} />
      <PaintDetails paint={paint} onSave={setPaint} />
      <TouchUps proposal={proposal} onToast={showToast} />
      <PrePaintPayment proposal={proposal} onToast={showToast} />
      <QuickNote proposalId={proposal.id} onSaved={() => showToast('Note saved')} />
      <RecentNotes proposal={proposal} />
      {toast}
    </div>
  )
}

// Which painters are on this job. Each painter put on it sees the job on their
// phone (address, colors, touch-ups), sends the daily photos and moves it
// along. Several painters can be on one job; each has their own entry.
function PaintersOnJob({ proposal }) {
  const navigate = useNavigate()
  const crew = usePaintCrew()
  const me = useStore(s => s.me)
  const tasks = useStore(s => s.subTasks)
  const addSubTask = useStore(s => s.addSubTask)
  const deleteSubTask = useStore(s => s.deleteSubTask)
  const onJob = (tasks || []).filter(t => t && t.paint && String(t.proposalId) === String(proposal.id))
  const taskOf = (c) => onJob.find(t => t.crewUserId && t.crewUserId === c.userId)
  const toggle = (c) => {
    const t = taskOf(c)
    if (t) {
      const started = statusKey(t) !== 'booked' || (t.photos || []).length > 0
      if (started && !window.confirm(`Take ${c.name} off this job?`)) return
      deleteSubTask(t.id)
      return
    }
    addSubTask({
      paint: true, proposalId: proposal.id, subId: crew.id, subName: crew.name || 'Paint crew',
      subUserId: me?.id || null, pmId: me?.id || null, crewUserId: c.userId, crewName: c.name,
      title: 'Paint', notes: '', startDate: proposal.jobData?.stageDates?.paint || null, endDate: null,
      client: proposal.client || '', address: proposal.address || '',
    })
  }
  const ready = crew.crew.filter(c => c.userId)
  const waiting = crew.crew.filter(c => !c.userId)
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold text-gray-900 flex items-center gap-2"><Users size={18} className="text-gray-500" /> Painters on this job</p>
        <button onClick={() => navigate('/field/crew')} className="text-sm font-semibold text-[var(--brand-700)] px-2 py-1">Crew</button>
      </div>
      {crew.crew.length === 0 && <p className="text-sm text-gray-500">{crew.loaded ? 'Add your painters under Crew first.' : 'Loading…'}</p>}
      <div className="space-y-2">
        {ready.map(c => {
          const t = taskOf(c)
          return (
            <div key={c.email} className={`rounded-xl border ${t ? 'border-[var(--brand-600)] bg-[var(--brand-50)]' : 'border-gray-200'}`}>
              <button onClick={() => toggle(c)} aria-pressed={!!t} aria-label={`${c.name} on this job`}
                className="w-full min-h-12 px-3 py-2 flex items-center gap-3 text-left">
                {t ? <CheckCircle2 size={24} className="text-[var(--brand-600)] shrink-0" /> : <Circle size={24} className="text-gray-300 shrink-0" />}
                <span className="flex-1 min-w-0 text-base font-medium text-gray-900 truncate">{c.name}</span>
                {t && <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_PILL[statusKey(t)]}`}>{statusLabel(t)}</span>}
              </button>
              {t && (t.photos || []).length > 0 && <div className="px-3 pb-3"><PhotoDays task={t} big /></div>}
            </div>
          )
        })}
        {waiting.map(c => (
          <div key={c.email} className="min-h-12 px-3 py-2 flex items-center gap-3 rounded-xl border border-dashed border-gray-200">
            <Circle size={24} className="text-gray-200 shrink-0" />
            <span className="flex-1 min-w-0 text-base text-gray-500 truncate">{c.name}</span>
            <span className="text-sm text-gray-500 shrink-0">Hasn't signed up yet</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── Crew: the paint PM's painters ────────────────────────────────────────────
// Add a painter (name, email, phone): they get a link to set their own
// password, then see the jobs they're put on in the sub app on their phone.
export function PaintCrew() {
  const crew = usePaintCrew()
  const [f, setF] = useState({ name: '', email: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))
  const input = 'w-full h-12 px-3 rounded-xl border border-gray-300 bg-white text-base text-gray-900 outline-none'
  const invite = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      if (DEMO) throw new Error('Invites are turned off in the demo.')
      const r = await createPaintCrewInvite(f.email.trim(), f.name.trim(), f.phone.trim())
      const link = `${window.location.origin}/signup?code=${r.code}`
      try { await navigator.clipboard?.writeText(link) } catch { /* shown below */ }
      setMsg({ ok: true, text: `Link for ${r.display_name} copied. Text it to them; it works for 14 days.`, link })
      setF({ name: '', email: '', phone: '' })
      crew.reload()
    } catch (err) { setMsg({ ok: false, text: err.message }) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Crew</h1>
      <Card className="divide-y divide-gray-100 overflow-hidden">
        {crew.crew.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">{crew.loaded ? 'No painters yet.' : 'Loading…'}</p>}
        {crew.crew.map(c => (
          <div key={c.email} className="px-4 py-3 flex items-center gap-3">
            <span className="flex-1 min-w-0">
              <span className="block text-base font-medium text-gray-900 truncate">{c.name}</span>
              <span className="block text-sm text-gray-500 truncate">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
            </span>
            {c.phone && <a href={telUrl(c.phone)} aria-label={`Call ${c.name}`} className="p-2 text-[var(--brand-700)]"><Phone size={20} /></a>}
            {c.userId
              ? <span className="text-sm font-semibold text-green-700 flex items-center gap-1 shrink-0"><CheckCircle2 size={16} /> On the app</span>
              : <span className="text-sm text-gray-500 shrink-0">Invited</span>}
          </div>
        ))}
      </Card>
      <Card className="p-4">
        <form onSubmit={invite} className="space-y-3">
          <p className="text-base font-semibold text-gray-900 flex items-center gap-2"><UserPlus size={18} className="text-gray-500" /> Add a painter</p>
          <input value={f.name} onChange={set('name')} placeholder="Their name" aria-label="Painter name" className={input} />
          <input type="email" value={f.email} onChange={set('email')} placeholder="Their email" aria-label="Painter email" className={input} />
          <input type="tel" value={f.phone} onChange={set('phone')} placeholder="Their phone (optional)" aria-label="Painter phone" className={input} />
          <button type="submit" disabled={busy || !f.name.trim() || !f.email.trim()}
            className="w-full h-12 rounded-xl bg-[var(--brand-600)] text-white text-base font-bold disabled:opacity-40">{busy ? 'Adding…' : 'Add and get their link'}</button>
          {msg && <p className={`text-sm break-all ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}{msg.link ? <><br />{msg.link}</> : null}</p>}
        </form>
      </Card>
    </div>
  )
}

function PaintDetails({ paint, onSave }) {
  const [editing, setEditing] = useState(false)
  const [colors, setColors] = useState([])
  const [notes, setNotes] = useState('')
  const saved = paintColorsOf(paint)
  const has = saved.length > 0 || paint.notes
  const start = () => { setColors(saved.length ? saved : [blankColor()]); setNotes(paint.notes || ''); setEditing(true) }
  const set = (i, k) => (e) => setColors(list => list.map((c, j) => (j === i ? { ...c, [k]: e.target.value } : c)))
  const save = () => {
    const list = colors.map(tidyColor).filter(hasColor)
    const first = list[0] || blankColor()
    onSave({ colors: list, product: first.product, color: first.color, sheen: first.sheen, areas: first.areas, notes: notes.trim() })
    setEditing(false)
  }
  const input = 'w-full h-12 px-3 rounded-xl border border-gray-300 bg-white text-base text-gray-900'

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold text-gray-900">Paint details</p>
        {!editing && <button onClick={start} className="text-sm font-semibold text-[var(--brand-700)] px-2 py-1">{has ? 'Edit' : 'Add'}</button>}
      </div>
      {editing ? (
        <div className="space-y-3">
          {colors.map((c, i) => (
            <div key={i} className="space-y-2.5 rounded-xl border border-gray-200 p-3" role="group" aria-label={`Color ${i + 1}`}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">Color {i + 1}</p>
                {colors.length > 1 && <button onClick={() => setColors(list => list.filter((_, j) => j !== i))} className="text-sm font-semibold text-red-600 px-2 py-1" aria-label={`Remove color ${i + 1}`}>Remove</button>}
              </div>
              <input className={input} value={c.color} onChange={set(i, 'color')} placeholder="Color (brand, name, code)" aria-label={`Color ${i + 1} name`} />
              <input className={input} value={c.areas} onChange={set(i, 'areas')} placeholder="What gets painted (rails, ceiling, trim…)" aria-label={`Color ${i + 1} areas`} />
              <div className="grid grid-cols-2 gap-2">
                <select aria-label={`Color ${i + 1} product`} className={input} value={c.product} onChange={set(i, 'product')}>
                  <option value="">Product…</option>{withSaved(PRODUCTS, c.product).map(x => <option key={x}>{x}</option>)}
                </select>
                <select aria-label={`Color ${i + 1} sheen`} className={input} value={c.sheen} onChange={set(i, 'sheen')}>
                  <option value="">Sheen…</option>{withSaved(SHEENS, c.sheen).map(x => <option key={x}>{x}</option>)}
                </select>
              </div>
            </div>
          ))}
          <button onClick={() => setColors(list => [...list, blankColor()])}
            className="w-full h-12 rounded-xl text-base font-semibold text-[var(--brand-700)] border border-dashed border-gray-300">+ Add another color</button>
          <textarea id="pd-notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes for the painter"
            className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base text-gray-900 bg-white resize-none" />
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 h-12 rounded-xl text-base font-bold text-white bg-[var(--brand-600)]">Save</button>
            <button onClick={() => setEditing(false)} className="h-12 px-5 rounded-xl text-base font-semibold text-gray-600 border border-gray-200">Cancel</button>
          </div>
        </div>
      ) : has ? (
        <div className="space-y-3">
          {saved.length > 0 && (
            <ul className="divide-y divide-gray-100" aria-label="Paint colors">
              {saved.map((c, i) => (
                <li key={i} className="py-2 first:pt-0 last:pb-0">
                  <p className="text-base font-semibold text-gray-900">{c.color || 'Color not set'}</p>
                  {c.areas && <p className="text-base text-gray-800">{c.areas}</p>}
                  {(c.product || c.sheen) && <p className="text-sm text-gray-500">{[c.product, c.sheen].filter(Boolean).join(' · ')}</p>}
                </li>
              ))}
            </ul>
          )}
          {paint.notes && (
            <div className={saved.length ? 'pt-2 border-t border-gray-100' : ''}>
              <p className="text-sm text-gray-500">Notes</p>
              <p className="text-base text-gray-900 font-medium whitespace-pre-wrap">{paint.notes}</p>
            </div>
          )}
        </div>
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
    save([...list, { id: newTouchUpId(), text: text.trim(), done: false, createdAt: new Date().toISOString(), by: me?.displayName || '' }])
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
