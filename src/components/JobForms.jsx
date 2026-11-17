// ── Forms (Jobs page tab, and the job in Field mode) ─────────────────────────
// What the project manager builds from, taken from the contract as it was
// sent: the Scope of Work with its payment schedule, the job spec sheets and
// the Processing Form. The legal pages stay on the contract itself.
import { useEffect, useState } from 'react'
import { Loader2, Printer } from 'lucide-react'
import { contractNumberFor } from '../store'
import SignedContractDoc from './SignedContractDoc'
import { btnGhost } from '../pages/books/ui'

async function getJson(url) {
  const res = await fetch(url)
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok && !data.error, status: res.status, data }
}

// The job's contract record: the one saved on the job, or (when that one was
// replaced by a newer send, or was never saved) the latest for its number.
async function loadRecord(proposal) {
  const draft = proposal.contractDraft || {}
  let denied = false
  if (draft.signRecordId) {
    const r = await getJson(`/api/sign/record-${draft.signRecordId}`)
    if (r.ok && r.data.status !== 'superseded') return { record: r.data }
    denied = r.status === 403
  }
  const num = draft.contractNum || contractNumberFor(proposal.id)
  const found = await getJson(`/api/sign/lookup-${encodeURIComponent(num)}?proposalId=${encodeURIComponent(proposal.id)}`)
  if (found.ok && found.data.recordId) {
    const r = await getJson(`/api/sign/record-${found.data.recordId}`)
    if (r.ok) return { record: r.data }
  }
  return { record: null, denied: denied || found.status === 403 }
}

export default function JobForms({ proposal, phone = false }) {
  const key = `${proposal.id}:${proposal.contractDraft?.signRecordId || ''}`
  const [got, setGot] = useState(null)   // { key, record, denied }
  useEffect(() => {
    let live = true
    loadRecord(proposal)
      .then(r => { if (live) setGot({ key, ...r }) })
      .catch(() => { if (live) setGot({ key, record: null }) })
    return () => { live = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the job or its contract record changes
  }, [key])

  if (got?.key !== key) return <p className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" /> Loading forms…</p>
  const record = got.record
  if (!record?.contractData?.dp) {
    return <p className="text-center py-8 text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">{got.denied ? 'You can only view your own contracts.' : 'No contract sent for this job yet'}</p>
  }
  const signed = record.status === 'signed'
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-gray-800">Contract #{record.contractNum}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${signed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{signed ? 'Signed' : 'Not fully signed'}</span>
        <div className="flex-1" />
        {!phone && <a href={`/view/${record.recordId}?forms=1`} target="_blank" rel="noopener noreferrer" className={btnGhost}><Printer size={14} /> Print</a>}
      </div>
      <div className="qx-ink dp-signing border border-gray-200 rounded-xl bg-white">
        <SignedContractDoc record={record} formsOnly />
      </div>
    </div>
  )
}
