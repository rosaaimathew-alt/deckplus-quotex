// ── Navigation map ───────────────────────────────────────────────────────────
// The whole app in seven places. Every tab still answers to the page path it came
// from (`access`), so plan and role permissions (src/plans.js, src/roles.js)
// work exactly as before: a tab shows only when its old page was allowed, and
// a destination shows only when at least one of its tabs is allowed.
//
// Old addresses (/tracker, /jobs, /analytics, …) redirect to their new home in
// LEGACY_REDIRECTS, so bookmarks and emailed links keep working.
import { useMemo } from 'react'
import {
  House, Handshake, HardHat, ChartColumn, Package, List, Columns3, Ruler,
  ClipboardCheck, FileSignature, CalendarDays, TrendingUp, Wallet, Target,
  Sparkles, Calculator, Users, Hammer, ShieldCheck, Landmark, FileText, Receipt, ShoppingCart, Truck, FilePen,
} from 'lucide-react'
import { useStore } from './store'
import { canAccessRoute } from './plans'
import { canRoleAccess } from './roles'
import { isOff, PATH_KEYS, JOB_MONEY } from './permissions'

export const DESTINATIONS = [
  { key: 'home', to: '/', label: 'Home', icon: House, access: ['/'],
    hint: 'What needs you today', keywords: 'dashboard today start overview' },

  { key: 'sales', to: '/sales', label: 'Sales', icon: Handshake,
    hint: 'Proposals, pipeline and designs', keywords: 'proposal tracker crm quotes leads clients customers',
    tabs: [
      { key: 'proposals', label: 'Proposals', icon: List, access: '/tracker', hint: 'Every client and quote, newest first, and who opened them', keywords: 'tracker quotes follow up reminder status revise contract clients customers contacts opens opened views' },
      { key: 'pipeline',  label: 'Pipeline',  icon: Columns3, access: '/tracker', hint: 'Board by status', keywords: 'kanban board stages' },
      { key: 'designs',   label: 'Designs',   icon: Ruler, access: '/tracker', hint: '3D renderings and floor plans', keywords: 'drawings floor plan rendering 3d 2d cad illustrator design' },
      // Office / admin only: website bookings can't be read by anyone else
      { key: 'leads',     label: 'Leads',     icon: Users, access: '/leads', hint: 'Everyone who booked online, got a quote or had a job, to check before booking', keywords: 'master lead list double booked duplicate website calendar booking caller phone' },
    ] },

  // Contracts get their own place: sales prepares and sends them, managers and
  // project managers track signatures — everyone finds them in one spot.
  { key: 'contracts', to: '/contracts', label: 'Contracts', icon: FileSignature,
    hint: 'Prepare, send and track signatures', keywords: 'sign signature agreement contract',
    tabs: [
      { key: 'all', label: 'Contracts', icon: FileSignature, access: '/contracts', hint: 'Every contract and its signing status', keywords: 'sign signature agreement' },
    ] },

  { key: 'projects', to: '/projects', label: 'Projects', icon: HardHat,
    hint: 'Jobs, inspections and the schedule', keywords: 'operations work won',
    tabs: [
      { key: 'jobs',       label: 'Jobs',       icon: Hammer, access: '/jobs', hint: 'Stages, change orders, logs, warranty', keywords: 'job management stages change order daily log warranty costs receipts payment close out' },
      { key: 'changeorders', label: 'Change orders', icon: FilePen, access: '/jobs', hint: 'Every change order on every job', keywords: 'co addendum change order coordination' },
      { key: 'inspections', label: 'Inspections', icon: ShieldCheck, access: '/jobs', hint: 'Mecklenburg permits and inspections, every job on one screen', keywords: 'permit inspection county mecklenburg footing framing final failed' },
      { key: 'calendar',   label: 'Calendar',   icon: CalendarDays, access: '/scheduler', hint: 'Start dates, milestones, planned work', keywords: 'schedule scheduler dates planner milestones' },
      { key: 'checklists', label: 'Checklists', icon: ClipboardCheck, access: '/checklists', hint: 'Shared team checklists', keywords: 'punch list todo tasks' },
    ] },

  { key: 'insights', to: '/insights', label: 'Insights', icon: ChartColumn,
    hint: 'Revenue, win rate, profit and spend', keywords: 'reports analytics numbers metrics',
    tabs: [
      { key: 'overview', label: 'Overview',   icon: TrendingUp, access: '/analytics', hint: 'Revenue trend, win rate, project types, map', keywords: 'analytics revenue seasonality heat map past jobs' },
      { key: 'winloss',  label: 'Win / loss', icon: Target, access: ['/analytics', '/tracker'], hint: 'Pipeline by status, reasons, days to close', keywords: 'reasons funnel close rate' },
      { key: 'profit',   label: 'Profit',     icon: Calculator, access: '/profitability', hint: 'Actual job costs and margins', keywords: 'profitability margin job costs' },
      { key: 'expenses', label: 'Expenses',   icon: Wallet, access: '/finance', hint: 'Card spend, fixed costs, subscriptions and inventory', keywords: 'finance cards statement spend fixed operating inventory subscriptions' },
    ] },

  // The office's money: what we bill, what we owe, what we've committed to
  // spend, and who we buy from. Office / admin only (role 'manager').
  { key: 'money', to: '/money', label: 'Money', icon: Landmark,
    hint: 'Invoices, bills, purchase orders and vendors', keywords: 'accounting books finance ar ap',
    tabs: [
      { key: 'invoices',  label: 'Invoices',  icon: FileText, access: '/finance', hint: 'What customers owe us', keywords: 'invoice billing receivable overdue payment customer' },
      { key: 'bills',     label: 'Bills',     icon: Receipt, access: '/finance', hint: 'What we owe vendors', keywords: 'bill payable vendor owe pay' },
      { key: 'purchases', label: 'Purchases', icon: ShoppingCart, access: '/finance', hint: 'Purchase orders and commissions', keywords: 'po purchase order commission materials committed cost' },
      // Subs live here too (they used to be Projects › Subcontractors), so
      // project managers get this one tab: subs only, no money.
      { key: 'vendors',   label: 'Vendors',   icon: Truck, access: '/subs', hint: 'Suppliers, subs and their paperwork', keywords: 'vendor supplier w9 gl insurance workers comp subs subcontractors crews coi trades incidents rating' },
    ] },

  { key: 'catalog', to: '/catalog', label: 'Catalog', icon: Package,
    hint: 'Prices, builder rates and imports', keywords: 'pricing items price list',
    tabs: [
      { key: 'items',     label: 'Items',         icon: List, access: '/catalog', hint: 'Every priced item', keywords: 'item catalog prices categories' },
      { key: 'rates',     label: 'Builder rates', icon: Calculator, access: '/catalog', hint: 'Deck and porch builder pricing', keywords: 'tools formulas deck porch rates lock' },
      { key: 'import',    label: 'Import & AI',   icon: Sparkles, access: '/analyze', hint: 'Pull prices from estimates or spreadsheets, or bulk-edit them in plain English', keywords: 'analyze estimate spreadsheet excel csv pdf ai assistant chat bulk' },
    ] },
]

