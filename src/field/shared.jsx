// Shared Field mode pieces: job facts, date helpers and small UI blocks used by
// both the PM screens (FieldApp) and the paint screens (PaintApp).
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useMemo, useRef, useState } from 'react'
import { tr } from '../lib/lang'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, HardHat, StickyNote, Undo2 } from 'lucide-react'
import { useStore } from '../store'
import { isJob, isJobClosed } from '../lib/attention'
import {
  permitAlerts, permitTracked, usePermitAccess, boardCells, BOARD_COLUMNS,
  inspectionLabel, jobCounty, countyConnected,
} from '../lib/permitTracking'
import { getStages } from '../pages/Jobs'

// ── Date helpers (local calendar days, not UTC) ─────────────────────────────
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const todayStr = () => ymd(new Date())
export const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }
export const dayLabel = (s) => {
  if (!s) return ''
  if (s === todayStr()) return 'Today'
  if (s === addDays(1)) return 'Tomorrow'
  if (s === addDays(-1)) return 'Yesterday'
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export const mapsUrl = (address) => `https://maps.google.com/?q=${encodeURIComponent(address)}`
export const telUrl  = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`
export const smsUrl  = (phone) => `sms:${String(phone).replace(/[^\d+]/g, '')}`

// Everything a field screen needs to know about one job, worked out once.
export function describeJob(p, permitAccess) {
  const stages = getStages(p) || []
  const jd = p.jobData || {}
  const done = new Set(jd.completedStages || [])
  // "Job Closed" is the office's close-out (final payment + email) — it's never
  // a field step, so it's left out of what's next here.
  const open = stages.filter(s => !done.has(s.key) && s.key !== 'closed')
  const next = open[0] || null
  const dates = jd.stageDates || {}
  // Inspections — same rules as the desktop Inspections board: every county,
  // county results plus results the office records by hand.
  const tracked = !!permitAccess && permitTracked(p)
  const cells = tracked ? boardCells(p) : {}
  const failed = tracked
    ? Math.max(permitAlerts(p, stages).failed, Object.values(cells).filter(c => c.state === 'fail').length)
    : 0
  const officeNext = jd.nextInspection?.code
    ? { label: inspectionLabel(jd.nextInspection.code), date: jd.nextInspection.date || null } : null
  const countyNext = Object.entries(cells)
    .filter(([, c]) => c.state === 'sched')
    .map(([k, c]) => ({ label: BOARD_COLUMNS.find(b => b.key === k)?.title || k, date: c.date || null }))
    .sort((a, b) => (a.date || '9').localeCompare(b.date || '9'))[0]
  return {
    p, stages, done, open, next,
    nextDate: next ? dates[next.key] || (next.key === 'start' ? jd.startDate : null) : null,
    doneCount: stages.filter(s => done.has(s.key)).length,
    total: stages.length,
    needsType: stages.length === 0,
    failed,
    tracked, cells,
    nextInsp: tracked ? (officeNext || countyNext || null) : null,
    county: tracked ? jobCounty(p) : '',
    connected: tracked && countyConnected(p),
    paintIndex: open.findIndex(s => s.key === 'paint'), // 0 = paint is next
    paintDate: dates.paint || null,
  }
}

// Open jobs, described, honoring the Mine / All toggle.
export function useFieldJobs() {
  const proposals = useStore(s => s.proposals)
  const myId = useStore(s => s.me?.id)
  const permitAccess = usePermitAccess()
  const [scope, setScope] = useState(null) // null = decide automatically
  const all = useMemo(
    () => proposals.filter(p => isJob(p) && !isJobClosed(p)).map(p => describeJob(p, permitAccess)),
    [proposals, permitAccess],
  )
  const mineList = useMemo(() => (myId ? all.filter(j => j.p.pmId === myId) : []), [all, myId])
  const hasMine = mineList.length > 0
  const effective = scope || (hasMine ? 'mine' : 'all')
  return { jobs: effective === 'mine' ? mineList : all, scope: effective, setScope, hasMine }
}

// ── Little building blocks ──────────────────────────────────────────────────
export function Card({ children, className = '' }) {
  return <section className={`bg-white rounded-2xl border border-gray-200 shadow-sm ${className}`}>{children}</section>
}

export function Progress({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div className="h-2 rounded-full bg-gray-100 overflow-hidden" aria-label={`${done} of ${total} steps done`}>
      <div className="h-full rounded-full bg-[var(--brand-600)] transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function ScopeToggle({ scope, setScope, hasMine }) {
  if (!hasMine) return null
  return (
    <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl text-sm font-semibold">
      {[['mine', 'My jobs'], ['all', 'All jobs']].map(([k, label]) => (
        <button key={k} onClick={() => setScope(k)}
          className={`h-10 rounded-lg ${scope === k ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{label}</button>
      ))}
    </div>
  )
}

