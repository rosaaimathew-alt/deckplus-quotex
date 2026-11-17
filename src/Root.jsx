// ── The front door ──────────────────────────────────────────────────────────
// Routes, the sign-in gate, loading the organization's data, and the choice of
// which app this person gets. Each app is its own download, fetched only when
// it is the one being opened:
//   • the full office app (src/App.jsx)       — sales, office, managers
//   • Field mode (src/field/FieldApp.jsx)     — PMs and the paint manager on a phone
//   • the sub app (src/sub/SubApp.jsx)        — subcontractors
//   • the customer pages (signing, a proposal link, a change order)
// A sub on a phone used to download the whole office app before seeing a task.
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Component, Suspense, lazy, useEffect, useState } from 'react'
import AuthGuard, { logout } from './components/AuthGuard'
import { useStore, bootstrapOrg } from './store'
import { DEMO, DEMO_BASENAME } from './demo'
import { useFieldHome, canUseField, readViewPref } from './field/fieldMode'

// When a new version goes live, the files of the version a person still has
// open are gone. If a part they tap next can't be fetched, load the page fresh
// (the new version) instead of showing an error; once, so a real outage can't
// make it loop.
const RELOAD_KEY = 'qx_reloaded_at'
const fresh = (load) => () => load().catch((err) => {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
    if (Date.now() - last > 60_000) {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
      window.location.reload()
      return new Promise(() => {})   // the page is leaving
    }
  } catch { /* no storage: fall through to the error screen */ }
  throw err
})

const SHELLS = { full: fresh(() => import('./App')), field: fresh(() => import('./field/FieldApp')), sub: fresh(() => import('./sub/SubApp')) }
const AppShell = lazy(SHELLS.full)
const FieldApp = lazy(SHELLS.field)
const SubApp = lazy(SHELLS.sub)

// Which app this phone or computer opened last time. Its download starts right
// now, alongside sign-in and the data, instead of waiting for both to finish.
// (The customer pages have their own small downloads and skip this.)
const SHELL_KEY = 'qx_shell'
const rememberShell = (kind) => { try { localStorage.setItem(SHELL_KEY, kind) } catch { /* private mode: just not remembered */ } }
try {
  const publicPage = /^\/(sign|p|co|view|legal|welcome|login|signup|reset-password)(\/|$)/.test(window.location.pathname)
  const early = { full: () => import('./App'), field: () => import('./field/FieldApp'), sub: () => import('./sub/SubApp') }[localStorage.getItem(SHELL_KEY)]
  if (!publicPage && early) early().catch(() => { /* fetched again when it is needed */ })
} catch { /* nothing remembered */ }
const Login = lazy(fresh(() => import('./pages/Login')))
const Signup = lazy(fresh(() => import('./pages/Signup')))
const ResetPassword = lazy(fresh(() => import('./pages/ResetPassword')))
const Landing = lazy(fresh(() => import('./pages/Landing')))
const SignPage = lazy(fresh(() => import('./pages/SignPage')))
const COSignPage = lazy(fresh(() => import('./pages/COSignPage')))
const ContractViewFull = lazy(fresh(() => import('./pages/ContractViewFull')))
const PublicProposal = lazy(fresh(() => import('./pages/PublicProposal')))
const Legal = lazy(fresh(() => import('./pages/Legal')))

// Shown for the moment a part of the app is still arriving.
function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <p className="text-sm text-gray-500">Loading…</p>
    </div>
  )
}

// Loads the signed-in user's org rows into the store (once) before the shell
// renders, so every page starts from real data. Demo builds skip it.
function BootGate({ children }) {
  const orgLoaded = useStore(s => s.orgLoaded)
  const [bootError, setBootError] = useState('')
  useEffect(() => {
    if (DEMO) return
    bootstrapOrg().catch(e => setBootError(e?.message || 'Could not load your organization.'))
  }, [])
  if (DEMO || orgLoaded) return children
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="text-center max-w-sm">
        {bootError ? (
          <>
            <p className="text-sm font-semibold text-red-700 mb-2">Could not load your data</p>
            <p className="text-xs text-gray-500 mb-4">{bootError}</p>
            <button onClick={() => logout()} className="text-xs underline text-gray-500">Sign out</button>
          </>
        ) : (
          <>
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-800 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading your organization…</p>
          </>
        )}
      </div>
    </div>
  )
}

