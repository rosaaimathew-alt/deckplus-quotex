import { useState, useMemo } from 'react'
import { useStore } from '../store'
import { getStages } from './Jobs'
import {
  ChevronLeft, ChevronRight, Plus, X, Eye, EyeOff, Trash2, CalendarDays,
  MapPin, HardHat, Circle, CheckCircle2, Square, ListChecks,
  Check, ChevronUp, ChevronDown,
} from 'lucide-react'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PLAN_COLORS = ['#2563eb', '#0d9488', '#7c3aed', '#c0603f', '#b45309', '#be123c', '#4b5563']

const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parseKey = (s) => { const [y, m, dd] = s.split('-').map(Number); return new Date(y, m - 1, dd) }
const todayKey = () => key(new Date())
const fmtRange = (a, b) => {
  const s = parseKey(a), e = parseKey(b)
  const o = { month: 'short', day: 'numeric' }
  return a === b ? s.toLocaleDateString('en-US', o) : `${s.toLocaleDateString('en-US', o)} – ${e.toLocaleDateString('en-US', o)}`
}

// Build the events list from won jobs + planned projects.
function useCalendarEvents() {
  const proposals          = useStore(s => s.proposals)
  const plannedProjects    = useStore(s => s.plannedProjects) || []
  const calendarHiddenJobs = useStore(s => s.calendarHiddenJobs) || []

  return useMemo(() => {
    const wonJobs = proposals.filter(p => p.status === 'Won')
    const jobs = wonJobs.map(p => {
      const start = p.jobData?.startDate || null
      const end   = p.jobData?.targetDate || start
      return {
        id: `job-${p.id}`, kind: 'job', proposalId: p.id,
        title: p.client || 'Job', address: p.address || '',
        start, end: end || start,
        hidden: calendarHiddenJobs.includes(p.id),
        color: '#0f766e',
      }
    })
    // Individual scheduled stage milestones
    const stageEvents = []
    wonJobs.forEach(p => {
      if (calendarHiddenJobs.includes(p.id)) return
      const dates = p.jobData?.stageDates || {}
      const completed = p.jobData?.completedStages || []
      ;(getStages(p) || []).forEach(st => {
        const d = dates[st.key]
        if (!d) return
        const done = completed.includes(st.key)
        stageEvents.push({
          id: `stage-${p.id}-${st.key}`, kind: 'stage', proposalId: p.id,
          stageKey: st.key, stageLabel: st.label,
          title: `${p.client || 'Job'} · ${st.label}`, address: p.address || '',
          start: d, end: d, completed: done,
          color: done ? '#16a34a' : '#0d9488',
        })
      })
    })
    const planned = plannedProjects.map(pp => ({
      id: `plan-${pp.id}`, kind: 'planned', planId: pp.id,
      title: pp.title || 'Planned', address: pp.client || '',
      start: pp.startDate, end: pp.endDate || pp.startDate,
      hidden: false, color: pp.color || '#2563eb',
    }))
    const scheduled   = [...jobs.filter(e => e.start && !e.hidden), ...stageEvents, ...planned.filter(e => e.start)]
    const unscheduled = jobs.filter(e => !e.start && !e.hidden)
    const hidden      = jobs.filter(e => e.hidden)
    return { scheduled, unscheduled, hidden }
  }, [proposals, plannedProjects, calendarHiddenJobs])
}

