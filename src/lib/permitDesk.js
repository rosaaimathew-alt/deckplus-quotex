// ── The permitting numbers (components/PermitDesk, the office Today page) ──
// Read from each open job's steps and permit records (lib/permitTracking.js),
// the same data as the job's Permits tab and Projects › Inspections.
import { useMemo } from 'react'
import { useStore } from '../store'
import { getStages } from '../pages/Jobs'
import { isJob, isJobClosed } from './attention'
import {
  lastAttempt, isFailResult, boardCells, BOARD_COLUMNS, jobCounty, daysUntil, isInspectionKey, today as todayIso,
} from './permitTracking'

const APPROVAL_KEYS = ['hoa', 'zoning', 'building']

export function usePermitDesk() {
  const proposals = useStore(s => s.proposals)
  return useMemo(() => {
    const today = todayIso()
    const permits = [], inspections = [], expiring = []
    for (const p of proposals) {
      if (!isJob(p) || isJobClosed(p)) continue
      const jd = p.jobData || {}
      const done = jd.completedStages || []
      const stages = getStages(p) || []
      const name = p.client || 'Unnamed'
      for (const s of stages.filter(x => APPROVAL_KEYS.includes(x.key))) {
        const rec = jd.permits?.[s.key] || {}
        const approved = done.includes(s.key)
        const status = approved ? 'Approved' : rec.submitted ? 'Submitted' : 'Not submitted'
        if (approved && !(rec.approved && -daysUntil(rec.approved) <= 14)) continue
        permits.push({ id: p.id, name, permit: s.label, where: rec.jurisdiction || jobCounty(p) || '—', submitted: rec.submitted || '',
          days: !approved && rec.submitted ? Math.max(0, -daysUntil(rec.submitted)) : null, status, approved: rec.approved || '' })
      }
      for (const k of ['zoning', 'building']) {
        const e = jd.permits?.[k]?.expires
        if (e && !done.includes('final_insp') && daysUntil(e) <= 30) expiring.push({ id: p.id, name, days: daysUntil(e), date: e })
      }
      // Inspections: what's on the calendar this week, and anything failed and not passed since
      const seen = new Set()
      for (const s of stages.filter(x => isInspectionKey(x.key) && !done.includes(x.key))) {
        const last = lastAttempt(jd.inspections?.[s.key])
        const date = jd.stageDates?.[s.key]
        if (last && isFailResult(last.result)) { inspections.push({ id: p.id, name, what: s.label, date: last.date || '', status: 'Failed · re-inspect' }); seen.add(s.label) }
        else if (date && date >= today && daysUntil(date) <= 7) inspections.push({ id: p.id, name, what: s.label, date, status: 'Scheduled' })
      }
      const cells = boardCells(p)
      for (const c of BOARD_COLUMNS) {
        const cell = cells[c.key]
        if (cell?.state === 'fail' && ![...seen].some(l => l.toLowerCase().includes(c.title.toLowerCase().split(' ')[0]))) {
          inspections.push({ id: p.id, name, what: `${c.title} (county)`, date: cell.date || '', status: 'Failed · re-inspect' })
        }
      }
      const next = jd.nextInspection
      if (next?.date && next.date >= today && daysUntil(next.date) <= 7 && !inspections.some(i => i.id === p.id && i.date === next.date)) {
        inspections.push({ id: p.id, name, what: BOARD_COLUMNS.find(c => c.key === next.code)?.title || next.code || 'Inspection', date: next.date, status: 'Scheduled' })
      }
    }
    const order = { 'Not submitted': 1, Submitted: 0, Approved: 2 }
    permits.sort((a, b) => order[a.status] - order[b.status] || (b.days ?? -1) - (a.days ?? -1))
    inspections.sort((a, b) => (a.status === b.status ? (a.date || '').localeCompare(b.date || '') : a.status.startsWith('Failed') ? -1 : 1))
    const waiting = permits.filter(x => x.status === 'Submitted')
    return {
      permits, inspections, expiring,
      waiting: waiting.length, longest: waiting.reduce((m, x) => Math.max(m, x.days || 0), 0),
      notSubmitted: permits.filter(x => x.status === 'Not submitted').length,
      scheduled: inspections.filter(x => x.status === 'Scheduled').length,
      failed: inspections.filter(x => x.status !== 'Scheduled').length,
    }
  }, [proposals])
}

