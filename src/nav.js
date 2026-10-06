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
  House, Handshake, HardHat, ChartColumn, Package, List, Columns3, Users, Eye,
  ClipboardCheck, FileSignature, CalendarDays, Wrench, TrendingUp, Wallet, Target,
  Upload, Sparkles, Calculator, Hammer,
} from 'lucide-react'
import { useStore } from './store'
import { canAccessRoute } from './plans'
import { canRoleAccess } from './roles'

export const DESTINATIONS = [
  { key: 'home', to: '/', label: 'Home', icon: House, access: ['/'],
    hint: 'What needs you today', keywords: 'dashboard today start overview' },

  { key: 'sales', to: '/sales', label: 'Sales', icon: Handshake,
    hint: 'Proposals, pipeline and clients', keywords: 'proposal tracker crm quotes leads',
    tabs: [
      { key: 'proposals', label: 'Proposals', icon: List, access: '/tracker', hint: 'Every quote, newest first', keywords: 'tracker quotes follow up reminder status revise contract' },
      { key: 'pipeline',  label: 'Pipeline',  icon: Columns3, access: '/tracker', hint: 'Board by status', keywords: 'kanban board stages' },
      { key: 'clients',   label: 'Clients',   icon: Users, access: '/clients', hint: 'One row per customer', keywords: 'customers contacts people' },
      { key: 'opens',     label: 'Opens',     icon: Eye, access: '/tracker', hint: 'When customers open proposals', keywords: 'activity views tracking opened' },
    ] },

  // Contracts get their own place: sales prepares and sends them, managers and
  // project managers track signatures — everyone finds them in one spot.
  { key: 'contracts', to: '/contracts', label: 'Contracts', icon: FileSignature,
    hint: 'Prepare, send and track signatures', keywords: 'sign signature agreement contract',
    tabs: [
      { key: 'all', label: 'Contracts', icon: FileSignature, access: '/contracts', hint: 'Every contract and its signing status', keywords: 'sign signature agreement' },
    ] },

  { key: 'projects', to: '/projects', label: 'Projects', icon: HardHat,
    hint: 'Jobs, the schedule and crews', keywords: 'operations work won',
    tabs: [
      { key: 'jobs',       label: 'Jobs',       icon: Hammer, access: '/jobs', hint: 'Stages, change orders, logs, warranty', keywords: 'job management stages change order daily log warranty costs receipts payment close out' },
      { key: 'calendar',   label: 'Calendar',   icon: CalendarDays, access: '/scheduler', hint: 'Start dates, milestones, planned work', keywords: 'schedule scheduler dates planner milestones' },
      { key: 'crews',      label: 'Subcontractors', icon: Wrench, access: '/subs', hint: 'Subs, insurance and incidents', keywords: 'subs crews coi insurance trades' },
      { key: 'checklists', label: 'Checklists', icon: ClipboardCheck, access: '/checklists', hint: 'Shared team checklists', keywords: 'punch list todo tasks' },
    ] },

  { key: 'insights', to: '/insights', label: 'Insights', icon: ChartColumn,
    hint: 'Revenue, win rate, profit and spend', keywords: 'reports analytics numbers metrics',
    tabs: [
      { key: 'overview', label: 'Overview',   icon: TrendingUp, access: '/analytics', hint: 'Revenue trend, win rate, project types, map', keywords: 'analytics revenue seasonality heat map past jobs' },
      { key: 'winloss',  label: 'Win / loss', icon: Target, access: ['/analytics', '/tracker'], hint: 'Pipeline by status, reasons, days to close', keywords: 'reasons funnel close rate' },
      { key: 'profit',   label: 'Profit',     icon: Calculator, access: '/profitability', hint: 'Actual job costs and margins', keywords: 'profitability margin job costs' },
      { key: 'expenses', label: 'Expenses',   icon: Wallet, access: '/finance', hint: 'Card spend and statements', keywords: 'finance cards statement spend' },
    ] },

  { key: 'catalog', to: '/catalog', label: 'Catalog', icon: Package,
    hint: 'Prices, builder rates and imports', keywords: 'pricing items price list',
    tabs: [
      { key: 'items',     label: 'Items',         icon: List, access: '/catalog', hint: 'Every priced item', keywords: 'item catalog prices categories' },
      { key: 'rates',     label: 'Builder rates', icon: Calculator, access: '/catalog', hint: 'Deck and porch builder pricing', keywords: 'tools formulas deck porch rates lock' },
      { key: 'import',    label: 'Import',        icon: Upload, access: '/analyze', hint: 'Pull prices from estimates or spreadsheets', keywords: 'analyze estimate spreadsheet excel csv pdf' },
      { key: 'assistant', label: 'AI edit',       icon: Sparkles, access: '/ai', hint: 'Bulk-edit prices in plain English', keywords: 'ai assistant chat bulk' },
    ] },
]

// Old page → new place
export const LEGACY_REDIRECTS = {
  '/tracker':       '/sales?tab=proposals',
  '/pipeline':      '/sales?tab=pipeline',
  '/clients':       '/sales?tab=clients',
  '/jobs':          '/projects?tab=jobs',
  '/scheduler':     '/projects?tab=calendar',
  '/subs':          '/projects?tab=crews',
  '/checklists':    '/projects?tab=checklists',
  '/analytics':     '/insights?tab=overview',
  '/profitability': '/insights?tab=profit',
  '/finance':       '/insights?tab=expenses',
  '/analyze':       '/catalog?tab=import',
  '/ai':            '/catalog?tab=assistant',
}

const asList = (a) => (Array.isArray(a) ? a : [a])

export function makeAccess(plan, role) {
  return (paths) => asList(paths).every(p => canAccessRoute(plan, p) && canRoleAccess(role, p))
}

// Destinations (with only their allowed tabs) for the signed-in role and plan.
export function visibleDestinations(plan, role) {
  const can = makeAccess(plan, role)
  const out = []
  for (const d of DESTINATIONS) {
    if (d.tabs) {
      const tabs = d.tabs.filter(t => can(t.access))
      if (tabs.length) out.push({ ...d, tabs })
    } else if (can(d.access)) {
      out.push(d)
    }
  }
  return out
}

export function useNav() {
  const plan = useStore(s => s.branding?.plan || 'enterprise')
  const role = useStore(s => s.role || 'manager')
  return useMemo(() => {
    const destinations = visibleDestinations(plan, role)
    const can = makeAccess(plan, role)
    const tabsOf = (key) => destinations.find(d => d.key === key)?.tabs || []
    return { plan, role, can, destinations, tabsOf }
  }, [plan, role])
}
