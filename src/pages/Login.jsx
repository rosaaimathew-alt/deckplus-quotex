import { useState } from 'react'
import { signIn, supabaseReady } from '../supabase'

// The login page renders before sign-in, so it can't read the org's branding
// row (RLS). It shows the company logo from a static file instead, and falls
// back to the company name in text until that file is added.
//   public/brand/logo.png  → shown when present
//   VITE_COMPANY_NAME      → text fallback (defaults to QuoteX)
const COMPANY_NAME = import.meta.env.VITE_COMPANY_NAME || 'QuoteX'
const LOGO_URL     = '/brand/logo.png'

export default function Login() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [logoOk, setLogoOk]     = useState(true)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email.trim(), password)
      window.location.href = '/'
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {logoOk
            ? <img src={LOGO_URL} alt={COMPANY_NAME} onError={() => setLogoOk(false)}
                className="mx-auto h-16 max-w-[260px] object-contain" />
            : <h1 className="text-2xl font-bold text-gray-900 tracking-wide">{COMPANY_NAME}</h1>}
          <p className="text-sm text-gray-500 mt-2">Sign in to continue</p>
        </div>
        {!supabaseReady && (
          <p className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Supabase is not configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in the Vercel project.
          </p>
        )}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus autoComplete="username"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={loading || !supabaseReady}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-4">
          <a href="/legal/terms" className="hover:text-gray-600 underline">Terms</a>
          {' · '}
          <a href="/legal/privacy" className="hover:text-gray-600 underline">Privacy</a>
          {' · '}
          <a href="/legal" className="hover:text-gray-600 underline">Policies</a>
        </p>
      </div>
    </div>
  )
}
