// ── Split one bill or card charge across jobs (lib/split.js) ─────────────────
// One row per job with its amount; "Split evenly" for loads shared equally.
// The rows must add up to the total before it can be saved (splitAddsUp).
import { useState } from 'react'
import { Plus, XCircle } from 'lucide-react'
import { Combo, inputCls, Modal, btnPrimary, btnGhost, useJobOptions } from './ui'
import { money } from '../../lib/books'
import { evenSplit, splitAddsUp, splitPatch, splitReady } from '../../lib/split'

export default function JobSplit({ rows, setRows, total, jobOptions }) {
  const sum = rows.reduce((t, r) => t + (Number(r.amount) || 0), 0)
  const ok = splitAddsUp(rows, total)
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 grid-cols-[1fr_120px_auto] items-center">
          <Combo options={jobOptions} value={r.jobId} onChange={v => setRows(rows.map((x, j) => (j === i ? { ...x, jobId: v } : x)))} placeholder="Pick a job…" />
          <input type="number" step="0.01" value={r.amount} onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
            placeholder="0.00" className={inputCls} aria-label="Amount to this job" />
          <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length <= 2}
            className="text-gray-300 hover:text-red-500 px-1 disabled:opacity-30" aria-label="Remove job"><XCircle size={15} /></button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setRows([...rows, { jobId: null, amount: '' }])} className="inline-flex items-center gap-1 text-xs text-[var(--brand-700)] hover:underline"><Plus size={12} /> Another job</button>
          <button type="button" onClick={() => setRows(evenSplit(rows, total))} className="text-xs text-[var(--brand-700)] hover:underline">Split evenly</button>
        </div>
        <p className={`text-xs ${ok ? 'text-gray-500' : 'text-red-600 font-semibold'}`}>{new Set(rows.filter(r => r.jobId != null).map(r => String(r.jobId))).size < rows.filter(r => r.jobId != null).length ? 'A job is picked twice · ' : ''}Split {money(sum)} of {money(total)}</p>
      </div>
    </div>
  )
}

// A card charge split across jobs (Insights › Expenses): the same rows in a box.
export function SplitChargeModal({ charge, onSave, onClose }) {
  const jobOptions = useJobOptions()
  const total = Number(charge.amount) || 0
  const [rows, setRows] = useState(() => (Array.isArray(charge.splits) && charge.splits.length > 1
    ? charge.splits.map(r => ({ ...r }))
    : [{ jobId: charge.jobId ?? null, amount: total }, { jobId: null, amount: '' }]))
  const ok = splitReady(rows, total)
  return (
    <Modal title={`Split ${money(total)} across jobs`} onClose={onClose}
      footer={<>
        {Array.isArray(charge.splits) && charge.splits.length > 1 && (
          <button onClick={() => { onSave({ jobId: charge.splits[0].jobId, splits: null }); onClose() }} className={`${btnGhost} mr-auto`}>One job only</button>
        )}
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button onClick={() => { onSave({ ...splitPatch(rows), bucket: 'job' }); onClose() }} disabled={!ok} className={btnPrimary}>Save</button>
      </>}>
      <p className="text-sm text-gray-600">{charge.description}{charge.date ? ` · ${charge.date}` : ''}</p>
      <JobSplit rows={rows} setRows={setRows} total={total} jobOptions={jobOptions} />
    </Modal>
  )
}
