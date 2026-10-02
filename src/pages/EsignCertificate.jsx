import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, ShieldCheck, ShieldAlert, CheckCircle2, XCircle, MinusCircle } from 'lucide-react'

// ── Certificate of completion / audit trail ─────────────────────────────────
// For the office (and, printed, for a court or a collections file): what was
// signed, by whom, from where, on what device, when to the millisecond, with
// what consent and email verification — and a live re-check that the document,
// the signatures, the server seal and the audit log are all untouched.
// /certificate/contract/<recordId> · /certificate/co/<recordId>

const EVENT_LABEL = {
  link_created: 'Signing links created',
  opened: 'Document opened',
  staff_viewed: 'Opened by office staff',
  disclosure_accepted: 'E-sign disclosure accepted',
  consent_checked: 'Consent box checked',
  consent_unchecked: 'Consent box unchecked',
  otp_sent: 'Email code sent',
  otp_verified: 'Email code verified',
  otp_failed: 'Wrong email code entered',
  consent: 'Consent recorded at signing',
  signed: 'Adopted and signed',
  rejected: 'Signing attempt refused',
  completed: 'All parties signed',
}
const ROLE = { client: 'Client', builder: 'Deck Plus', gc: 'General Contractor' }

const msTime = (ms) => {
  if (!ms) return '—'
  const d = new Date(Number(ms))
  return `${d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })}.${String(d.getMilliseconds()).padStart(3, '0')}`
}
const short = (h, n = 12) => (h ? `${String(h).slice(0, n)}…` : '—')
const geoText = (g) => (g ? [g.city, g.region, g.country].filter(Boolean).join(', ') : '')
const deviceText = (d) => (d ? [d.platform, d.screen && `screen ${d.screen}`, d.timezone, d.language].filter(Boolean).join(' · ') : '')

function Check({ c }) {
  const Icon = c.ok === true ? CheckCircle2 : c.ok === false ? XCircle : MinusCircle
  const color = c.ok === true ? 'text-emerald-600' : c.ok === false ? 'text-red-600' : 'text-gray-400'
  return (
    <li className="flex items-start gap-2 py-1.5">
      <Icon size={16} className={`${color} shrink-0 mt-0.5`} />
      <div className="min-w-0">
        <p className="text-sm text-gray-800">{c.label}</p>
        {c.detail && <p className="text-[11px] text-gray-500 break-all">{c.detail}</p>}
      </div>
    </li>
  )
}

