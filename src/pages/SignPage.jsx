import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import SignaturePad from '../components/SignaturePad'
import { X, CheckCircle2 } from 'lucide-react'
import { ESIGN_DISCLOSURE, AGREEMENT_ACK } from '../legalContent'
import DeckPlusContract from '../contract/DeckPlusContract'
import { requiredSignFields, ROLE_LABELS, fmtShortDate } from '../contract/contractFields'

// ── Signing page ─────────────────────────────────────────────────────────────
// Each party opens their own link (/sign/<token>) and signs or initials only
// the fields the packet assigns to them. The packet is rendered by
// DeckPlusContract from the snapshot saved when the office sent it, so the
// signer sees exactly what the office saw.

const fmt = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const ROLE_LABEL = { client: 'Client', builder: 'Deck Plus', gc: 'General Contractor' }
const today = () => fmtShortDate(new Date())

export default function SignPage() {
  const { token } = useParams()
  const sigRef = useRef(null)
  const [record, setRecord]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [printedName, setPrintedName] = useState('')
  const [masterSig, setMasterSig] = useState(null)   // base64 from capture drawer
  const [, setStagingSig] = useState(null) // temp while drawer is open
  const [appliedFields, setAppliedFields] = useState(new Set())
  const [showCapture, setShowCapture] = useState(false)
  const [pendingField, setPendingField] = useState(null) // field waiting for first capture
  const [submitting, setSubmitting] = useState(false)
  const [esignConsent, setEsignConsent] = useState(false)   // ESIGN/UETA consent
  const [agreedAt, setAgreedAt]   = useState(null)          // binding-agreement acceptance, on open
  const [done, setDone]           = useState(false)

  useEffect(() => {
    fetch(`/api/sign/${token}`)
      .then(async r => {
        const text = await r.text()
        let parsed
        try { parsed = JSON.parse(text) } catch { throw new Error(`Bad response (${r.status}): ${text.slice(0,200)}`) }
        if (!r.ok || parsed.error) throw new Error(parsed.error || `HTTP ${r.status}`)
        return parsed
      })
      .then(d => { setRecord(d); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [token])

  const openCapture = useCallback((fieldId = null) => {
    setPendingField(fieldId)
    setStagingSig(null)
    sigRef.current?.clear()
    setShowCapture(true)
  }, [])

  const confirmCapture = useCallback(() => {
    if (!printedName.trim()) { alert('Enter your full name first'); return }
    if (sigRef.current?.isEmpty()) { alert('Please draw or type your signature'); return }
    const dataUrl = sigRef.current.toDataURL()
    setMasterSig(dataUrl)
    setShowCapture(false)
    if (pendingField) {
      setAppliedFields(prev => new Set([...prev, pendingField]))
      setPendingField(null)
    }
  }, [printedName, pendingField])

  const applyField = useCallback((fieldId) => {
    if (!masterSig) { openCapture(fieldId); return }
    setAppliedFields(prev => new Set([...prev, fieldId]))
  }, [masterSig, openCapture])

  const handleSubmit = async () => {
    if (!masterSig) { alert('Please create your signature first'); return }
    if (!esignConsent) { alert('Please agree to sign electronically before submitting.'); return }
    if (requiredFields.length > 0 && !isComplete) {
      alert(`Please sign all required fields (${requiredFields.length - signedCount} remaining)`)
      return
    }
    setSubmitting(true)
    try {
      // Build fieldSignatures map
      const fieldSignatures = {}
      appliedFields.forEach(fid => { fieldSignatures[fid] = masterSig })
      const res = await fetch(`/api/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fieldSignatures, signatureDataUrl: masterSig, printedName, esignConsent: true, agreementAgreedAt: agreedAt }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error)
      setDone(true)
    } catch (err) {
      alert(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-4xl mb-3">📄</div>
        <div className="text-gray-700 font-semibold">Loading contract…</div>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md text-center bg-white rounded-2xl border border-red-200 p-6 shadow-sm">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-red-600 font-bold mb-2">Can't load contract</p>
        <p className="text-gray-700 text-sm font-mono bg-red-50 rounded p-3 text-left break-all">{error}</p>
      </div>
    </div>
  )

  if (done || record?.alreadySigned) return (
    <div className="min-h-screen flex items-center justify-center bg-green-50">
      <div className="text-center px-6 max-w-sm">
        <div className="text-6xl mb-4">✓</div>
        <h1 className="text-2xl font-bold text-green-700 mb-2">{done ? 'Signed Successfully' : 'Already Signed'}</h1>
        <p className="text-gray-500">
          {done ? `Thank you ${printedName}. Your signature has been recorded.` : 'This party has already signed this contract.'}
        </p>
      </div>
    </div>
  )

  const { contractData: d, contractNum, role, signatures: existingSigs = {} } = record || {}

  if (d?.type === 'change-order') {
    const clientSig  = existingSigs?.client
    const builderSig = existingSigs?.builder
    const myRole     = role === 'builder' ? 'builder' : 'client'
    const mySig      = myRole === 'client' ? clientSig : builderSig
    const coLines    = d.lines || []

    return (
      <div className="min-h-screen bg-gray-100 py-8 px-4">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden">

          {/* CO Header */}
          <div className="bg-gray-900 text-white px-8 py-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">{companyName}</p>
                <h1 className="text-2xl font-bold">Change Order</h1>
                <p className="text-sm text-gray-300 mt-1">{d.coNumber}</p>
              </div>
              <div className="text-right text-sm text-gray-300">
                <p>{new Date(d.createdAt || Date.now()).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p>
                <p className="mt-1">Ref: {d.originalContractNum}</p>
              </div>
            </div>
          </div>

          <div className="px-8 py-6 space-y-6">

            {/* Client info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Client</p>
                <p className="font-medium text-gray-900">{d.client}</p>
                <p className="text-gray-500">{d.address}</p>
                <p className="text-gray-500">{d.email}</p>
                <p className="text-gray-500">{d.phone}</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Contractor</p>
                <p className="font-medium text-gray-900">{companyName}</p>
                <p className="text-gray-500">Licensed & Insured</p>
              </div>
            </div>

            {/* Description */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Scope of Change</p>
              <p className="text-sm text-gray-800 bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">{d.description}</p>
            </div>

            {/* Line items */}
            {coLines.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Line Items</p>
                <div className="border border-gray-200 rounded-xl overflow-hidden text-sm">
                  <div className="grid grid-cols-[1fr_60px_90px_90px] bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <span>Description</span><span>Qty</span><span>Unit $</span><span className="text-right">Total</span>
                  </div>
                  {coLines.map((l, i) => (
                    <div key={i} className="grid grid-cols-[1fr_60px_90px_90px] px-4 py-2 border-t border-gray-100">
                      <span className="text-gray-800">{l.desc}</span>
                      <span className="text-gray-600">{l.qty}</span>
                      <span className="text-gray-600">${fmt(l.unitPrice)}</span>
                      <span className="text-right font-medium">${fmt((Number(l.qty)||0)*(Number(l.unitPrice)||0))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Financial summary */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 space-y-2 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Original Contract ({d.originalContractNum})</span>
                <span>${fmt(d.originalTotal)}</span>
              </div>
              <div className="flex justify-between text-blue-700 font-medium">
                <span>This Change Order</span>
                <span>+ ${fmt(d.amount)}</span>
              </div>
              <div className="flex justify-between font-bold text-gray-900 text-base border-t border-gray-300 pt-2 mt-2">
                <span>New Contract Total</span>
                <span>${fmt(d.newTotal)}</span>
              </div>
            </div>

            {/* Terms */}
            <p className="text-xs text-gray-500 border-t border-gray-100 pt-4">
              By signing below, both parties agree to the scope and pricing described in this change order.
              Payment for this change order is due at the time of the change per the original contract terms.
              All other terms of the original contract remain in effect.
            </p>

            {/* Signature section */}
            {mySig ? (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 flex items-center gap-2">
                <CheckCircle2 size={16} /> You have signed this change order. Thank you, {mySig.printedName}.
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {myRole === 'client' ? 'Client Signature' : 'Builder Signature'}
                </p>
                <input
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="Print your full name"
                  value={printedName}
                  onChange={e => setPrintedName(e.target.value)}
                />
                <div className="border-2 border-dashed border-gray-300 rounded-xl overflow-hidden">
                  <SignaturePad ref={sigRef} />
                </div>
                <button
                  disabled={submitting || !printedName.trim()}
                  onClick={async () => {
                    if (!sigRef.current || sigRef.current.isEmpty()) { alert('Please draw your signature'); return }
                    setSubmitting(true)
                    try {
                      const dataUrl = sigRef.current.toDataURL()
                      const r = await fetch(`/api/sign/${token}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ signatureDataUrl: dataUrl, printedName }),
                      })
                      const j = await r.json()
                      if (j.ok) setDone(true)
                      else alert(j.error || 'Error saving signature')
                    } catch (e) { alert(e.message) }
                    setSubmitting(false)
                  }}
                  className="w-full py-3 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-gray-800 disabled:opacity-40 transition-colors"
                >
                  {submitting ? 'Saving…' : `Sign Change Order`}
                </button>
              </div>
            )}

            {/* Other party status */}
            <div className="text-xs text-gray-400 space-y-1 border-t border-gray-100 pt-3">
              {(['client','builder']).map(r => {
                const s = existingSigs[r]
                return (
                  <p key={r}>{r === 'client' ? 'Client' : 'Builder'}:{' '}
                    {s ? <span className="text-green-600 font-medium">Signed {new Date(s.signedAt).toLocaleDateString()}</span>
                       : <span className="text-amber-500">Awaiting signature</span>}
                  </p>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Deck Plus contract packet ────────────────────────────────────────────
  const dp          = d?.dp || { values: {}, checks: {}, packet: [] }
  const total       = Number(d?.total) || 0
  const payments    = Array.isArray(d?.payments) ? d.payments : []
  const scopeLines  = d?.scopeLines || []
  const branding    = d?.branding || {}
  const logo        = branding?.logo || null
  const companyName = branding?.companyName || 'Deck Plus'

  const requiredFields = requiredSignFields(role, dp.packet)
  const signedCount = requiredFields.filter(f => appliedFields.has(f)).length
  const isComplete  = requiredFields.length === 0 || signedCount === requiredFields.length
  const progress    = requiredFields.length > 0 ? Math.round((signedCount / requiredFields.length) * 100) : 100

  // A signature / initials slot inside the packet. Mine: tap to apply the
  // captured signature. The other party's: show what they signed, if anything.
  const otherSig = (fieldId, r) => existingSigs?.[r]?.fields?.[fieldId] || existingSigs?.[r]?.signatureDataUrl || null
  const SigSlot = ({ fieldId, forRole, initial = false }) => {
    if (forRole === role) {
      const applied = appliedFields.has(fieldId)
      if (applied) return <img src={masterSig} alt="signature" style={initial ? { height: 22 } : undefined} />
      return (
        <button type="button" id={`field-${fieldId}`} onClick={() => applyField(fieldId)}
          className={`dp-sign-btn ${masterSig ? 'ready' : ''}`} title={initial ? 'Tap to initial' : 'Tap to sign'}>
          {initial ? (masterSig ? 'INITIAL' : 'INITIAL') : (masterSig ? '✍ TAP TO SIGN' : '+ SIGN')}
        </button>
      )
    }
    const src = otherSig(fieldId, forRole)
    return src ? <img src={src} alt="signature" style={initial ? { height: 22 } : undefined} /> : null
  }
  const renderSig     = (id, r) => <SigSlot fieldId={id} forRole={r} />
  const renderInit    = (id)    => <SigSlot fieldId={`init:${id}`} forRole="client" initial />
  const renderSigDate = (id, r) => {
    if (r === role) return appliedFields.has(id) ? <span>{today()}</span> : null
    const s = existingSigs?.[r]
    return s?.signedAt && otherSig(id, r) ? <span>{fmtShortDate(s.signedAt)}</span> : null
  }

  // ESIGN/UETA consumer disclosure gate — shown on open, BEFORE the document, as
  // its own step (as the ESIGN Act requires). The signer must read this and
  // check the consent box to continue; consent and its time are recorded.
  if (!agreedAt) {
    const esign = ESIGN_DISCLOSURE.build(companyName)
    return (
      <div className="min-h-screen bg-gray-100 flex items-start justify-center p-4 py-8">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-2xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-4">
            {logo ? <img src={logo} alt="logo" className="h-8 object-contain" /> : <img src="/contract/deckplus-logo.png" alt="Deck Plus" className="h-8 object-contain" />}
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">{ESIGN_DISCLOSURE.title}</h1>
          <p className="text-sm text-gray-600 leading-relaxed mb-5">{esign.intro}</p>
          <div className="max-h-[46vh] overflow-y-auto pr-2 border border-gray-200 rounded-xl p-4 mb-5 bg-gray-50">
            {esign.sections.map((s, i) => (
              <div key={i} className="mb-4 last:mb-0">
                <h2 className="text-sm font-bold text-gray-900 mb-1">{s.h}</h2>
                {s.p.map((para, j) => <p key={j} className="text-xs text-gray-600 leading-relaxed mb-1.5 last:mb-0">{para}</p>)}
              </div>
            ))}
          </div>
          <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
            <input type="checkbox" checked={esignConsent} onChange={e => setEsignConsent(e.target.checked)} className="mt-0.5 shrink-0 w-4 h-4" />
            <span className="text-sm text-gray-800 leading-snug font-medium">{ESIGN_DISCLOSURE.consentLabel}</span>
          </label>
          <button onClick={() => { if (esignConsent) setAgreedAt(Date.now()) }} disabled={!esignConsent}
            className="w-full bg-gray-900 text-white font-bold py-3 rounded-xl text-sm hover:bg-gray-700 disabled:opacity-40 transition-colors">
            Agree &amp; Continue to Document
          </button>
          <p className="text-[11px] text-gray-400 mt-3 text-center">Your consent and the time are recorded. Prefer paper? Contact the contractor instead of signing here.</p>
        </div>
      </div>
    )
  }

  if (!d?.dp) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md text-center bg-white rounded-2xl border border-amber-200 p-6 shadow-sm">
        <p className="text-amber-700 font-bold mb-2">This signing link is from an older contract format</p>
        <p className="text-gray-600 text-sm">Ask the office to re-send the contract for signature.</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 pb-32">
      {/* Sticky header with progress */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center gap-3 mb-2">
            <div className="flex items-center gap-3 min-w-0">
              <img src={logo || '/contract/deckplus-logo.png'} alt="logo" className="h-8 object-contain shrink-0" />
              <span className="text-xs text-gray-400 truncate">Contract #{contractNum}</span>
            </div>
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider shrink-0">{role && `Signing as ${ROLE_LABELS[role] || role}`}</span>
          </div>
          {masterSig && requiredFields.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, background: isComplete ? '#10b981' : '#3b82f6' }} />
              </div>
              <span className={`text-xs font-semibold whitespace-nowrap ${isComplete ? 'text-emerald-600' : 'text-blue-600'}`}>
                {isComplete ? 'All signed ✓' : `${signedCount} / ${requiredFields.length} signed`}
              </span>
            </div>
          )}
          {!masterSig && (
            <p className="text-xs text-amber-700 font-medium">
              Read the contract, then tap any signature or initials field to begin — or{' '}
              <button onClick={() => openCapture()} className="underline text-blue-600">set your signature now</button>
            </p>
          )}
        </div>
      </div>

      {/* The packet */}
      <div className="max-w-4xl mx-auto my-4 px-2 sm:px-4 dp-signing">
        <DeckPlusContract
          className="bg-white shadow-lg rounded-sm overflow-hidden"
          values={dp.values} checks={dp.checks} packet={dp.packet}
          scopeLines={scopeLines} projectSummary={d?.projectSummary || ''} total={total} payments={payments}
          renderSig={renderSig} renderSigDate={renderSigDate} renderInit={renderInit}
        />
      </div>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 shadow-lg z-30">
        <div className="max-w-4xl mx-auto">
          {!masterSig ? (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="Enter your full legal name" value={printedName} onChange={e => setPrintedName(e.target.value)} />
              </div>
              <button onClick={() => openCapture()} className="shrink-0 bg-gray-900 text-white font-bold px-5 py-2 rounded-xl text-sm hover:bg-gray-700 transition-colors">Create Signature</button>
            </div>
          ) : (
            <div>
              <p className="text-[11px] text-gray-600 leading-snug mb-2 border-l-2 border-gray-300 pl-2">
                {AGREEMENT_ACK}{' '}
                <a href="/legal/dpa" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Data Processing Agreement</a>
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  {!isComplete
                    ? <p className="text-xs text-amber-700 font-medium">{requiredFields.length - signedCount} field{requiredFields.length - signedCount !== 1 ? 's' : ''} remaining — scroll up and tap each blue field to sign or initial</p>
                    : <p className="text-xs text-emerald-600 font-semibold">All fields signed — ready to submit</p>}
                  <div className="flex items-center gap-2 mt-1">
                    <img src={masterSig} alt="sig" className="h-6 object-contain" />
                    <span className="text-xs text-gray-500">{printedName}</span>
                    <button onClick={() => openCapture()} className="text-xs text-blue-500 underline ml-1">change</button>
                  </div>
                </div>
                <button onClick={handleSubmit} disabled={!isComplete || submitting || !esignConsent}
                  className="shrink-0 bg-gray-900 text-white font-bold px-5 py-2.5 rounded-xl text-sm hover:bg-gray-700 disabled:opacity-40 transition-colors whitespace-nowrap">
                  {submitting ? 'Submitting…' : 'Sign & Submit'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Signature capture drawer */}
      {showCapture && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-2xl w-full max-w-2xl p-5 pb-8 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base">{ROLE_LABEL[role] ? `${ROLE_LABEL[role]} Signature` : 'Your Signature'}</h3>
              <button onClick={() => { setShowCapture(false); setPendingField(null) }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-semibold text-gray-600 mb-1">Full Legal Name</label>
              <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="Type your full name" value={printedName} onChange={e => setPrintedName(e.target.value)} />
            </div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">Draw or Type Signature</label>
            <SignaturePad ref={sigRef} onChange={setStagingSig} />
            <button onClick={confirmCapture} className="w-full mt-4 bg-gray-900 text-white font-bold py-3 rounded-xl hover:bg-gray-700 transition-colors">Set My Signature</button>
            <p className="text-xs text-gray-400 text-center mt-2">Your signature is applied to each signature field, and shrunk into each initials box, as you tap them.</p>
          </div>
        </div>
      )}
    </div>
  )
}
