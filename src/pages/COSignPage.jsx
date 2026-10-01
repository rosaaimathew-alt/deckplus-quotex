import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import SignaturePad from '../components/SignaturePad'
import { CheckCircle2, Printer } from 'lucide-react'
import { changeOrderIntro } from '../contract/deckPlusAgreement'

const fmt = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function renderBold(text) {
  const parts = String(text ?? '').split(/(\*\*[^*\n]+\*\*|__[^_\n]+__)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('__') && p.endsWith('__') && p.length > 4) return <u key={i}>{p.slice(2, -2)}</u>
    return <span key={i}>{p}</span>
  })
}

const ROLE_LABEL = {
  client:  'Client',
  builder: 'Builder',
}

export default function COSignPage() {
  const { token } = useParams()
  const sigRef = useRef(null)

  const [record, setRecord]           = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [printedName, setPrintedName] = useState('')
  const [masterSig, setMasterSig]     = useState(null)
  const [showCapture, setShowCapture] = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [done, setDone]               = useState(false)

  useEffect(() => {
    fetch(`/api/co/${token}`)
      .then(async r => {
        const text = await r.text()
        let parsed
        try { parsed = JSON.parse(text) } catch { throw new Error(`Bad response: ${text.slice(0, 200)}`) }
        if (!r.ok || parsed.error) throw new Error(parsed.error || `HTTP ${r.status}`)
        return parsed
      })
      .then(d => { setRecord(d); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [token])

  const confirmCapture = useCallback(() => {
    if (!printedName.trim()) { alert('Enter your full name first'); return }
    if (sigRef.current?.isEmpty()) { alert('Please draw or type your signature'); return }
    setMasterSig(sigRef.current.toDataURL())
    setShowCapture(false)
  }, [printedName])

  const submit = async () => {
    if (!masterSig) { alert('Please sign first'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/co/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureDataUrl: masterSig, printedName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit')
      setDone(true)
    } catch (e) {
      alert(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500 text-sm">Loading change order…</p>
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

  const { role, coData: d, signatures = {}, alreadySigned } = record
  const logo        = d?.branding?.logo || null
  const companyName = d?.branding?.companyName || 'Your Company'
  const gcName    = d?.branding?.gcName || 'General Contractor'
  const licenseNo = d?.branding?.licenseNo || ''
  const coNumber    = d?.coNumber || 'CO-1'
  const contractNum = d?.contractNum || ''
  const client      = d?.client || ''
  const address     = d?.address || ''
  const description = d?.description || ''
  const scopeLines  = d?.scopeLines || []
  const payments    = d?.payments || []
  const newTotal    = d?.newTotal || 0
  const originalTotal = d?.originalTotal || 0
  const delta       = newTotal - originalTotal

  const docStyle = { fontFamily: 'Georgia,"Times New Roman",serif', fontSize: '10.5pt', lineHeight: '1.55', color: '#1a1a1a' }
  const todayStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full text-center">
          <CheckCircle2 size={48} className="text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Change Order Signed!</h2>
          <p className="text-sm text-gray-500">Thank you, {printedName}. Your signature has been recorded.</p>
          <p className="text-xs text-gray-400 mt-4">Contract #{contractNum} · {coNumber}</p>
          <button onClick={() => window.location.reload()} className="mt-5 text-sm text-blue-600 font-medium hover:underline">View signed copy →</button>
        </div>
      </div>
    )
  }

  const existingSig = signatures?.[role]
  // When already signed, show the completed document (read-only) instead of the form.
  const viewOnly = !!alreadySigned

  return (
    <div className="min-h-screen bg-gray-100 pb-12" style={docStyle}>
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-20 shadow-sm no-print">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div>
            <p className="text-sm font-bold text-gray-900">{coNumber} — Change Order</p>
            <p className="text-xs text-gray-400">
              Contract #{contractNum} · {viewOnly
                ? <span className="text-green-600 font-semibold">✓ Signed</span>
                : <>Signing as: <strong>{ROLE_LABEL[role]}</strong></>}
            </p>
          </div>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700">
            <Printer size={13} /> {viewOnly ? 'Print / Save PDF' : 'Print'}
          </button>
        </div>
      </div>

      <div className="max-w-3xl mx-auto my-6 px-3">
        <div className="bg-white shadow-lg rounded-sm contract-doc" style={docStyle}>
          <div className="px-8 py-8">

            {/* Header */}
            <div className="flex justify-between items-start mb-1 gap-4">
              <div>
                {logo
                  ? <img src={logo} alt="logo" className="h-12 object-contain mb-1" />
                  : <div className="text-lg font-black tracking-widest" style={{ fontFamily: 'Arial,sans-serif' }}>{companyName.toUpperCase()}</div>}
                <div className="text-xl font-bold mt-1" style={{ fontFamily: 'Arial,sans-serif' }}>CHANGE ORDER</div>
              </div>
              <div className="text-right text-[10pt]" style={{ fontFamily: 'Arial,sans-serif' }}>
                <div><strong>{coNumber}</strong></div>
                <div className="text-gray-500 mt-0.5"><strong>Contract #</strong> {contractNum}</div>
                <div className="text-gray-500 mt-0.5"><strong>Date:</strong> {todayStr}</div>
              </div>
            </div>
            <div className="border-b-2 border-gray-900 mb-4" />

            {/* Client info */}
            <div className="grid grid-cols-2 gap-x-8 text-[10pt] mb-4">
              <div><strong>Client:</strong> {client}</div>
              <div><strong>Address:</strong> {address}</div>
            </div>

            {/* Addendum opening paragraph */}
            <p className="text-[10pt] mb-4 text-justify">{changeOrderIntro(contractNum)}</p>

            {/* Description */}
            {description && (
              <div className="mb-4 p-3 border border-gray-300 rounded">
                <p className="font-bold text-[10pt] mb-1">Description of Change:</p>
                <p className="text-[10pt] whitespace-pre-wrap">{description}</p>
              </div>
            )}

            {/* Price summary */}
            <div className="flex gap-8 text-[10pt] mb-4">
              <div><span className="text-gray-500">Original Total:</span> <strong>${fmt(originalTotal)}</strong></div>
              <div><span className="text-gray-500">Change Amount:</span> <strong className={delta >= 0 ? 'text-green-700' : 'text-red-600'}>{delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta))}</strong></div>
              <div><span className="text-gray-500">New Total:</span> <strong>${fmt(newTotal)}</strong></div>
            </div>

            <div className="border-b border-gray-300 mb-4" />

            {/* Updated Scope of Work */}
            {scopeLines.length > 0 && (
              <div className="mb-5">
                <p className="font-bold text-[10pt] mb-2 uppercase tracking-wide">Updated Scope of Work</p>
                {(() => {
                  const hasBulletPrefix = scopeLines.some(l => { const t=typeof l==='string'?l:(l?.text||l?.name||''); return t.trimStart().startsWith('--') })
                  return (
                    <ul className="text-[10pt] space-y-1.5">
                      {scopeLines.map((l, i) => {
                        const txt = typeof l === 'string' ? l : (l?.text || l?.name || '')
                        if (!txt.trim()) return <li key={i} className="list-none h-2" />
                        const isBullet = txt.trimStart().startsWith('--') || !hasBulletPrefix
                        const display = isBullet && txt.trimStart().startsWith('--') ? txt.trimStart().slice(2).trimStart() : txt
                        return isBullet
                          ? <li key={i} className="flex gap-2"><span>●</span><span className="whitespace-pre-wrap">{renderBold(display)}</span></li>
                          : <li key={i} className="list-none whitespace-pre-wrap leading-snug">{renderBold(display)}</li>
                      })}
                    </ul>
                  )
                })()}
              </div>
            )}

            {/* Updated Payment Schedule */}
            {payments.length > 0 && (
              <div className="mb-6">
                <p className="font-bold text-[10pt] mb-2 uppercase tracking-wide">Updated Payment Schedule</p>
                <table className="w-full text-[10pt] border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 px-3 py-2 text-left font-bold">Milestone</th>
                      <th className="border border-gray-300 px-3 py-2 text-center font-bold w-16">%</th>
                      <th className="border border-gray-300 px-3 py-2 text-right font-bold w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p, i) => (
                      <tr key={i}>
                        <td className="border border-gray-300 px-3 py-2">{p.label}</td>
                        <td className="border border-gray-300 px-3 py-2 text-center">{Math.round((p.pct || 0) * 100)}%</td>
                        <td className="border border-gray-300 px-3 py-2 text-right font-semibold">${fmt(p.amount)}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-bold">
                      <td className="border border-gray-300 px-3 py-2">New Contract Total</td>
                      <td className="border border-gray-300 px-3 py-2 text-center">100%</td>
                      <td className="border border-gray-300 px-3 py-2 text-right">${fmt(newTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* Agreement line */}
            <p className="text-[10pt] mb-3 text-justify">
              By signing below, both parties agree to the scope of work and payment schedule modifications described in this Change Order. All other terms of the original contract remain in full effect.
            </p>

            {/* Special-order materials & cancellation clause */}
            <p className="text-[10pt] mb-4 text-justify">
              <strong>Special-Order Materials &amp; Cancellation.</strong> If items in this Change Order require special-order, custom, or made-to-order materials that are non-returnable and non-refundable once purchased, PURCHASER acknowledges and agrees that if the items are later rescinded or canceled, or PURCHASER elects not to proceed with this Change Order after it has been signed, the PURCHASER remains responsible for the full cost of any special-order or non-returnable materials already purchased, along with any labor performed, up to the value of this Change Order. Any such amount becomes due upon notice of cancellation.
            </p>

            {/* Signature section */}
            {viewOnly ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-4">
                {['client', 'builder'].map(r => {
                  const sig = signatures[r]
                  return (
                    <div key={r}>
                      <p className="font-bold text-[10pt] mb-2">{ROLE_LABEL[r]}</p>
                      <div className="border-b border-gray-500 pb-6 relative min-h-[52px]">
                        {sig?.signatureDataUrl && <img src={sig.signatureDataUrl} alt="sig" className="absolute left-0 bottom-0.5 h-10 object-contain" />}
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">
                        {sig
                          ? `${sig.printedName || ''}${sig.signedAt ? ' · ' + new Date(sig.signedAt).toLocaleDateString() : ''}`
                          : 'Awaiting signature'}
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : (
            <div className="no-print">
              {masterSig ? (
                <div className="border border-green-200 bg-green-50 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-green-800">Signature captured — {ROLE_LABEL[role]}</p>
                    <button onClick={() => setMasterSig(null)} className="text-xs text-green-600 hover:underline">Change</button>
                  </div>
                  <img src={masterSig} alt="signature" className="h-12 object-contain" />
                  <p className="text-xs text-green-700 mt-1 italic">{printedName}</p>
                </div>
              ) : (
                <div className="mb-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Sign as: <span className="text-indigo-600">{ROLE_LABEL[role]}</span></p>
                  <div className="flex gap-3 mb-3">
                    <input
                      placeholder="Full name (printed)"
                      value={printedName}
                      onChange={e => setPrintedName(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    />
                    <button onClick={() => { sigRef.current?.clear(); setShowCapture(true) }}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                      Add Signature
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={submit}
                disabled={!masterSig || submitting}
                className="w-full py-3 bg-gray-900 text-white rounded-xl font-semibold text-sm hover:bg-gray-700 disabled:opacity-40 transition-colors"
              >
                {submitting ? 'Submitting…' : `Sign Change Order — ${ROLE_LABEL[role]}`}
              </button>
            </div>
            )}

            {/* Print-only signature blocks (hidden on screen; viewOnly shows them above) */}
            <div className={`${viewOnly ? 'hidden' : 'print-only'} mt-4 grid grid-cols-2 gap-8`}>
              {['client', 'builder'].map(r => {
                const sig = signatures[r]
                return (
                  <div key={r}>
                    <p className="font-bold text-[10pt] mb-2">{ROLE_LABEL[r]}</p>
                    <div className="border-b border-gray-500 pb-5 relative min-h-[48px]">
                      {sig?.signatureDataUrl && <img src={sig.signatureDataUrl} alt="sig" className="absolute left-0 bottom-0.5 h-10 object-contain" />}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">Signature / Date</p>
                  </div>
                )
              })}
            </div>

          </div>
        </div>
      </div>

      {/* Signature capture drawer */}
      {showCapture && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <h3 className="font-bold text-gray-900 mb-1">Draw Your Signature</h3>
            <p className="text-xs text-gray-400 mb-3">Sign in the box below</p>
            <SignaturePad ref={sigRef} className="border-2 border-gray-200 rounded-xl w-full h-32" />
            <div className="flex gap-2 mt-4">
              <button onClick={() => sigRef.current?.clear()} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Clear</button>
              <button onClick={() => setShowCapture(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={confirmCapture} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700">Confirm Signature</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
