// ── Field mode ───────────────────────────────────────────────────────────────
// The phone app for project / paint managers. Three screens and one job page:
//
//   Today  — what needs you right now, and what's coming this week
//   Jobs   — every open job, one tap to open it
//   Paint  — jobs ready for paint (and the ones about to be)
//   Job    — call / text / directions, the ONE next step with a big Done
//            button, a quick note, and the full checklist if you need it
//
// No money, no tabs, no forms with ten fields. Everything here writes to the
// same store as the desktop Jobs page (toggleJobStage, setJobStageDate,
// addDailyLog), so the office sees field updates immediately.
import { useEffect, useMemo, useState } from 'react'
import { Routes, Route, Navigate, NavLink, useNavigate, useParams } from 'react-router-dom'
import {
  Sun, CalendarDays, HardHat, PaintRoller, Phone, MessageSquare, Navigation,
  ChevronLeft, ChevronRight, Check, CheckCircle2, Circle, AlertTriangle, Clock,
  Search, Monitor, LogOut, StickyNote, ListChecks, Undo2, Settings2, ShieldCheck,
} from 'lucide-react'
import { useStore } from '../store'
import { applyBrandStyles, applyTheme, brandOptions, DEFAULT_BRAND_COLOR } from '../brand'
import { isJobClosed } from '../lib/attention'
import { usePermitAccess, BOARD_COLUMNS } from '../lib/permitTracking'
import { JOB_TYPE_OPTIONS } from '../pages/Jobs'
import { logout } from '../components/AuthGuard'
import { DEMO, resetDemo } from '../demo'
import { setViewPref, usePaintView } from './fieldMode'
import { PaintQueue, PaintSchedule, PaintTouchUps, PaintJob } from './PaintApp'
import InstallCard from './InstallCard'
import JobMoney from './JobMoney'
import { useJobMoney } from '../nav'
import {
  todayStr, addDays, dayLabel, mapsUrl, telUrl, smsUrl, describeJob, useFieldJobs, Card, Progress, ScopeToggle, JobRow, nextLine, useUndo, BackButton, QuickAction, QuickNote, RecentNotes,
} from './shared'

// ── Today ───────────────────────────────────────────────────────────────────
function TodayScreen() {
  const { jobs, scope, setScope, hasMine } = useFieldJobs()
  const me = useStore(s => s.me)
  const today = todayStr()
  const weekEnd = addDays(7)

  const { now, week } = useMemo(() => {
    const now = [], week = []
    for (const j of jobs) {
      if (j.failed) now.push({ j, tone: 'red', why: `Failed inspection — ${j.failed} to redo`, rank: 0 })
      else if (j.next && j.nextDate && j.nextDate < today) now.push({ j, tone: 'amber', why: `Late: ${j.next.label} (was ${dayLabel(j.nextDate)})`, rank: 1 })
      else if (j.next && j.nextDate === today) now.push({ j, tone: 'blue', why: `Today: ${j.next.label}`, rank: 2 })
      else if (j.nextInsp?.date === today) now.push({ j, tone: 'blue', why: `Inspection today: ${j.nextInsp.label}`, rank: 2 })
      // Jobs added only for inspection tracking have no job type — don't nag
      else if (j.needsType && !j.p.imported) now.push({ j, tone: 'amber', why: 'Pick the job type', rank: 3 })

      if (j.nextInsp?.date && j.nextInsp.date > today && j.nextInsp.date < weekEnd) {
        week.push({ j, date: j.nextInsp.date, label: `Inspection: ${j.nextInsp.label}`, id: `${j.p.id}-insp` })
      }

      // Anything dated this week that isn't done yet (all steps, not just next)
      const dates = j.p.jobData?.stageDates || {}
      for (const s of j.open) {
        const d = dates[s.key]
        if (d && d > today && d < weekEnd) week.push({ j, date: d, label: s.label, id: `${j.p.id}-${s.key}` })
      }
    }
    now.sort((a, b) => a.rank - b.rank)
    week.sort((a, b) => a.date.localeCompare(b.date))
    return { now, week }
  }, [jobs, today, weekEnd])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = (me?.displayName || '').split(' ')[0]

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{greeting}{firstName ? `, ${firstName}` : ''}</h1>
        <p className="text-sm text-gray-500">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>

      <ScopeToggle scope={scope} setScope={setScope} hasMine={hasMine} />

      <InstallCard />

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-3xl font-bold text-gray-900">{jobs.length}</p>
          <p className="text-sm text-gray-500">open jobs</p>
        </Card>
        <Card className={`p-4 ${now.length ? 'border-amber-300' : ''}`}>
          <p className={`text-3xl font-bold ${now.length ? 'text-amber-600' : 'text-green-600'}`}>{now.length}</p>
          <p className="text-sm text-gray-500">need you now</p>
        </Card>
      </div>

      <div className="space-y-2.5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Needs you now</h2>
        {now.length === 0 ? (
          <Card className="p-5 flex items-center gap-3">
            <CheckCircle2 size={26} className="text-green-500 shrink-0" />
            <p className="text-base font-medium text-gray-800">You're all caught up.</p>
          </Card>
        ) : now.map(({ j, tone, why }) => <JobRow key={j.p.id} j={j} tone={tone} sub={why} />)}
      </div>

      <div className="space-y-2.5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Coming up this week</h2>
        {week.length === 0 ? (
          <p className="text-sm text-gray-500 px-1">Nothing scheduled in the next 7 days.</p>
        ) : (
          <Card className="divide-y divide-gray-100 overflow-hidden">
            {week.map(w => <WeekRow key={w.id} w={w} />)}
          </Card>
        )}
      </div>
    </div>
  )
}

