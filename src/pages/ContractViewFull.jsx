import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { Printer, Loader2 } from 'lucide-react'
import DeckPlusContract from '../contract/DeckPlusContract'
import { fmtShortDate, ROLE_LABELS } from '../contract/contractFields'

// ── Signed contract view (/view/:recordId) ───────────────────────────────────
// Renders the packet exactly as it was sent, with every party's signatures and
// initials placed in their fields, plus the audit trail.

export default function ContractViewFull() {
  const { recordId } = useParams()
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  useEffect(() => {
    fetch(`/api/sign/record-${recordId}`)
      .then(async r => {
        const text = await r.text()
        let parsed
        try { parsed = JSON.parse(text) } catch { throw new Error(text.slice(0, 200)) }
        if (!r.ok || parsed.error) throw new Error(parsed.error || `HTTP ${r.status}`)
        return parsed
      })
      .then(d => { setRecord(d); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [recordId])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex items-center gap-2 text-gray-500"><Loader2 size={18} className="animate-spin" /> Loading signed contract…</div>
    </div>
  )
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md text-center bg-white rounded-2xl border border-red-200 p-6">
        <p className="text-red-600 font-bold mb-2">Error</p>
        <p className="text-sm font-mono text-gray-700">{error}</p>
      </div>
    </div>
  )

  const { contractData: d, contractNum, signatures = {} } = record
  const dp        = d?.dp
  const branding  = d?.branding || {}
  const logo      = branding?.logo || '/contract/deckplus-logo.png'

  const sigOf = (fieldId, role) => signatures?.[role]?.fields?.[fieldId] || signatures?.[role]?.signatureDataUrl || null
  const renderSig     = (id, role) => { const s = sigOf(id, role); return s ? <img src={s} alt={`${ROLE_LABELS[role] || role} signature`} /> : null }
  const renderInit    = (id) => { const s = sigOf(`init:${id}`, 'client'); return s ? <img src={s} alt="Client initials" style={{ height: 22 }} /> : null }
  const renderSigDate = (id, role) => { const s = signatures?.[role]; return s?.signedAt && sigOf(id, role) ? <span>{fmtShortDate(s.signedAt)}</span> : null }

  return (
    <div className="min-h-screen bg-gray-100 pb-12">
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-20 shadow-sm no-print">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src={logo} alt="logo" className="h-8 object-contain" />
            <span className="text-xs text-gray-500">Contract #{contractNum} — Signed Document</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${record.status === 'signed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {record.status === 'signed' ? 'Fully Signed' : 'Partially Signed'}
            </span>
          </div>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700"><Printer size={14} /> Print / Save PDF</button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto my-4 px-2 sm:px-4">
        {dp ? (
          <DeckPlusContract
            className="bg-white shadow-lg rounded-sm overflow-hidden"
            values={dp.values} checks={dp.checks} packet={dp.packet}
            scopeLines={d?.scopeLines || []} projectSummary={d?.projectSummary || ''} total={Number(d?.total) || 0} payments={d?.payments || []}
            renderSig={renderSig} renderSigDate={renderSigDate} renderInit={renderInit}
          />
        ) : (
          <div className="bg-white rounded-2xl border border-amber-200 p-6 text-sm text-amber-700">This record predates the Deck Plus contract packet and cannot be rendered here.</div>
        )}

        {/* Audit trail */}
        <div className="bg-white rounded-b-sm px-6 sm:px-12 py-6 border-t border-gray-200 no-print">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Signature Audit Trail</p>
          <div className="space-y-2">
            {['client', 'builder'].map(r => {
              const sig = signatures[r]
              if (!sig) return <div key={r} className="text-xs text-gray-400">{ROLE_LABELS[r]}: not signed</div>
              return (
                <div key={r} className="text-xs text-gray-600 font-mono bg-gray-50 rounded p-2 border border-gray-200">
                  <span className="font-bold text-gray-800">{ROLE_LABELS[r]}</span> — {sig.printedName} — {new Date(sig.signedAt).toLocaleString()} — IP: {sig.ip}
                  {sig.agreementAgreedAt && <> — ESIGN consent {new Date(sig.agreementAgreedAt).toLocaleString()}</>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
