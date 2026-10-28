import { Fragment, useMemo, useState } from 'react'
import { useStore } from '../store'
import { DEMO } from '../demo'
import { getStages } from './Jobs'
import PermitsTab from '../components/PermitsTab'
import { isJob } from '../lib/attention'
import { startPulse } from '../lib/permitPulse'
import {
  usePermitAccess, permitTracked, BOARD_COLUMNS, boardCells, countyFinaled, inspectionLabel, INSPECTION_TYPES,
} from '../lib/permitTracking'
import { Search, X, RefreshCw, Loader, ExternalLink, ChevronDown, ChevronRight, AlertTriangle, ShieldCheck } from 'lucide-react'

// ── Inspections board (Projects › Inspections) ───────────────────────────────
// Every ongoing Mecklenburg job on one screen, one column per inspection, the
// way the office's Inspection Track sheet reads. Click a row for the inspector
// notes, the permit pick and the next-inspection setter (the job's Permits tab).

const md = (d) => { if (!d) return ''; const [, m, day] = d.split('-'); return `${Number(m)}/${Number(day)}` }
const CELL = {
  pass:  'bg-green-100 text-green-800 border-green-200',
  fail:  'bg-red-100 text-red-800 border-red-200',
  sched: 'bg-blue-100 text-blue-800 border-blue-200',
  void:  'bg-gray-100 text-gray-500 border-gray-200',
}
const SHORT = { Passed: '✓', Failed: 'Fail', Inaccessible: 'Inacc', 'Partial Approval': 'Partial', Cancelled: 'Canc', Rescheduled: 'Resch', Scheduled: 'Sched' }

function Cell({ cell, title }) {
  if (!cell?.state) return <span className="block text-center text-gray-200">·</span>
  return (
    <span title={`${title}: ${cell.result}${cell.date ? ` ${cell.date}` : ''}`}
      className={`block text-center text-[11px] leading-tight font-medium border rounded-md px-1 py-0.5 whitespace-nowrap ${CELL[cell.state]}`}>
      {SHORT[cell.result] || cell.result} {md(cell.date)}
    </span>
  )
}

// The office types the next inspection straight into the row, like the sheet.
function NextCell({ proposal, edit }) {
  const updateJobData = useStore(s => s.updateJobData)
  const next = proposal.jobData?.nextInspection || {}
  if (!edit) return next.code ? <>{inspectionLabel(next.code)}{next.date ? ` · ${md(next.date)}` : ''}</> : <span className="text-gray-300">—</span>
  const save = (changes) => {
    const v = { code: next.code || '', date: next.date || '', ...changes }
    updateJobData(proposal.id, { nextInspection: v.code ? v : null })
  }
  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <select value={next.code || ''} onChange={e => save({ code: e.target.value })}
        className="text-xs border border-gray-200 rounded-md px-1 py-1 bg-white max-w-[8.5rem]">
        <option value="">—</option>
        {INSPECTION_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
      </select>
      <input type="date" value={next.date || ''} onChange={e => save({ date: e.target.value })} disabled={!next.code}
        className="text-xs border border-gray-200 rounded-md px-1 py-1 bg-white disabled:opacity-40 w-[7.5rem]" />
    </div>
  )
}

