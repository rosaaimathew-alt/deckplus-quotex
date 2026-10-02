import { useState } from 'react'
import { CheckCircle2, Mail, ShieldCheck } from 'lucide-react'
import { CONSENT_TEXT, deviceInfo, logStep } from '../lib/esignConsent'

// ── Final signing step — contracts and change orders ─────────────────────────
// 1. Full legal name.
// 2. Email verification: a 6-digit code is emailed and must be entered back.
// 3. The consent box (unchecked to start) with the exact consent wording.
// 4. "Adopt and Sign" — the active signing act.
// The server re-checks every one of these; this page only collects them.

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300'

async function post(api, body) {
  const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, device: deviceInfo() }) })
  let j = {}
  try { j = await res.json() } catch { /* non-JSON error page */ }
  if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`)
  return j
}

export default function EsignAdopt({ api, esign, docHash, printedName, onNameChange, ready = true, notReadyText, submitting, onSign, agreementAgreedAt }) {
  const e = esign || {}
  const [consent, setConsent]       = useState(false)
  const [consentAt, setConsentAt]   = useState(null)
  const [verified, setVerified]     = useState(!!e.verified)
  const [useOther, setUseOther]     = useState(!e.hasEmailOnFile)
  const [email, setEmail]           = useState('')
  const [sentTo, setSentTo]         = useState('')
  const [code, setCode]             = useState('')
  const [busy, setBusy]             = useState('')
  const [err, setErr]               = useState('')

  const otpShown   = !!(e.otpRequired || e.otpAvailable)
  const otpBlocked = !!e.otpRequired && !e.otpAvailable
  const name       = String(printedName || '').trim()
  const canSign    = consent && name.length >= 2 && ready && !submitting && !otpBlocked && (verified || !e.otpRequired)

  const sendCode = async () => {
    setErr(''); setBusy('send')
    try {
      const j = await post(api, { action: 'otp-send', email: useOther ? email : undefined })
      setSentTo(j.sentTo || 'your email'); setCode('')
    } catch (x) { setErr(x.message) }
    setBusy('')
  }
  const verifyCode = async () => {
    setErr(''); setBusy('verify')
    try {
      await post(api, { action: 'otp-verify', code })
      setVerified(true)
    } catch (x) { setErr(x.message) }
    setBusy('')
  }
  const toggleConsent = (on) => {
    setConsent(on)
    const at = on ? Date.now() : null
    setConsentAt(at)
    logStep(api, on ? 'consent_checked' : 'consent_unchecked', { printedName: name })
  }
  const adopt = () => {
    if (!canSign) return
    onSign({
      consent: true,
      consentText: CONSENT_TEXT,
      consentCheckedAt: consentAt,
      adopt: true,
      adoptedAt: Date.now(),
      device: deviceInfo(),
      docHash,
      agreementAgreedAt: agreementAgreedAt || null,
      printedName: name,
    })
  }

  return (
    <div className="space-y-4">
      {onNameChange && (
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Full legal name</label>
          <input className={inputCls} placeholder="Type your full legal name" value={printedName} onChange={ev => onNameChange(ev.target.value)} aria-label="Full legal name" />
        </div>
      )}

      {otpShown && (
        <div className="rounded-xl border border-gray-200 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-2"><Mail size={13} /> Verify your email</p>
          {verified ? (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700 font-medium"><CheckCircle2 size={15} /> Email verified</p>
          ) : otpBlocked ? (
            <p className="text-sm text-amber-700">Email verification isn't available right now, so this document can't be signed yet. Please contact the office.</p>
          ) : (
            <div className="space-y-2">
              {!sentTo && (useOther ? (
                <div className="flex gap-2">
                  <input type="email" className={inputCls} placeholder="you@example.com" value={email} onChange={ev => setEmail(ev.target.value)} aria-label="Email for verification code" />
                  <button type="button" onClick={sendCode} disabled={busy === 'send' || !email.trim()}
                    className="shrink-0 px-3.5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-40">{busy === 'send' ? 'Sending…' : 'Send code'}</button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={sendCode} disabled={busy === 'send'}
                    className="px-3.5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-40">{busy === 'send' ? 'Sending…' : `Email a code to ${e.emailHint}`}</button>
                  <button type="button" onClick={() => setUseOther(true)} className="text-xs text-blue-600 underline">Use a different email</button>
                </div>
              ))}
              {sentTo && (
                <>
                  <p className="text-xs text-gray-500">We sent a 6-digit code to <strong>{sentTo}</strong>. It expires in 10 minutes.</p>
                  <div className="flex gap-2">
                    <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={`${inputCls} tracking-[0.4em] font-semibold`} placeholder="••••••"
                      value={code} onChange={ev => setCode(ev.target.value.replace(/\D/g, '').slice(0, 6))} aria-label="Verification code" />
                    <button type="button" onClick={verifyCode} disabled={busy === 'verify' || code.length !== 6}
                      className="shrink-0 px-3.5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-40">{busy === 'verify' ? 'Checking…' : 'Verify'}</button>
                  </div>
                  <button type="button" onClick={() => { setSentTo(''); setCode('') }} className="text-xs text-blue-600 underline">Send a new code</button>
                </>
              )}
            </div>
          )}
          {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
        </div>
      )}

      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" checked={consent} onChange={ev => toggleConsent(ev.target.checked)} className="mt-0.5 shrink-0 w-4 h-4" aria-label="E-sign consent" />
        <span className="text-sm text-gray-800 leading-snug font-medium">{CONSENT_TEXT}</span>
      </label>

      {!ready && notReadyText && <p className="text-xs text-amber-700 font-medium">{notReadyText}</p>}

      <button type="button" onClick={adopt} disabled={!canSign}
        className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white font-bold py-3 rounded-xl text-sm hover:bg-gray-700 disabled:opacity-40 transition-colors">
        <ShieldCheck size={16} /> {submitting ? 'Signing…' : 'Adopt and Sign'}
      </button>
      <p className="text-[11px] text-gray-400 text-center leading-snug">
        Pressing Adopt and Sign applies your signature to this document. Your IP address, device, browser, verified email and the exact time are recorded with it.
      </p>
    </div>
  )
}
