import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { contractTotalOf } from '../contractTotal'
import { getStages } from './Jobs'
import { ChevronLeft, ChevronRight, CalendarDays, MapPin, DollarSign, HardHat, Search, ChevronDown, ChevronUp } from 'lucide-react'

const fmt = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December']
const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const JOB_COLORS = [
  'bg-blue-400',  'bg-purple-400', 'bg-emerald-400', 'bg-amber-400',
  'bg-pink-400',  'bg-indigo-400', 'bg-teal-400',    'bg-rose-400',
]

function parseLocalDate(str) {
  if (!str) return null
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function buildCalendar(year, month) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

// For each job, build a set of date keys the job spans
function jobDateKeys(job) {
  const start  = parseLocalDate(job.jobData?.startDate)
  const target = parseLocalDate(job.jobData?.targetDate)
  if (!start) return new Set()
  const keys = new Set()
  const end = target || start
  const cur = new Date(start)
  while (cur <= end) {
    keys.add(toKey(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return keys
}

export default function Scheduler() {
  const proposals    = useStore(s => s.proposals)
  const updateJobData = useStore(s => s.updateJobData)
  const navigate     = useNavigate()
  const [scheduling, setScheduling] = useState(null) // proposal being scheduled
  const today      = new Date()
  const [year,  setYear]  = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selected, setSelected] = useState(null) // date key string
  const [showUnsched, setShowUnsched]   = useState(false)
  const [unschedQuery, setUnschedQuery] = useState('')
  const [showStats, setShowStats]       = useState(false)
  const [expandedStages, setExpandedStages] = useState(new Set())
  const toggleStage = (label) => setExpandedStages(prev => {
    const next = new Set(prev); next.has(label) ? next.delete(label) : next.add(label); return next
  })

  const wonJobs = proposals
    .filter(p => p.status === 'Won' && (p.jobData?.startDate || p.jobData?.targetDate))
    .filter(p => !(p.jobData?.completedStages || []).includes('closed'))

  // Assign a stable color index per job
  const colorMap = {}
  wonJobs.forEach((j, i) => { colorMap[j.id] = JOB_COLORS[i % JOB_COLORS.length] })

  // Build lookup: dateKey → [job, ...]
  const dayJobs = {}
  wonJobs.forEach(job => {
    jobDateKeys(job).forEach(key => {
      if (!dayJobs[key]) dayJobs[key] = []
      dayJobs[key].push(job)
    })
  })

  const cells   = buildCalendar(year, month)
  const todayKey = toKey(today)

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const selectedJobs = selected ? (dayJobs[selected] || []) : []

  // Jobs with no dates — actionable strip
  const noDateJobs = proposals.filter(p =>
    p.status === 'Won' &&
    !(p.jobData?.completedStages || []).includes('closed') &&
    !p.jobData?.startDate && !p.jobData?.targetDate
  )
  const filteredUnsched = unschedQuery
    ? noDateJobs.filter(j => (j.client || '').toLowerCase().includes(unschedQuery.toLowerCase()))
    : noDateJobs

  // All active (won, not closed) jobs grouped by their current stage
  const activeJobs = proposals.filter(p =>
    p.status === 'Won' && !(p.jobData?.completedStages || []).includes('closed'))
  const stageGroups = (() => {
    const map = new Map()
    activeJobs.forEach(job => {
      const stages = getStages(job) || []
      const completed = job.jobData?.completedStages || []
      const label = stages.length === 0
        ? 'Needs setup'
        : (stages.find(s => !completed.includes(s.key))?.label || 'Ready to close')
      if (!map.has(label)) map.set(label, [])
      map.get(label).push(job)
    })
    return [...map.entries()].map(([label, jobs]) => ({ label, jobs })).sort((a, b) => b.jobs.length - a.jobs.length)
  })()

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Scheduler</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">{MONTH_NAMES[month]} {year} · jobs by start date</p>
        </div>

        {/* Unscheduled jobs — searchable dropdown */}
        <div className="relative">
          <button onClick={() => setShowUnsched(o => !o)}
            className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            <HardHat size={14} className="text-[var(--brand-600)]" />
            Unscheduled <span className="text-gray-400 font-medium">{noDateJobs.length}</span>
            <ChevronDown size={14} className="text-gray-400" />
          </button>
          {showUnsched && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowUnsched(false)} />
              <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-20 p-2">
                <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-2.5 py-1.5 mb-2">
                  <Search size={13} className="text-gray-400 shrink-0" />
                  <input autoFocus value={unschedQuery} onChange={e => setUnschedQuery(e.target.value)}
                    placeholder="Search unscheduled jobs…" className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400" />
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {filteredUnsched.length === 0 ? (
                    <p className="text-xs text-gray-400 px-2 py-4 text-center">{noDateJobs.length === 0 ? 'All jobs are scheduled.' : 'No matches.'}</p>
                  ) : filteredUnsched.map(job => (
                    <button key={job.id} onClick={() => { setScheduling(job); setShowUnsched(false) }}
                      className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 text-left transition-colors">
                      <span className="flex items-center gap-2 min-w-0">
                        <HardHat size={12} className="text-[var(--brand-600)] shrink-0" />
                        <span className="text-sm font-medium text-gray-800 truncate">{job.client}</span>
                      </span>
                      <span className="text-xs text-gray-400 shrink-0">${fmt(contractTotalOf(job))}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-gray-400 px-2 pt-2 border-t border-gray-100 mt-1">Click a job to set its start &amp; target dates.</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Active-jobs stats — collapsible, per-stage with jobs listed */}
      {activeJobs.length > 0 && (
        <div className="mb-5 bg-white rounded-xl border border-gray-200 shadow-sm">
          <button onClick={() => setShowStats(o => !o)} className="w-full flex items-center justify-between px-5 py-3.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
              Active Jobs <span className="text-xs font-medium text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{activeJobs.length}</span>
            </span>
            {showStats ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </button>
          {showStats && (
            <div className="border-t border-gray-100 px-3 py-2">
              {stageGroups.map(({ label, jobs }) => {
                const open = expandedStages.has(label)
                return (
                  <div key={label}>
                    <button onClick={() => toggleStage(label)}
                      className="w-full flex items-center justify-between px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <span className="flex items-center gap-2 text-sm text-gray-700">
                        {open ? <ChevronDown size={14} className="text-gray-300" /> : <ChevronRight size={14} className="text-gray-300" />}
                        {label}
                      </span>
                      <span className="text-xs font-semibold px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{jobs.length}</span>
                    </button>
                    {open && (
                      <div className="pl-7 pr-2 pb-2 space-y-0.5">
                        {jobs.map(job => (
                          <button key={job.id} onClick={() => navigate('/jobs')}
                            className="w-full flex items-center justify-between text-left px-1 py-1 rounded hover:bg-gray-50 transition-colors">
                            <span className="flex items-center gap-2 min-w-0">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colorMap[job.id] || 'bg-gray-300'}`} />
                              <span className="text-sm text-gray-600 truncate">{job.client}</span>
                            </span>
                            <span className="text-xs text-gray-400 shrink-0">${fmt(contractTotalOf(job))}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">

        {/* Calendar */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Month nav */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold text-gray-800">{MONTH_NAMES[month]} {year}</p>
              <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }}
                className="text-xs text-blue-600 hover:underline">Today</button>
            </div>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {DAY_NAMES.map(d => (
              <div key={d} className="py-2 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {cells.map((date, i) => {
              if (!date) return <div key={`empty-${i}`} className="min-h-[74px] bg-gray-50/40 border-r border-b border-gray-100" />
              const key       = toKey(date)
              const jobs      = dayJobs[key] || []
              const isToday   = key === todayKey
              const isSelected= key === selected
              return (
                <div
                  key={key}
                  onClick={() => setSelected(isSelected ? null : key)}
                  className={`min-h-[74px] p-1.5 border-r border-b border-gray-100 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                    isToday ? 'bg-blue-600 text-white' : 'text-gray-600'
                  }`}>
                    {date.getDate()}
                  </span>
                  <div className="space-y-0.5 mt-0.5">
                    {jobs.slice(0, 2).map(job => (
                      <div key={job.id}
                        className="flex items-center gap-1 text-[10px] font-medium px-1 py-0.5 rounded bg-gray-100 text-gray-700">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${colorMap[job.id]}`} />
                        <span className="truncate">{job.client.split(' ')[0]}</span>
                      </div>
                    ))}
                    {jobs.length > 2 && (
                      <p className="text-[10px] text-gray-400 pl-0.5">+{jobs.length - 2} more</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Quiet right rail — selected day */}
        <div className="space-y-4">
          {selected ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {new Date(selected + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </p>
              {selectedJobs.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No jobs scheduled.</p>
              ) : (
                <div className="space-y-3">
                  {selectedJobs.map(job => (
                    <div key={job.id}
                      onClick={() => navigate('/jobs')}
                      className="cursor-pointer hover:bg-gray-50 -mx-1 px-1 py-1 rounded-lg transition-colors">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${colorMap[job.id]}`} />
                        <p className="text-sm font-semibold text-gray-900 truncate">{job.client}</p>
                      </div>
                      {job.address && (
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                          <MapPin size={10} /> {job.address}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <DollarSign size={10} /> ${fmt(contractTotalOf(job))}
                      </p>
                      {job.jobData?.startDate && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {job.jobData.startDate} → {job.jobData.targetDate || '?'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-xs text-gray-400">Select a day to see scheduled jobs.</p>
            </div>
          )}

          {wonJobs.length === 0 && !noDateJobs.length && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
              <CalendarDays size={28} className="text-gray-200 mx-auto mb-2" />
              <p className="text-xs text-gray-400">No active jobs with dates yet.</p>
              <button onClick={() => navigate('/jobs')}
                className="mt-2 text-xs text-blue-600 hover:underline">
                Go to Job Management →
              </button>
            </div>
          )}
        </div>
      </div>

      {scheduling && (
        <ScheduleModal
          job={scheduling}
          onClose={() => setScheduling(null)}
          onSave={(changes) => { updateJobData(scheduling.id, changes); setScheduling(null) }}
          onOpenJob={() => navigate('/jobs')}
        />
      )}

    </div>
  )
}

function ScheduleModal({ job, onClose, onSave, onOpenJob }) {
  const stages = getStages(job) || []
  const completed = job.jobData?.completedStages || []
  const [startDate, setStartDate] = useState(job.jobData?.startDate || '')
  const [targetDate, setTargetDate] = useState(job.jobData?.targetDate || '')
  const invalid = startDate && targetDate && targetDate < startDate

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--brand-600)] uppercase tracking-wide">Schedule job</p>
            <h2 className="text-lg font-bold text-gray-900 truncate">{job.client}</h2>
            <p className="text-xs text-gray-400 mt-0.5">${fmt(contractTotalOf(job))}{job.address ? ` · ${job.address}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><span className="text-xl leading-none">×</span></button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Target / end date</label>
            <input type="date" value={targetDate} min={startDate || undefined} onChange={e => setTargetDate(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]" />
          </div>
        </div>
        {invalid && <p className="text-xs text-red-500 mt-1.5">End date can’t be before the start date.</p>}
        <p className="text-[11px] text-gray-400 mt-2">The job spans these dates across the calendar. Set it here to place it on the schedule.</p>

        {stages.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-600 mb-1.5">Stages</p>
            <div className="flex flex-wrap gap-1.5">
              {stages.map(s => (
                <span key={s.key}
                  className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${completed.includes(s.key) ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {s.label}
                </span>
              ))}
            </div>
            <button onClick={onOpenJob} className="mt-2 text-xs text-[var(--brand-700)] hover:underline">
              Update stage progress in Job Management →
            </button>
          </div>
        )}

        <div className="flex gap-2 mt-5">
          <button onClick={() => onSave({ startDate, targetDate })} disabled={!startDate || invalid}
            className="flex-1 py-2 bg-[var(--brand-600)] text-white text-sm font-medium rounded-lg hover:bg-[var(--brand-700)] disabled:opacity-40 transition-colors">
            Save schedule
          </button>
          <button onClick={onClose}
            className="flex-1 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
