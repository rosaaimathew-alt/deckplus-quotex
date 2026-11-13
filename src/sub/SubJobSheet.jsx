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
import { Zap, ListChecks, CheckCircle2, Circle, PaintRoller, ClipboardCheck } from 'lucide-react'
import { useStore } from '../store'
import { subJobSheet } from '../supabase'
import { DEMO } from '../demo'
import { Card } from '../field/shared'
import { getStages } from '../pages/Jobs'
import { electricalItemsOf } from '../lib/electricalItems'
import { paintColorsOf } from '../lib/paintColors'
import { tr, dayText as dayLabel } from '../lib/lang'

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
    // the job's own text (types, quote lines, summary, permits) when the database sends it
    ...(typeof sheet.checklistText === 'string' ? { checklistText: sheet.checklistText } : {}),
    jobData: { projectTypeOverride: sheet.projectTypeOverride || undefined },
    contractDraft: { projectTypes: sheet.projectTypes || [], scopeBullets: sheet.hasWindows ? ['window'] : [] },
  }) : null
  const done = new Set(sheet?.completedStages || [])
  const dates = sheet?.stageDates || {}
  const paint = task.paint ? sheet?.paint : null
  const colors = paintColorsOf(paint)
  const touchUps = paint?.touchUps || []
  const hasPaint = colors.length > 0 || paint?.notes || touchUps.length > 0 || paint?.date
  // Their own trade's inspection results on this job, newest first (lib/subInspections)
  const results = [...(Array.isArray(task.inspections) ? task.inspections : [])].reverse()
  if (!items.length && !stages && !hasPaint && !results.length) return null
  return (
    <>
      {hasPaint && (
        <Card className="p-4 space-y-3">
          <p className="text-base font-semibold text-gray-900 flex items-center gap-2"><PaintRoller size={20} className="text-[var(--brand-700)]" /> {tr('Paint')}</p>
          {paint.date && <p className="text-base text-gray-800">{tr('Paint date')}: {dayLabel(paint.date)}</p>}
          {colors.length > 0 && (
            <ul className="divide-y divide-gray-100" aria-label="Paint colors">
              {colors.map((c, i) => (
                <li key={i} className="py-2 first:pt-0 last:pb-0">
                  <p className="text-base font-semibold text-gray-900">{c.color || tr('Color not set')}</p>
                  {c.areas && <p className="text-base text-gray-800">{c.areas}</p>}
                  {(c.product || c.sheen) && <p className="text-sm text-gray-500">{[c.product, c.sheen].filter(Boolean).join(' · ')}</p>}
                </li>
              ))}
            </ul>
          )}
          {paint.notes && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">{tr('Notes for the painter')}</p>
              <p className="text-base text-gray-800 whitespace-pre-wrap">{paint.notes}</p>
            </div>
          )}
          {touchUps.length > 0 && (
            <div className="pt-2 border-t border-gray-100">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">{tr('Touch-ups')}</p>
              <ul className="list-disc pl-5 text-base text-gray-800" aria-label="Touch-ups">{touchUps.map((t, i) => <li key={i}>{t.text}</li>)}</ul>
            </div>
          )}
        </Card>
      )}
      {results.length > 0 && (
        <Card className="p-4 space-y-2">
          <p className="text-base font-semibold text-gray-900 flex items-center gap-2"><ClipboardCheck size={20} className="text-[var(--brand-700)]" /> {tr('Inspection results')}</p>
          <ul className="divide-y divide-gray-100" aria-label="Inspection results">
            {results.map(r => (
              <li key={r.id} className="py-2 first:pt-0 last:pb-0">
                <p className="flex items-center gap-2 text-base text-gray-900">
                  <span className="flex-1 min-w-0 font-semibold">{tr(r.name)}</span>
                  <span className={`shrink-0 text-sm font-bold px-2.5 py-0.5 rounded-full ${r.state === 'pass' ? 'bg-green-100 text-green-800' : r.state === 'fail' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                    {r.state === 'pass' ? tr('Passed') : r.state === 'fail' ? tr('Did not pass') : (r.result || tr('Recorded'))}
                  </span>
                </p>
                <p className="text-sm text-gray-500">{[r.date ? dayLabel(r.date) : '', r.state === 'fail' ? r.result : ''].filter(Boolean).join(' · ')}</p>
                {r.state === 'fail' && r.note && <p className="text-base text-gray-800 mt-1 whitespace-pre-wrap">{r.note}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {items.length > 0 && (
        <Card className="p-4 space-y-2">
          <p className="text-base font-semibold text-gray-900 flex items-center gap-2"><Zap size={20} className="text-[var(--brand-700)]" /> {tr('Electrical items')}</p>
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
          <p className="text-base font-semibold text-gray-900 flex items-center gap-2"><ListChecks size={20} className="text-[var(--brand-700)]" /> {tr('Job checklist')}</p>
          <ul className="space-y-1.5" aria-label="Job checklist">
            {stages.map(s => {
              const ok = done.has(s.key)
              return (
                <li key={s.key} className={`flex items-center gap-2.5 text-base ${ok ? 'text-gray-500' : 'text-gray-900'}`}>
                  {ok ? <CheckCircle2 size={20} className="text-green-600 shrink-0" /> : <Circle size={20} className="text-gray-300 shrink-0" />}
                  <span className="flex-1 min-w-0">{tr(s.label)}</span>
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
