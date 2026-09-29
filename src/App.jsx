import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { LayoutGrid, User, FileText, Cloud, Package, ListChecks, LineChart, Tag, UserCog, Wrench, Calendar, BarChart3, TrendingUp, Wallet, Mail, Search, X, Settings as SettingsIcon, Sun, Moon, LogOut, Menu, CheckSquare } from 'lucide-react'
import { Component, useEffect, useState, useRef } from 'react'
import Dashboard from './pages/Dashboard'
import Analyze from './pages/Analyze'
import ItemCatalog from './pages/ItemCatalog'
import BuildQuote from './pages/BuildQuote'
import Analytics from './pages/Analytics'
import ProposalView from './pages/ProposalView'
import ProposalTracker from './pages/ProposalTracker'
import InboxPage from './pages/Inbox'
import AiChat from './pages/AiChat'
import SettingsPage from './pages/Settings'
import ClientList from './pages/ClientList'
import ContractView from './pages/ContractView'
import ContractsList from './pages/ContractsList'
import Login from './pages/Login'
import Landing from './pages/Landing'
import PMCalendar from './pages/PMCalendar'
import Finance from './pages/Finance'
import SignPage from './pages/SignPage'
import COSignPage from './pages/COSignPage'
import ContractViewFull from './pages/ContractViewFull'
import ProfitabilityTracker from './pages/ProfitabilityTracker'
import Jobs from './pages/Jobs'
import Subcontractors from './pages/Subcontractors'
import Scheduler from './pages/Scheduler'
import Checklists from './pages/Checklists'
import PublicProposal from './pages/PublicProposal'
import Legal from './pages/Legal'
import AuthGuard, { logout } from './components/AuthGuard'
import { useStore, bootstrapOrg } from './store'
import { applyBrandStyles, applyTheme, DEFAULT_BRAND_COLOR } from './brand'
import { canAccessRoute, landingRoute } from './plans'
import { canRoleAccess, roleLanding } from './roles'
import { TodoDock } from './components/TodoPanel'
import { DEMO, DEMO_BASENAME, resetDemo } from './demo'

// Nav grouped into labeled sections. Same routes and order of use as before —
// only chunked so the sidebar reads as four short lists instead of one wall.
const NAV_SECTIONS = [
  { section: 'Sales', items: [
    { to: '/',        label: 'Dashboard',       icon: LayoutGrid },
    { to: '/clients', label: 'Clients',          icon: User },
    { to: '/analyze', label: 'Analyze',          icon: FileText },
    { to: '/ai',      label: 'AI Assistant',     icon: Cloud },
    { to: '/catalog', label: 'Item Catalog',     icon: Package },
    { to: '/quote',   label: 'Build Quote',      icon: ListChecks },
    { to: '/tracker', label: 'Proposal Tracker', icon: LineChart },
  ] },
  { section: 'Operations', items: [
    { to: '/contracts', label: 'Contracts',      icon: Tag },
    { to: '/jobs',      label: 'Job Management',  icon: UserCog },
    { to: '/subs',      label: 'Subcontractors',  icon: Wrench },
    { to: '/scheduler', label: 'Scheduler',       icon: Calendar },
    { to: '/checklists',label: 'Checklists',       icon: CheckSquare },
  ] },
  { section: 'Financials', items: [
    { to: '/analytics',     label: 'Analytics',     icon: BarChart3 },
    { to: '/profitability', label: 'Profitability', icon: TrendingUp },
    { to: '/finance',       label: 'Finance',       icon: Wallet },
  ] },
  { section: 'Comms', items: [
    { to: '/inbox', label: 'Inbox', icon: Mail },
  ] },
]
// Flat list preserved for lookups (page title, etc.)
const NAV = NAV_SECTIONS.flatMap(s => s.items)

const STATUS_BADGE = {
  Won:           'bg-green-100 text-green-700',
  Lost:          'bg-red-100 text-red-700',
  Draft:         'bg-gray-100 text-gray-600',
  Sent:          'bg-blue-100 text-blue-700',
  'Followed Up': 'bg-purple-100 text-purple-700',
  Negotiating:   'bg-amber-100 text-amber-700',
  MIA:           'bg-slate-100 text-slate-500',
}

const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const UNREAD_POLL = 60_000

