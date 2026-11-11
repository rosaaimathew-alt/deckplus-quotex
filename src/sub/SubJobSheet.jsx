// ── Sub app: what's being installed, and where the job stands ───────────────
// On a task, for the sub it's booked with and the crew member on it:
//
//   Electrical items — the list the office put on the booking, or, when the
//                      job's contract was made here, its Electrical
//                      Specifications answers
//   Job checklist    — the job's stages, with the ones the PM has ticked off,
//                      so they can see when their part is coming
//   Paint            — on a paint job (one the paint PM put a painter on):
//                      the colors with what each goes on, the notes for the
//                      painter and the open touch-ups
//
// A sub's login can't read the job itself; the database hands back just these
// two things for their own tasks (supabase/sub_job_sheet.sql). No prices.
import { useEffect, useState } from 'react'
import { Zap, ListChecks, CheckCircle2, Circle, PaintRoller } from 'lucide-react'
import { useStore } from '../store'
import { subJobSheet } from '../supabase'
import { DEMO } from '../demo'
import { Card } from '../field/shared'
import { getStages } from '../pages/Jobs'
import { electricalItemsOf } from '../lib/electricalItems'
import { paintColorsOf } from '../lib/paintColors'
import { dayLabel } from '../field/shared'

const _cache = new Map()   // task id → sheet, so going back and forth doesn't blink

function useSheet(task) {
  const proposals = useStore(s => s.proposals)
  const [sheet, setSheet] = useState(() => _cache.get(task.id) || null)
  useEffect(() => {
    if (DEMO) return
    let off = false
    subJobSheet(task.id).then(d => { if (!off && d) { _cache.set(task.id, d); setSheet(d) } }).catch(() => { /* offline: keep what we had */ })
    return () => { off = true }
  }, [task.id])
  if (DEMO) {
    // The demo holds the whole job in the browser
    const p = (proposals || []).find(x => String(x.id) === String(task.proposalId))
    if (!p) return null
    const d = p.contractDraft || {}
    return {
      paint: task.paint ? { ...(p.jobData?.paint || {}), date: p.jobData?.stageDates?.paint || null, touchUps: (p.jobData?.touchUps || []).filter(t => !t.done) } : null,
      electrical: d.dp?.values || {}, completedStages: p.jobData?.completedStages || [], stageDates: p.jobData?.stageDates || {}, projectTypeOverride: p.jobData?.projectTypeOverride || null,
      projectTypes: d.projectTypes || [], hasWindows: /window|glass|enclos/i.test(JSON.stringify([d.scopeBullets || [], d.scopeLines || []])),
    }
  }
  return sheet
}

export function JobSheet({ task }) {
  const sheet = useSheet(task)
  const items = (task.electrical || []).length ? task.electrical : electricalItemsOf(sheet?.electrical)
  const stages = sheet ? getStages({
    jobData: { projectTypeOverride: sheet.projectTypeOverride || undefined },
    contractDraft: { projectTypes: sheet.projectTypes || [], scopeBullets: sheet.hasWindows ? ['window'] : [] },
  }) : null
  const done = new Set(sheet?.completedStages || [])
  const dates = sheet?.stageDates || {}
  const paint = task.paint ? sheet?.paint : null
  const colors = paintColorsOf(paint)
  const touchUps = paint?.touchUps || []
  const hasPaint = colors.length > 0 || paint?.notes || touchUps.length > 0 || paint?.date
  if (!items.length && !stages && !hasPaint) return null
  return (
    <>
      {hasPaint && (
        <Card className="p-4 space-y-3">
          <p className="text-base font-semibold text-gray-900 flex items-center gap-2"><PaintRoller size={20} className="text-[var(--brand-700)]" /> Paint</p>
          {paint.date && <p className="text-base text-gray-800">Paint date: {dayLabel(paint.date)}</p>}
          {colors.length > 0 && (
            <ul className="divide-y divide-gray-100" aria-label="Paint colors">
              {colors.map((c, i) => (
                <li key={i} className="py-2 first:pt-0 last:pb-0">
                  <p className="text-base font-semibold text-gray-900">{c.color || 'Color not set'}</p>
                  {c.areas && <p className="text-base text-gray-800">{c.areas}</p>}
                  {(c.product || c.sheen) && <p className="text-sm text-gray-500">{[c.product, c.sheen].filter(Boolean).join(' · ')}</p>}
                </li>
              ))}
            </ul>
          )}
          {paint.notes && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">Notes for the painter</p>
              <p className="text-base text-gray-800 whitespace-pre-wrap">{paint.notes}</p>
            </div>
          )}
          {touchUps.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">Touch-ups</p>
              <ul className="list-disc pl-5 text-base text-gray-800" aria-label="Touch-ups">{touchUps.map((t, i) => <li key={i}>{t.text}</li>)}</ul>
            </div>
          )}
        </Card>
      )}
      {items.length > 0 && (
        <Card className="p-4 space-y-2">
          <p className="text-base font-semibold text-gray-900 flex items-center gap-2"><Zap size={20} className="text-[var(--brand-700)]" /> Electrical items</p>
          <ul className="divide-y divide-gray-100" aria-label="Electrical items">
            {items.map((it, i) => (
              <li key={i} className="flex items-start gap-3 py-2 text-base text-gray-900">
                <span className="flex-1 min-w-0">{it.label}</span>
                {it.qty && <span className="shrink-0 font-bold tabular-nums">{it.qty}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {stages && (
        <Card className="p-4 space-y-2">
          <p className="text-base font-semibold text-gray-900 flex items-center gap-2"><ListChecks size={20} className="text-[var(--brand-700)]" /> Job checklist</p>
          <ul className="space-y-1.5" aria-label="Job checklist">
            {stages.map(s => {
              const ok = done.has(s.key)
              return (
                <li key={s.key} className={`flex items-center gap-2.5 text-base ${ok ? 'text-gray-500' : 'text-gray-900'}`}>
                  {ok ? <CheckCircle2 size={20} className="text-green-600 shrink-0" /> : <Circle size={20} className="text-gray-300 shrink-0" />}
                  <span className="flex-1 min-w-0">{s.label}</span>
                  {!ok && dates[s.key] && <span className="shrink-0 text-sm font-semibold text-gray-700">{dayLabel(dates[s.key])}</span>}
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </>
  )
}
