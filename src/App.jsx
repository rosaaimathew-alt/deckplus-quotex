import { Routes, Route, NavLink, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Search, X, Settings as SettingsIcon, Sun, Moon, LogOut, Menu, Plus, ListChecks, Wallet, ClipboardList, Wrench } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import Dashboard from './pages/Dashboard'
import PMHome from './pages/PMHome'
import BuildQuote from './pages/BuildQuote'
import ProposalView from './pages/ProposalView'
import SettingsPage from './pages/Settings'
import ContractView from './pages/ContractView'
import EsignCertificate from './pages/EsignCertificate'
import { SalesHub, ProjectsHub, InsightsHub, CatalogHub, MoneyHub } from './pages/hubs/Hubs'
import OfficeHome from './pages/OfficeHome'
import OwnerHome from './pages/OwnerHome'
import CommandPalette from './components/CommandPalette'
import PermitPulse from './components/PermitPulse'
import { logout } from './components/AuthGuard'
import { useStore } from './store'
import { applyBrandStyles, applyTheme, brandOptions, DEFAULT_BRAND_COLOR } from './brand'
import { canAccessRoute, landingRoute } from './plans'
import { canRoleAccess, roleLanding } from './roles'
import { useNav, LEGACY_REDIRECTS } from './nav'
import { nextReminderDate, contractStatusOf, isJobClosed } from './lib/attention'
import { TodoDock } from './components/TodoPanel'
import { openTodoCount } from './lib/todos'
import { DEMO, resetDemo } from './demo'
import PushCard from './components/PushCard'
import { useIsPhone, canUseField, setViewPref } from './field/fieldMode'

const ROLE_LABEL = { sales: 'Sales', pm: 'Project manager', manager: 'Manager' }

// Today depends on the person: the page picked for them in Settings › Team
// (homePages: owner / office / permits), else their department's: project
// managers plan from the job calendar, office logins get the office home.
// Office / admin can preview any of them at /?home=owner|office|permits.
function RoleHome() {
  const role = useStore(s => s.role || 'manager')
  const me = useStore(s => s.me)
  const homePages = useStore(s => s.homePages)
  const location = useLocation()
  const preview = role === 'manager' ? new URLSearchParams(location.search).get('home') : null
  const own = role === 'manager' ? (homePages?.[me?.id] || (me?.role === 'office' ? 'office' : '')) : ''
  // Office / admin can flip their Today page to the owner's view and back (the
  // pill beside the greeting); the choice is remembered on this device.
  const [ownerView, setOwnerView] = useState(() => { try { return localStorage.getItem('qx_today_owner') === '1' } catch { return false } })
  const flip = (on) => { setOwnerView(on); try { localStorage.setItem('qx_today_owner', on ? '1' : '0') } catch { /* private mode */ } }
  const picked = preview || (ownerView && own !== 'owner' ? 'owner' : own)
  const pill = role === 'manager' && own !== 'owner' && !preview ? (
    <span className="inline-flex rounded-full border border-gray-300 bg-white p-0.5 text-xs font-semibold" role="group" aria-label="Which Today page">
      {[[false, 'My view'], [true, 'Owner view']].map(([on, label]) => (
        <button key={label} type="button" onClick={() => flip(on)} aria-pressed={ownerView === on}
          className={`px-3 py-1 rounded-full transition-colors ${ownerView === on ? 'bg-[var(--brand-600)] text-white' : 'text-gray-600 hover:text-gray-900'}`}>{label}</button>
      ))}
    </span>
  ) : null
  const home = role === 'pm' ? <PMHome />
    : picked === 'owner' ? <OwnerHome pill={pill} />
    : picked === 'permits' ? <OfficeHome permits pill={pill} />
    : picked === 'office' ? <OfficeHome pill={pill} />
    : <Dashboard pill={pill} />
  // Pop-up alerts for the office too (lib/push): the card hides once they're on
  return <><div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 empty:hidden"><PushCard compact /></div>{home}</>
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
    return { sales: followUps + contracts, projects }
  }, [proposals, can])
}

