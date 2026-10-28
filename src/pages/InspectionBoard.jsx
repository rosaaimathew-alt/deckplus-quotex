import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'
import { DEMO } from '../demo'
import { getStages } from './Jobs'
import PermitsTab from '../components/PermitsTab'
import { isJob } from '../lib/attention'
import { startPulse, runPermitPulse } from '../lib/permitPulse'
import { locateAddress } from '../lib/permitFees'
import {
  usePermitAccess, permitTracked, BOARD_COLUMNS, boardCells, countyFinaled, inspectionLabel, INSPECTION_TYPES,
} from '../lib/permitTracking'
import { Search, X, RefreshCw, Loader, ExternalLink, ChevronDown, ChevronRight, AlertTriangle, ShieldCheck, Printer, Plus, Trash2 } from 'lucide-react'
import { buildWeeklyReportHtml } from '../lib/inspectionReport'

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
const MARK = { pass: '✓', fail: '✗', sched: '◷', void: '–' }

function Cell({ cell, title }) {
  if (!cell?.state) return <span className="block text-center text-gray-200">·</span>
  return (
    <span title={`${title}: ${cell.result}${cell.date ? ` ${cell.date}` : ''}`}
      className={`block text-center text-[11px] leading-tight font-medium border rounded-md px-0.5 py-0.5 whitespace-nowrap min-w-[3rem] ${CELL[cell.state]}`}>
      {MARK[cell.state]} {md(cell.date)}
    </span>
  )
}

// A job sold outside the app, added so the office can track its permits.
// It's stored with status 'Imported', which every sales number leaves out.
function AddJobModal({ pms, onClose, onAdded }) {
  const addOffPlatformJob = useStore(s => s.addOffPlatformJob)
  const [f, setF] = useState({ client: '', street: '', city: '', zip: '', pm: '', jobType: '', permit: '' })
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))
  const address = [f.street.trim(), f.city.trim(), `NC ${f.zip.trim()}`.trim()].filter(Boolean).join(', ')

  const save = () => {
    if (!f.client.trim() || !f.street.trim()) return setErr('Client name and street address are needed.')
    if (!/^\d+\s+\S/.test(f.street.trim())) return setErr('The street address needs the house number, e.g. "1320 Betsy Dr".')
    if (!/^\d{5}$/.test(f.zip.trim())) return setErr('Add the 5-digit ZIP code. The county is looked up by it.')
    const loc = locateAddress(address)
    if (loc.county !== 'Mecklenburg') return setErr(`That ZIP is ${loc.county ? `in ${loc.county} County` : 'not one we know'}. The board only tracks Mecklenburg County jobs for now.`)
    const id = addOffPlatformJob({
      client: f.client.trim(), address, pm: f.pm.trim(), jobType: f.jobType.trim(),
      permit: f.permit.trim().toUpperCase(), county: 'Mecklenburg',
    })
    onAdded(id)
  }

  const input = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300'
  const label = 'block text-xs font-medium text-gray-600 mb-1'
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Add a job sold outside the app</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <p className="text-xs text-gray-500">Only for tracking its permit and inspections. It isn't counted as a sale anywhere: no revenue, win rate or commission changes.</p>
        <div>
          <label className={label}>Client *</label>
          <input className={input} value={f.client} onChange={set('client')} placeholder="Last, First — e.g. Ashley, Sara" autoFocus />
        </div>
        <div>
          <label className={label}>Street address *</label>
          <input className={input} value={f.street} onChange={set('street')} placeholder="1320 Betsy Dr" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className={label}>City</label>
            <input className={input} value={f.city} onChange={set('city')} placeholder="Charlotte" />
          </div>
          <div>
            <label className={label}>ZIP *</label>
            <input className={input} value={f.zip} onChange={set('zip')} placeholder="28211" inputMode="numeric" maxLength={5} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={label}>PM</label>
            <input className={input} value={f.pm} onChange={set('pm')} list="qx-pm-list" placeholder="B" />
            <datalist id="qx-pm-list">{pms.map(x => <option key={x} value={x} />)}</datalist>
          </div>
          <div className="col-span-2">
            <label className={label}>Job type</label>
            <input className={input} value={f.jobType} onChange={set('jobType')} placeholder="16'x14' Gable Roof Screen Porch" />
          </div>
        </div>
        <div>
          <label className={label}>County permit # (if issued)</label>
          <input className={`${input} font-mono`} value={f.permit} onChange={set('permit')} placeholder="RES-ADD-26-000807" />
          <p className="text-[11px] text-gray-400 mt-1">Leave blank and the app finds the permit by address once the county issues it.</p>
        </div>
        {err && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={save} className="flex-1 py-2 bg-[var(--brand-600)] text-white text-sm font-medium rounded-lg hover:opacity-90">Add to the board</button>
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
        </div>
      </div>
    </div>
  )
}

