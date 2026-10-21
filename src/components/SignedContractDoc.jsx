import DeckPlusContract from '../contract/DeckPlusContract'
import { fmtShortDate, ROLE_LABELS, effectivePacket } from '../contract/contractFields'

// ── A signed (or partly signed) Deck Plus contract, as printed ───────────────
// The packet exactly as it was sent, with every party's signatures and initials
// in their fields. Used by the full-document view (/view/:recordId) and by the
// signing link once that party has signed, so both print the same copy.
export default function SignedContractDoc({ record }) {
  const d = record?.contractData
  const dp = d?.dp
  const signatures = record?.signatures || {}
  const sigOf = (fieldId, role) => signatures?.[role]?.fields?.[fieldId] || signatures?.[role]?.signatureDataUrl || null
  const renderSig     = (id, role) => { const s = sigOf(id, role); return s ? <img src={s} alt={`${ROLE_LABELS[role] || role} signature`} /> : null }
  const renderInit    = (id) => { const s = sigOf(`init:${id}`, 'client'); return s ? <img src={s} alt="Client initials" style={{ height: 22 }} /> : null }
  const renderSigDate = (id, role) => { const s = signatures?.[role]; return s?.signedAt && sigOf(id, role) ? <span>{fmtShortDate(s.signedAt)}</span> : null }

  if (!dp) return <div className="bg-white rounded-2xl border border-amber-200 p-6 text-sm text-amber-700">This record predates the Deck Plus contract packet and cannot be rendered here.</div>
  return (
    <DeckPlusContract
      className="bg-white shadow-lg rounded-sm overflow-hidden"
      values={dp.values} checks={dp.checks} packet={effectivePacket(dp)}
      scopeLines={d?.scopeLines || []} projectSummary={d?.projectSummary || ''} total={Number(d?.total) || 0} payments={d?.payments || []}
      renderSig={renderSig} renderSigDate={renderSigDate} renderInit={renderInit}
    />
  )
}
