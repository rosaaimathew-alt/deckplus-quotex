import { useState } from 'react'
import { useStore } from '../store'
import {
  PERMIT_KEYS, isInspectionKey, today, daysUntil, INSPECTION_TYPES, inspectionLabel,
  countyByStage, countyPassed, countyLast, isFailResult, isPassResult,
} from '../lib/permitTracking'
import { runPermitPulse } from '../lib/permitPulse'
import { DEMO } from '../demo'
import { CheckCircle2, AlertTriangle, Clock, Plus, X, FileText, ShieldCheck, ExternalLink, RefreshCw, Loader, CalendarDays } from 'lucide-react'

// Office / Admin edit everything here; PMs (readOnly) see inspection status only.
// The data model is described in lib/permitTracking.js. Results marked
// "County" come from the Mecklenburg permit site via the twice-daily pulse.

const RESULTS = ['Passed', 'Failed', 'Partial', 'Cancelled']
const RESULT_STYLE = {
  Passed:    'bg-green-100 text-green-700',
  Failed:    'bg-red-100 text-red-700',
  Partial:   'bg-amber-100 text-amber-700',
  Cancelled: 'bg-gray-100 text-gray-600',
}

const fmtDate = d => d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const fmtWhen = iso => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
const resultStyle = r => RESULT_STYLE[r] || (isPassResult(r) ? RESULT_STYLE.Passed : isFailResult(r) ? RESULT_STYLE.Failed : RESULT_STYLE.Cancelled)
const CountyTag = () => <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--brand-600)] bg-[var(--brand-50,#f5efe6)] px-1.5 py-0.5 rounded">County</span>

function permitStatus(permit = {}) {
  if (permit.approved) return { label: 'Approved', cls: 'bg-green-100 text-green-700' }
  if (permit.submitted) return { label: 'Submitted', cls: 'bg-blue-100 text-blue-700' }
  return { label: 'Not submitted', cls: 'bg-gray-100 text-gray-600' }
}

const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-300'
const Label = ({ children }) => <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{children}</label>

function PermitCard({ proposal, stage }) {
  const { updateJobData } = useStore()
  const jobData = proposal.jobData || {}
  const permit = jobData.permits?.[stage.key] || {}
  const status = permitStatus(permit)

  const set = (field, value) => {
    const next = { ...permit, [field]: value }
    const changes = { permits: { ...(jobData.permits || {}), [stage.key]: next } }
    const completed = jobData.completedStages || []
    if (field === 'approved' && value && !completed.includes(stage.key)) {
      changes.completedStages = [...completed, stage.key]
    }
    updateJobData(proposal.id, changes)
  }

  const expiresIn = permit.expires ? daysUntil(permit.expires) : null

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-800">{stage.label}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.cls}`}>{status.label}</span>
        </div>
        {expiresIn !== null && expiresIn <= 30 && (
          <span className={`text-xs font-medium inline-flex items-center gap-1 ${expiresIn < 0 ? 'text-red-600' : 'text-amber-600'}`}>
            <AlertTriangle size={11} /> {expiresIn < 0 ? `Expired ${-expiresIn} day${expiresIn === -1 ? '' : 's'} ago` : `Expires in ${expiresIn} day${expiresIn === 1 ? '' : 's'}`}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <Label>Permit #</Label>
          <input value={permit.number || ''} onChange={e => set('number', e.target.value)} placeholder="e.g. BLD-2026-01234" className={inputCls} />
        </div>
        <div className="col-span-2 sm:col-span-2">
          <Label>Jurisdiction</Label>
          <input value={permit.jurisdiction || ''} onChange={e => set('jurisdiction', e.target.value)}
            placeholder="Mecklenburg County, NC" className={inputCls} />
        </div>
        <div>
          <Label>Submitted</Label>
          <input type="date" value={permit.submitted || ''} onChange={e => set('submitted', e.target.value)} className={inputCls} />
        </div>
        <div>
          <Label>Approved</Label>
          <input type="date" value={permit.approved || ''} onChange={e => set('approved', e.target.value)} className={inputCls} />
        </div>
        <div>
          <Label>Expires</Label>
          <input type="date" value={permit.expires || ''} onChange={e => set('expires', e.target.value)} className={inputCls} />
        </div>
        <div>
          <Label>Fee paid ($)</Label>
          <input type="number" min="0" step="0.01" value={permit.fee ?? ''} onChange={e => set('fee', e.target.value)} className={inputCls} />
        </div>
        <div className="col-span-2">
          <Label>Notes</Label>
          <input value={permit.notes || ''} onChange={e => set('notes', e.target.value)}
            placeholder="Portal login, plan reviewer, conditions…" className={inputCls} />
        </div>
      </div>
    </div>
  )
}

function InspectionCard({ proposal, stage, readOnly, county = [] }) {
  const { updateJobData, setJobStageDate } = useStore()
  const jobData = proposal.jobData || {}
  const attempts = jobData.inspections?.[stage.key]?.attempts || []
  const scheduled = jobData.stageDates?.[stage.key] || ''
  const passed = attempts.some(a => a.result === 'Passed') || countyPassed(county)
  // Latest result, ours or the county's
  const last = [attempts[attempts.length - 1], countyLast(county)].filter(Boolean)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).pop()
  const [adding, setAdding] = useState(false)
  const blank = () => ({ date: scheduled || today(), result: 'Passed', inspector: last?.inspector || '', notes: '' })
  const [form, setForm] = useState(blank)

  const saveAttempts = (next, extra = {}) =>
    updateJobData(proposal.id, {
      inspections: { ...(jobData.inspections || {}), [stage.key]: { attempts: next } },
      ...extra,
    })

  const add = () => {
    const extra = {}
    const completed = jobData.completedStages || []
    if (form.result === 'Passed' && !completed.includes(stage.key)) extra.completedStages = [...completed, stage.key]
    saveAttempts([...attempts, { id: Date.now(), ...form }], extra)
    setAdding(false)
  }

  const remove = (id) => saveAttempts(attempts.filter(a => a.id !== id))

  const status = passed
    ? { label: 'Passed', cls: RESULT_STYLE.Passed }
    : last
      ? { label: /cancel/i.test(last.result) ? 'Cancelled' : `${last.result} — re-inspect`, cls: resultStyle(last.result) }
      : scheduled
        ? { label: 'Scheduled', cls: 'bg-blue-100 text-blue-700' }
        : { label: 'Not scheduled', cls: 'bg-gray-100 text-gray-600' }

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {passed ? <CheckCircle2 size={14} className="text-green-500" /> : <Clock size={14} className="text-gray-400" />}
          <span className="text-sm font-semibold text-gray-800">{stage.label}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${status.cls}`}>{status.label}</span>
        </div>
        {!passed && readOnly && scheduled && (
          <span className="text-xs text-gray-500">Scheduled {fmtDate(scheduled)}</span>
        )}
        {!passed && !readOnly && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Scheduled</span>
            <input type="date" value={scheduled} onChange={e => setJobStageDate(proposal.id, stage.key, e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
        )}
      </div>

      {county.length > 0 && (
        <div className="space-y-1.5">
          {county.map(c => (
            <div key={`${c.record}-${c.id}`} className="text-sm bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <CountyTag />
                <span className="text-xs font-semibold text-gray-700">{fmtDate(c.date)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${resultStyle(c.result)}`}>{c.result}</span>
                <span className="text-xs text-gray-500">{c.code} - {c.name}</span>
                {c.inspector && <span className="text-xs text-gray-500">Inspector: {c.inspector}</span>}
              </div>
              {(c.notes || []).map((n, i) => <p key={i} className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{n.text}</p>)}
            </div>
          ))}
        </div>
      )}

      {attempts.length > 0 && (
        <div className="space-y-1.5">
          {attempts.map((a, i) => (
            <div key={a.id} className="flex items-start gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-400">#{i + 1}</span>
                  <span className="text-xs font-semibold text-gray-700">{fmtDate(a.date)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RESULT_STYLE[a.result]}`}>{a.result}</span>
                  {a.inspector && <span className="text-xs text-gray-500">Inspector: {a.inspector}</span>}
                </div>
                {a.notes && <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{a.notes}</p>}
              </div>
              {!readOnly && <button onClick={() => remove(a.id)} title="Remove this result" className="text-gray-300 hover:text-red-500 shrink-0"><X size={13} /></button>}
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <Label>Date</Label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <Label>Result</Label>
              <select value={form.result} onChange={e => setForm(f => ({ ...f, result: e.target.value }))} className={inputCls}>
                {RESULTS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label>Inspector</Label>
              <input value={form.inspector} onChange={e => setForm(f => ({ ...f, inspector: e.target.value }))} className={inputCls} />
            </div>
          </div>
          <div>
            <Label>{form.result === 'Passed' ? 'Notes' : 'Corrections needed'}</Label>
            <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder={form.result === 'Passed' ? 'Optional' : 'What the inspector flagged…'}
              className={`${inputCls} resize-none`} />
          </div>
          <div className="flex gap-2">
            <button onClick={add} className="flex-1 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">Save result</button>
            <button onClick={() => setAdding(false)} className="flex-1 py-1.5 border border-gray-200 text-gray-600 text-xs rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      ) : !passed && !readOnly && (
        <button onClick={() => { setForm(blank()); setAdding(true) }}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
          <Plus size={13} /> Record {attempts.length ? 're-inspection' : 'inspection'} result
        </button>
      )}
    </div>
  )
}

// What the county site says about this job's permit(s), and — when the
// county has more than one permit at the address — the choice of which.
function CountyPanel({ proposal, readOnly }) {
  const { updateJobData } = useStore()
  const cp = proposal.countyPermit
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const check = async () => {
    setBusy(true); setErr('')
    try { await runPermitPulse({ ids: [proposal.id] }) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const pick = async (capIds) => {
    updateJobData(proposal.id, { countyPick: capIds })
    // the store update is synchronous, so the check below already sends the pick
    await check()
  }

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-gray-400" />
          <span className="text-sm font-semibold text-gray-800">Mecklenburg County permit</span>
          {cp?.checkedAt && <span className="text-xs text-gray-400">checked {fmtWhen(cp.checkedAt)}</span>}
        </div>
        {!readOnly && !DEMO && (
          <button onClick={check} disabled={busy}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50">
            {busy ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />} {busy ? 'Checking…' : 'Check county now'}
          </button>
        )}
      </div>

      {!cp && <p className="text-xs text-gray-400 italic">Not checked yet. The county site is read every morning and afternoon.</p>}
      {(err || cp?.error) && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 flex items-start gap-1.5">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {err || cp.error}
        </p>
      )}

      {(cp?.permits || []).map(p => (
        <div key={p.record} className="flex items-center gap-2 flex-wrap text-xs">
          <a href={p.url} target="_blank" rel="noreferrer" className="font-mono font-semibold text-blue-700 hover:underline inline-flex items-center gap-1">
            {p.record} <ExternalLink size={11} />
          </a>
          <span className="text-gray-500">{p.type}</span>
          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium">{p.recordStatus || p.status}</span>
          <span className="text-gray-400">{p.projectName} · {p.address}</span>
        </div>
      ))}

      {cp?.needsPick && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 space-y-2">
          <p className="text-xs text-amber-800 font-medium">
            {readOnly
              ? 'The county has more than one permit at this address. The office needs to pick the right one.'
              : 'Which permit is this job? These are every permit the county has at this address. Check the name and description before picking.'}
          </p>
          {(cp.candidates || []).map(c => (
            <div key={c.record} className="flex items-center gap-2 flex-wrap text-xs bg-white rounded-lg px-2.5 py-2 border border-amber-100">
              <a href={c.url} target="_blank" rel="noreferrer" className="font-mono font-semibold text-blue-700 hover:underline inline-flex items-center gap-1">{c.record} <ExternalLink size={11} /></a>
              <span className="font-medium text-gray-800">{c.projectName}</span>
              <span className="text-gray-500">{c.description}</span>
              <span className="text-gray-400">{c.status}{c.date ? ` · ${fmtDate(c.date)}` : ''}</span>
              {!readOnly && (
                <button onClick={() => pick(c.capIds)} disabled={busy}
                  className="ml-auto px-2.5 py-1 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">Use this permit</button>
              )}
            </div>
          ))}
        </div>
      )}

      {!readOnly && proposal.jobData?.countyPick && !cp?.needsPick && (
        <button onClick={() => updateJobData(proposal.id, { countyPick: null })} className="text-[11px] text-gray-400 hover:text-gray-600 underline">
          Wrong permit? Clear the pick and choose again on the next check
        </button>
      )}
    </div>
  )
}

// "Scheduled for <date>: <type>" — set by the office once an inspection is booked.
function NextInspection({ proposal, readOnly, upcoming }) {
  const { updateJobData } = useStore()
  const next = proposal.jobData?.nextInspection || null
  const [form, setForm] = useState({ code: next?.code || '', date: next?.date || '' })
  const dirty = form.code !== (next?.code || '') || form.date !== (next?.date || '')
  const save = () => updateJobData(proposal.id, { nextInspection: form.code ? { code: form.code, date: form.date } : null })

  return (
    <div className="border border-gray-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <CalendarDays size={14} className="text-gray-400" />
        <span className="text-sm font-semibold text-gray-800">Next inspection</span>
      </div>
      {readOnly ? (
        <p className="text-sm text-gray-700">
          {next?.code ? <>Scheduled{next.date ? ` for ${fmtDate(next.date)}` : ''}: <b>{inspectionLabel(next.code)}</b></> : <span className="text-gray-400 italic">Nothing scheduled yet.</span>}
        </p>
      ) : (
        <div className="flex items-end gap-2 flex-wrap">
          <div className="min-w-[13rem]">
            <Label>Type</Label>
            <select value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className={inputCls}>
              <option value="">— Nothing scheduled —</option>
              {INSPECTION_TYPES.map(t => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <Label>Scheduled for</Label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inputCls} />
          </div>
          <button onClick={save} disabled={!dirty}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40">Save</button>
        </div>
      )}
      {upcoming.map(u => (
        <p key={`${u.record}-${u.id}`} className="text-xs text-gray-600 flex items-center gap-2 flex-wrap">
          <CountyTag /> {u.code} - {u.name} {u.status ? u.status.toLowerCase() : 'scheduled'} {u.date ? `for ${fmtDate(u.date)}` : ''}{u.inspector ? ` · Inspector: ${u.inspector}` : ''}
        </p>
      ))}
    </div>
  )
}

export default function PermitsTab({ proposal, stages, readOnly }) {
  const permits = readOnly ? [] : stages.filter(s => PERMIT_KEYS.includes(s.key))
  const inspections = stages.filter(s => isInspectionKey(s.key))
  const county = countyByStage(proposal, stages.map(s => s.key))

  return (
    <div className="space-y-4">
      <CountyPanel proposal={proposal} readOnly={readOnly} />
      <NextInspection key={JSON.stringify(proposal.jobData?.nextInspection || null)} proposal={proposal} readOnly={readOnly} upcoming={county.upcoming} />
      {permits.length === 0 && inspections.length === 0 && (
        <p className="text-xs text-gray-400 italic">
          {!stages.length ? 'Set the job type on the Stages tab to track permits and inspections by stage.' : 'This job type has no permit or inspection stages; county inspections are listed below.'}
        </p>
      )}
      {permits.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Permits</p>
          {permits.map(s => <PermitCard key={s.key} proposal={proposal} stage={s} />)}
        </div>
      )}
      {inspections.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Inspections{readOnly ? ' — updated by the office' : ''}</p>
          {inspections.map(s => <InspectionCard key={s.key} proposal={proposal} stage={s} readOnly={readOnly} county={county.byStage[s.key]} />)}
        </div>
      )}
      {county.other.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Other county inspections</p>
          {county.other.map(c => (
            <div key={`${c.record}-${c.id}`} className="text-sm bg-gray-50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 flex-wrap">
                <CountyTag />
                <span className="text-xs font-semibold text-gray-700">{fmtDate(c.date)}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${resultStyle(c.result)}`}>{c.result}</span>
                <span className="text-xs text-gray-500">{c.code} - {c.name}</span>
                <span className="text-xs text-gray-400 font-mono">{c.record}</span>
                {c.inspector && <span className="text-xs text-gray-500">Inspector: {c.inspector}</span>}
              </div>
              {(c.notes || []).map((n, i) => <p key={i} className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{n.text}</p>)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
