import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Search, X, Settings as SettingsIcon, Sun, Moon, LogOut, Menu, Plus, Mail, ListChecks, Wallet, ClipboardList, Wrench } from 'lucide-react'
import { Component, useEffect, useMemo, useState } from 'react'
import Dashboard from './pages/Dashboard'
import PMHome from './pages/PMHome'
import BuildQuote from './pages/BuildQuote'
import ProposalView from './pages/ProposalView'
import InboxPage from './pages/Inbox'
import SettingsPage from './pages/Settings'
import ContractView from './pages/ContractView'
import Login from './pages/Login'
import Landing from './pages/Landing'
import SignPage from './pages/SignPage'
import COSignPage from './pages/COSignPage'
import ContractViewFull from './pages/ContractViewFull'
import PublicProposal from './pages/PublicProposal'
import Legal from './pages/Legal'
import { SalesHub, ContractsHub, ProjectsHub, InsightsHub, CatalogHub } from './pages/hubs/Hubs'
import CommandPalette from './components/CommandPalette'
import AuthGuard, { logout } from './components/AuthGuard'
import { useStore, bootstrapOrg } from './store'
import { applyBrandStyles, applyTheme, DEFAULT_BRAND_COLOR } from './brand'
import { canAccessRoute, landingRoute } from './plans'
import { canRoleAccess, roleLanding } from './roles'
import { useNav, LEGACY_REDIRECTS } from './nav'
import { nextReminderDate, contractStatusOf, isJobClosed } from './lib/attention'
import { useUnread } from './lib/unread'
import { TodoDock } from './components/TodoPanel'
import { DEMO, DEMO_BASENAME, resetDemo } from './demo'

const ROLE_LABEL = { sales: 'Sales', pm: 'Project manager', manager: 'Manager' }
const UNREAD_POLL = 60_000

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

// Home depends on role: project managers plan from the job calendar.
function RoleHome() {
  const role = useStore(s => s.role || 'manager')
  return role === 'pm' ? <PMHome /> : <Dashboard />
}

// Blocks a route the current plan OR role can't reach, redirecting home.
function Gated({ path, children }) {
  const plan = useStore(s => s.branding?.plan || 'enterprise')
  const role = useStore(s => s.role || 'manager')
  if (!canAccessRoute(plan, path)) return <Navigate to={landingRoute(plan)} replace />
  if (!canRoleAccess(role, path))  return <Navigate to={roleLanding(role)} replace />
  return children
}

// A destination opens when at least one of its tabs is allowed.
function GatedDestination({ dkey, children }) {
  const { destinations, plan } = useNav()
  if (!destinations.some(d => d.key === dkey)) return <Navigate to={destinations[0]?.to || landingRoute(plan)} replace />
  return children
}

// Old page address → its tab in the new layout (keeps bookmarks working)
function LegacyRedirect({ to }) {
  const location = useLocation()
  const extra = new URLSearchParams(location.search)
  const [path, q] = to.split('?')
  const params = new URLSearchParams(q)
  extra.forEach((v, k) => params.set(k, v))
  return <Navigate to={`${path}?${params.toString()}`} replace />
}

// Counts shown as badges in the sidebar — the same rules as Home's list.
function useBadges() {
  const proposals = useStore(s => s.proposals)
  const unread = useUnread(s => s.unread)
  const { can } = useNav()
  return useMemo(() => {
    const today = new Date()
    let followUps = 0
    for (const p of proposals) for (const r of p.reminders || []) {
      const d = nextReminderDate(r)
      if (d && new Date(d + 'T00:00:00') <= today) followUps++
    }
    const won = proposals.filter(p => p.status === 'Won')
    const contracts = can('/contracts') ? won.filter(p => contractStatusOf(p) === 'not-started').length : 0
    const projects  = can('/scheduler') ? won.filter(p => !isJobClosed(p) && !p.jobData?.startDate).length : 0
    return { sales: followUps, contracts, projects, inbox: unread }
  }, [proposals, unread, can])
}

