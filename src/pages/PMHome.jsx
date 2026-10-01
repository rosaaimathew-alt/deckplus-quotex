import { useMemo } from 'react'
import { CalendarDays } from 'lucide-react'
import { useStore } from '../store'
import { useNav } from '../nav'
import { attentionItems, isJobClosed } from '../lib/attention'
import { getStages } from './Jobs'
import NeedsAttention from '../components/NeedsAttention'
import { TodoCard } from '../components/TodoPanel'
import PMCalendar from './PMCalendar'

// ── Project manager home ─────────────────────────────────────────────────────
// What needs scheduling or setup first, this week's milestones and the team
// to-do list, then the job calendar PMs plan from all day.

const ymd = (d) => d.toISOString().split('T')[0]

export default function PMHome() {
  const proposals = useStore(s => s.proposals)
  const { can, role } = useNav()
  const items = attentionItems({ proposals, can, role })

  // Milestones dated in the next 7 days, not yet done
  const week = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0)
    const end = new Date(start); end.setDate(end.getDate() + 7)
    const out = []
    for (const p of proposals) {
      if (p.status !== 'Won' || isJobClosed(p)) continue
      const stages = getStages(p) || []
      const done = p.jobData?.completedStages || []
      for (const [key, date] of Object.entries(p.jobData?.stageDates || {})) {
        if (!date || done.includes(key)) continue
        const d = new Date(date + 'T00:00:00')
        if (d >= start && d < end) out.push({ id: `${p.id}-${key}`, client: p.client || 'Unnamed', stage: stages.find(s => s.key === key)?.label || key, date })
      }
      if (p.jobData?.startDate) {
        const d = new Date(p.jobData.startDate + 'T00:00:00')
        if (d >= start && d < end) out.push({ id: `${p.id}-start`, client: p.client || 'Unnamed', stage: 'Job starts', date: p.jobData.startDate })
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date))
  }, [proposals])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const today = ymd(new Date())

  return (
    <div className="space-y-5">
      <div className="p-4 sm:p-6 pb-0 sm:pb-0 max-w-7xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting}!</h1>
          <p className="text-sm text-gray-400 mt-0.5">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <NeedsAttention items={items} />
            <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                <CalendarDays size={15} className="text-[var(--brand-600)]" />
                <p className="text-sm font-semibold text-gray-900">This week</p>
              </div>
              {week.length === 0 ? (
                <p className="px-5 py-4 text-sm text-gray-400">No start dates or milestones in the next 7 days.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {week.map(w => (
                    <li key={w.id} className="px-5 py-2.5 flex items-center gap-3">
                      <span className={`text-xs font-semibold w-20 shrink-0 ${w.date === today ? 'text-[var(--brand-700)]' : 'text-gray-500'}`}>
                        {w.date === today ? 'Today' : new Date(w.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      <span className="text-sm text-gray-900 font-medium truncate">{w.client}</span>
                      <span className="text-xs text-gray-500 truncate">· {w.stage}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <TodoCard />
        </div>
      </div>
      <PMCalendar />
    </div>
  )
}