// ── Global Search ────────────────────────────────────────────────────────────
function GlobalSearch() {
  const navigate  = useNavigate()
  const proposals = useStore(s => s.proposals)
  const catalog   = useStore(s => s.catalog)
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const q = query.toLowerCase().trim()

  const matchedProposals = q.length < 2 ? [] : proposals
    .filter(p => [p.client, p.email, p.phone, p.address, p.status]
      .some(v => v?.toLowerCase().includes(q)))
    .slice(0, 6)

  const matchedCatalog = q.length < 2 ? [] : catalog
    .filter(c => [c.name, c.description, c.category]
      .some(v => v?.toLowerCase().includes(q)))
    .slice(0, 4)

  const hasResults = matchedProposals.length > 0 || matchedCatalog.length > 0
  const showEmpty  = q.length >= 2 && !hasResults

  const openProposal = (p) => {
    sessionStorage.setItem('proposal', JSON.stringify({
      client: p.client, email: p.email, phone: p.phone,
      address: p.address, expiration: p.expiration,
      lines: p.lines || [], margin: 0, proposalId: p.id,
    }))
    setQuery(''); setOpen(false)
    navigate('/proposal')
  }

  const goToCatalog = () => { setQuery(''); setOpen(false); navigate('/catalog') }

  return (
    <div ref={ref} className="relative">
      <div className={`flex items-center gap-2 border rounded-lg px-3 py-1.5 bg-white w-64 transition-all ${
        open ? 'border-[var(--brand-400)] ring-1 ring-[var(--brand-300)]' : 'border-gray-200'
      }`}>
        <Search size={14} className="text-gray-400 shrink-0" />
        <input
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400"
          placeholder="Search clients or items…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false) }} className="text-gray-300 hover:text-gray-500">
            <X size={13} />
          </button>
        )}
      </div>

      {open && (hasResults || showEmpty) && (
        <div className="absolute top-full right-0 mt-1.5 w-80 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          {matchedProposals.length > 0 && (
            <div>
              <p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-400 bg-gray-50">Clients / Proposals</p>
              {matchedProposals.map(p => (
                <button key={p.id} onClick={() => openProposal(p)}
                  className="w-full text-left px-4 py-2.5 hover:bg-[var(--brand-50)] border-t border-gray-50 transition-colors">
                  <p className="text-sm font-medium text-gray-900">{p.client || <span className="italic text-gray-400">Unnamed</span>}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${STATUS_BADGE[p.status] || 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                    <span className="text-xs text-gray-400">${fmt(p.total || 0)}</span>
                    {p.email && <span className="text-xs text-gray-400 truncate max-w-[120px]">{p.email}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
          {matchedCatalog.length > 0 && (
            <div>
              <p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-gray-400 bg-gray-50 border-t border-gray-100">Catalog Items</p>
              {matchedCatalog.map(c => (
                <button key={c.id} onClick={goToCatalog}
                  className="w-full text-left px-4 py-2.5 hover:bg-[var(--brand-50)] border-t border-gray-50 transition-colors">
                  <p className="text-sm font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.category} · ${c.unitPrice}/{c.unit}</p>
                </button>
              ))}
            </div>
          )}
          {showEmpty && (
            <div className="px-4 py-5 text-center">
              <p className="text-sm text-gray-400">No results for "<span className="font-medium text-gray-600">{query}</span>"</p>
            </div>
          )}
        </div>
      )}
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

// The home screen ('/') depends on role: PMs get the job calendar.
function RoleHome() {
  const role = useStore(s => s.role || 'manager')
  return role === 'pm' ? <PMCalendar /> : <Dashboard />
}

// Blocks a route the current plan OR role can't reach, redirecting home.
function Gated({ path, children }) {
  const plan = useStore(s => s.branding?.plan || 'enterprise')
  const role = useStore(s => s.role || 'manager')
  if (!canAccessRoute(plan, path)) return <Navigate to={landingRoute(plan)} replace />
  if (!canRoleAccess(role, path))  return <Navigate to={roleLanding(role)} replace />
  return children
}

// ── App Shell ────────────────────────────────────────────────────────────────
function AppShell() {
  const proposals      = useStore(s => s.proposals)
  const readMessageIds = useStore(s => s.readMessageIds)
  const branding       = useStore(s => s.branding)
  const theme          = useStore(s => s.theme)
  const setTheme       = useStore(s => s.setTheme)
  const [inboxUnread, setInboxUnread] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const location  = useLocation()
  const pageTitle = location.pathname === '/settings'
    ? 'Settings'
    : (NAV.find(i => i.to === location.pathname)?.label || '')

  const isDark = theme === 'dark'
  const closeSidebar = () => setSidebarOpen(false)

  const plan = branding?.plan || 'enterprise'
  const role = useStore(s => s.role || 'manager')
  const autoExpireStaleSent = useStore(s => s.autoExpireStaleSent)

  // Flag proposals that have sat in 'Sent' for 90+ days (no new iteration,
  // activity, or status change) as MIA. Runs once per app load.
  useEffect(() => { autoExpireStaleSent() }, [autoExpireStaleSent])

  useEffect(() => {
    applyBrandStyles(branding?.primaryColor || DEFAULT_BRAND_COLOR, {
      sidebar: branding?.sidebarColor || null,
      accent:  branding?.accentColor  || null,
    })
  }, [branding?.primaryColor, branding?.sidebarColor, branding?.accentColor])

  useEffect(() => {
    applyTheme(isDark)
  }, [isDark])

  // Close sidebar on resize to desktop
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 1024) setSidebarOpen(false) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const dueCount = proposals.reduce((count, p) => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const due = (p.reminders || []).filter(r => !r.dismissed && new Date(r.date + 'T00:00:00') <= today)
    return count + due.length
  }, 0)

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/messages')
        if (!res.ok) return
        const { messages } = await res.json()
        const readSet = new Set(readMessageIds || [])
        setInboxUnread(messages.filter(m => m.direction === 'inbound' && !readSet.has(m.id)).length)
      } catch {}
    }
    const timer = setInterval(async () => { try { await check() } catch {} }, UNREAD_POLL)
    return () => clearInterval(timer)
  }, [readMessageIds])

  // Live sync is Realtime now (see src/supabase.js): every committed row change
  // is pushed to this device the moment it happens. Nothing to poll.

  const companyName = branding?.companyName || 'QUOTEX'
  const logo        = branding?.logo        || null

  return (
    <div className="min-h-screen flex qx-ground">

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={closeSidebar} />
      )}

      {/* Sidebar — fixed drawer on mobile, inline on desktop */}
      <aside
        className={`w-64 flex flex-col no-print shrink-0 shadow-lg
          fixed lg:relative inset-y-0 left-0 z-50 h-full
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        style={{ backgroundColor: 'var(--sidebar)' }}
      >
        {/* Logo + close button on mobile */}
        <div className="px-5 py-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--sidebar-border)' }}>
          <div className="flex-1 flex justify-center">
            {logo
              ? <img src={logo} alt="logo" className="h-12 object-contain" />
              : <h1 className="text-xl font-black text-white tracking-widest leading-tight">{companyName}</h1>}
          </div>
          <button onClick={closeSidebar} className="lg:hidden text-white/60 hover:text-white ml-2">
            <X size={18} />
          </button>
        </div>

        {/* Nav links — grouped into labeled sections */}
        <nav className="flex-1 py-3 space-y-4 px-2 overflow-y-auto">
          {NAV_SECTIONS.map(({ section, items }) => {
            const visible = items.filter(({ to }) => canAccessRoute(plan, to) && canRoleAccess(role, to))
            if (visible.length === 0) return null
            return (
              <div key={section}>
                <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-wider brand-footer opacity-60">{section}</p>
                <div className="space-y-0.5">
                  {visible.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === '/'}
                      onClick={closeSidebar}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                          isActive ? 'brand-nav-active' : 'brand-nav-inactive'
                        }`
                      }
                    >
                      <Icon size={16} />
                      <span className="flex-1">{label}</span>
                      {to === '/tracker' && dueCount > 0 && (
                        <span className="bg-amber-400 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                          {dueCount}
                        </span>
                      )}
                      {to === '/inbox' && inboxUnread > 0 && (
                        <span className="brand-badge bg-white text-xs font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center leading-none">
                          {inboxUnread}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        <div className="px-2 pb-2">
          <NavLink
            to="/settings"
            onClick={closeSidebar}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'brand-nav-active' : 'brand-nav-inactive'
              }`
            }
          >
            <SettingsIcon size={16} />
            <span>Settings</span>
          </NavLink>
        </div>

        <div className="px-4 py-3 border-t flex items-center justify-between" style={{ borderColor: 'var(--brand-600)' }}>
          <p className="text-xs brand-footer">© 2025 {companyName}</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors brand-nav-inactive hover:bg-white/10"
            >
              {isDark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button onClick={DEMO ? resetDemo : logout} title={DEMO ? 'Reset demo data' : 'Log out'} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors brand-nav-inactive hover:bg-white/10">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Demo banner */}
        {DEMO && (
          <div className="bg-[var(--brand-600)] text-white text-xs px-4 py-1.5 flex items-center justify-center gap-3 no-print shrink-0">
            <span className="font-medium">🎬 Demo — sample data only. Your changes stay in this browser and never affect real accounts.</span>
            <button onClick={resetDemo} className="underline underline-offset-2 hover:opacity-80 font-medium shrink-0">
              Reset demo
            </button>
          </div>
        )}
        {/* Top header */}
        <header className="h-12 bg-white border-b border-gray-200 flex items-center gap-3 px-4 no-print shrink-0">
          {/* Hamburger — mobile only */}
          <button
            className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          {pageTitle && <span className="text-sm font-semibold text-gray-800 truncate">{pageTitle}</span>}
          <div className="ml-auto hidden sm:block">
            <GlobalSearch />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto print:overflow-visible print:h-auto">
          <Routes>
            <Route path="/"         element={<Gated path="/"><RoleHome /></Gated>} />
            <Route path="/analyze"  element={<Gated path="/analyze"><Analyze /></Gated>} />
            <Route path="/ai"       element={<Gated path="/ai"><AiChat /></Gated>} />
            <Route path="/catalog"  element={<Gated path="/catalog"><ItemCatalog /></Gated>} />
            <Route path="/quote"     element={<Gated path="/quote"><BuildQuote /></Gated>} />
            <Route path="/analytics" element={<Gated path="/analytics"><Analytics /></Gated>} />
            <Route path="/proposal"  element={<Gated path="/proposal"><ProposalView /></Gated>} />
            <Route path="/clients"  element={<Gated path="/clients"><ClientList /></Gated>} />
            <Route path="/tracker"  element={<Gated path="/tracker"><ProposalTracker /></Gated>} />
            <Route path="/inbox"    element={<Gated path="/inbox"><InboxPage /></Gated>} />
            <Route path="/settings" element={<Gated path="/settings"><SettingsPage /></Gated>} />
            <Route path="/contracts"     element={<Gated path="/contracts"><ContractsList /></Gated>} />
            <Route path="/contract"      element={<Gated path="/contract"><ContractView /></Gated>} />
            <Route path="/jobs"          element={<Gated path="/jobs"><Jobs /></Gated>} />
            <Route path="/subs"          element={<Gated path="/subs"><Subcontractors /></Gated>} />
            <Route path="/scheduler"     element={<Gated path="/scheduler"><Scheduler /></Gated>} />
            <Route path="/checklists"    element={<Gated path="/checklists"><Checklists /></Gated>} />
            <Route path="/profitability" element={<Gated path="/profitability"><ProfitabilityTracker /></Gated>} />
            <Route path="/finance"       element={<Gated path="/finance"><Finance /></Gated>} />
            {/* Pipeline folded into the Proposal Tracker's Pipeline tab */}
            <Route path="/pipeline"      element={<Navigate to="/tracker" replace />} />
          </Routes>
        </main>
      </div>

      {/* Pinned daily to-do — floats on every page when pinned */}
      <TodoDock />
    </div>
  )
}

class SignBoundary extends Component {
  state = { err: null }
  static getDerivedStateFromError(e) { return { err: e } }
  render() {
    if (this.state.err) return (
      <div style={{ padding: '2rem', fontFamily: 'monospace', color: '#dc2626' }}>
        <strong>Sign page error:</strong> {this.state.err.message}
        <pre style={{ fontSize: 12, marginTop: 8, whiteSpace: 'pre-wrap' }}>{this.state.err.stack}</pre>
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

export default function App() {
  return (
    <BrowserRouter basename={DEMO_BASENAME}>
      <Routes>
        <Route path="/welcome"     element={<Landing />} />
        <Route path="/login"       element={<Login />} />
        <Route path="/sign/:token" element={<SignBoundary><SignPage /></SignBoundary>} />
        <Route path="/p/:token"    element={<PublicProposal />} />
        <Route path="/legal"       element={<Legal />} />
        <Route path="/legal/:doc"  element={<Legal />} />
        <Route path="/co/:token"   element={<SignBoundary><COSignPage /></SignBoundary>} />
        <Route path="/view/:recordId" element={<SignBoundary><ContractViewFull /></SignBoundary>} />
        <Route path="*"            element={<AuthGuard><AppBoundary><BootGate><AppShell /></BootGate></AppBoundary></AuthGuard>} />
      </Routes>
    </BrowserRouter>
  )
}