function WeekRow({ w }) {
  const navigate = useNavigate()
  return (
    <button onClick={() => navigate(`/field/job/${w.j.p.id}`)} className="w-full text-left px-4 py-3 flex items-center gap-3 active:bg-gray-50">
      <span className="w-20 shrink-0 text-sm font-semibold text-[var(--brand-700)]">{dayLabel(w.date)}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-medium text-gray-900 truncate">{w.j.p.client || 'Unnamed job'}</span>
        <span className="block text-sm text-gray-500 truncate">{w.label}</span>
      </span>
      <ChevronRight size={18} className="text-gray-300 shrink-0" />
    </button>
  )
}

// ── Jobs ────────────────────────────────────────────────────────────────────
function JobsScreen() {
  const { jobs, scope, setScope, hasMine } = useFieldJobs()
  const [q, setQ] = useState('')
  const [show, setShow] = useState('all')       // all | failed | insp
  const [county, setCounty] = useState('')
  const counties = useMemo(() => [...new Set(jobs.map(j => j.county).filter(Boolean))].sort(), [jobs])
  const anyInspections = jobs.some(j => j.tracked)
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return jobs
      .filter(j => !needle || `${j.p.client || ''} ${j.p.address || ''} ${j.p.imported?.permit || ''}`.toLowerCase().includes(needle))
      .filter(j => !county || j.county === county)
      .filter(j => show === 'all' || (show === 'failed' ? j.failed > 0 : !!j.nextInsp))
      .sort((a, b) => (a.p.client || '').localeCompare(b.p.client || ''))
  }, [jobs, q, county, show])
  const counts = { failed: jobs.filter(j => j.failed > 0).length, insp: jobs.filter(j => j.nextInsp).length }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
      <ScopeToggle scope={scope} setScope={setScope} hasMine={hasMine} />
      <label className="flex items-center gap-2 h-12 px-4 rounded-2xl border border-gray-200 bg-white">
        <Search size={18} className="text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Name or street"
          className="flex-1 bg-transparent text-base text-gray-900 outline-none" />
      </label>
      {anyInspections && (
        <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
          {[['all', 'All jobs'], ['failed', `Failed inspection (${counts.failed})`], ['insp', `Inspection coming (${counts.insp})`]].map(([k, label]) => (
            <button key={k} onClick={() => setShow(k)}
              className={`h-10 px-4 rounded-full text-sm font-semibold whitespace-nowrap border ${show === k
                ? (k === 'failed' ? 'bg-red-600 border-red-600 text-white' : 'bg-[var(--brand-600)] border-[var(--brand-600)] text-white')
                : 'bg-white border-gray-200 text-gray-700'}`}>{label}</button>
          ))}
        </div>
      )}
      {counties.length > 1 && (
        <select value={county} onChange={e => setCounty(e.target.value)} aria-label="County"
          className="w-full h-12 px-3 rounded-2xl border border-gray-200 bg-white text-base text-gray-900">
          <option value="">Every county</option>
          {counties.map(c => <option key={c} value={c}>{c} County</option>)}
        </select>
      )}
      <div className="space-y-2.5">
        {list.length === 0 && <p className="text-sm text-gray-500 px-1">No open jobs{q || county || show !== 'all' ? ' match that' : ''}.</p>}
        {list.map(j => (
          <JobRow key={j.p.id} j={j} tone={j.failed ? 'red' : null}
            sub={<>
              {j.p.address ? <span className="block truncate">{j.p.address}</span> : null}
              <span className="block truncate font-medium text-gray-800">
                {j.failed ? 'Failed inspection' : j.nextInsp ? `Inspection: ${j.nextInsp.label}${j.nextInsp.date ? ` · ${dayLabel(j.nextInsp.date)}` : ''}` : nextLine(j)}
              </span>
            </>} />
        ))}
      </div>
    </div>
  )
}

