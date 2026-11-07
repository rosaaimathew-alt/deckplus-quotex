// ── Subs on this job (Field mode) ────────────────────────────────────────────
// The PM's phone view of lib/subTasks: who's booked for what, where each one
// stands, a date for the inspection once a sub is near completion or done,
// and "Book a sub". Same records as the Jobs page's Subs tab.
import { useState } from 'react'
import { Plus, HardHat, Phone, CalendarDays } from 'lucide-react'
import { useStore } from '../store'
import { BookSubForm } from '../components/JobSubsTab'
import { SUB_STATUSES, STATUS_PILL, statusKey, statusLabel, needsInspection, subNameOf, tasksForJob } from '../lib/subTasks'
import { Card, dayLabel, telUrl } from './shared'
import { missingTodaysPhotos } from '../lib/taskPhotos'
import { PhotoDays } from '../components/TaskPhotos'

export default function SubTasksCard({ proposal }) {
  const tasks = tasksForJob(useStore(s => s.subTasks), proposal.id)
  const subs = useStore(s => s.subcontractors)
  const setSubTaskStatus = useStore(s => s.setSubTaskStatus)
  const updateSubTask = useStore(s => s.updateSubTask)
  const [adding, setAdding] = useState(false)
  const [open, setOpen] = useState(null)

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <HardHat size={18} className="text-gray-500" />
        <p className="flex-1 text-base font-semibold text-gray-900">Subs</p>
        {!adding && (
          <button onClick={() => setAdding(true)} className="h-10 px-3 rounded-xl text-sm font-semibold text-[var(--brand-700)] flex items-center gap-1 active:bg-gray-50">
            <Plus size={16} /> Book a sub
          </button>
        )}
      </div>

      {adding && <BookSubForm proposal={proposal} big onDone={() => setAdding(false)} />}

      {tasks.length === 0 && !adding && <p className="text-sm text-gray-500">No subs booked on this job.</p>}

      {tasks.length > 0 && (
        <ul className="space-y-2">
          {tasks.map(t => {
            const st = statusKey(t)
            const sub = (subs || []).find(s => String(s.id) === String(t.subId))
            const flag = needsInspection(t)
            return (
              <li key={t.id} className={`rounded-xl border ${flag ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
                <button onClick={() => setOpen(o => (o === t.id ? null : t.id))} className="w-full text-left px-3 py-3 flex items-center gap-3">
                  <span className="flex-1 min-w-0">
                    <span className="block text-base font-semibold text-gray-900 truncate">{t.title}</span>
                    <span className="block text-sm text-gray-500 truncate">
                      {subNameOf(t, subs)}{t.crewName ? ` · ${t.crewName}` : ''}{t.startDate ? ` · ${dayLabel(t.startDate)}` : ''}
                    </span>
                  </span>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_PILL[st]}`}>{statusLabel(t)}</span>
                </button>
                {flag && open !== t.id && (
                  <p className="px-3 pb-3 -mt-1 text-sm font-medium text-amber-800">Schedule the inspection</p>
                )}
                {missingTodaysPhotos(t) && (
                  <p className="px-3 pb-3 -mt-1 text-sm font-medium text-red-600">No photos from the sub today</p>
                )}
                {open === t.id && (
                  <div className="px-3 pb-3 space-y-2.5">
                    {t.notes && <p className="text-sm text-gray-600 whitespace-pre-wrap">{t.notes}</p>}
                    <PhotoDays task={t} maxDays={7} />
                    <div className="grid grid-cols-2 gap-2">
                      {SUB_STATUSES.map(s => (
                        <button key={s.key} onClick={() => s.key !== st && setSubTaskStatus(t.id, s.key)}
                          className={`h-11 rounded-xl text-sm font-semibold border ${s.key === st
                            ? 'bg-[var(--brand-600)] border-[var(--brand-600)] text-white'
                            : 'bg-white border-gray-200 text-gray-700'}`}>{s.label}</button>
                      ))}
                    </div>
                    {(st === 'near' || st === 'done') && (
                      <label className="flex items-center gap-3 h-12 px-3 rounded-xl border border-gray-200 bg-white">
                        <CalendarDays size={18} className="text-gray-500 shrink-0" />
                        <span className="text-sm text-gray-600 shrink-0">Inspection</span>
                        <input type="date" value={t.inspectionDate || ''} onChange={e => updateSubTask(t.id, { inspectionDate: e.target.value || null })}
                          className="flex-1 min-w-0 bg-transparent text-base text-gray-900 text-right outline-none" />
                      </label>
                    )}
                    {sub?.phone && (
                      <a href={telUrl(sub.phone)} className="h-11 rounded-xl border border-gray-200 bg-white flex items-center justify-center gap-2 text-sm font-semibold text-gray-700">
                        <Phone size={16} /> Call {sub.name || 'sub'}
                      </a>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