export default function InspectionBoard() {
  const proposals = useStore(s => s.proposals)
  const permitPulse = useStore(s => s.permitPulse)
  const progress = useStore(s => s.permitPulseProgress)
  const me = useStore(s => s.me)
  const access = usePermitAccess()
  const [query, setQuery] = useState('')
  const [pm, setPm] = useState('')
  const [attention, setAttention] = useState(false)
  const [hideFinaled, setHideFinaled] = useState(false)
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const jobs = useMemo(() => proposals.filter(p => isJob(p) && permitTracked(p)).map(p => {
    const cells = boardCells(p)
    const cp = p.countyPermit
    const failed = Object.values(cells).some(c => c.state === 'fail')
    const problem = cp?.needsPick ? 'Pick permit' : (cp?.error && !cp?.permits?.length) ? 'Not found' : ''
    const building = (cp?.permits || []).find(x => x.role === 'building')
    return { p, cells, failed, problem, building, pm: p.imported?.pm || '', finaled: countyFinaled(p) }
  }).sort((a, b) => String(a.p.client || '').localeCompare(String(b.p.client || ''))), [proposals])

  const pms = [...new Set(jobs.map(j => j.pm).filter(Boolean))].sort()
  const shown = jobs.filter(j => {
    if (pm && j.pm !== pm) return false
    if (attention && !j.failed && !j.problem) return false
    if (hideFinaled && j.finaled) return false
    if (query) {
      const q = query.toLowerCase()
      return [j.p.client, j.p.address, j.building?.record, j.p.imported?.permit].some(v => String(v || '').toLowerCase().includes(q))
    }
    return true
  })
  const counts = {
    failed: jobs.filter(j => j.failed).length,
    pick: jobs.filter(j => j.problem === 'Pick permit').length,
    missing: jobs.filter(j => j.problem === 'Not found').length,
    sched: jobs.filter(j => Object.values(j.cells).some(c => c.state === 'sched') || j.p.jobData?.nextInspection?.code).length,
  }

  const checkNow = async () => {
    setBusy(true); setMsg('')
    try {
      const out = await startPulse(me?.displayName || me?.email || 'office', { force: true })
      if (out) setMsg(`Checked ${out.done} job${out.done === 1 ? '' : 's'}${out.failed ? `, ${out.failed} couldn't be read — try again` : ''}.`)
    } catch (e) { setMsg(e.message) } finally { setBusy(false) }
  }

  if (!access) {
    return <p className="p-6 text-sm text-gray-500">The inspections board is for the office and project managers.</p>
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Mecklenburg inspections</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {jobs.length} ongoing job{jobs.length === 1 ? '' : 's'} · county site {permitPulse?.lastRunAt
              ? `checked ${new Date(permitPulse.lastRunAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
              : 'not checked yet'} · checks at 8 AM and 1 PM
          </p>
          {progress && (
            <p className="text-xs text-blue-700 mt-1 inline-flex items-center gap-1.5">
              <Loader size={12} className="animate-spin" /> Reading the county site… {progress.done} of {progress.total} jobs
            </p>
          )}
        </div>
        {access === 'edit' && !DEMO && (
          <div className="flex items-center gap-2">
            {msg && <span className="text-xs text-gray-600">{msg}</span>}
            <button onClick={checkNow} disabled={busy}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-300 disabled:opacity-50">
              {busy ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />} {busy ? 'Checking the county site…' : 'Check county now'}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-100">{counts.failed} with a failed inspection</span>
        <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">{counts.sched} scheduled</span>
        {counts.pick > 0 && <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-100">{counts.pick} need a permit picked</span>}
        {counts.missing > 0 && <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 border border-gray-200">{counts.missing} not found on the county site</span>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 bg-white w-full sm:w-64">
          <Search size={13} className="text-gray-400 shrink-0" />
          <input className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400"
            placeholder="Client, address or permit #…" value={query} onChange={e => setQuery(e.target.value)} />
          {query && <button onClick={() => setQuery('')} className="text-gray-300 hover:text-gray-500"><X size={12} /></button>}
        </div>
        {pms.length > 0 && (
          <select value={pm} onChange={e => setPm(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white">
            <option value="">All PMs</option>
            {pms.map(x => <option key={x} value={x}>PM {x}</option>)}
          </select>
        )}
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={attention} onChange={e => setAttention(e.target.checked)} /> Needs attention
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={hideFinaled} onChange={e => setHideFinaled(e.target.checked)} /> Hide finaled at county
        </label>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[1200px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
              <th className="text-left font-semibold px-3 py-2 w-6"></th>
              <th className="text-left font-semibold px-2 py-2">Client</th>
              <th className="text-left font-semibold px-2 py-2">PM</th>
              <th className="text-left font-semibold px-2 py-2">Permit</th>
              {BOARD_COLUMNS.map(c => <th key={c.key} title={c.title} className="font-semibold px-1 py-2 w-[4.5rem] min-w-[4.5rem] text-center">{c.label}</th>)}
              <th className="text-left font-semibold px-2 py-2 min-w-[17rem]">Next inspection</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={5 + BOARD_COLUMNS.length} className="px-4 py-10 text-center text-sm text-gray-400">
                {jobs.length ? 'No jobs match these filters.' : 'No ongoing Mecklenburg jobs yet.'}
              </td></tr>
            )}
            {shown.map(j => {
              const isOpen = open === j.p.id
              return (
                <Fragment key={j.p.id}>
                  <tr onClick={() => setOpen(isOpen ? null : j.p.id)}
                    className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${isOpen ? 'bg-gray-50' : ''}`}>
                    <td className="px-3 py-2 text-gray-400">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td className="px-2 py-2">
                      <div className="font-medium text-gray-900 flex items-center gap-1.5">
                        {j.p.client}
                        {j.failed && <AlertTriangle size={12} className="text-red-500" />}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate max-w-[15rem]">{j.p.address}</div>
                    </td>
                    <td className="px-2 py-2 text-xs text-gray-600">{j.pm || '—'}</td>
                    <td className="px-2 py-2 text-xs whitespace-nowrap">
                      {j.building ? (
                        <a href={j.building.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                          className="font-mono text-blue-700 hover:underline inline-flex items-center gap-1">{j.building.record} <ExternalLink size={10} /></a>
                      ) : j.problem ? (
                        <span className={`px-2 py-0.5 rounded-full font-medium ${j.problem === 'Pick permit' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>{j.problem}</span>
                      ) : <span className="text-gray-300">not checked</span>}
                      {j.building && <div className="text-[11px] text-gray-400">{j.building.recordStatus || j.building.status}</div>}
                    </td>
                    {BOARD_COLUMNS.map(c => <td key={c.key} className="px-1 py-2"><Cell cell={j.cells[c.key]} title={c.title} /></td>)}
                    <td className="px-2 py-2 text-xs text-gray-700 whitespace-nowrap">
                      <NextCell proposal={j.p} edit={access === 'edit'} />
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-gray-50/60 border-b border-gray-100">
                      <td colSpan={5 + BOARD_COLUMNS.length} className="px-4 py-4">
                        <div className="sticky left-4 max-w-4xl">
                          <PermitsTab proposal={j.p} stages={getStages(j.p) || []} readOnly={access !== 'edit'} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
        <ShieldCheck size={12} /> Green passed · red failed / inaccessible / partial (latest result) · blue scheduled at the county · gray cancelled.
        FT footing · SL slab · FR framing · ER / EF electrical rough / final · MI / MF mechanical rough / final · FI building final.
      </p>
    </div>
  )
}