// ── Paint ───────────────────────────────────────────────────────────────────
function PaintScreen() {
  const { jobs, scope, setScope, hasMine } = useFieldJobs()
  const toggleJobStage = useStore(s => s.toggleJobStage)
  const [toast, showToast] = useUndo()
  const ready = jobs.filter(j => j.paintIndex === 0)
  const soon  = jobs.filter(j => j.paintIndex === 1 || j.paintIndex === 2)

  const markPainted = (j) => {
    toggleJobStage(j.p.id, 'paint')
    showToast(`Paint done — ${j.p.client || 'job'}`, () => toggleJobStage(j.p.id, 'paint'))
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-gray-900">Paint</h1>
      <ScopeToggle scope={scope} setScope={setScope} hasMine={hasMine} />

      <div className="space-y-2.5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Ready for paint ({ready.length})</h2>
        {ready.length === 0 && <p className="text-sm text-gray-500 px-1">No jobs are waiting on paint.</p>}
        {ready.map(j => (
          <Card key={j.p.id} className="p-4 space-y-3">
            <JobHeaderMini j={j} />
            {j.paintDate && <p className="text-sm text-gray-600 flex items-center gap-1.5"><CalendarDays size={15} /> Scheduled {dayLabel(j.paintDate)}</p>}
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <button onClick={() => markPainted(j)}
                className="h-14 rounded-xl bg-green-600 active:bg-green-700 text-white text-base font-bold flex items-center justify-center gap-2">
                <Check size={22} /> Paint done
              </button>
              {j.p.address && (
                <a href={mapsUrl(j.p.address)} target="_blank" rel="noreferrer" aria-label="Directions"
                  className="h-14 w-14 rounded-xl border border-gray-200 flex items-center justify-center text-gray-700"><Navigation size={22} /></a>
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="space-y-2.5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Coming soon ({soon.length})</h2>
        {soon.length === 0 && <p className="text-sm text-gray-500 px-1">Nothing lined up behind those.</p>}
        {soon.map(j => (
          <JobRow key={j.p.id} j={j}
            sub={`${j.paintIndex} step${j.paintIndex > 1 ? 's' : ''} before paint · next: ${j.next.label}${j.paintDate ? ` · paint ${dayLabel(j.paintDate)}` : ''}`} />
        ))}
      </div>
      {toast}
    </div>
  )
}

function JobHeaderMini({ j }) {
  const navigate = useNavigate()
  return (
    <button onClick={() => navigate(`/field/job/${j.p.id}`)} className="w-full text-left flex items-center gap-2">
      <span className="flex-1 min-w-0">
        <span className="block text-base font-semibold text-gray-900 truncate">{j.p.client || 'Unnamed job'}</span>
        {j.p.address && <span className="block text-sm text-gray-500 truncate">{j.p.address}</span>}
      </span>
      <ChevronRight size={20} className="text-gray-300 shrink-0" />
    </button>
  )
}

// ── One job ─────────────────────────────────────────────────────────────────
function JobScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const showMoney = useJobMoney()   // payments: off for some people (Settings › Team › Access)
  const proposal = useStore(s => s.proposals.find(p => String(p.id) === String(id)))
  const toggleJobStage = useStore(s => s.toggleJobStage)
  const setJobStageDate = useStore(s => s.setJobStageDate)
  const updateJobData = useStore(s => s.updateJobData)
  const permitAccess = usePermitAccess()
  const [toast, showToast] = useUndo()
  const [showAll, setShowAll] = useState(false)

  if (!proposal) {
    return (
      <div className="space-y-4">
        <BackButton />
        <p className="text-base text-gray-600">That job isn't here anymore.</p>
      </div>
    )
  }

  const j = describeJob(proposal, permitAccess)
  const closed = isJobClosed(proposal)

  const toggle = (stage) => {
    const wasDone = j.done.has(stage.key)
    toggleJobStage(proposal.id, stage.key)
    showToast(wasDone ? `Unchecked: ${stage.label}` : `Done: ${stage.label}`, () => toggleJobStage(proposal.id, stage.key))
  }

  return (
    <div className="space-y-4">
      <BackButton />

      <div>
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">{proposal.client || 'Unnamed job'}</h1>
        {proposal.address && <p className="text-base text-gray-600 mt-0.5">{proposal.address}</p>}
      </div>

      {/* Call / Text / Directions */}
      <div className="grid grid-cols-3 gap-2">
        <QuickAction href={proposal.phone ? telUrl(proposal.phone) : null} icon={Phone} label="Call" />
        <QuickAction href={proposal.phone ? smsUrl(proposal.phone) : null} icon={MessageSquare} label="Text" />
        <QuickAction href={proposal.address ? mapsUrl(proposal.address) : null} icon={Navigation} label="Directions" external />
      </div>

      {j.failed > 0 && (
        <Card className="p-4 border-red-300 bg-red-50 flex items-start gap-3">
          <AlertTriangle size={22} className="text-red-600 shrink-0 mt-0.5" />
          <p className="text-base text-red-800 font-medium">A county inspection failed on this job. Check with the office before moving on.</p>
        </Card>
      )}

      {/* The one thing to do next */}
      {j.needsType ? (
        <Card className="p-4 space-y-3">
          <p className="text-base font-semibold text-gray-900">What kind of job is this?</p>
          <p className="text-sm text-gray-500">Pick one and its steps will show up.</p>
          <select defaultValue="" onChange={e => e.target.value && updateJobData(proposal.id, { projectTypeOverride: e.target.value })}
            className="w-full h-12 px-3 rounded-xl border border-gray-300 bg-white text-base text-gray-900">
            <option value="" disabled>Choose job type…</option>
            {JOB_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Card>
      ) : closed || !j.next ? (
        <Card className="p-5 flex items-center gap-3 border-green-300 bg-green-50">
          <CheckCircle2 size={28} className="text-green-600 shrink-0" />
          <p className="text-base font-semibold text-green-800">{closed ? 'This job is closed.' : 'Every field step is done. The office will close it out.'}</p>
        </Card>
      ) : (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Next step</p>
            <p className="text-xs font-semibold text-gray-500">{j.doneCount} of {j.total} done</p>
          </div>
          <p className="text-xl font-bold text-gray-900 leading-snug">{j.next.label}</p>
          <Progress done={j.doneCount} total={j.total} />
          <button onClick={() => toggle(j.next)}
            className="w-full h-16 rounded-xl bg-green-600 active:bg-green-700 text-white text-lg font-bold flex items-center justify-center gap-2 shadow-sm">
            <Check size={24} /> Mark done
          </button>
          <label className="flex items-center gap-3 h-12 px-3 rounded-xl border border-gray-200">
            <CalendarDays size={18} className="text-gray-500 shrink-0" />
            <span className="text-sm text-gray-600 shrink-0">Scheduled</span>
            <input type="date" value={j.p.jobData?.stageDates?.[j.next.key] || ''}
              onChange={e => setJobStageDate(proposal.id, j.next.key, e.target.value || null)}
              className="flex-1 min-w-0 bg-transparent text-base text-gray-900 text-right outline-none" />
          </label>
        </Card>
      )}

      {j.tracked && <InspectionsCard j={j} />}

      <QuickNote proposalId={proposal.id} onSaved={() => showToast('Note saved')} />

      {/* Full checklist, tucked away */}
      {j.total > 0 && (
        <Card className="overflow-hidden">
          <button onClick={() => setShowAll(v => !v)} className="w-full px-4 h-14 flex items-center gap-3 text-left">
            <ListChecks size={20} className="text-gray-500" />
            <span className="flex-1 text-base font-semibold text-gray-900">All steps</span>
            <span className="text-sm text-gray-500">{showAll ? 'Hide' : 'Show'}</span>
          </button>
          {showAll && (
            <ul className="border-t border-gray-100 divide-y divide-gray-100">
              {j.stages.map(s => {
                const isDone = j.done.has(s.key)
                const date = j.p.jobData?.stageDates?.[s.key]
                const officeOnly = s.key === 'closed'
                return (
                  <li key={s.key}>
                    <button onClick={() => !officeOnly && toggle(s)} disabled={officeOnly} className="w-full px-4 py-3 min-h-14 flex items-center gap-3 text-left active:bg-gray-50">
                      {isDone ? <CheckCircle2 size={24} className="text-green-600 shrink-0" /> : <Circle size={24} className="text-gray-300 shrink-0" />}
                      <span className={`flex-1 text-base ${isDone ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{s.label}</span>
                      {officeOnly && !isDone && <span className="text-xs font-semibold text-gray-400 shrink-0">Office</span>}
                      {date && !isDone && <span className="text-xs font-semibold text-gray-500 shrink-0">{dayLabel(date)}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      )}

      <RecentNotes proposal={proposal} />

      {showMoney && <JobMoney proposal={proposal} />}

      <button onClick={() => { setViewPref('full'); navigate('/projects?tab=jobs') }}
        className="w-full h-12 rounded-xl text-sm font-semibold text-gray-600 flex items-center justify-center gap-2">
        <Monitor size={16} /> Open budget, change orders & more in the full app
      </button>
      {toast}
    </div>
  )
}

// Read-only copy of this job's row on the Inspections board.
const CELL_STYLE = {
  pass:  { cls: 'bg-green-50 text-green-700 border-green-200', word: 'Passed' },
  fail:  { cls: 'bg-red-50 text-red-700 border-red-200', word: 'Failed' },
  sched: { cls: 'bg-blue-50 text-blue-700 border-blue-200', word: 'Scheduled' },
  void:  { cls: 'bg-gray-50 text-gray-600 border-gray-200', word: '' },
}
function InspectionsCard({ j }) {
  const rows = BOARD_COLUMNS.filter(c => j.cells[c.key])
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-gray-500" />
        <p className="flex-1 text-base font-semibold text-gray-900">Inspections</p>
        {j.county && <span className="text-xs font-semibold text-gray-500">{j.county} County</span>}
      </div>
      {j.nextInsp && (
        <p className="text-base text-gray-800 flex items-center gap-2">
          <CalendarDays size={16} className="text-[var(--brand-700)] shrink-0" />
          Next: <b>{j.nextInsp.label}</b>{j.nextInsp.date ? ` · ${dayLabel(j.nextInsp.date)}` : ''}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No inspection results yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map(c => {
            const cell = j.cells[c.key]
            const st = CELL_STYLE[cell.state] || CELL_STYLE.void
            return (
              <li key={c.key} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${st.cls}`}>
                <span className="flex-1 text-base font-medium">{c.title}</span>
                <span className="text-sm font-semibold text-right">
                  {st.word || cell.result}{cell.date ? ` · ${dayLabel(cell.date)}` : ''}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {!j.connected && (
        <p className="text-xs text-gray-500">This county's results are entered by the office.</p>
      )}
    </Card>
  )
}

// ── Shell ───────────────────────────────────────────────────────────────────
const TABS = [
  { to: '/field', label: 'Today', icon: Sun, end: true },
  { to: '/field/jobs', label: 'Jobs', icon: HardHat },
  { to: '/field/paint', label: 'Paint', icon: PaintRoller },
]
const PAINT_TABS = [
  { to: '/field', label: 'Queue', icon: PaintRoller, end: true },
  { to: '/field/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/field/touchups', label: 'Touch-ups', icon: ListChecks },
]

export default function FieldApp() {
  const branding = useStore(s => s.branding)
  const theme = useStore(s => s.theme)
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const { paint, locked, toggle: setPaintView } = usePaintView()
  const tabs = paint ? PAINT_TABS : TABS

  useEffect(() => {
    applyBrandStyles(branding?.primaryColor || DEFAULT_BRAND_COLOR, brandOptions(branding || {}))
  }, [branding])
  useEffect(() => { applyTheme(theme === 'dark') }, [theme])

  const toFullApp = () => { setViewPref('full'); navigate('/') }
  const companyName = branding?.companyName || 'QUOTEX'

  return (
    <div className="min-h-[100dvh] qx-ground bg-gray-50 overflow-x-hidden">
      <header className="sticky top-0 z-30 h-14 px-4 flex items-center gap-3 text-white pt-[env(safe-area-inset-top)] box-content"
        style={{ backgroundColor: 'var(--sidebar)' }}>
        {branding?.logo
          ? <img src={branding.logo} alt={companyName} className="h-8 object-contain" />
          : <span className="text-base font-black tracking-widest">{companyName}</span>}
        <span className="text-xs font-semibold uppercase tracking-wide bg-white/15 rounded-full px-2 py-0.5">{paint ? 'Paint' : 'Field'}</span>
        <div className="ml-auto relative">
          <button onClick={() => setMenu(m => !m)} className="h-10 w-10 rounded-lg flex items-center justify-center text-white/80 active:bg-white/10" aria-label="Options">
            <Settings2 size={20} />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-12 z-50 w-60 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden text-gray-900">
                {!locked && (
                  <button onClick={() => { setPaintView(!paint); setMenu(false); navigate('/field') }}
                    className="w-full px-4 h-14 flex items-center gap-3 text-base text-left border-b border-gray-100 active:bg-gray-50">
                    <PaintRoller size={18} className="text-gray-500" /> {paint ? 'Back to PM screens' : 'I manage paint'}
                  </button>
                )}
                {!locked && (
                  <button onClick={toFullApp} className="w-full px-4 h-14 flex items-center gap-3 text-base text-left border-b border-gray-100 active:bg-gray-50">
                    <Monitor size={18} className="text-gray-500" /> Switch to full app
                  </button>
                )}
                <button onClick={DEMO ? resetDemo : logout} className="w-full px-4 h-14 flex items-center gap-3 text-base text-left active:bg-gray-50">
                  <LogOut size={18} className="text-gray-500" /> {DEMO ? 'Reset demo' : 'Log out'}
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 pt-4 pb-28">
        {paint ? (
          <Routes>
            <Route path="/" element={<PaintQueue />} />
            <Route path="/field" element={<PaintQueue />} />
            <Route path="/field/schedule" element={<PaintSchedule />} />
            <Route path="/field/touchups" element={<PaintTouchUps />} />
            <Route path="/field/job/:id" element={<PaintJob />} />
            <Route path="*" element={<Navigate to="/field" replace />} />
          </Routes>
        ) : (
        <Routes>
          <Route path="/" element={<TodayScreen />} />
          <Route path="/field" element={<TodayScreen />} />
          <Route path="/field/jobs" element={<JobsScreen />} />
          <Route path="/field/paint" element={<PaintScreen />} />
          <Route path="/field/job/:id" element={<JobScreen />} />
          <Route path="*" element={<Navigate to="/field" replace />} />
        </Routes>
        )}
      </main>

      <nav className="fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 pb-[env(safe-area-inset-bottom)]" aria-label="Field navigation">
        <div className="max-w-xl mx-auto grid grid-cols-3">
          {tabs.map(t => (
            <NavLink key={t.to} to={t.to} end={t.end}
              className={({ isActive }) => `h-16 flex flex-col items-center justify-center gap-0.5 text-xs font-semibold ${isActive ? 'text-[var(--brand-700)]' : 'text-gray-500'}`}>
              <t.icon size={24} />{t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