// Phone field mode vs. the full app. /field/* is always field mode; '/' is
// field mode on a PM's phone (unless they switched to the full app); every
// other address — and every desktop — gets the full app, so emailed links
// and bookmarks keep working everywhere.
function ShellSwitch() {
  const location = useLocation()
  const fieldHome = useFieldHome()
  const role = useStore(s => s.role)
  const path = location.pathname
  let kind = 'full', redirect = null
  // The paint PM only ever gets Field mode — at every address, on every
  // device — so typing /sales or /settings can't reach the full app.
  if (role === 'paint') kind = 'field'
  // A sub only ever gets the sub app (src/sub), the same way.
  else if (role === 'sub') kind = 'sub'
  else if (path === '/field' || path.startsWith('/field/')) {
    // The phone home-screen app used to open at /field for everyone. Field mode
    // is the PM's screen: anyone else lands in the full app, unless they picked
    // Field mode themselves on this phone.
    if (role === 'pm' || (canUseField(role) && readViewPref() === 'field')) kind = 'field'
    else {
      // An emailed link to a job (e.g. a sub's message) opens that job in the full app
      const jobId = /^\/field\/job\/([^/]+)/.exec(path)?.[1]
      redirect = jobId ? `/projects?tab=jobs&job=${encodeURIComponent(jobId)}` : '/'
    }
  } else if (path === '/' && fieldHome) kind = 'field'
  useEffect(() => { rememberShell(kind) }, [kind])
  if (redirect) return <Navigate to={redirect} replace />
  return kind === 'field' ? <FieldApp /> : kind === 'sub' ? <SubApp /> : <AppShell />
}

class SignBoundary extends Component {
  state = { err: null }
  static getDerivedStateFromError(e) { return { err: e } }
  render() {
    if (this.state.err) return (
      <div style={{ padding: '2rem', fontFamily: 'monospace', color: '#dc2626' }}>
        <strong>Sign page error:</strong> {this.state.err.message}
        <pre style={{ fontSize: 12, marginTop: 8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{this.state.err.stack}</pre>
      </div>
    )
    return this.props.children
  }
}

// Recoverable boundary for the main app — shows a friendly message with a way
// back instead of a blank white screen when a page component throws.
class AppBoundary extends Component {
  state = { err: null }
  static getDerivedStateFromError(e) { return { err: e } }
  handleReset = () => { this.setState({ err: null }); window.location.href = '/' }
  render() {
    if (this.state.err) return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '1.5rem' }}>
        <div style={{ maxWidth: 440, textAlign: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Something went wrong on this page</h1>
          <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 20px', lineHeight: 1.6 }}>
            Your data is safe. This screen hit an error, but nothing was lost — you can head back and keep working.
          </p>
          <button onClick={this.handleReset}
            style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Back to Dashboard
          </button>
          <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 16, fontFamily: 'monospace', wordBreak: 'break-word' }}>{this.state.err.message}</p>
        </div>
      </div>
    )
    return this.props.children
  }
}

export default function Root() {
  return (
    <BrowserRouter basename={DEMO_BASENAME}>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/welcome"     element={<Landing />} />
          <Route path="/login"       element={<Login />} />
          <Route path="/signup"      element={<Signup />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/sign/:token" element={<SignBoundary><SignPage /></SignBoundary>} />
          <Route path="/p/:token"    element={<PublicProposal />} />
          <Route path="/legal"       element={<Legal />} />
          <Route path="/legal/:doc"  element={<Legal />} />
          <Route path="/co/:token"   element={<SignBoundary><COSignPage /></SignBoundary>} />
          <Route path="/view/:recordId" element={<SignBoundary><ContractViewFull /></SignBoundary>} />
          <Route path="*"            element={<AuthGuard><AppBoundary><BootGate><ShellSwitch /></BootGate></AppBoundary></AuthGuard>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
