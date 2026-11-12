// ── Send a sub back for the next stage ──────────────────────────────────────
// On a completed booking: one button, a note for the sub ("Back for decking
// once the roof is on") and an optional start date. The booking goes back to
// Booked as the next stage, the note shows next to the job on the sub's
// phone, and the sub is told (lib/subTasks sendBackChanges, lib/notify).
import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useStore } from '../store'
import { sendBackChanges, stageOf } from '../lib/subTasks'

export default function SendBack({ task, big = false }) {
  const updateSubTask = useStore(s => s.updateSubTask)
  const me = useStore(s => s.me)
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [start, setStart] = useState('')
  const h = big ? 'h-11 text-sm' : 'h-8 text-xs'
  const box = `rounded-lg border border-gray-200 bg-white px-2.5 ${big ? 'text-base py-2' : 'text-xs py-1.5'}`
  const field = `w-full ${box}`

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className={`${h} px-3 rounded-lg border border-gray-200 bg-white font-semibold text-[var(--brand-700)] flex items-center gap-1.5 hover:bg-gray-50 ${big ? 'w-full justify-center rounded-xl' : ''}`}>
        <RotateCcw size={big ? 16 : 13} /> Send back for stage {stageOf(task) + 1}
      </button>
    )
  }
  const send = () => {
    if (!note.trim()) return
    updateSubTask(task.id, sendBackChanges(task, { note, startDate: start || null, by: me?.displayName || me?.email || '' }))
    setOpen(false); setNote(''); setStart('')
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
      <textarea autoFocus rows={2} value={note} onChange={e => setNote(e.target.value)} className={`${field} resize-none`}
        placeholder="What they're coming back for" aria-label="What they're coming back for" />
      <label className={`flex items-center gap-2 ${big ? 'text-sm' : 'text-xs'} text-gray-600`}>
        Start <input type="date" value={start} onChange={e => setStart(e.target.value)} className={box} aria-label="Start" />
      </label>
      <div className="flex gap-2">
        <button type="button" onClick={send} disabled={!note.trim()}
          className={`${h} flex-1 rounded-lg font-semibold text-white bg-[var(--brand-600)] hover:bg-[var(--brand-700)] disabled:opacity-40`}>Send back</button>
        <button type="button" onClick={() => setOpen(false)} className={`${h} flex-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-white`}>Cancel</button>
      </div>
    </div>
  )
}