// A tappable job row used on every list screen.
export function JobRow({ j, sub, tone }) {
  const navigate = useNavigate()
  const toneCls = {
    red: 'border-l-red-500', amber: 'border-l-amber-400', blue: 'border-l-[var(--brand-600)]',
  }[tone] || 'border-l-transparent'
  return (
    <button onClick={() => navigate(`/field/job/${j.p.id}`)}
      className={`w-full text-left bg-white rounded-2xl border border-gray-200 border-l-4 ${toneCls} shadow-sm px-4 py-3.5 flex items-center gap-3 active:bg-gray-50`}>
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-gray-900 truncate">{j.p.client || 'Unnamed job'}</p>
        <p className="text-sm text-gray-600 truncate">{sub}</p>
        {j.total > 0 && <div className="mt-2"><Progress done={j.doneCount} total={j.total} /></div>}
      </div>
      <ChevronRight size={20} className="text-gray-300 shrink-0" />
    </button>
  )
}

export function nextLine(j) {
  if (j.needsType) return 'Pick the job type to see its steps'
  if (!j.next) return 'Ready for the office to close out'
  return `Next: ${j.next.label}${j.nextDate ? ` · ${dayLabel(j.nextDate)}` : ''}`
}

// Undo toast: every Done button can be taken back for a few seconds.
export function useUndo() {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const show = (message, undo) => {
    clearTimeout(timer.current)
    setToast({ message, undo })
    timer.current = setTimeout(() => setToast(null), 6000)
  }
  const el = toast && (
    <div className="fixed left-3 right-3 bottom-24 z-50 flex justify-center pointer-events-none">
      <div className="pointer-events-auto max-w-md w-full bg-gray-900 text-white rounded-2xl shadow-lg px-4 py-3 flex items-center gap-3">
        <CheckCircle2 size={20} className="text-green-400 shrink-0" />
        <span className="flex-1 text-sm font-medium">{toast.message}</span>
        {toast.undo && (
          <button onClick={() => { toast.undo(); setToast(null) }}
            className="flex items-center gap-1 text-sm font-bold text-amber-300 px-2 py-1"><Undo2 size={16} /> Undo</button>
        )}
      </div>
    </div>
  )
  return [el, show]
}

export function BackButton() {
  const navigate = useNavigate()
  return (
    <button onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/field/jobs'))}
      className="-ml-2 h-10 pr-3 flex items-center gap-1 text-base font-semibold text-[var(--brand-700)]">
      <ChevronLeft size={22} /> {tr('Back')}
    </button>
  )
}

export function QuickAction({ href, icon, label, external }) {
  const Icon = icon
  const cls = 'h-16 rounded-2xl border flex flex-col items-center justify-center gap-1 text-sm font-semibold'
  if (!href) {
    return <span className={`${cls} border-gray-100 text-gray-300`} aria-disabled="true"><Icon size={20} />{label}</span>
  }
  return (
    <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}
      className={`${cls} border-gray-200 bg-white text-[var(--brand-700)] active:bg-gray-50 shadow-sm`}>
      <Icon size={20} />{label}
    </a>
  )
}

// One box, one button. Saves as today's daily log entry.
export function QuickNote({ proposalId, onSaved }) {
  const addDailyLog = useStore(s => s.addDailyLog)
  const [notes, setNotes] = useState('')
  const [crew, setCrew] = useState('')
  const save = () => {
    if (!notes.trim()) return
    addDailyLog(proposalId, { date: todayStr(), crew: crew.trim(), weather: '', notes: notes.trim(), source: 'field' })
    setNotes(''); setCrew('')
    onSaved?.()
  }
  return (
    <Card className="p-4 space-y-3">
      <p className="text-base font-semibold text-gray-900 flex items-center gap-2"><StickyNote size={18} className="text-gray-500" /> Today's note</p>
      <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What happened on site today?"
        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-base text-gray-900 bg-white resize-none outline-none focus:border-[var(--brand-500)]" />
      <div className="flex gap-2">
        <label className="flex-1 min-w-0 flex items-center gap-2 h-12 px-3 rounded-xl border border-gray-300 bg-white">
          <HardHat size={18} className="text-gray-400 shrink-0" />
          <input value={crew} onChange={e => setCrew(e.target.value)} placeholder="Crew (optional)"
            className="flex-1 min-w-0 bg-transparent text-base text-gray-900 outline-none" />
        </label>
        <button onClick={save} disabled={!notes.trim()}
          className="h-12 px-6 shrink-0 rounded-xl text-base font-bold text-white bg-[var(--brand-600)] disabled:opacity-40">Save</button>
      </div>
    </Card>
  )
}

export function RecentNotes({ proposal }) {
  const logs = (proposal.jobData?.dailyLogs || []).slice(0, 3)
  const office = proposal.jobData?.notes
  if (!logs.length && !office) return null
  return (
    <div className="space-y-2.5">
      <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Notes</h2>
      {office && (
        <Card className="p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">From the office</p>
          <p className="text-base text-gray-800 whitespace-pre-wrap">{office}</p>
        </Card>
      )}
      {logs.map(l => (
        <Card key={l.id} className="p-4">
          <p className="text-xs font-semibold text-gray-500 mb-1 flex items-center gap-2">
            <Clock size={12} /> {dayLabel(l.date)}{l.crew ? ` · ${l.crew}` : ''}
          </p>
          <p className="text-base text-gray-800 whitespace-pre-wrap">{l.notes}</p>
        </Card>
      ))}
    </div>
  )
}