function Row({ label, children }) {
  if (children == null || children === '') return null
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 py-1 text-xs">
      <span className="text-gray-400 font-medium">{label}</span>
      <span className="text-gray-800 break-all">{children}</span>
    </div>
  )
}

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

      <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Certificate of completion · e-sign audit trail</p>
        <h1 className="text-xl font-bold text-gray-900 mt-1">{rep.title}</h1>
        <p className="text-sm text-gray-500">{rep.client}{rep.status ? ` · ${rep.status}` : ''}{rep.createdAt ? ` · sent ${msTime(rep.createdAt)}` : ''}{rep.createdBy ? ` by ${rep.createdBy}` : ''}</p>
        <div className={`mt-4 flex items-center gap-2 rounded-xl px-4 py-3 ${rep.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
          {rep.ok ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
          <p className="text-sm font-semibold">{rep.ok ? 'Verified — nothing has been altered.' : 'Verification found a problem — see the failed checks below.'}</p>
          <span className="ml-auto text-[11px] opacity-70">checked {new Date(rep.verifiedAt).toLocaleString()}</span>
        </div>
        <ul className="mt-3 divide-y divide-gray-100">{rep.checks.map((c, i) => <Check key={i} c={c} />)}</ul>
        <div className="mt-3 border-t border-gray-100 pt-3">
          <Row label="Document SHA-256">{rep.docHash}</Row>
          <Row label="Seal public key">{`Ed25519 ${rep.sealKeyId} · ${rep.sealPublicKey}`}</Row>
          <Row label="Audit chain head">{rep.chain?.head}</Row>
        </div>
      </div>

      {rep.signers.map(s => (
        <div key={s.role} className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 break-inside-avoid">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ROLE[s.role] || s.role}</p>
              <p className="text-base font-bold text-gray-900">{s.printedName || '—'}</p>
            </div>
            {s.signatureDataUrl && <img src={s.signatureDataUrl} alt="signature" className="h-12 object-contain" />}
          </div>
          {s.legacy ? (
            <>
              <p className="text-xs text-amber-700 mb-1">Signed before sealed evidence was added. What was recorded at the time:</p>
              <Row label="Signed at">{msTime(s.signedAt)}</Row>
              <Row label="IP address">{s.ip}</Row>
              <Row label="Browser">{s.userAgent}</Row>
            </>
          ) : (
            <>
              <Row label="Signed at">{`${msTime(s.signedAt)} (${s.signedAtIso})`}</Row>
              <Row label="IP address">{s.ip}</Row>
              <Row label="IP chain">{s.ipChain !== s.ip ? s.ipChain : ''}</Row>
              <Row label="Location (IP)">{geoText(s.geo)}</Row>
              <Row label="Browser">{s.userAgent}</Row>
              <Row label="Device">{deviceText(s.device)}</Row>
              <Row label="Email verified">{s.emailVerification?.method === 'email code'
                ? `${s.emailVerification.email} at ${msTime(s.emailVerification.verifiedAt)}${s.emailVerification.emailMatchesFile ? ' (matches email on file)' : ' (differs from email on file)'}`
                : `No — ${s.emailVerification?.reason || 'not captured'}`}</Row>
              <Row label="Consent">{`“${s.consent?.text}” — checked${s.consent?.checkedAtClient ? ` ${msTime(s.consent.checkedAtClient)} (device clock)` : ''}`}</Row>
              <Row label="Disclosure">{s.disclosureAcceptedAtClient ? `E-sign disclosure accepted ${msTime(s.disclosureAcceptedAtClient)} (device clock)` : ''}</Row>
              <Row label="Signing act">{s.adopt?.method}</Row>
              <Row label="Fields signed">{s.fieldsSigned?.length ? `${s.fieldsSigned.length}` : ''}</Row>
              <Row label="Document SHA-256">{s.docHash}</Row>
              <Row label="Signature SHA-256">{s.signatureHash}</Row>
              <Row label="Server seal">{s.seal?.signature ? `Ed25519 ${s.seal.keyId} · ${short(s.seal.signature, 40)}` : (s.seal?.error || 'none')}</Row>
              <Row label="Audit entry">{s.eventHash}</Row>
            </>
          )}
        </div>
      ))}

      <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6">
        <p className="text-sm font-bold text-gray-900 mb-3">Audit log ({rep.events.length} events)</p>
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400">
                <th className="px-2 py-1.5 font-medium">#</th>
                <th className="px-2 py-1.5 font-medium">Time (server)</th>
                <th className="px-2 py-1.5 font-medium">Event</th>
                <th className="px-2 py-1.5 font-medium">Party</th>
                <th className="px-2 py-1.5 font-medium">IP / location</th>
                <th className="px-2 py-1.5 font-medium">Email / name</th>
                <th className="px-2 py-1.5 font-medium">Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rep.events.map(e => (
                <tr key={e.seq} className="align-top">
                  <td className="px-2 py-1.5 text-gray-400 tabular-nums">{e.seq}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap tabular-nums">{msTime(e.at_ms)}</td>
                  <td className="px-2 py-1.5 text-gray-800">{EVENT_LABEL[e.event] || e.event}{e.detail?.reason ? ` — ${e.detail.reason}` : ''}</td>
                  <td className="px-2 py-1.5">{ROLE[e.role] || e.role || '—'}</td>
                  <td className="px-2 py-1.5"><span className="block">{e.ip || '—'}</span><span className="block text-gray-400">{geoText(e.geo)}</span></td>
                  <td className="px-2 py-1.5 break-all">{[e.signer_email, e.signer_name].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-2 py-1.5 font-mono text-gray-400" title={e.event_hash}>{short(e.event_hash, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-gray-400 mt-3">Each log entry's hash covers the entry before it, so changing or removing any entry breaks every hash after it. The log can't be edited or deleted.</p>
      </div>
    </div>
  )
}
