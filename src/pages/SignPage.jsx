import { useState, useRef, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import SignaturePad from '../components/SignaturePad'
import { X, CheckCircle2, ChevronDown } from 'lucide-react'
import { ESIGN_DISCLOSURE, AGREEMENT_ACK } from '../legalContent'

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
  gc:      'General Contractor',
}
const PROJECT_TYPES = ['Open Deck','Screen Porches','Eze-Breeze Porches','Open Porches','Porch Conversions','Sunrooms','Hardscapes']
const METHODS = ['Electronic Wire Transfer / ACH', 'Cash', 'Check', 'Zelle']
const GENERAL_NOTES = [
  { text: 'Builder to provide all labor, material sufficient to complete the accepted scope', bold: false },
  { text: 'Builder to secure permits and provide owner with any required HOA submission docs', bold: false },
  { text: 'Builder to dispose of new construction debris per this scope', bold: false },
  { text: 'One year craftsmanship warranty on new work; five years on new structure', bold: true },
  { text: "Manufacturer's lifetime warranty on pressure treated wood against rot, termite infestation", bold: true },
  { text: 'Builder job sign to be posted in yard for duration of project', bold: false },
  { text: 'Excavation soil will remain on-site to be removed', bold: false },
  { text: 'Cracks in concrete are normal wear and tear and are not covered by the Builder warranty', bold: false },
  { text: 'Builder is not responsible for any landscaping that needs to be removed to complete work', bold: false },
  { text: "Builder is not responsible for hanging swing / daybed's, TVs mounts and or any furniture setup. We'll gladly provide reference a trusted handyman", bold: false },
  { text: 'Addendums: Any change resulting in additional charges must be paid at the time of the change.', bold: false },
  { text: 'If the inspector requires engineering it will result in an additional charge.', bold: false },
  { text: 'Homeowner responsible for obtaining and paying for any required Plot survey requested by county, city, or permitting departments.', bold: false },
  { text: 'Homeowner responsible to pay any costs associated with a sub panel if it is required to complete the electrical work', bold: false },
  { text: 'Homeowner responsible to check Impervious area of the property', bold: false },
  { text: 'Homeowner responsible to call 811 to mark the utilities', bold: false, highlight: true },
]
const ordinal = n => { const s=['th','st','nd','rd'],v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]) }
const CB = ({ checked }) => <span className="inline-block w-3.5 h-3.5 border border-gray-700 mr-1 align-middle text-center text-[10px] leading-[14px]">{checked?'X':' '}</span>
const today = () => new Date().toLocaleDateString('en-US',{month:'numeric',day:'numeric',year:'numeric'})
const todayLong = () => new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})
const now = new Date()

// Required field IDs per role
function getRequiredFields(role, isSmallContract, includesElectrical, scopeLines) {
  if (role === 'client') {
    return [
      'c-page1',
      'c-clauses',
      'c-scope-clarity',
      'c-ptwood',
      'c-unforeseen',
      'c-processing',
      ...(!isSmallContract ? ['c-ack'] : []),
      'c-scope-final',
      ...(includesElectrical ? ['c-elec-1','c-elec-2'] : []),
      ...scopeLines.map((_,i) => `c-init-${i}`),
    ]
  }
  if (role === 'builder') {
    return [
      'b-page1',
      ...(!isSmallContract ? ['b-ack'] : []),
      'b-scope-final',
      ...(includesElectrical ? ['b-elec'] : []),
    ]
  }
  if (role === 'gc') {
    return isSmallContract ? [] : ['g-page1','g-ack']
  }
  return []
}

