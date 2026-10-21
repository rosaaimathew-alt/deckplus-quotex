import { useEffect, useState } from 'react'
import AuditCertificate from './AuditCertificate'

// ── The audit trail, printed on its own page after the signed contract ───────
// `url` returns the verification report (office: /api/sign/verify-<id>;
// signing link: /api/sign/<token>?certificate=1). `refreshKey` reloads it,
// e.g. after a new signature. Shows nothing until it has loaded.
export default function SignedAuditTrail({ url, refreshKey }) {
  const [rep, setRep] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    fetch(url)
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j })
      .then(j => { if (live) { setRep(j); setError('') } })
      .catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [url, refreshKey])

  if (error) return <p className="no-print text-xs text-red-600 mt-4">Could not load the audit trail: {error}</p>
  if (!rep) return <p className="no-print text-xs text-gray-500 mt-4">Loading the audit trail…</p>
  return (
    <div data-pdf-block className="mt-6" style={{ breakBefore: 'page', pageBreakBefore: 'always' }}>
      <AuditCertificate rep={rep} />
    </div>
  )
}
