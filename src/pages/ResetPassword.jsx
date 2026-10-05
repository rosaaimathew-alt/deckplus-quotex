import { useEffect, useState } from 'react'
import { supabase, changePassword, sendPasswordReset } from '../supabase'

// ── Forgot / reset password ─────────────────────────────────────────────────
// /reset-password without a recovery link: enter your email to get one.
// Opened from the emailed link: Supabase signs you in for recovery, and you
// choose a new password here.

const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function ResetPassword() {
  const [recovery, setRecovery] = useState(null)   // null = checking
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [msg, setMsg]           = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)

  useEffect(() => {
    if (!supabase) { Promise.resolve().then(() => setRecovery(false)); return }
    let live = true
    const fromLink = /type=recovery|access_token|code=/.test(window.location.hash + window.location.search)
    supabase.auth.getSession().then(({ data }) => { if (live) setRecovery(!!(fromLink && data.session)) })
    const { data: sub } = supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY' && live) setRecovery(true) })
    return () => { live = false; sub?.subscription?.unsubscribe() }
  }, [])

  const requestLink = async (e) => {
    e.preventDefault()
    setBusy(true); setError(''); setMsg('')
    try {
      await sendPasswordReset(email.trim())
      setMsg('If that email has an account, a reset link is on its way. Check your inbox.')
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  const save = async (e) => {
    e.preventDefault()
    if (password.length < 8 || password !== confirm) return
    setBusy(true); setError('')
    try {
      await changePassword(password)
      window.location.href = '/'
      return
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-xl font-bold text-gray-900 mb-6">{recovery ? 'Choose a new password' : 'Reset your password'}</h1>
        {recovery === null ? (
          <p className="text-center text-sm text-gray-500">Loading…</p>
        ) : recovery ? (
          <form onSubmit={save} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="rp-pw">New password</label>
              <input id="rp-pw" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" className={inputCls} placeholder="At least 8 characters" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="rp-pw2">Confirm new password</label>
              <input id="rp-pw2" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" className={inputCls} />
              {confirm && password !== confirm && <p className="text-xs text-red-600 mt-1">Passwords don't match.</p>}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy || password.length < 8 || password !== confirm}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {busy ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        ) : (
          <form onSubmit={requestLink} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
            <p className="text-sm text-gray-600">Enter the email you sign in with and we'll send you a link to set a new password.</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="rp-email">Email</label>
              <input id="rp-email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" className={inputCls} placeholder="you@example.com" />
            </div>
            {msg && <p className="text-sm text-emerald-700">{msg}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy || !email.trim()}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
        <p className="text-center text-sm text-gray-500 mt-4"><a href="/login" className="text-blue-600 font-medium hover:underline">Back to sign in</a></p>
      </div>
    </div>
  )
}