export default function SignPage() {
  const { token } = useParams()
  const sigRef = useRef(null)
  const [record, setRecord]       = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [printedName, setPrintedName] = useState('')
  const [masterSig, setMasterSig] = useState(null)   // base64 from capture drawer
  const [stagingSig, setStagingSig] = useState(null) // temp while drawer is open
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

  // ── Change Order document ────────────────────────────────────────────────
  if (d?.type === 'change-order') {
    const clientSig  = existingSigs?.client
    const builderSig = existingSigs?.builder
    const myRole     = role === 'builder' ? 'builder' : 'client'
    const mySig      = myRole === 'client' ? clientSig : builderSig
    const coLines    = d.lines || []
    const needsMyField = !mySig

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

  let total = 0, payments = []
  if (Number.isFinite(Number(d?.total)) && Number(d?.total) > 0) {
    total = Number(d.total)
  } else {
    total = (d?.lines || []).reduce((s,l) => s + Number(l?.qty??1)*Number(l?.price??l?.unitPrice??0), 0)
  }
  payments = Array.isArray(d?.payments) ? d.payments : []

  const client       = d?.client || ''
  const email        = d?.email  || ''
  const phone        = d?.phone  || ''
  const address      = d?.address || ''
  const salesperson  = d?.salesperson || 'Mathew Rosa'
  const projectTypes = d?.projectTypes || []
  const city         = d?.city || ''
  const state        = d?.state || 'North Carolina'
  const lotNumber    = d?.lotNumber || ''
  const permitNumber = d?.permitNumber || ''
  const hoa          = d?.hoa
  const permitReq    = d?.permitReq
  const specialInstructions = d?.specialInstructions || ''
  const directions   = d?.directions || ''
  const lumberDrop   = d?.lumberDrop
  const power        = d?.power
  const gateCode     = d?.gateCode || ''
  const paymentMethods = d?.paymentMethods || []
  const otherTerms   = d?.otherTerms || ''
  const projectSummary = d?.projectSummary || ''
  const ceilingFanNote = d?.ceilingFanNote || 'Homeowner to provide 1 ceiling fan with downrod'
  const scopeBullets = d?.scopeBullets || []
  const scopeLines   = d?.scopeLines || []
  const includesElectrical = !!d?.includesElectrical
  const recessedSize = d?.recessedSize || '6'
  const homePhone    = d?.homePhone || ''
  const cellPhone    = d?.cellPhone || ''
  const elecItems    = d?.elecItems || []
  const branding     = d?.branding || {}
  const logo         = branding?.logo || null
  const companyName  = branding?.companyName || 'Your Company'
  const gcName    = branding?.gcName || 'General Contractor'
  const licenseNo = branding?.licenseNo || ''
  const isSmallContract = d?.isSmallContract ?? (total < 40000)

  const visibleScopeLines = scopeLines.filter(l => (l.name || '').trim() || l.price > 0)
  const requiredFields = getRequiredFields(role, isSmallContract, includesElectrical, visibleScopeLines)
  const signedCount = requiredFields.filter(f => appliedFields.has(f)).length
  const isComplete  = requiredFields.length === 0 || signedCount === requiredFields.length
  const progress    = requiredFields.length > 0 ? Math.round((signedCount / requiredFields.length) * 100) : 100

  const docStyle = { fontFamily: 'Georgia,"Times New Roman",serif', fontSize: '10.5pt', lineHeight: '1.55', color: '#1a1a1a' }

  // ── Signature field components ──
  // Field: full signature line
  const Field = ({ fieldId, label, date = true, forRole }) => {
    const isMyField = forRole === role
    const td = today()
    if (isMyField) {
      const applied = appliedFields.has(fieldId)
      return (
        <div className="mt-4" id={`field-${fieldId}`}>
          <div className="flex gap-6 items-end">
            <div className={`flex-1 relative pb-6 border-b-2 min-h-[52px] transition-colors ${applied ? 'border-emerald-500' : masterSig ? 'border-dashed border-blue-400' : 'border-gray-400'}`}>
              {applied ? (
                <>
                  <img src={masterSig} alt="sig" className="absolute left-0 bottom-0.5 h-10 object-contain pointer-events-none" />
                  {printedName && <span className="absolute left-0 -bottom-5 text-[9px] italic text-gray-500">{printedName}</span>}
                </>
              ) : (
                <button onClick={() => applyField(fieldId)}
                  className={`absolute inset-0 flex items-center justify-center text-xs font-bold rounded transition-colors ${masterSig ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
                  {masterSig ? '✍ TAP TO SIGN' : '+ TAP TO ADD SIGNATURE'}
                </button>
              )}
            </div>
            {date && (
              <div className={`w-28 relative pb-6 border-b-2 ${applied ? 'border-emerald-500' : 'border-gray-400'}`}>
                {applied && <span className="absolute left-0 bottom-1 text-[11px] font-medium">{td}</span>}
              </div>
            )}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">{label}{date?' / Date':''}</p>
        </div>
      )
    }
    // Other party's field — show their existing sig if already signed
    const partySig = existingSigs?.[forRole]
    return (
      <div className="mt-4">
        <div className="flex gap-6 items-end">
          <div className="flex-1 border-b border-gray-400 pb-6 relative min-h-[52px]">
            {partySig?.fields?.[fieldId] && <img src={partySig.fields[fieldId]} alt="sig" className="absolute left-0 bottom-0.5 h-10 object-contain pointer-events-none" />}
            {partySig?.signatureDataUrl && !partySig?.fields?.[fieldId] && <img src={partySig.signatureDataUrl} alt="sig" className="absolute left-0 bottom-0.5 h-10 object-contain pointer-events-none" />}
          </div>
          {date && (
            <div className="w-28 border-b border-gray-400 pb-6 relative">
              {(partySig?.fields?.[fieldId] || partySig?.signatureDataUrl) && <span className="absolute left-0 bottom-1 text-[11px]">{partySig?.signedAt ? new Date(partySig.signedAt).toLocaleDateString() : ''}</span>}
            </div>
          )}
        </div>
        <p className="text-[10px] text-gray-500 mt-1">{label}{date?' / Date':''}</p>
      </div>
    )
  }

  // InlineField: shorter inline sig used in disclosure sections
  const InlineField = ({ fieldId, label = 'Signature', forRole, withDate = false }) => {
    const isMyField = forRole === role
    const td = today()
    if (isMyField) {
      const applied = appliedFields.has(fieldId)
      const content = (
        <div className={`border-b-2 relative pb-5 min-h-[44px] transition-colors ${applied ? 'border-emerald-500' : masterSig ? 'border-dashed border-blue-400' : 'border-gray-400'}`}
          style={{ width: withDate ? undefined : '14rem' }}>
          {applied ? (
            <img src={masterSig} alt="sig" className="absolute left-0 bottom-0.5 h-10 object-contain pointer-events-none" />
          ) : (
            <button onClick={() => applyField(fieldId)}
              className={`absolute inset-0 flex items-center justify-center text-xs font-bold rounded transition-colors ${masterSig ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>
              {masterSig ? '✍ TAP TO SIGN' : '+ ADD SIGNATURE'}
            </button>
          )}
        </div>
      )
      if (withDate) {
        return (
          <div className="flex gap-8 mt-4" id={`field-${fieldId}`}>
            <div><div className="border-b-2 w-48 relative pb-5 min-h-[44px] transition-colors" style={{borderColor: applied ? '#10b981' : masterSig ? '#60a5fa' : '#9ca3af', borderStyle: applied ? 'solid' : masterSig ? 'dashed' : 'solid'}}>
              {applied ? <img src={masterSig} alt="sig" className="absolute left-0 bottom-0.5 h-10 object-contain pointer-events-none" /> : <button onClick={() => applyField(fieldId)} className={`absolute inset-0 flex items-center justify-center text-xs font-bold rounded ${masterSig ? 'text-blue-600 hover:bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}>{masterSig ? '✍ TAP TO SIGN' : '+ ADD SIGNATURE'}</button>}
            </div><p className="text-[10px] text-gray-500 mt-1">{label}</p></div>
            <div><div className={`border-b-2 w-32 pb-5 relative ${applied ? 'border-emerald-500' : 'border-gray-400'}`}>
              {applied && <span className="absolute left-0 bottom-1 text-[11px] font-medium">{td}</span>}
            </div><p className="text-[10px] text-gray-500 mt-1">Date</p></div>
          </div>
        )
      }
      return (
        <div id={`field-${fieldId}`} className="mt-5">
          {content}
          <p className="text-[10px] text-gray-500 mt-1">{label}</p>
        </div>
      )
    }
    // Other party
    const partySig = existingSigs?.[forRole]
    const hasSig = partySig?.fields?.[fieldId] || partySig?.signatureDataUrl
    const sigSrc = partySig?.fields?.[fieldId] || partySig?.signatureDataUrl
    if (withDate) {
      return (
        <div className="flex gap-8 mt-4">
          <div><div className="border-b border-gray-400 w-48 relative pb-5 min-h-[44px]">{hasSig && <img src={sigSrc} alt="sig" className="absolute left-0 bottom-0.5 h-10 object-contain" />}</div><p className="text-[10px] text-gray-500 mt-1">{label}</p></div>
          <div><div className="border-b border-gray-400 w-32 pb-5 relative">{hasSig && partySig?.signedAt && <span className="absolute left-0 bottom-1 text-[11px]">{new Date(partySig.signedAt).toLocaleDateString()}</span>}</div><p className="text-[10px] text-gray-500 mt-1">Date</p></div>
        </div>
      )
    }
    return (
      <div className="mt-5">
        <div className="border-b border-gray-400 w-56 relative pb-5 min-h-[44px]">
          {hasSig && <img src={sigSrc} alt="sig" className="absolute left-0 bottom-0.5 h-10 object-contain" />}
        </div>
        <p className="text-[10px] text-gray-500 mt-1">{label}</p>
      </div>
    )
  }

  // Initial field for pricing table cells
  const Initial = ({ fieldId }) => {
    if (role !== 'client') {
      const clientSig = existingSigs?.client
      const hasSig = clientSig?.fields?.[fieldId] || clientSig?.signatureDataUrl
      return <div className="flex items-center justify-center h-8">{hasSig ? <CheckCircle2 size={14} className="text-emerald-500" /> : null}</div>
    }
    const applied = appliedFields.has(fieldId)
    return (
      <button onClick={() => applyField(fieldId)}
        className={`w-full h-8 flex items-center justify-center rounded text-[10px] font-bold transition-colors ${applied ? 'bg-emerald-50 text-emerald-600' : masterSig ? 'bg-blue-50 text-blue-600 border border-dashed border-blue-300' : 'bg-gray-50 text-gray-400 border border-dashed border-gray-300'}`}>
        {applied ? <><CheckCircle2 size={11} className="mr-1" />INITIALED</> : masterSig ? 'TAP TO INITIAL' : 'INITIAL'}
      </button>
    )
  }

  // ESIGN/UETA consumer disclosure gate — shown on open, BEFORE the document, as its
  // own step (as the ESIGN Act requires). The signer must read this and check the
  // consent box to continue; consent and its time are recorded with the signature.
  if (!agreedAt) {
    const esign = ESIGN_DISCLOSURE.build(companyName)
    return (
      <div className="min-h-screen bg-gray-100 flex items-start justify-center p-4 py-8">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-2xl p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-4">
            {logo ? <img src={logo} alt="logo" className="h-8 object-contain" />
              : <span className="font-black tracking-widest text-sm">{companyName.toUpperCase()}</span>}
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-1">{ESIGN_DISCLOSURE.title}</h1>
          <p className="text-sm text-gray-600 leading-relaxed mb-5">{esign.intro}</p>

          <div className="max-h-[46vh] overflow-y-auto pr-2 border border-gray-200 rounded-xl p-4 mb-5 bg-gray-50">
            {esign.sections.map((s, i) => (
              <div key={i} className="mb-4 last:mb-0">
                <h2 className="text-sm font-bold text-gray-900 mb-1">{s.h}</h2>
                {s.p.map((para, j) => (
                  <p key={j} className="text-xs text-gray-600 leading-relaxed mb-1.5 last:mb-0">{para}</p>
                ))}
              </div>
            ))}
          </div>

          <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
            <input type="checkbox" checked={esignConsent} onChange={e => setEsignConsent(e.target.checked)} className="mt-0.5 shrink-0 w-4 h-4" />
            <span className="text-sm text-gray-800 leading-snug font-medium">{ESIGN_DISCLOSURE.consentLabel}</span>
          </label>

          <button
            onClick={() => { if (esignConsent) setAgreedAt(Date.now()) }}
            disabled={!esignConsent}
            className="w-full bg-gray-900 text-white font-bold py-3 rounded-xl text-sm hover:bg-gray-700 disabled:opacity-40 transition-colors">
            Agree & Continue to Document
          </button>
          <p className="text-[11px] text-gray-400 mt-3 text-center">
            Your consent and the time are recorded. Prefer paper? Contact the contractor instead of signing here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 pb-32">

      {/* Sticky header with progress */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-20 shadow-sm">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center gap-3 mb-2">
            <div className="flex items-center gap-3 min-w-0">
              {logo ? <img src={logo} alt="logo" className="h-8 object-contain shrink-0" />
                : <span className="font-black tracking-widest text-sm">{companyName.toUpperCase()}</span>}
              <span className="text-xs text-gray-400 truncate">Contract #{contractNum}</span>
            </div>
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider shrink-0">
              {role && `Signing as ${role}`}
            </span>
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
              Scroll down, then tap any signature field to begin — or{' '}
              <button onClick={() => openCapture()} className="underline text-blue-600">set your signature now</button>
            </p>
          )}
        </div>
      </div>

      {/* Contract document */}
      <div className="max-w-4xl mx-auto my-4 px-2 sm:px-4">
        <div className="bg-white shadow-lg rounded-sm overflow-hidden" style={docStyle}>

          {/* PAGE 1 */}
          <div className="px-6 sm:px-12 py-6">
            <div className="flex justify-between items-start mb-1 gap-4">
              <div className="min-w-0">
                {logo ? <img src={logo} alt="logo" className="h-14 object-contain mb-1" />
                  : <div className="text-xl font-black tracking-widest leading-tight" style={{fontFamily:'Arial,sans-serif'}}>{companyName}</div>}
                <div className="text-2xl font-bold mt-1" style={{fontFamily:'Arial,sans-serif'}}>CONTRACT</div>
              </div>
              <div className="text-right shrink-0" style={{fontFamily:'Arial,sans-serif',fontSize:'10pt'}}>
                <div><strong>Contract #</strong> {contractNum}</div>
                <div className="text-gray-500 mt-1"><strong>Date:</strong> {todayLong()}</div>
              </div>
            </div>
            <div className="border-b-2 border-gray-900 mb-5" />

            <p className="mb-4 text-justify">
              THIS CONTRACT made effective on the <strong>{ordinal(now.getDate())}</strong> day of <strong>{now.toLocaleDateString('en-US',{month:'long'})}, {now.getFullYear()}</strong> In City of <strong>{city||'___________'}</strong> and the State of <strong>{state}</strong> by and Between <strong>{client}</strong> (PURCHASER), At <strong>{address}</strong> and <strong>{companyName}</strong> (BUILDER), for work to be performed at <strong>{address}</strong> (the PREMISES) in accordance with the written terms and specifications of this CONTRACT (the WORK). THE WORK shall include the following:
            </p>

            <p className="mb-1 flex flex-wrap gap-x-4 gap-y-1">
              {PROJECT_TYPES.map(t => <span key={t}><CB checked={projectTypes.includes(t)} />{t}</span>)}
            </p>
            <p className="mb-1">( &nbsp; ) Other _______________________________________________________________________________</p>
            {projectSummary && (
              <p className="mt-2 mb-1 text-[10pt] text-justify whitespace-pre-wrap">{projectSummary}</p>
            )}
            <div className="border-b border-gray-300 mb-4 mt-2" />

            <p className="mb-3 text-justify"><strong>1.</strong> BUILDER shall furnish the services and material for performance of the WORK on the PREMISES described on the SCOPE OF WORK each attached to and made part of this CONTRACT, for and in consideration of the payment to BUILDER by the PURCHASER of <strong>${fmt(total)}</strong> for the WORK. Together with any amounts set forth in any addenda hereto (TOTAL CONTRACT SUM).</p>
            <p className="mb-1"><strong>2.</strong> THE TOTAL CONTRACT SUM shall be paid to BUILDER as follows:</p>
            {payments[0] && <p className="mb-1 font-bold">{payments[0].label} ${fmt(payments[0].amount)}</p>}
            {payments.length > 1 && (
              <><p className="mb-2 font-bold">Progress Payments:</p>
              <table className="w-full text-sm mb-3"><tbody>
                {payments.slice(1).map((p,i) => <tr key={i}><td className="pr-4 pb-1.5 font-semibold w-36">${fmt(p.amount)}</td><td className="pb-1.5 border-b border-gray-400">{p.label}</td></tr>)}
              </tbody></table></>
            )}
            <p className="mb-3">Down payment by {METHODS.map(m => <span key={m} className="mr-3 inline-block"><CB checked={paymentMethods.includes(m)} />{m}</span>)}</p>
            <p className="mb-4"><strong>3. OTHER TERMS:</strong> {otherTerms || <span className="inline-block w-64 border-b border-gray-400">&nbsp;</span>}</p>

            {[
              ['4.','THE Down Payment may be used to purchase material necessary for performance of the WORK. BUILDER shall be entitled to final payment upon final inspection of the WORK. The WORK is substantially complete when all items described in this CONTRACT have been constructed, installed, and project has passed a final inspection. Final Completion shall not include adjustment, repair, replacement or cleaning of any item constructed or installed after final inspection has passed and 1(one) Punch list has been completed. PURCHASER shall be entitled to one punch list prior to final payment. Requests for adjustment, repair, replacement or cleaning of any constructed or installed item shall not be cause for delay of final payment, but rather shall be considered warranty items. After five business days from Final completion, the unpaid balance of the TOTAL CONTRACT SUM may be subject to interest charges as allowed by applicable state law. PURCHASER acknowledges and agrees that this CONTRACT shall serve as the invoice for the TOTAL CONTRACT SUM and that no additional invoice will be provided to PURCHASER for any part thereof.'],
              ['5.','Modification to the WORK or CONTRACT will be made only when a written addendum describing such modification has been signed by both PURCHASER and BUILDER. There may be an additional charge for any changes.'],
            ].map(([n,t]) => <p key={n} className="mb-3 text-justify text-[10pt]"><strong>{n}</strong> {t}</p>)}

            <p className="mb-3 text-justify text-[10pt]"><strong>6. a.</strong> The WORK will be warranted by BUILDER . Existing structures to which the WORK may be affixed or interconnected are not part of the WORK and will not be covered under the Warranty. This Warrant is issued to and only applicable to the PURCHASER after payment in full of the TOTAL CONTRACT SUM .</p>
            {!isSmallContract && <p className="mb-3 text-justify text-[10pt]"><strong>B.</strong> As General contractors we have <strong>{gcName}</strong> that operate as part of the {companyName} team. {gcName} serves as the licensed General Contractor{licenseNo ? ` (License No. ${licenseNo})` : ''} and is responsible for maintaining the applicable licenses and overall legal and regulatory compliance required for the project. {gcName} also acts as a general supervisor of the project, performing occasional site visits during the progress of the work for purposes of overall oversight and supervision. However, {gcName} is not involved in the daily management of the job site, operational coordination of crews, or direct execution of the services.</p>}
            <p className="mb-4 text-[10pt]"><strong>7.</strong> This CONTRACT shall not be effective and binding upon BUILDER until countersigned by BUILDER{!isSmallContract && ' and GENERAL CONTRACTOR'}.</p>
            <p className="text-center font-bold mb-3">ADDITIONAL TERMS ON NEXT PAGE</p>

            {isSmallContract ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-2">
                <div><p className="font-bold underline mb-2">PURCHASER</p><Field fieldId="c-page1" forRole="client" label="Signature" date={false} /><Field fieldId="c-page1-name" forRole="client" label="Print Name" date={false} /></div>
                <div><p className="font-bold underline mb-2">BUILDER: {companyName.toUpperCase()}</p><Field fieldId="b-page1" forRole="builder" label="Signature" date={false} /><Field fieldId="b-page1-name" forRole="builder" label="Print Name" date={false} /></div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-2">
                <div><p className="font-bold underline mb-2">PURCHASER</p><Field fieldId="c-page1" forRole="client" label="Signature" date={false} /><Field fieldId="c-page1-name" forRole="client" label="Print Name" date={false} /></div>
                <div>
                  <p className="font-bold underline mb-2">BUILDER: {companyName.toUpperCase()}</p><Field fieldId="b-page1" forRole="builder" label="Signature" date={false} /><Field fieldId="b-page1-name" forRole="builder" label="Print Name" date={false} />
                  <p className="font-bold mt-3">GENERAL CONTRACTOR: {gcName.toUpperCase()}</p><Field fieldId="g-page1" forRole="gc" label="Signature" date={false} /><Field fieldId="g-page1-name" forRole="gc" label="Print Name" date={false} />
                </div>
              </div>
            )}

            <p className="mt-3 text-[10pt] underline">115 Unionville Indian Trail Road, Indian Trail, NC 28079 Unit B15</p>
            <p className="text-[10px] text-gray-500 mb-4">(Builder Address)</p>

            {[
              ['8.','BUILDER shall obtain applicable permits and inspections. Unless agreed otherwise in writing signed by the parties, or required by local code to be provided by BUILDER, PURCHASER shall be responsible for any additional approvals and processes (such as homeowner associations, special tax district, wetlands, endangered species, variances, or historic preservation). PURCHASER shall provide BUILDER with an accurate plat of PURCHASER\'s property.'],
              ['9.','PURCHASER shall provide sufficient electricity for the continuous operation of BUILDER\'s equipment. There may be an additional charge if BUILDER is required to provide electricity.'],
              ['10. a.','PURCHASER agrees that should BUILDER encounter unforeseen site conditions on the PREMISES (including for example unsound roof shingles, buried storage tanks, solid rock, high water table, unsound house framing, or unsound or uncompacted soil conditions all the footing depth described on the Builder Specification Sheet, etc.) which would substantially interfere with BUILDER\'s completion of the WORK, BUILDER may require that PURCHASER and BUILDER execute an addendum to this CONTRACT describing the additional work that must be performed and setting forth the price at which BUILDER will perform such additional work. BUILDER shall not be obligated to continue the WORK if an addendum is not executed, if, in BUILDER\'s sole judgment, continuing the WORK as specified herein without any modifications would cause such WORK to not meet applicable local building code requirements or not meet BUILDER\'s construction standards.'],
              ['b.','PURCHASER agrees that BUILDER shall not be responsible for unforeseen site conditions on the PREMISES discovered or occurring after completion of the WORK.'],
              ['c.','PURCHASER shall mark the location of underground drain lines, sprinkler systems, septic tanks, septic fields or other obstructions.'],
              ['11.',"BUILDER is not responsible or liable for delays in the commencement or completion of the WORK that are result of conditions beyond BUILDER's control (including for example weather, strikes, supplier's inability to obtain materials, or a third party's inability to comply with the terms of this CONTRACT, etc.). If PURCHASER fails to make a scheduled progress payment, BUILDER may elect to postpone its performance of the WORK and schedule continuance of the WORK at its discretion after receipt of all due and payable progress payments. Delays caused by such events do not constitute abandonment and are not included in calculating time frames for payment or performance. PURCHASER has the right to terminate CONTRACT upon BUILDER default. Default means unreasonable delay, poor/defective work, consistent failure to perform according to schedule, failure to pay subcontractors, use of inferior material, failure to communicate."],
              ['12.','If described as part of the WORK, this CONTRACT includes the cost of installing utility hardware or fixtures (including for example telephone and cable jacks, lights, ceiling fans, and electrical outlets). Relocation of utility services (such as wires, piping, cables, and equipment) by the utility company(ies) may be necessary, and PURCHASER shall be responsible for such costs. PURCHASER agrees to allow BUILDER to schedule and coordinate such relocation of utility services as needed.'],
              ['13.','Unless specifically set forth in the description of the WORK, BUILDER shall not move or dispose of soil excavated while performing the WORK. Additionally, PURCHASER acknowledges that there may be damage to or disfiguration of the turf in and about the area of the WORK and the location of the storage of materials due to foot traffic, machinery, storage of materials, or otherwise.'],
              ['14. a.',"PURCHASER acknowledges and agrees that all drawings, plans, sketches, renderings, models and designs remain the sole property of BUILDER, and BUILDER reserves the right to use such materials in any manner it shall deem appropriate. BUILDER retains copyright in all drawings, plans, sketches, renderings, models and designs created pursuant to the CONTRACT. All documents created for this purpose of constructing or installing the WORK remain the property of the BUILDER and are not a part of this CONTRACT. BUILDER further reserves the exclusive right to use photographs, drawings, and representations of the completed project in its advertising and marketing efforts."],
              ['b.','PURCHASER acknowledges that the services to be provided by BUILDER hereunder are limited to construction services and shall not include any architectural or engineering services.'],
              ['C.','PURCHASER acknowledges that technical field changes shall not constitute a modification to the WORK, and may be made by BUILDER to ensure that the WORK is performed in compliance with applicable codes regulations, or BUILDER construction standards.'],
              ['15.',"PURCHASER agrees that materials required for the completion of the WORK be delivered and stored at the PREMISES at a location reasonably determined by BUILDER to be efficient for the purpose of construction of the WORK. PURCHASER further agrees that any material not required for completion of the WORK shall, notwithstanding delivery to or storage at the PREMISES, be and remain the sole property of BUILDER, and PURCHASER shall not have any right or interest therein."],
              ['16.',"PURCHASER recognizes and acknowledges that during the performance of the WORK, certain hazardous conditions could exist in the area of the WORK. BUILDER agrees to take all reasonable steps necessary to make such conditions known and obvious to PURCHASER and to prevent PURCHASER and others from entering hazardous areas. PURCHASER shall indemnify and hold BUILDER harmless from any liability, damage, claim or expense arising out of the PURCHASER 's or a third party's disregard of a clear, open and obvious danger in the WORK area."],
              ['17.',"BUILDER is independently owned. PURCHASER acknowledges and agrees that this CONTRACT is made solely with BUILDER."],
              ['18.','If any provision, sentence, phrase or word of this CONTRACT or the application thereof to any person or circumstance shall be held invalid, the remainder of the CONTRACT, or the application of such provision, sentence, phrase or word to persons or circumstances other than those as to which it is held invalid shall not be affected thereby.'],
              ['19.','This CONTRACT is made and shall be construed under the laws of the State set forth in the first paragraph hereof. Except as set forth below, if any controversy or claim arises out of or relates to this CONTRACT, or the breach thereof, and if said controversy or claim cannot be settled through direct discussions, the parties agree to first endeavor to settle the controversy or claim in an amicable manner by mediation administered by the American Arbitration Association under Its Construction Industry Mediation Rules, before resorting to arbitration. Thereafter, any unresolved controversy or claim arising out of or relating to this CONTRACT, or breach thereof, shall be settled by arbitration administered by the American Arbitration Association in accordance with its, Construction Industry Arbitration Rules, and judgment upon the award rendered by the arbitrator(s) may be entered in any court having jurisdiction thereof The parties may agree to mediation and arbitration by the Better Business Bureau (if applicable) in lieu of the foregoing. It is further agreed that any efforts by BUILDER to collect the TOTAL CONTRACT SUM or any part thereof will not be subject to the mediation and arbitration provisions set forth above. PURCHASER will pay any collection expense, court costs, and reasonable attorney\'s fees which may be incurred in such collection efforts. PURCHASER hereby waives any and all rights PURCHASER may have to a Jury many suit hereunder.'],
              ['20.','Should PURCHASER fail to fulfill its obligations under this CONTRACT in addition to any other remedy at law or in equity that BUILDER may have or otherwise provided herein, BUILDER may retain as liquidated damages and not as a penalty, all consideration paid by PURCHASER to BUILDER, including, but not limited to the Down Payment referenced above.'],
              ['21.',"BUILDER'S failure to exercise a right or remedy, or BUILDER's acceptance of a partial or delinquent payment, will not operate as a waiver of any of BUILDER's rights, or PURCHASER's obligations, under this CONTRACT and will not constitute a waiver of BUILDER's right to declare an immediate or a subsequent default of this CONTRACT."],
              ['22.','This CONTRACT contains the entire understanding and agreement between the parties with respect to the WORK and supersedes all prior or contemporaneous written and oral agreements and understandings with respect to the subject matter hereof. NO ORAL PROMISES OR AGREEMENTS ARE A PART OF THIS CONTRACT.'],
            ].map(([n,t]) => <p key={n} className="mb-3 text-justify text-[10pt]"><strong>{n}</strong> {t}</p>)}

            <Field fieldId="c-clauses" forRole="client"  label="Client Signature" />
            <Field fieldId="b-clauses" forRole="builder" label="Builder Signature" />
            {!isSmallContract && <Field fieldId="g-clauses" forRole="gc" label="GC Signature" />}
          </div>

          {/* Scope & Final Payment Clarification */}
          <div className="px-6 sm:px-12 py-6 border-t border-gray-200">
            <h2 className="text-center font-bold text-base mb-5">SCOPE OF WORK &amp; FINAL PAYMENT CLARIFICATION</h2>
            <p className="text-[10pt] mb-3">{companyName}'s aim for customer service as our #1 priority. In order to provide you with the best possible customer experience, we are fully committed to providing you with <strong>everything</strong> written in the scope of work, specifications, and drawing.</p>
            <ul className="text-[10pt] space-y-2 mb-5 ml-2">
              {[
                'In the event that the project proposed by Builder is not approved by the Homeowners Association (HOA) or local zoning authorities, the deposit paid by the customer shall be returned in full, minus any fees incurred by Builder related to the processing or submission of the project for approval.',
                'In the rare case there is a dispute with what we are obligated to provide, both parties agree to revert to only what is written in scope of work, specifications, and/or drawing.',
                'Any work requested on behalf of the customer that is not covered in the scope of work, specifications, and/or drawing may be added through an addendum at a signed agreed specification form upon additional cost paid at the time of addendum.',
                'Per your contract, your final payment is due upon Final Inspection and Punchlist completion.',
                "We appreciate your continuous feedback throughout the construction process. If you happen to see something you don't like, please let us know immediately. We are able to address your concerns in a timelier manner if we are made aware of them while the carpenter is still working onsite.",
                'Near the end of the project we will allow for a single close out walk ("final walk through") to ensure that all expectations set forth by your scope of work, specifications, and/or drawing have been met. This final walk through creates an opportunity for a single punch list of outstanding concerns to be addressed before your project is considered complete. All partial payments prior to this punch list must be paid in full before punch list work will be performed. Any adjustments, repairs, or replacements beyond this one list will be treated as a warranty claim and addressed upon receipt of final payment, per the terms of your warranty.',
                'Duration of construction projects is often unpredictable due to weather, inspections, change orders, material availability, etc. There is NO discount for job duration. A reasonable time frame will be established for each job, and every effort will be made to adhere to that time frame.',
              ].map((t,i) => <li key={i} className="flex gap-2"><span>●</span><span>{t}</span></li>)}
            </ul>
            <p className="font-bold text-center mb-2 text-[10pt]">I HAVE READ AND UNDERSTAND THE ABOVE SCOPE OF WORK AND FINAL PAYMENT CLARIFICATION.</p>
            <InlineField fieldId="c-scope-clarity" forRole="client" label="Signature" />
          </div>

          {/* Pressure-Treated Wood */}
          <div className="px-6 sm:px-12 py-6 border-t border-gray-200">
            <h2 className="text-center font-bold text-base mb-4">PRESSURE-TREATED WOOD INFORMATION</h2>
            <ul className="text-[10pt] space-y-2 ml-1">
              {[
                'Pressure-Treated pine is one of the most durable products for decks, porches and pergola. It is warranted against rot and termite infestation.',
                'Projects with pressure-treated wood must be maintained with stain or paint to ensure your project is warranted and lasts as long as possible.',
                'Lumber manufacturers provide a warranty against rot and insect infestation of their product. This warranty ONLY covers approved replacement material, labor is NOT included.',
                'All pressure-treat wood (including #1 grade) will have knots as it is a natural product and is part of the beauty of real wood.',
                'Even when wood filler is used, the lumber may continue to expand and contract, requiring additional maintenance.',
                'The wood is cut to provide tight joints, but as pressure-treated wood continues to expand and contract, the joints may separate (for example, at the corners where the rail caps are mitered).',
                'The lumber mill will ink stamp the wood as required by law. These stamps will fade over time. We do not recommend spot sanding these stamps, as it will show up differently when stained.',
                'Pressure-treated wood is outdoor lumber. It is not as stable and consistent as wood used for interior furniture or trim and will have natural imperfections.',
                'Surface cracks or splits (known as "checking") will develop on pressure-treated wood; this is not cause for alarm. Checking indicates that a pattern has been established to allow each piece of lumber to swell and shrink as nature intended. Large checking may develop on 4x4" and 6x6" post as these are cut from the center of the Southern Yellow Pine Tree, where more moisture is present in the heartwood at the time of milling. These larger cracks develop due to a difference in the rate of movement between the sapwood on the outside of each piece of heartwood. Checking does not affect the structural integrity of posts or decking and does not represent a warrantable concern.',
                'Should the checking extend through the entire diameter of the wood during the applicable warranty period, it will be addressed by Builder.',
                'Checking does not negatively affect the structural integrity of the timber, but instead releases the tension built up internally. The checks will open and close as the outer layers of the timber pick up and shed moisture. It is for this reason that the checks should NOT be filled in with epoxy or something similar.',
                'Minor cupping of decking boards can occur. This occurs largely due to the evaporation of any moisture left in the board after treatment, e.g. the sun will dry the top of the board while the bottom of the board remains wet. This interaction results in cupping of decking boards and is normal responses as wood weathers. For decades, lumber companies have advised that we disregard the older method of installing decking with rings turned down ( "frown") and instead install the best-looking side up. Sometimes the best side of the board will have the lumber stamp, sometimes it will not. It is impossible to predict which way a board will cup, regardless of the direction of the rings.',
                'Pressure-treated wood comes from a Southern Yellow Pine Tree where sap/resin is prevalent. It is not uncommon for resin to seep from decking boards, especially during the warmer, sunny months. Sap will typically crystalize and show up as white patches, or can sometimes present as dark, sticky bubbles. The best method to clean sap is to scrape it off with a putty knife and wipe the surface down with turpentine or Goo-be-gone. We use the best pressure-treated lumber available- which is dried after treatment - to minimize this problem; however, sap is an uncontrollable and unpredictable characteristic and is not a warrantable item. If it becomes a nuisance, you may request to have problem board(s) replaced at your cost.',
              ].map((t,i) => <li key={i} className="flex gap-2"><span>●</span><span>{t}</span></li>)}
            </ul>
            <p className="font-bold text-center mt-3 mb-3 text-[10pt]">I HAVE READ AND UNDERSTAND THE ABOVE CHARACTERISTICS OF PRESSURE TREATED WOOD.</p>
            <InlineField fieldId="c-ptwood" forRole="client" label="Signature" withDate />
          </div>

          {/* Unforeseen Site Conditions */}
          <div className="px-6 sm:px-12 py-6 border-t border-gray-200">
            <h2 className="text-center font-bold text-base mb-4">UNFORESEEN SITE CONDITIONS POLICY</h2>
            <p className="text-[10pt] mb-3">As described in Paragraph 12(a) of the Contract, the Builder Shall not be responsible for any additional work required due to unforeseen site conditions, which include but are not limited to the following:</p>
            <ul className="text-[10pt] space-y-1.5 ml-2 mb-4">
              {[
                'Soil that will not pass building inspector requirements','Concealed plumbing, electrical lines, gas lines and mechanical lines',
                'Engineer required by building inspector (and subsequent delay waiting for the engineer)','Unforeseen load bearing walls','Rotten wood','Insect infested wood','Mold',
                'Irrigation lines and sprinkler heads','Tree roots',
                'Subsequent interior damage or exterior brick/siding damage due to construction vibrations or demolition',
                'New cracks may develop as materials are dropped in your driveway. This is an inherent risk on behalf of the homeowner and Builder is not responsible for the repair of your driveway.',
                'Should we need to cut drywall for an inspection to take place or for the specific placement of an electrical box, the drywall repair and subsequent paint touchup will be an additional change to the contract.',
                'Reconnection of existing cables, wires, internet, security systems etc., due to construction demolition or new door frame.',
                'Any concrete removal is assumed the concrete is 4" thick or less. If through the course of demolition it is discovered the concrete is thicker than 4", there will be an additional charge to account for the additional labor and haul fees.',
                'Permit delays',
              ].map((t,i) => <li key={i} className="flex gap-2"><span>●</span><span>{t}</span></li>)}
            </ul>
            <p className="text-[10pt] mb-3">If any unforeseen items are discovered during the course of your work we will immediately bring them to your attention with a recommended course of action. The labor required to correct, adjust, or work around these items will result in additional charges and work will only proceed when authorized by you.</p>
            <p className="font-bold text-[10pt] mb-6">I HAVE READ THE ABOVE UNFORESEEN SITE CONDITIONS POLICY AND AGREE TO ITS TERMS AND CONDITIONS.</p>
            <InlineField fieldId="c-unforeseen" forRole="client" label="Signature" />
          </div>

          {/* Processing Form */}
          <div className="px-6 sm:px-12 py-6 border-t border-gray-200">
            <div className="text-xl font-bold mb-1" style={{fontFamily:'Arial,sans-serif'}}>PROCESSING FORM</div>
            <div className="border-b border-gray-400 mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1 text-[10pt] mb-4">
              <div><strong>Date sold:</strong> {today()}</div>
              <div><strong>Salesperson:</strong> {salesperson}</div>
              <div><strong>Job Name:</strong> {client}</div>
              <div><strong>Contract #:</strong> {contractNum}</div>
              <div className="sm:col-span-2"><strong>Address:</strong> {address}</div>
              <div><strong>Lot #:</strong> {lotNumber||'___________'}</div>
              <div><strong>Telephone:</strong> {phone}</div>
              <div><strong>Permit #:</strong> {permitNumber||'___________'}</div>
              <div className="sm:col-span-2"><strong>Email:</strong> {email}</div>
              <div><strong>HOA:</strong> {hoa==='yes'?'YES':hoa==='no'?'NO':'YES / NO'}</div>
              <div><strong>Permit Required:</strong> {permitReq==='yes'?'YES':permitReq==='no'?'NO':'YES / NO'}</div>
            </div>
            {specialInstructions && <div className="text-[10pt] mb-3"><strong>Special Instructions:</strong><div className="border-b border-gray-400 mt-1 pb-2">{specialInstructions}</div></div>}
            {directions && <div className="text-[10pt] mb-3"><strong>Directions to Job site:</strong><div className="border-b border-gray-400 mt-1 pb-2">{directions}</div></div>}
            <div className="border-b border-gray-200 mb-4" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-[10pt] mb-4">
              <div>
                <p className="font-semibold mb-1">Lumber drop ON or OFF driveway?</p>
                <p><CB checked={lumberDrop==='on'} /> On &nbsp;&nbsp; <CB checked={lumberDrop==='off'} /> Off</p>
                <p className="font-semibold mt-3 mb-1">Power?</p>
                <p><CB checked={power==='yes'} /> Yes &nbsp;&nbsp; <CB checked={power==='no'} /> No</p>
                <p className="font-semibold mt-1">Mark location with 'P'</p>
                {gateCode && <p className="mt-3"><strong>Gate Code:</strong> {gateCode}</p>}
              </div>
              <div>
                <p className="font-bold text-[10pt] mb-1">Mark lumber drop location with an X</p>
                <div className="border border-gray-400 rounded p-2 flex items-center justify-center" style={{height:'160px'}}>
                  <svg viewBox="0 0 200 160" width="180" height="140" xmlns="http://www.w3.org/2000/svg">
                    <polygon points="100,10 180,70 20,70" fill="#dbeafe" stroke="#374151" strokeWidth="2"/>
                    <rect x="40" y="70" width="120" height="80" fill="#dbeafe" stroke="#374151" strokeWidth="2"/>
                  </svg>
                </div>
                <p className="text-[10pt] mt-1 font-bold">Please show drop off location with a drawing or a X</p>
              </div>
            </div>
            <div className="border-b border-gray-200 mb-3" />
            <InlineField fieldId="c-processing" forRole="client" label="Client Signature" withDate />
          </div>

          {/* Client Acknowledgment (>$40K) */}
          {!isSmallContract && (
            <div className="px-6 sm:px-12 py-6 border-t border-gray-200">
              <h2 className="text-center font-bold text-base mb-5">Client Acknowledgment and Agreement</h2>
              <div className="text-[10pt] space-y-4">
                <p>At <strong>{companyName}</strong>, we are committed to transparency, contractual clarity, and professional communication with our clients. This document is intended to formalize the understanding between the parties regarding the operational structure and distribution of responsibilities related to the contracted project. {companyName} and <strong>{gcName}</strong> operate collaboratively as part of the same project team. {gcName} serves as the licensed General Contractor{licenseNo ? ` (License No. ${licenseNo})` : ''} and is responsible for maintaining the applicable licenses and overall legal and regulatory compliance required for the project.</p>
                <p>{companyName} is solely responsible for the execution and management of the work, including, without limitation, project supervision, scheduling and timeline management, coordination of crews and subcontractors, and daily job site operations. The Client acknowledges and agrees that all communications, requests, clarifications, or questions related to project execution, timelines, scheduling, and operational responsibilities shall be directed exclusively to the official contacts provided to the Client upon receipt of the fully executed contract.</p>
                <p>{gcName} also acts as a general supervisor of the project, performing occasional site visits during the progress of the work for purposes of overall oversight and supervision. However, {gcName} is not involved in the daily management of the job site, operational coordination of crews, or direct execution of the services.</p>
                <p>This acknowledgment is supplementary in nature and forms part of the project's contractual documentation, without replacing or modifying the terms and conditions of the primary agreement previously executed between the parties.</p>
                <p>By signing below, the Client confirms that they have read, understood, and fully agree with the information and distribution of responsibilities described in this document.</p>
              </div>
              <p className="text-[10pt] mt-4"><strong>Project Address:</strong> {address}</p>
              <Field fieldId="c-ack" forRole="client"  label="Client Signature" />
              <Field fieldId="b-ack" forRole="builder" label="Builder Signature" />
              <Field fieldId="g-ack" forRole="gc"      label="General Contractor Signature" date={false} />
            </div>
          )}

          {/* Scope of Work */}
          <div className="px-6 sm:px-12 py-6 border-t border-gray-200">
            <div className="flex justify-between items-center mb-1">
              {logo ? <img src={logo} alt="logo" className="h-10 object-contain" />
                : <div className="text-base font-black tracking-widest" style={{fontFamily:'Arial,sans-serif'}}>{companyName.toUpperCase()}</div>}
              <div className="text-base font-bold" style={{fontFamily:'Arial,sans-serif'}}>SCOPE OF WORK</div>
            </div>
            <div className="border-b border-gray-400 mb-4" />
            <div className="text-[10pt] mb-4 space-y-0.5">
              <p><strong>DATE:</strong> {todayLong()}</p>
              <p><strong>CONTRACT #:</strong> {contractNum}</p>
              <p><strong>CUSTOMER NAME:</strong> {client}</p>
              <p><strong>ADDRESS:</strong> {address}</p>
              <p><strong>EMAIL:</strong> {email}</p>
              <p><strong>PHONE:</strong> {phone}</p>
            </div>
            {projectSummary && <div className="mb-4"><p className="font-bold text-[10pt] mb-1">PROJECT SUMMARY:</p><p className="font-semibold text-[10pt] whitespace-pre-wrap">{projectSummary}</p></div>}
            {scopeBullets.length > 0 && (() => {
              const hasBulletPrefix = scopeBullets.some(b => { const t=typeof b==='string'?b:(b?.text||b?.name||''); return t.trimStart().startsWith('--') })
              return (
                <ul className="text-[10pt] space-y-1.5 mb-5">
                  {scopeBullets.map((b,i) => {
                    const txt = typeof b==='string'?b:(b?.text||b?.name||'')
                    if (!txt.trim()) return <li key={i} className="list-none h-2" />
                    const isBullet = txt.trimStart().startsWith('--') || !hasBulletPrefix
                    const display = isBullet && txt.trimStart().startsWith('--') ? txt.trimStart().slice(2).trimStart() : txt
                    return isBullet
                      ? <li key={i} className="flex gap-2"><span className="shrink-0">●</span><span className="whitespace-pre-wrap leading-snug">{renderBold(display)}</span></li>
                      : <li key={i} className="list-none whitespace-pre-wrap leading-snug">{renderBold(display)}</li>
                  })}
                </ul>
              )
            })()}
            <p className="font-bold text-[10pt] mb-3">GENERAL NOTES AND WARRANTIES TO THE ACCEPTED SCOPE OF WORK</p>
            <ul className="text-[10pt] space-y-2 mb-5">
              {GENERAL_NOTES.map((n,i) => (
                <li key={i} className={`flex gap-2 ${n.highlight?'bg-yellow-50 -mx-1 px-1 rounded':''}`}>
                  <span>●</span><span className={n.bold?'font-bold':''}>{n.text}</span>
                </li>
              ))}
              <li className="flex gap-2"><span>●</span><span>{ceilingFanNote}</span></li>
            </ul>

            {scopeLines.length > 0 && (
              <table className="w-full text-[10pt] border-collapse mb-5">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-2 py-2 text-left font-bold"></th>
                    <th className="border border-gray-300 px-2 py-2 text-left font-bold"></th>
                    <th className="border border-gray-300 px-2 py-2 text-center font-bold text-[9px] uppercase tracking-wide">OWNER INITIALS</th>
                  </tr>
                </thead>
                <tbody>
                  {scopeLines.filter(l => (l.name || '').trim() || l.price > 0).map((line,i) => (
                    <tr key={i}>
                      <td className="border border-gray-300 px-2 py-2 font-bold">{(line.name||'').toUpperCase()}</td>
                      <td className="border border-gray-300 px-2 py-2 font-semibold whitespace-nowrap">${fmt(line.price)}</td>
                      <td className="border border-gray-300 px-2 py-1.5 w-24"><Initial fieldId={`c-init-${i}`} /></td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50"><td className="border border-gray-300 px-2 py-2 font-bold">INVESTMENT TOTAL</td><td className="border border-gray-300 px-2 py-2 font-bold underline whitespace-nowrap">${fmt(total)}</td><td className="border border-gray-300 px-2 py-2"></td></tr>
                  {['ADDENDUM #1:','ADDENDUM #2:'].map(label => <tr key={label}><td className="border border-gray-300 px-2 py-2 font-bold">{label}</td><td className="border border-gray-300 px-2 py-2"></td><td className="border border-gray-300 px-2 py-2"></td></tr>)}
                  <tr className="bg-gray-50"><td className="border border-gray-300 px-2 py-2 font-bold">TOTAL AFTER ADDENDUMS</td><td className="border border-gray-300 px-2 py-2"></td><td className="border border-gray-300 px-2 py-2"></td></tr>
                </tbody>
              </table>
            )}

            {payments.length > 0 && (
              <>
                <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full min-w-[480px] text-[10pt] border-collapse mb-3">
                  <thead><tr className="bg-blue-50">{['PAYMENT SCHEDULE','EOL','ADDENDUMS','TOTALS','PYM'].map(h => <th key={h} className="border border-gray-300 px-2 py-2 text-left font-bold">{h}</th>)}</tr></thead>
                  <tbody>
                    {payments.map((p,i) => <tr key={i}><td className="border border-gray-300 px-2 py-2">{p.label}</td><td className="border border-gray-300 px-2 py-2 text-center">{Math.round((p.pct||0)*100)}%</td><td className="border border-gray-300 px-2 py-2"></td><td className="border border-gray-300 px-2 py-2 font-semibold underline whitespace-nowrap">${fmt(p.amount)}</td><td className="border border-gray-300 px-2 py-2"></td></tr>)}
                    <tr className="bg-gray-50 font-bold"><td className="border border-gray-300 px-2 py-2">TOTALS</td><td className="border border-gray-300 px-2 py-2 text-center">100%</td><td className="border border-gray-300 px-2 py-2"></td><td className="border border-gray-300 px-2 py-2 underline whitespace-nowrap">${fmt(total)}</td><td className="border border-gray-300 px-2 py-2"></td></tr>
                  </tbody>
                </table>
                </div>
                <p className="text-[10px] text-gray-600 text-justify mb-6">** Initial schedule deposit paid as 20% deposit at sign. Builder will not drop material or labor on the project until the scheduled deposit is paid in full. Builder has the right to hold construction progress if scheduled payments are delayed.</p>
                <Field fieldId="c-scope-final" forRole="client"  label="Client signature" />
                <Field fieldId="b-scope-final" forRole="builder" label="Builder signature" />
              </>
            )}
          </div>

          {/* Electrical */}
          {includesElectrical && (
            <div className="px-6 sm:px-12 py-6 border-t border-gray-200">
              <div className="flex justify-between items-center mb-1">
                {logo ? <img src={logo} alt="logo" className="h-10 object-contain" />
                  : <div className="text-base font-black tracking-widest" style={{fontFamily:'Arial,sans-serif'}}>{companyName.toUpperCase()}</div>}
                <div className="text-base font-bold" style={{fontFamily:'Arial,sans-serif'}}>ELECTRICAL SPECIFICATION</div>
              </div>
              <div className="border-b border-gray-400 mb-4" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 text-[10pt] mb-4">
                <div><strong>CUSTOMER NAME:</strong> {client}</div>
                <div><strong>CONTRACT #:</strong> {contractNum}</div>
                <div className="sm:col-span-2"><strong>PHONE:</strong> {homePhone||phone}{cellPhone?` | ${cellPhone}`:''}</div>
              </div>
              <p className="text-[10pt] font-bold mb-2">THE FOLLOWING ELECTRICAL ITEMS ARE INCLUDED IN YOUR ABOVE REFERENCE CONTRACT:</p>
              <table className="w-full text-[10pt] border-collapse">
                <thead><tr><th className="border border-gray-400 px-2 py-2 text-left font-bold">ELECTRICAL ITEM</th><th className="border border-gray-400 px-2 py-2 text-center font-bold w-16">QTY</th></tr></thead>
                <tbody>
                  {elecItems.filter(i => i.qty).map(item => (
                    <tr key={item.id}><td className="border border-gray-400 px-2 py-2">{item.isRecessed?<>{item.label} <span className="text-[9px]">({recessedSize==='6'?'X':' '}) 6" &nbsp; ({recessedSize==='4'?'X':' '}) 4"</span></>:item.label}</td><td className="border border-gray-400 px-2 py-2 text-center">{item.qty}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[10pt] mt-4 mb-4">If you would like any additional electrical performance, you can add it at the time we are building your project through an addendum to your contract. The Builder can process this for you.</p>
              <ul className="text-[10pt] space-y-2 mb-6">
                {[
                  {t:'Mounting and installation of your TV and/or speakers is not included.',r:false},
                  {t:'Cable TV connections in some cases may need to be connected through your cable provider.',r:false},
                  {t:'The electrical wiring provided may require exposed conduit piping. We will minimize this when possible. If you have any question, please do not hesitate to discuss them with the builder or you may call at (704) 776-2210',r:false},
                  {t:'Due Breaker capacity plug-in heaters cannot be used. Please discuss if an additional heater circuit is desired.',r:false},
                  {t:'The Outlets installed are a common household outlet, typically designed to handle 15 or 20 amps of current at 120 volts, yielding a maximum capacity of 1800 or 2400 watts, respectively. This capacity is suitable for most everyday appliances and devices such as lamps, chargers, computers, and TVs. NOT PLUG-IN HEATERS.',r:true},
                  {t:'Builder is not responsible for the cost of reconnecting any cables, security system, alarms, etc in case it was disconnected during the construction process. The homeowner is responsible to inform the builder the existence and location of possible wires prior to starting the work.',r:false},
                  {t:'Due to recent code changes and grossly varying inspector interpretations, some are considering the EzeBreeze system as the same as a traditional window and a year-round usable living space, which falls under the 6/12 outlet spacing code.',r:false},
                  {t:'Homeowners are responsible for costs of an extra Sub panel if required to perform the work.',r:true},
                ].map((d,i) => <li key={i} className={`flex gap-2 ${d.r?'text-red-600':''}`}><span className="shrink-0">●</span><span>{d.t}</span></li>)}
              </ul>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-5">
                <div>
                  <Field fieldId="c-elec-1" forRole="client" label="Customer(s) Signature" />
                  <Field fieldId="c-elec-2" forRole="client" label="Customer(s) Signature" />
                </div>
                <div><Field fieldId="b-elec" forRole="builder" label="Builder Signature" /></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3 shadow-lg z-30">
        <div className="max-w-4xl mx-auto">
          {!masterSig ? (
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 mb-2"
                  placeholder="Enter your full legal name"
                  value={printedName}
                  onChange={e => setPrintedName(e.target.value)}
                />
              </div>
              <button onClick={() => openCapture()}
                className="shrink-0 bg-gray-900 text-white font-bold px-5 py-2 rounded-xl text-sm hover:bg-gray-700 transition-colors">
                Create Signature
              </button>
            </div>
          ) : (
            <div>
              {/* Binding-agreement reaffirmation. ESIGN/UETA consent was captured at
                  the disclosure gate on open (esignConsent); this restates the effect
                  of signing directly above the Submit button. */}
              <p className="text-[11px] text-gray-600 leading-snug mb-2 border-l-2 border-gray-300 pl-2">
                {AGREEMENT_ACK}{' '}
                <a href="/legal/dpa" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Data Processing Agreement</a>
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  {!isComplete ? (
                    <p className="text-xs text-amber-700 font-medium">
                      {requiredFields.length - signedCount} field{requiredFields.length - signedCount !== 1 ? 's' : ''} remaining — scroll up and tap each blue field to sign
                    </p>
                  ) : (
                    <p className="text-xs text-emerald-600 font-semibold">All fields signed — ready to submit</p>
                  )}
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
              <h3 className="font-bold text-base">{ROLE_LABEL[role] || 'Your Signature'}</h3>
              <button onClick={() => { setShowCapture(false); setPendingField(null) }} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="mb-3">
              <label className="block text-sm font-semibold text-gray-600 mb-1">Full Legal Name</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Type your full name"
                value={printedName}
                onChange={e => setPrintedName(e.target.value)}
              />
            </div>
            <label className="block text-sm font-semibold text-gray-600 mb-1">Draw or Type Signature</label>
            <SignaturePad ref={sigRef} onChange={setStagingSig} />
            <button onClick={confirmCapture}
              className="w-full mt-4 bg-gray-900 text-white font-bold py-3 rounded-xl hover:bg-gray-700 transition-colors">
              Set My Signature
            </button>
            <p className="text-xs text-gray-400 text-center mt-2">Your signature will be applied to each field as you tap it</p>
          </div>
        </div>
      )}
    </div>
  )
}