// lg and up: one grid row per job (matches Tailwind's lg breakpoint)
function useWide() {
  const q = '(min-width: 1024px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
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
    <div className="flex lg:flex-col gap-1" onClick={e => e.stopPropagation()}>
      <select value={next.code || ''} onChange={e => save({ code: e.target.value })}
        className="text-xs border border-gray-200 rounded-md px-1 py-1 bg-white w-full">
        <option value="">—</option>
        {INSPECTION_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
      </select>
      <input type="date" value={next.date || ''} onChange={e => save({ date: e.target.value })} disabled={!next.code}
        className="text-xs border border-gray-200 rounded-md px-1 py-1 bg-white disabled:opacity-40 w-full" />
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
    // What the job is: as sold in the app, else the county permit's description
    const type = p.imported?.jobType || p.jobData?.projectTypeOverride
      || [...(p.contractDraft?.projectTypes || p.projectTypes || [])].join(', ')
      || building?.description || ''
    return { p, cells, failed, problem, building, type, pm: p.imported?.pm || '', finaled: countyFinaled(p) }
  }).sort((a, b) => String(a.p.client || '').localeCompare(String(b.p.client || ''))), [proposals])

  const pms = [...new Set(jobs.map(j => j.pm).filter(Boolean))].sort()
  // Only the inspection columns some job actually has
  const cols = BOARD_COLUMNS.filter(c => jobs.some(j => j.cells[c.key]))
  const grid = `1.25rem minmax(0,1fr) repeat(${cols.length}, 3.4rem) 11.5rem`
  const wide = useWide()
  const shown = jobs.filter(j => {
    if (pm && j.pm !== pm) return false
    if (attention && !j.failed && !j.problem) return false
    if (hideFinaled && j.finaled) return false
    if (query) {
      const q = query.toLowerCase()
      return [j.p.client, j.p.address, j.type, j.building?.record, j.p.imported?.permit].some(v => String(v || '').toLowerCase().includes(q))
    }
    return true
  })
  const counts = {
    failed: jobs.filter(j => j.failed).length,
    pick: jobs.filter(j => j.problem === 'Pick permit').length,
    missing: jobs.filter(j => j.problem === 'Not found').length,
    sched: jobs.filter(j => Object.values(j.cells).some(c => c.state === 'sched') || j.p.jobData?.nextInspection?.code).length,
  }

  const company = useStore(s => s.branding?.companyName)
  const deleteProposal = useStore(s => s.deleteProposal)
  const [adding, setAdding] = useState(false)
  const onAdded = (id) => {
    setAdding(false); setOpen(id); setQuery('')
    if (!DEMO) runPermitPulse({ ids: [id] }).catch(e => setMsg(e.message))
  }
  // Prints what's on screen (the PM / search / attention filters apply)
  const printReport = () => {
    const w = window.open('', '_blank')
    if (!w) { setMsg('Allow pop-ups for this site to print the report.'); return }
    w.document.write(buildWeeklyReportHtml({ jobs: shown, company }))
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
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
        <div className="flex items-center gap-2 flex-wrap">
          {access === 'edit' && (
            <button onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:border-gray-300">
              <Plus size={13} /> Add job
            </button>
          )}
          <button onClick={printReport} disabled={!shown.length}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-[var(--brand-600)] text-white hover:opacity-90 disabled:opacity-40">
            <Printer size={13} /> Print weekly report
          </button>
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
            placeholder="Client, address, job type or permit #…" value={query} onChange={e => setQuery(e.target.value)} />
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

      {/* Fits the screen — no sideways scrolling. On wide screens each job is one
          row with a column per inspection; on narrow ones the cells wrap under it. */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
        <div className="hidden lg:grid items-center gap-x-1 px-3 py-2 text-[10px] uppercase tracking-wider text-gray-400 font-semibold" style={{ gridTemplateColumns: grid }}>
          <span />
          <span>Job</span>
          {cols.map(c => <span key={c.key} title={c.title} className="text-center">{c.label}</span>)}
          <span>Next inspection</span>
        </div>
        {shown.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-gray-400">{jobs.length ? 'No jobs match these filters.' : 'No ongoing Mecklenburg jobs yet.'}</p>
        )}
        {shown.map(j => {
          const isOpen = open === j.p.id
          return (
            <div key={j.p.id} className={isOpen ? 'bg-gray-50/70' : ''}>
              <div onClick={() => setOpen(isOpen ? null : j.p.id)}
                className="cursor-pointer hover:bg-gray-50 px-3 py-2 flex flex-wrap gap-2 lg:grid lg:items-center lg:gap-x-1"
                style={wide ? { gridTemplateColumns: grid } : undefined}>
                <span className="text-gray-400 pt-0.5">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                <div className="min-w-0 w-[calc(100%-2rem)] lg:w-auto">
                  <div className="font-medium text-gray-900 text-sm flex items-center gap-1.5 flex-wrap">
                    <span className="truncate">{j.p.client}</span>
                    {j.failed && <AlertTriangle size={12} className="text-red-500 shrink-0" />}
                    {j.pm && <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">PM {j.pm}</span>}
                  </div>
                  {j.type && <div className="text-xs text-gray-700 truncate" title={j.type}>{j.type}</div>}
                  <div className="text-[11px] text-gray-400 truncate">{j.p.address}</div>
                  <div className="text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap">
                    {j.building ? (
                      <>
                        <a href={j.building.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                          className="font-mono text-blue-700 hover:underline inline-flex items-center gap-0.5">{j.building.record} <ExternalLink size={9} /></a>
                        <span className="text-gray-400">{j.building.recordStatus || j.building.status}</span>
                      </>
                    ) : j.problem ? (
                      <span className={`px-1.5 py-0.5 rounded-full font-medium ${j.problem === 'Pick permit' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>{j.problem}</span>
                    ) : <span className="text-gray-300">not checked yet</span>}
                  </div>
                </div>
                {/* inspection cells: a column each on wide screens, a wrapped row of labelled chips otherwise */}
                {cols.map(c => (
                  <div key={c.key} className={`lg:block ${j.cells[c.key] ? '' : 'max-lg:hidden'}`}>
                    <span className="lg:hidden text-[9px] font-semibold text-gray-400 block text-center">{c.label}</span>
                    <Cell cell={j.cells[c.key]} title={c.title} />
                  </div>
                ))}
                <div className="w-full lg:w-auto text-xs text-gray-700">
                  <NextCell proposal={j.p} edit={access === 'edit'} />
                </div>
              </div>
              {isOpen && (
                <div className="px-4 pb-4 pt-1 space-y-2">
                  <PermitsTab proposal={j.p} stages={getStages(j.p) || []} readOnly={access !== 'edit'} />
                  {access === 'edit' && j.p.status === 'Imported' && (
                    <button onClick={() => { if (window.confirm(`Remove ${j.p.client} from the inspections board?`)) { deleteProposal(j.p.id); setOpen(null) } }}
                      className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-600">
                      <Trash2 size={11} /> Remove this job from the board
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {adding && <AddJobModal pms={pms} onClose={() => setAdding(false)} onAdded={onAdded} />}

      <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
        <ShieldCheck size={12} /> ✓ green passed · ✗ red failed / inaccessible / partial (latest result) · ◷ blue scheduled at the county · – gray cancelled. Hover a cell for the result.
        FT footing · SL slab · FR framing · ER / EF electrical rough / final · MI / MF mechanical rough / final · FI building final.
      </p>
    </div>
  )
}