function NavItem({ d, badge, onClick }) {
  const Icon = d.icon
  return (
    <NavLink to={d.to} end={d.to === '/'} onClick={onClick} title={d.hint}
      className={({ isActive }) => `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-colors ${isActive ? 'brand-nav-active shadow-sm' : 'brand-nav-inactive'}`}>
      <Icon size={19} className="shrink-0" />
      <span className="flex-1 truncate">{d.label}</span>
      {badge > 0 && (
        <span className="bg-amber-400 text-[#1f1300] text-[11px] font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center leading-none">{badge > 99 ? '99+' : badge}</span>
      )}
    </NavLink>
  )
}

// ── App Shell ────────────────────────────────────────────────────────────────
function AppShell() {
  const readMessageIds = useStore(s => s.readMessageIds)
  const branding       = useStore(s => s.branding)
  const theme          = useStore(s => s.theme)
  const setTheme       = useStore(s => s.setTheme)
  const me             = useStore(s => s.me)
  const todoPin        = useStore(s => s.todoPin)
  const setTodoPin     = useStore(s => s.setTodoPin)
  const openTodos      = useStore(s => (s.todos || []).filter(t => !t.done).length)
  const setUnread      = useUnread(s => s.setUnread)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const navigate = useNavigate()

  const { destinations, can, role } = useNav()
  const badges = useBadges()
  const isDark = theme === 'dark'
  const closeSidebar = () => setSidebarOpen(false)
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

  useEffect(() => { applyTheme(isDark) }, [isDark])

  // Close the drawer when the screen grows to desktop
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 1024) setSidebarOpen(false) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Ctrl/⌘ + K opens search from anywhere
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Unread inbox count — checked on load, then every minute
  useEffect(() => {
    if (!can('/inbox')) return
    let alive = true
    const check = async () => {
      try {
        const res = await fetch('/api/messages')
        if (!res.ok) return
        const { messages } = await res.json()
        const readSet = new Set(readMessageIds || [])
        if (alive) setUnread((messages || []).filter(m => m.direction === 'inbound' && !readSet.has(m.id)).length)
      } catch { /* offline or not configured */ }
    }
    check()
    const timer = setInterval(check, UNREAD_POLL)
    return () => { alive = false; clearInterval(timer) }
  }, [readMessageIds, can, setUnread])

  const companyName = branding?.companyName || 'QUOTEX'
  const logo        = branding?.logo        || null
  const canQuote    = can('/quote')

  // Actions the search box can run directly
  const actions = useMemo(() => {
    const a = []
    if (canQuote) a.push({ label: 'New quote', hint: 'Build a proposal from your catalog', keywords: 'create estimate proposal build', icon: Plus, to: '/quote' })
    if (can('/finance')) a.push({ label: 'Add an expense', hint: 'Insights › Expenses', keywords: 'card spend receipt statement', icon: Wallet, to: '/insights?tab=expenses' })
    if (can('/jobs')) a.push({ label: 'Log a daily report', hint: 'Projects › Jobs — open a job, then Daily Log', keywords: 'daily log crew weather', icon: ClipboardList, to: '/projects?tab=jobs' })
    if (can('/subs')) a.push({ label: 'Add a subcontractor', hint: 'Projects › Subcontractors', keywords: 'sub crew coi', icon: Wrench, to: '/projects?tab=crews' })
    a.push({ label: isDark ? 'Switch to light mode' : 'Switch to dark mode', keywords: 'theme dark light', icon: isDark ? Sun : Moon, run: () => setTheme(isDark ? 'light' : 'dark') })
    a.push({ label: 'Settings', hint: 'Branding, email account, backups', keywords: 'branding logo colors email backup', icon: SettingsIcon, to: '/settings' })
    return a
  }, [canQuote, can, isDark, setTheme])

  // Phone tab bar: the first destinations, with New quote in the middle
  const mobileTabs = destinations.filter(d => d.key !== 'inbox').slice(0, canQuote ? 2 : 3)
  const mobileTabsRight = destinations.filter(d => d.key !== 'inbox' && !mobileTabs.includes(d)).slice(0, canQuote ? 1 : 1)

  return (
    <div className="h-screen flex qx-ground overflow-hidden">

      {/* Mobile backdrop */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={closeSidebar} />}

      {/* Sidebar — drawer on phones/tablets, fixed column on desktop */}
      <aside
        className={`w-64 flex flex-col no-print shrink-0
          fixed lg:relative inset-y-0 left-0 z-50 h-full
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        style={{ backgroundColor: 'var(--sidebar)' }}
        aria-label="Main navigation"
      >
        <div className="px-5 pt-5 pb-4 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex-1 flex justify-center" aria-label="Home">
            {logo
              ? <img src={logo} alt={companyName} className="h-11 object-contain" />
              : <span className="text-xl font-black text-white tracking-widest leading-tight">{companyName}</span>}
          </button>
          <button onClick={closeSidebar} className="lg:hidden text-white/60 hover:text-white ml-2" aria-label="Close menu"><X size={18} /></button>
        </div>

        {canQuote && (
          <div className="px-3 pb-3">
            <button onClick={() => { navigate('/quote'); closeSidebar() }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md transition-transform active:scale-[0.98]"
              style={{ background: 'var(--accent)' }}>
              <Plus size={17} /> New quote
            </button>
          </div>
        )}

        <nav className="flex-1 px-3 py-1 space-y-1 overflow-y-auto">
          {destinations.map(d => (
            <NavItem key={d.key} d={d} badge={badges[d.key] || 0} onClick={closeSidebar} />
          ))}
        </nav>

        <div className="px-3 pb-2 space-y-1">
          <button onClick={() => { setPaletteOpen(true); closeSidebar() }}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm brand-nav-inactive">
            <Search size={17} /> <span className="flex-1 text-left">Search</span>
            <kbd className="text-[10px] opacity-60 border border-current rounded px-1">Ctrl K</kbd>
          </button>
          <NavLink to="/settings" onClick={closeSidebar}
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${isActive ? 'brand-nav-active' : 'brand-nav-inactive'}`}>
            <SettingsIcon size={17} /> <span>Settings</span>
          </NavLink>
        </div>

        <div className="px-4 py-3 border-t flex items-center gap-2" style={{ borderColor: 'var(--sidebar-border)' }}>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white/90 truncate">{me?.displayName || (DEMO ? 'Demo user' : companyName)}</p>
            <p className="text-[11px] brand-footer opacity-70 truncate">{ROLE_LABEL[role] || role}</p>
          </div>
          <button onClick={() => setTheme(isDark ? 'light' : 'dark')} title={isDark ? 'Light mode' : 'Dark mode'}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors brand-nav-inactive">
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button onClick={DEMO ? resetDemo : logout} title={DEMO ? 'Reset demo data' : 'Log out'}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors brand-nav-inactive">
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {DEMO && (
          <div className="bg-[var(--brand-600)] text-white text-xs px-4 py-1.5 flex items-center justify-center gap-3 no-print shrink-0">
            <span className="font-medium">🎬 Demo — sample data only. Your changes stay in this browser and never affect real accounts.</span>
            <button onClick={resetDemo} className="underline underline-offset-2 hover:opacity-80 font-medium shrink-0">Reset demo</button>
          </div>
        )}

        {/* Top bar: search everything, to-do, inbox */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 no-print shrink-0">
          <button className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <button onClick={() => setPaletteOpen(true)}
            className="flex-1 min-w-0 max-w-xl flex items-center gap-2.5 h-10 px-3.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-400 hover:border-[var(--brand-300)] hover:bg-white transition-colors text-left">
            <Search size={16} className="shrink-0" />
            <span className="flex-1 truncate"><span className="sm:hidden">Search…</span><span className="hidden sm:inline">Search clients, jobs, or jump to a page…</span></span>
            <kbd className="hidden md:inline text-[10px] font-semibold text-gray-400 border border-gray-200 rounded px-1.5 py-0.5 bg-white">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1 shrink-0">
            <button onClick={() => setTodoPin(todoPin === 'right' ? 'off' : 'right')} title={todoPin === 'right' ? 'Hide to-do list' : 'Show to-do list'}
              className={`relative p-2 rounded-lg transition-colors ${todoPin === 'right' ? 'bg-[var(--brand-50)] text-[var(--brand-700)]' : 'text-gray-500 hover:bg-gray-100'}`}>
              <ListChecks size={19} />
              {openTodos > 0 && <span className="absolute -top-0.5 -right-0.5 bg-[var(--brand-600)] text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">{openTodos}</span>}
            </button>
            {can('/inbox') && (
              <button onClick={() => navigate('/inbox')} title="Inbox"
                className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors">
                <Mail size={19} />
                {badges.inbox > 0 && <span className="absolute -top-0.5 -right-0.5 bg-amber-400 text-[#1f1300] text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">{badges.inbox}</span>}
              </button>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto print:overflow-visible print:h-auto pb-16 lg:pb-0">
          <Routes>
            <Route path="/"          element={<Gated path="/"><RoleHome /></Gated>} />
            <Route path="/sales"     element={<GatedDestination dkey="sales"><SalesHub /></GatedDestination>} />
            <Route path="/contracts" element={<GatedDestination dkey="contracts"><ContractsHub /></GatedDestination>} />
            <Route path="/projects"  element={<GatedDestination dkey="projects"><ProjectsHub /></GatedDestination>} />
            <Route path="/insights"  element={<GatedDestination dkey="insights"><InsightsHub /></GatedDestination>} />
            <Route path="/catalog"   element={<GatedDestination dkey="catalog"><CatalogHub /></GatedDestination>} />
            <Route path="/inbox"     element={<Gated path="/inbox"><InboxPage /></Gated>} />
            <Route path="/quote"     element={<Gated path="/quote"><BuildQuote /></Gated>} />
            <Route path="/proposal"  element={<Gated path="/proposal"><ProposalView /></Gated>} />
            <Route path="/contract"  element={<Gated path="/contract"><ContractView /></Gated>} />
            <Route path="/settings"  element={<Gated path="/settings"><SettingsPage /></Gated>} />
            {Object.entries(LEGACY_REDIRECTS).map(([from, to]) => (
              <Route key={from} path={from} element={<LegacyRedirect to={to} />} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Phone tab bar */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-gray-200 flex items-stretch justify-around no-print pb-[env(safe-area-inset-bottom)]" aria-label="Quick navigation">
          {mobileTabs.map(d => <MobileTab key={d.key} d={d} badge={badges[d.key] || 0} />)}
          {canQuote && (
            <button onClick={() => navigate('/quote')} className="flex flex-col items-center justify-center px-3 -mt-4" aria-label="New quote">
              <span className="w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg" style={{ background: 'var(--accent)' }}><Plus size={22} /></span>
            </button>
          )}
          {mobileTabsRight.map(d => <MobileTab key={d.key} d={d} badge={badges[d.key] || 0} />)}
          <button onClick={() => setSidebarOpen(true)} className="flex-1 flex flex-col items-center justify-center py-2 text-gray-500">
            <Menu size={20} /><span className="text-[10px] font-medium mt-0.5">More</span>
          </button>
        </nav>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} destinations={destinations} actions={actions} />}

      {/* Pinned to-do — floats on every page when pinned */}
      <TodoDock />
    </div>
  )
}

function MobileTab({ d, badge }) {
  const Icon = d.icon
  return (
    <NavLink to={d.to} end={d.to === '/'}
      className={({ isActive }) => `relative flex-1 flex flex-col items-center justify-center py-2 ${isActive ? 'text-[var(--brand-700)]' : 'text-gray-500'}`}>
      <Icon size={20} />
      <span className="text-[10px] font-medium mt-0.5">{d.label}</span>
      {badge > 0 && <span className="absolute top-1 right-1/2 translate-x-4 bg-amber-400 text-[#1f1300] text-[9px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">{badge}</span>}
    </NavLink>
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
