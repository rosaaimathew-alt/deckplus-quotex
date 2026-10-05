import { useState } from 'react'
import { ESIGN_DISCLOSURE } from '../legalContent'

// ESIGN/UETA consumer disclosure gate — shown on open, BEFORE the document, as
// its own step (as the ESIGN Act requires). The signer must read this and
// check the consent box to continue; consent and its time are recorded.
// Used by both the contract and the change-order signing pages.
export default function EsignDisclosureGate({ companyName, logo, onAgree }) {
  const [esignConsent, setEsignConsent] = useState(false)
  const esign = ESIGN_DISCLOSURE.build(companyName)
  return (
    <div className="qx-ink min-h-screen bg-gray-100 flex items-start justify-center p-4 py-8">
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
        <button onClick={() => { if (esignConsent) onAgree(Date.now()) }} disabled={!esignConsent}
          className="w-full bg-gray-900 text-white font-bold py-3 rounded-xl text-sm hover:bg-gray-700 disabled:opacity-40 transition-colors">
          Agree &amp; Continue to Document
        </button>
        <p className="text-[11px] text-gray-400 mt-3 text-center">Your consent and the time are recorded. Prefer paper? Contact the contractor instead of signing here.</p>
      </div>
    </div>
  )
}