function Shell({ children, onClose, icon, label }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <p className="font-semibold text-gray-900 flex items-center gap-2">{icon} {label}</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function EventEditor({ event, onClose }) {
  const updateJobData          = useStore(s => s.updateJobData)
  const toggleCalendarHiddenJob = useStore(s => s.toggleCalendarHiddenJob)
  const addPlannedProject      = useStore(s => s.addPlannedProject)
  const updatePlannedProject   = useStore(s => s.updatePlannedProject)
  const deletePlannedProject   = useStore(s => s.deletePlannedProject)
  const toggleJobStage         = useStore(s => s.toggleJobStage)
  const setJobStageDate        = useStore(s => s.setJobStageDate)
  const proposal               = useStore(s => s.proposals.find(p => p.id === event.proposalId))

  const isJob   = event.kind === 'job'
  const isStage = event.kind === 'stage'
  const isNew   = event.kind === 'planned' && event.planId == null

  const [start, setStart] = useState(event.start || '')
  const [end, setEnd]     = useState(event.end || event.start || '')
  const [title, setTitle] = useState(event.title || '')
  const [client, setClient] = useState(event.address || '')
  const [color, setColor] = useState(event.color || '#2563eb')
  const [showMilestones, setShowMilestones] = useState(false)

  // ── Single stage milestone ──
  if (isStage) {
    const done = (proposal?.jobData?.completedStages || []).includes(event.stageKey)
    return (
      <Shell onClose={onClose} icon={<ListChecks size={16} className="text-[var(--brand-600)]" />} label={done ? 'Completed milestone' : 'Scheduled milestone'}>
        <div className="p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-800">{event.stageLabel}</p>
            <p className="text-xs text-gray-400">{proposal?.client || 'Job'}</p>
          </div>
          <button onClick={() => toggleJobStage(event.proposalId, event.stageKey)}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium border transition-colors ${done ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-gray-700 border-gray-200 hover:border-[var(--brand-400)]'}`}>
            {done ? <CheckCircle2 size={15} /> : <Square size={15} />} {done ? 'Completed — mark incomplete' : 'Mark complete'}
          </button>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Scheduled date</label>
            <input type="date" value={event.start} onChange={e => setJobStageDate(event.proposalId, event.stageKey, e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]" />
            <p className="text-[11px] text-gray-400 mt-1">Rescheduling keeps it uncompleted until you check it off.</p>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-2">
          <button onClick={() => { setJobStageDate(event.proposalId, event.stageKey, null); onClose() }}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            <X size={13} /> Remove from calendar
          </button>
          <button onClick={onClose} className="ml-auto px-5 py-2 bg-[var(--brand-600)] text-white text-sm font-medium rounded-lg hover:bg-[var(--brand-700)]">Done</button>
        </div>
      </Shell>
    )
  }

  const save = () => {
    if (isJob) updateJobData(event.proposalId, { startDate: start || null, targetDate: end || start || null })
    else if (isNew) { if (title.trim() || client.trim()) addPlannedProject({ title, client, startDate: start, endDate: end || start, color }) }
    else updatePlannedProject(event.planId, { title, client, startDate: start, endDate: end || start, color })
    onClose()
  }

  const stages     = isJob && proposal ? (getStages(proposal) || []) : []
  const completed  = proposal?.jobData?.completedStages || []
  const stageDates = proposal?.jobData?.stageDates || {}

  return (
    <Shell onClose={onClose}
      icon={isJob ? <HardHat size={16} className="text-[var(--brand-600)]" /> : <Circle size={12} style={{ color }} fill={color} />}
      label={isJob ? 'Job' : 'Planned project'}>
      <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
        {isJob ? (
          <div>
            <p className="text-sm font-semibold text-gray-800">{event.title}</p>
            {event.address && <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5"><MapPin size={11} /> {event.address}</p>}
          </div>
        ) : (
          <>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Project</label>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Potential deck — Smith"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Client / note</label>
              <input value={client} onChange={e => setClient(e.target.value)} placeholder="optional"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1.5">Color</label>
              <div className="flex gap-2">
                {PLAN_COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full transition-transform ${color === c ? 'ring-2 ring-offset-1 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">{isJob ? 'Job start' : 'Start'}</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">{isJob ? 'Target' : 'End'}</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
        </div>

        {/* Per-job milestones — collapsed by default so the modal opens compact */}
        {isJob && stages.length > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <button type="button" onClick={() => setShowMilestones(v => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-700 transition-colors">
              {showMilestones ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              Schedule milestones ({stages.length})
            </button>
            {showMilestones && (
              <div className="space-y-1 mt-2">
                {stages.map(st => {
                  const sdone = completed.includes(st.key)
                  return (
                    <div key={st.key} className="flex items-center gap-2">
                      <button onClick={() => toggleJobStage(event.proposalId, st.key)} className={`shrink-0 ${sdone ? 'text-green-600' : 'text-gray-300 hover:text-[var(--brand-600)]'}`}>
                        {sdone ? <CheckCircle2 size={16} /> : <Square size={16} />}
                      </button>
                      <span className={`flex-1 text-sm truncate ${sdone ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{st.label}</span>
                      <input type="date" value={stageDates[st.key] || ''} onChange={e => setJobStageDate(event.proposalId, st.key, e.target.value)}
                        className="text-xs border border-gray-200 rounded px-1.5 py-1 shrink-0 focus:outline-none focus:ring-1 focus:ring-[var(--brand-300)]" />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-2">
        {isJob ? (
          <button onClick={() => { toggleCalendarHiddenJob(event.proposalId); onClose() }}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            <EyeOff size={13} /> Hide
          </button>
        ) : !isNew ? (
          <button onClick={() => { deletePlannedProject(event.planId); onClose() }}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50">
            <Trash2 size={13} /> Delete
          </button>
        ) : null}
        <button onClick={save} className="ml-auto px-5 py-2 bg-[var(--brand-600)] text-white text-sm font-medium rounded-lg hover:bg-[var(--brand-700)]">Save</button>
      </div>
    </Shell>
  )
}

export default function PMCalendar() {
  const toggleCalendarHiddenJob = useStore(s => s.toggleCalendarHiddenJob)
  const { scheduled, unscheduled, hidden } = useCalendarEvents()

  const now = new Date()
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [editing, setEditing] = useState(null)
  const [showHidden, setShowHidden] = useState(false)

  const monthStart = new Date(view.year, view.month, 1)
  const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // 6-week grid starting on the Sunday on/before the 1st
  const gridStart = new Date(monthStart)
  gridStart.setDate(1 - monthStart.getDay())
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d })

  const eventsOn = (d) => {
    const k = key(d)
    return scheduled.filter(e => e.start <= k && k <= (e.end || e.start))
  }

  const shift = (n) => setView(v => { const d = new Date(v.year, v.month + n, 1); return { year: d.getFullYear(), month: d.getMonth() } })
  const goToday = () => setView({ year: now.getFullYear(), month: now.getMonth() })

  const addOnDay = (d) => {
    const k = key(d)
    setEditing({ kind: 'planned', planId: null, start: k, end: k, title: '', address: '', color: '#2563eb' })
  }

  const tKey = todayKey()

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <CalendarDays size={22} className="text-[var(--brand-600)]" /> Job Calendar
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">All open jobs across the board — click a day to plan, click a job to reschedule.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goToday} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50">Today</button>
          <div className="flex items-center gap-1">
            <button onClick={() => shift(-1)} className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50"><ChevronLeft size={16} /></button>
            <span className="text-sm font-semibold text-gray-800 w-36 text-center">{monthLabel}</span>
            <button onClick={() => shift(1)} className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>

      {/* Unscheduled jobs strip */}
      {unscheduled.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
          <p className="text-xs font-semibold text-amber-800 mb-2">Jobs needing a date ({unscheduled.length}) — tap to schedule</p>
          <div className="flex gap-2 flex-wrap">
            {unscheduled.map(e => (
              <button key={e.id} onClick={() => setEditing(e)}
                className="flex items-center gap-1.5 text-xs bg-white border border-amber-200 rounded-lg px-2.5 py-1.5 hover:border-amber-400">
                <HardHat size={12} className="text-[var(--brand-600)]" /> {e.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
          {WEEKDAYS.map(w => <div key={w} className="px-2 py-2 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{w}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const inMonth = d.getMonth() === view.month
            const k = key(d)
            const evts = eventsOn(d)
            return (
              <div key={i}
                className={`min-h-[92px] border-b border-r border-gray-50 p-1.5 flex flex-col gap-1 group ${inMonth ? 'bg-white' : 'bg-gray-50/60'}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${k === tKey ? 'bg-[var(--brand-600)] text-white w-5 h-5 rounded-full flex items-center justify-center' : inMonth ? 'text-gray-600' : 'text-gray-300'}`}>
                    {d.getDate()}
                  </span>
                  <button onClick={() => addOnDay(d)} title="Add a planned project"
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-[var(--brand-600)] transition-opacity"><Plus size={13} /></button>
                </div>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {evts.slice(0, 3).map(e => (
                    <button key={e.id} onClick={() => setEditing(e)}
                      className="flex items-center gap-1 text-left text-[11px] leading-tight px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                      title={e.title}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: e.color }} />
                      {e.kind === 'stage' && e.completed ? <Check size={10} className="shrink-0 text-green-600" /> : null}
                      <span className="truncate">{e.title}</span>
                    </button>
                  ))}
                  {evts.length > 3 && <span className="text-[10px] text-gray-400 px-1">+{evts.length - 3} more</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Compact footer — legend + hidden jobs */}
      <div className="flex items-center gap-4 mt-4 flex-wrap text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#0f766e' }} /> Jobs &amp; milestones</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#16a34a' }} /> Completed</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: '#2563eb' }} /> Planned</span>
        {hidden.length > 0 && (
          <button onClick={() => setShowHidden(v => !v)} className="flex items-center gap-1 hover:text-gray-700 ml-auto">
            <EyeOff size={12} /> {hidden.length} hidden {showHidden ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        )}
      </div>
      {showHidden && hidden.length > 0 && (
        <div className="mt-2 bg-gray-50 border border-gray-200 rounded-xl p-3 flex gap-2 flex-wrap">
          {hidden.map(e => (
            <button key={e.id} onClick={() => toggleCalendarHiddenJob(e.proposalId)}
              className="flex items-center gap-1.5 text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 hover:border-[var(--brand-400)] text-gray-600">
              <Eye size={12} /> {e.title}
            </button>
          ))}
        </div>
      )}

      {editing && <EventEditor event={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
