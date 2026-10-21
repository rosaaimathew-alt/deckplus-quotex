import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import AuditCertificate from '../components/AuditCertificate'

// ── Certificate of completion / audit trail page ────────────────────────────
// For the office (and, printed, for a court or a collections file).
// /certificate/contract/<recordId> · /certificate/co/<recordId>

export default function EsignCertificate() {
  const { kind, recordId } = useParams()
  const navigate = useNavigate()
  const [rep, setRep] = useState(null)
  const [error, setError] = useState('')
  const api = kind === 'co' ? 'co' : 'sign'

  useEffect(() => {
    let live = true
    fetch(`/api/${api}/verify-${encodeURIComponent(recordId)}`)
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j })
      .then(j => { if (live) setRep(j) })
      .catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [api, recordId])

  if (error) return <div className="p-6 text-sm text-red-600">Could not load the audit certificate: {error}</div>
  if (!rep) return <div className="p-6 text-sm text-gray-500">Verifying signatures and audit log…</div>

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5 print:p-0">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"><ArrowLeft size={15} /> Back</button>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700"><Printer size={14} /> Print / Save PDF</button>
      </div>
      <AuditCertificate rep={rep} />
    </div>
  )
}