// Old page → new place
export const LEGACY_REDIRECTS = {
  '/tracker':       '/sales?tab=proposals',
  '/pipeline':      '/sales?tab=pipeline',
  '/clients':       '/sales?tab=proposals',
  '/leads':         '/sales?tab=leads',
  '/jobs':          '/projects?tab=jobs',
  '/scheduler':     '/projects?tab=calendar',
  '/subs':          '/money?tab=vendors',
  '/checklists':    '/projects?tab=checklists',
  '/analytics':     '/insights?tab=overview',
  '/profitability': '/insights?tab=profit',
  '/finance':       '/insights?tab=expenses',
  '/analyze':       '/catalog?tab=import',
  '/ai':            '/catalog?tab=import&mode=ai',
}

const asList = (a) => (Array.isArray(a) ? a : [a])

export function makeAccess(plan, role) {
  return (paths) => asList(paths).every(p => canAccessRoute(plan, p) && canRoleAccess(role, p))
}

// Destinations (with only their allowed tabs) for the signed-in role and plan.
// The paint PM has no sidebar at all: they only ever get Field mode (App.jsx).
// permissions: the person's own switches (permissions.js) — a tab the admin
// switched off for them is left out like one their department doesn't have.
export function visibleDestinations(plan, role, permissions = {}) {
  if (role === 'paint' || role === 'sub') return []
  const can = makeAccess(plan, role)
  const out = []
  for (const d of DESTINATIONS) {
    if (d.tabs) {
      const tabs = d.tabs.filter(t => can(t.access) && !isOff(permissions, `${d.key}.${t.key}`)
        // Job money off also takes the cost side of the books (bills, POs)
        && !(isOff(permissions, JOB_MONEY) && COST_TABS.includes(`${d.key}.${t.key}`)))
      if (tabs.length) out.push({ ...d, tabs })
    } else if (can(d.access)) {
      out.push(d)
    }
  }
  return out
}

const NO_PERMS = {}
// What jobs cost: hidden with "Job money & profit" (permissions.js).
const COST_TABS = ['money.bills', 'money.purchases']

export function useNav() {
  const plan = useStore(s => s.branding?.plan || 'enterprise')
  const role = useStore(s => s.role || 'manager')
  const permissions = useStore(s => s.me?.permissions) || NO_PERMS
  return useMemo(() => {
    const destinations = visibleDestinations(plan, role, permissions)
    const base = makeAccess(plan, role)
    const can = (paths) => base(paths) && asList(paths).every(p => !isOff(permissions, PATH_KEYS[p]))
    const tabsOf = (key) => destinations.find(d => d.key === key)?.tabs || []
    // allowed('projects.inspections'), allowed('job.money'): this person's switch
    const allowed = (key) => !isOff(permissions, key)
    return { plan, role, can, destinations, tabsOf, allowed, money: allowed(JOB_MONEY) }
  }, [plan, role, permissions])
}

// The money inside a job (Budget, Costs, Receipts, payments, profit, quote margin).
export function useJobMoney() {
  return useStore(s => !isOff(s.me?.permissions, JOB_MONEY))
}
