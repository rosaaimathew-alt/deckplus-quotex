import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { inviteInfo, signUp, claimInvite, supabaseReady } from '../supabase'

// ── Create your account (invite-only) ───────────────────────────────────────
// An admin or the office sends /signup?code=… from Settings › Team. The person
// opening it picks their own name and password; the invite decides the email
// and the role, so nobody can join the team without one.

const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || 'QuoteX'
const LOGO_URL     = '/brand/logo.png'
const ROLE_LABEL   = { rep: 'Sales', pm: 'Project Manager', office: 'Office', admin: 'Admin' }
const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function friendly(msg) {
  const m = String(msg || '')
  if (/already registered|already exists/i.test(m)) return 'This email already has an account. Sign in instead, or use “Forgot password?” on the sign-in page.'
  if (/signups not allowed|signup.*disabled/i.test(m)) return 'New accounts are switched off for this workspace. Ask your admin to turn on email sign-ups.'
  if (/error sending confirmation/i.test(m)) return 'The account was refused because the confirmation email could not be sent. Ask your admin to turn off email confirmation or set up email sending.'
  if (/password/i.test(m) && /(weak|short|least)/i.test(m)) return m
  return m || 'Something went wrong. Please try again.'
}

export default function Signup() {
  const [params] = useSearchParams()
  const [code, setCode]         = useState(params.get('code') || '')
  const [invite, setInvite]     = useState(null)    // { valid, email, role, display_name, org } | null
  const [checking, setChecking] = useState(!!params.get('code'))
  const [name, setName]         = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)
  const [done, setDone]         = useState('')      // 'confirm' when the email needs confirming
  const [logoOk, setLogoOk]     = useState(true)

  const lookUp = async (c) => {
    const clean = String(c || '').trim()
    if (!clean) return
    setChecking(true); setError('')
    try {
      const info = await inviteInfo(clean)
      setInvite(info)
      if (info?.valid && info.display_name) setName(n => n || info.display_name)
    } catch (e) {
      setInvite({ valid: false, reason: friendly(e.message) })
    }
    setChecking(false)
  }

  // Check the code from the link once, on open.
  useEffect(() => {
    const c = params.get('code')
    if (!c) return
    let live = true
    inviteInfo(c.trim())
      .then(info => { if (!live) return; setInvite(info); if (info?.valid && info.display_name) setName(n => n || info.display_name) })
      .catch(e => { if (live) setInvite({ valid: false, reason: friendly(e.message) }) })
      .finally(() => { if (live) setChecking(false) })
    return () => { live = false }
  }, [params])

  const pwOk = password.length >= 8
  const canSubmit = invite?.valid && name.trim().length >= 2 && pwOk && password === confirm && !busy

  const submit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true); setError('')
    try {
      const res = await signUp({ email: invite.email, password, displayName: name.trim() })
      if (res.session) {
        const joined = await claimInvite(code.trim(), name.trim())
        if (!joined?.joined) throw new Error('Your login was created, but the invite could not be applied. Ask your admin for a new invite.')
        window.location.href = '/'
        return
      }
      setDone('confirm')
    } catch (err) {
      setError(friendly(err.message))
    }
    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {logoOk
            ? <img src={LOGO_URL} alt={COMPANY_NAME} onError={() => setLogoOk(false)} className="mx-auto h-16 max-w-[260px] object-contain" />
            : <h1 className="text-2xl font-bold text-gray-900 tracking-wide">{COMPANY_NAME}</h1>}
          <p className="text-sm text-gray-500 mt-2">Create your account</p>
        </div>

        {!supabaseReady && (
          <p className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Supabase is not configured for this site.</p>
        )}

        {done === 'confirm' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 text-center space-y-3">
            <p className="text-base font-semibold text-gray-900">Check your email</p>
            <p className="text-sm text-gray-600">We sent a confirmation link to <strong>{invite.email}</strong>. Open it, then sign in with the password you just chose.</p>
            <a href="/login" className="inline-block mt-2 text-sm font-semibold text-blue-600 hover:underline">Go to sign in</a>
          </div>
        ) : !invite?.valid ? (
          <form onSubmit={e => { e.preventDefault(); lookUp(code) }} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
            <p className="text-sm text-gray-600">Accounts are invite-only. Open the invite link your admin sent you, or paste the invite code here.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="invite-code">Invite code</label>
              <input id="invite-code" value={code} onChange={e => setCode(e.target.value)} className={`${inputCls} font-mono`} placeholder="e.g. 3f9c…" autoFocus />
            </div>
            {invite && !invite.valid && <p className="text-sm text-red-600">{invite.reason}</p>}
            <button type="submit" disabled={checking || !code.trim()}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {checking ? 'Checking…' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
            <p className="text-sm text-gray-600">
              You're joining <strong>{invite.org || COMPANY_NAME}</strong> as <strong>{ROLE_LABEL[invite.role] || invite.role}</strong>.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="su-email">Email</label>
              <input id="su-email" value={invite.email} readOnly autoComplete="username" className={`${inputCls} bg-gray-50 text-gray-600`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="su-name">Your name</label>
              <input id="su-name" value={name} onChange={e => setName(e.target.value)} required autoComplete="name" className={inputCls} placeholder="First and last name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="su-pw">Choose a password</label>
              <input id="su-pw" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" className={inputCls} placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="su-pw2">Confirm password</label>
              <input id="su-pw2" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" className={inputCls} />
              {confirm && password !== confirm && <p className="text-xs text-red-600 mt-1">Passwords don't match.</p>}
              {password && !pwOk && <p className="text-xs text-amber-700 mt-1">Use at least 8 characters.</p>}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={!canSubmit}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {busy ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-gray-500 mt-4">Already have an account? <a href="/login" className="text-blue-600 font-medium hover:underline">Sign in</a></p>
      </div>
    </div>
  )
}