// Text only, no icons (the owner's call).
function NavItem({ d, badge, onClick }) {
  return (
    <NavLink to={d.to} end={d.to === '/'} onClick={onClick} title={d.hint}
      className={({ isActive }) => `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-[15px] font-medium transition-colors ${isActive ? 'brand-nav-active shadow-sm' : 'brand-nav-inactive'}`}>
      <span className="flex-1 truncate">{d.label}</span>
      {badge > 0 && (
        <span className="qx-badge text-[11px] font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center leading-none">{badge > 99 ? '99+' : badge}</span>
      )}
    </NavLink>
  )
}

// ── App Shell ────────────────────────────────────────────────────────────────
// The full office app: sidebar, top bar and every page. Loaded on demand by
// src/Root.jsx, so the sub app, Field mode and the customer pages (signing, a
// proposal link) don't download it.
export default function AppShell() {
  const branding       = useStore(s => s.branding)
  const theme          = useStore(s => s.theme)
  const setTheme       = useStore(s => s.setTheme)
  const me             = useStore(s => s.me)
  const todoPin        = useStore(s => s.todoPin)
  const setTodoPin     = useStore(s => s.setTodoPin)
  const openTodos      = useStore(s => openTodoCount(s.todos, s.me))   // waiting on me: my own and those given to me
  const setTodoTab     = useStore(s => s.setTodoTab)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Desktop: the menu can be tucked away for a full-width screen (remembered on this device)
  const [menuHidden, setMenuHidden] = useState(() => { try { return localStorage.getItem('qx_menu_hidden') === '1' } catch { return false } })
  const hideMenu = (on) => { setMenuHidden(on); try { localStorage.setItem('qx_menu_hidden', on ? '1' : '0') } catch { /* private mode */ } }
  const [paletteOpen, setPaletteOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  // The link in a "New task from …" alert (?todo=1) opens the list on Shared
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    if (q.get('todo') !== '1') return
    setTodoTab('shared'); setTodoPin('right')
    q.delete('todo')
    navigate({ pathname: location.pathname, search: q.toString() ? `?${q}` : '' }, { replace: true })
  }, [location.pathname, location.search, navigate, setTodoPin, setTodoTab])

  const { destinations, can, role } = useNav()
  const badges = useBadges()
  const isPhone = useIsPhone()
  const showFieldSwitch = isPhone && canUseField(role)
  const isDark = theme === 'dark'
  const closeSidebar = () => setSidebarOpen(false)
  const autoExpireStaleSent = useStore(s => s.autoExpireStaleSent)

  // Flag proposals that have sat in 'Sent' for 90+ days (no new iteration,
  // activity, or status change) as MIA. Runs once per app load.
  useEffect(() => { autoExpireStaleSent() }, [autoExpireStaleSent])

  useEffect(() => {
    applyBrandStyles(branding?.primaryColor || DEFAULT_BRAND_COLOR, { ...brandOptions(branding || {}), office: true })
  }, [branding])

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


  const companyName = branding?.companyName || 'QUOTEX'
  const logo        = branding?.logo        || null
  const canQuote    = can('/quote')

  // Actions the search box can run directly
  const actions = useMemo(() => {
    const a = []
    if (canQuote) a.push({ label: 'New quote', hint: 'Build a proposal from your catalog', keywords: 'create estimate proposal build', icon: Plus, to: '/quote' })
    if (can('/finance')) a.push({ label: 'Add an expense', hint: 'Insights › Expenses', keywords: 'card spend receipt statement', icon: Wallet, to: '/insights?tab=expenses' })
    if (can('/jobs')) a.push({ label: 'Log a daily report', hint: 'Projects › Jobs — open a job, then Daily Log', keywords: 'daily log crew weather', icon: ClipboardList, to: '/projects?tab=jobs' })
    if (can('/subs')) a.push({ label: 'Add a subcontractor', hint: 'Money › Vendors', keywords: 'sub crew coi vendor', icon: Wrench, to: '/money?tab=vendors' })
    a.push({ label: isDark ? 'Switch to light mode' : 'Switch to dark mode', keywords: 'theme dark light', icon: isDark ? Sun : Moon, run: () => setTheme(isDark ? 'light' : 'dark') })
    a.push({ label: 'Settings', hint: 'Branding, email account, backups', keywords: 'branding logo colors email backup', icon: SettingsIcon, to: '/settings' })
    return a
  }, [canQuote, can, isDark, setTheme])

  // Phone tab bar: the first destinations, with New quote in the middle
  const mobileTabs = destinations.slice(0, canQuote ? 2 : 3)
  const mobileTabsRight = destinations.filter(d => !mobileTabs.includes(d)).slice(0, 1)

  return (
    <div className="h-screen flex qx-ground qx-office overflow-hidden">

      {/* Mobile backdrop */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={closeSidebar} />}

      {/* Sidebar — drawer on phones/tablets, fixed column on desktop */}
      <aside
        className={`w-64 lg:w-56 flex flex-col no-print shrink-0 border-r border-gray-200
          fixed inset-y-0 left-0 z-50 h-full
          transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} ${menuHidden ? '' : 'lg:relative lg:translate-x-0'}`}
        style={{ backgroundColor: 'var(--sidebar)' }}
        aria-label="Main navigation"
      >
        <div className="px-5 pt-5 pb-4 flex items-center justify-between">
          <button onClick={() => navigate('/')} className="flex-1 flex justify-center" aria-label="Home">
            {logo
              ? <img src={logo} alt={companyName} className="h-16 max-w-full object-contain" />
              : <span className="text-xl font-black text-white tracking-widest leading-tight">{companyName}</span>}
          </button>
          <button onClick={closeSidebar} className="lg:hidden text-white/60 hover:text-white ml-2" aria-label="Close menu"><X size={18} /></button>
        </div>

        {canQuote && (
          <div className="px-3 pb-3">
            <button onClick={() => { navigate('/quote'); closeSidebar() }}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-transform active:scale-[0.98]"
              style={{ background: 'var(--accent)' }}>
              + New quote
            </button>
          </div>
        )}

        <nav className="flex-1 px-3 py-1 space-y-1 overflow-y-auto">
          {destinations.map(d => (
            <NavItem key={d.key} d={d} badge={badges[d.key] || 0} onClick={closeSidebar} />
          ))}
        </nav>

        <div className="px-3 pb-2 space-y-1">
          {showFieldSwitch && (
            <button onClick={() => { setViewPref('field'); closeSidebar(); navigate('/field') }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold brand-nav-inactive">
              <span className="flex-1 text-left">Field mode</span>
            </button>
          )}
          {/* Desktop has no top bar: search and the to-do list open from here */}
          <button onClick={() => { setPaletteOpen(true); closeSidebar() }} title="Search clients, jobs, or jump to a page (Ctrl K)"
            className="hidden lg:flex w-full items-center px-3 py-2 rounded-xl text-sm font-medium brand-nav-inactive">
            <span className="flex-1 text-left">Search</span><kbd className="text-[10px] font-semibold opacity-60">Ctrl K</kbd>
          </button>
          <button onClick={() => { setTodoPin(todoPin === 'right' ? 'off' : 'right'); closeSidebar() }} aria-pressed={todoPin === 'right'}
            title={todoPin === 'right' ? 'Hide to-do list' : 'Show to-do list'}
            className={`hidden lg:flex w-full items-center px-3 py-2 rounded-xl text-sm font-medium ${todoPin === 'right' ? 'brand-nav-active' : 'brand-nav-inactive'}`}>
            <span className="flex-1 text-left">To-do</span>
            {openTodos > 0 && <span className="qx-badge text-[11px] font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center leading-none">{openTodos}</span>}
          </button>
          <NavLink to="/settings" onClick={closeSidebar}
            className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${isActive ? 'brand-nav-active' : 'brand-nav-inactive'}`}>
            <span>Settings</span>
          </NavLink>
        </div>

        <button onClick={() => { hideMenu(true); closeSidebar() }} title="Hide the menu for a full-width screen"
          className="hidden lg:block mx-3 mb-1 px-3 py-2 rounded-xl text-left text-sm font-medium brand-nav-inactive">Hide menu</button>

        {/* Who's signed in, and the way out. Light / dark is in Settings › Branding. */}
        <div className="px-6 pb-4 pt-1 flex items-center gap-2 text-xs brand-footer">
          <span className="flex-1 min-w-0 truncate opacity-70" title={ROLE_LABEL[role] || role}>{me?.displayName || (DEMO ? 'Demo user' : companyName)}</span>
          <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className="opacity-70 hover:opacity-100 hover:underline">{isDark ? 'Light' : 'Dark'}</button>
          <button onClick={DEMO ? resetDemo : logout} className="opacity-70 hover:opacity-100 hover:underline">{DEMO ? 'Reset demo' : 'Log out'}</button>
        </div>
      </aside>

      {/* Menu tucked away (desktop): one small button brings it back */}
      {menuHidden && (
        <button onClick={() => hideMenu(false)} title="Show the menu"
          className="hidden lg:block fixed top-3 left-3 z-40 no-print px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">Menu</button>
      )}

      {/* Main column */}
      <div className={`flex-1 flex flex-col overflow-hidden min-w-0 ${menuHidden ? 'lg:pt-12' : ''}`}>
        {DEMO && (
          <div className="bg-[var(--brand-600)] text-white text-xs px-4 py-1.5 flex items-center justify-center gap-3 no-print shrink-0">
            <span className="font-medium">🎬 Demo — sample data only. Your changes stay in this browser and never affect real accounts.</span>
            <button onClick={resetDemo} className="underline underline-offset-2 hover:opacity-80 font-medium shrink-0">Reset demo</button>
          </div>
        )}

        {/* Top bar: search everything, to-do */}
        <header className="lg:hidden h-14 bg-white border-b border-gray-200 flex items-center gap-2 sm:gap-3 px-3 sm:px-4 no-print shrink-0">
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
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto print:overflow-visible print:h-auto pb-16 lg:pb-0">
          <Routes>
            <Route path="/"          element={<Gated path="/"><RoleHome /></Gated>} />
            <Route path="/sales"     element={<GatedDestination dkey="sales"><SalesHub /></GatedDestination>} />
            <Route path="/projects"  element={<GatedDestination dkey="projects"><ProjectsHub /></GatedDestination>} />
            <Route path="/insights"  element={<GatedDestination dkey="insights"><InsightsHub /></GatedDestination>} />
            <Route path="/catalog"   element={<GatedDestination dkey="catalog"><CatalogHub /></GatedDestination>} />
            <Route path="/money"     element={<GatedDestination dkey="money"><MoneyHub /></GatedDestination>} />
            <Route path="/inbox"     element={<Navigate to="/" replace />} />
            <Route path="/quote"     element={<Gated path="/quote"><BuildQuote /></Gated>} />
            <Route path="/proposal"  element={<Gated path="/proposal"><ProposalView /></Gated>} />
            <Route path="/contract"  element={<Gated path="/contract"><ContractView /></Gated>} />
            <Route path="/settings"  element={<Gated path="/settings"><SettingsPage /></Gated>} />
            <Route path="/certificate/:kind/:recordId" element={<EsignCertificate />} />
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
          <button onClick={() => setSidebarOpen(true)} className="flex-1 flex flex-col items-center justify-center py-3 text-gray-500">
            <span className="text-xs font-semibold">More</span>
          </button>
        </nav>
      </div>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} destinations={destinations} actions={actions} />}

      {/* Pinned to-do — floats on every page when pinned */}
      <TodoDock />

      {/* Mecklenburg inspection pulse (office / admin, twice a day) */}
      <PermitPulse />
    </div>
  )
}

function MobileTab({ d, badge }) {
  return (
    <NavLink to={d.to} end={d.to === '/'}
      className={({ isActive }) => `relative flex-1 flex flex-col items-center justify-center py-3 ${isActive ? 'text-[var(--brand-700)]' : 'text-gray-500'}`}>
      <span className="text-xs font-semibold">{d.label}</span>
      {badge > 0 && <span className="absolute top-1 right-1/2 translate-x-4 qx-badge text-[9px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">{badge}</span>}
    </NavLink>
  )
}
