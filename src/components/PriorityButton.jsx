// ── Priority button on a sub booking ─────────────────────────────────────────
// One tap by the PM puts this booking first on the sub's list and tells the
// sub (lib/subTasks priorityChanges). Tap again to clear it. Used on the job's
// Subs tab and on the PM's phone (Field mode).
import { Flag } from 'lucide-react'
import { useStore } from '../store'
import { isPriority, priorityChanges, statusKey } from '../lib/subTasks'

export default function PriorityButton({ task, big = false }) {
  const updateSubTask = useStore(s => s.updateSubTask)
  const me = useStore(s => s.me)
  if (statusKey(task) === 'done') return null
  const on = isPriority(task)
  const toggle = () => updateSubTask(task.id, priorityChanges(!on, me?.displayName || me?.email || ''))
  return (
    <button onClick={toggle} aria-pressed={on}
      title={on ? 'Priority: first on the sub\'s list. Click to clear.' : 'Put this first on the sub\'s list and tell them'}
      className={`${big ? 'h-11 w-full rounded-xl text-sm font-semibold justify-center' : 'px-2.5 py-1 rounded-lg text-xs font-medium'} border flex items-center gap-1.5 ${on
        ? 'border-red-600 bg-red-600 text-white'
        : 'border-red-200 text-red-700 hover:bg-red-50'}`}>
      <Flag size={big ? 16 : 12} /> {on ? 'Priority · on' : 'Priority'}
    </button>
  )
}
