import { useState } from 'react'
import { useStore } from '../store'
import { PERMIT_KEYS, isInspectionKey, today, daysUntil } from '../lib/permitTracking'
import { CheckCircle2, AlertTriangle, Clock, Plus, X, FileText, ShieldCheck } from 'lucide-react'

// Office / Admin edit everything here; PMs (readOnly) see inspection status only.
// The data model is described in lib/permitTracking.js.

const RESULTS = ['Passed', 'Failed', 'Partial', 'Cancelled']
const RESULT_STYLE = {
  Passed:    'bg-green-100 text-green-700',
  Failed:    'bg-red-100 text-red-700',
  Partial:   'bg-amber-100 text-amber-700',
  Cancelled: 'bg-gray-100 text-gray-600',
}

const fmtDate = d => d ? new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

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

function InspectionCard({ proposal, stage, readOnly }) {
  const { updateJobData, setJobStageDate } = useStore()
  const jobData = proposal.jobData || {}
  const attempts = jobData.inspections?.[stage.key]?.attempts || []
  const scheduled = jobData.stageDates?.[stage.key] || ''
  const passed = attempts.some(a => a.result === 'Passed')
  const last = attempts[attempts.length - 1]
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
      ? { label: last.result === 'Cancelled' ? 'Cancelled' : `${last.result} — re-inspect`, cls: RESULT_STYLE[last.result] }
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

export default function PermitsTab({ proposal, stages, readOnly }) {
  const permits = readOnly ? [] : stages.filter(s => PERMIT_KEYS.includes(s.key))
  const inspections = stages.filter(s => isInspectionKey(s.key))

  if (permits.length === 0 && inspections.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic flex items-center gap-1.5">
        <ShieldCheck size={13} /> {!stages.length ? 'Set the job type on the Stages tab first.' : readOnly ? 'This job type has no inspections.' : 'This job type has no permits or inspections.'}
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {permits.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Permits</p>
          {permits.map(s => <PermitCard key={s.key} proposal={proposal} stage={s} />)}
        </div>
      )}
      {inspections.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Inspections{readOnly ? ' — updated by the office' : ''}</p>
          {inspections.map(s => <InspectionCard key={s.key} proposal={proposal} stage={s} readOnly={readOnly} />)}
        </div>
      )}
    </div>
  )
}
