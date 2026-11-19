// ── The tabbed destinations ──────────────────────────────────────────────────
// Each destination groups pages that belong to one job-to-be-done. The pages
// themselves are unchanged; the destination decides which one is on screen,
// counts what needs attention in each tab, and offers the one primary action.
import { useMemo } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import Hub from '../../components/Hub'
import { useNav } from '../../nav'
import { useStore } from '../../store'
import { nextReminderDate, isJobClosed, isJob } from '../../lib/attention'

import ProposalTracker from '../ProposalTracker'
import Jobs from '../Jobs'
import InspectionBoard from '../InspectionBoard'
import { permitTracked, boardCells } from '../../lib/permitTracking'
import ContractsList from '../ContractsList'
import PMCalendar from '../PMCalendar'
import Checklists from '../Checklists'
import Analytics from '../Analytics'
import ProfitabilityTracker from '../ProfitabilityTracker'
import Finance from '../Finance'
import ItemCatalog from '../ItemCatalog'
import Analyze from '../Analyze'
import Designs from '../Designs'
import Leads from '../Leads'
import Invoices from '../books/Invoices'
import Bills from '../books/Bills'
import Purchases from '../books/Purchases'
import Vendors from '../books/Vendors'
import MoneyJobs from '../books/MoneyJobs'
import ChangeOrdersAll from '../books/ChangeOrdersAll'
import { invoiceStatus, billStatus, jobIndex } from '../../lib/books'
import { useJobCostOf } from '../../lib/jobCost'


const withRender = (tabs, renderers, counts = {}) =>
  tabs.map(t => ({ ...t, render: renderers[t.key] || (() => null), ...(counts[t.key] || {}) }))

// ── Sales ────────────────────────────────────────────────────────────────────
export function SalesHub() {
  const { tabsOf, can } = useNav()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const proposals = useStore(s => s.proposals)
  const status = params.get('status') || undefined
  const q = params.get('q') || ''

  const dueCount = useMemo(() => proposals.reduce((n, p) =>
    n + (p.reminders || []).filter(r => { const d = nextReminderDate(r); return d && new Date(d + 'T00:00:00') <= new Date() }).length, 0), [proposals])

  const tabs = withRender(tabsOf('sales'), {
    proposals: () => <ProposalTracker view="list" initialStatus={status} initialQuery={q} initialOpens={params.get('opens') === '1'} />,
    pipeline:  () => <ProposalTracker view="pipeline" initialStatus={status} />,
    designs:   () => <Designs />,
    leads:     () => <Leads />,
    contracts: () => <ContractsList initialFilter={params.get('filter') || undefined} />,
  }, {
    proposals: { count: dueCount, countTone: 'alert' },
    // Free-form editor: draw decks, stair runs and landings anywhere, with live 3D
    designs: { action: (
      <a href="/design-editor.html" target="_blank" rel="noopener"
        className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-800 bg-white border border-gray-300 hover:bg-gray-50 whitespace-nowrap">Design editor</a>
    ) },
  })

  // Clients and Opens now live inside Proposals (search box, Opens switch)
  const old = params.get('tab')
  if (old === 'clients') return <Navigate to={`/sales?tab=proposals${q ? `&q=${encodeURIComponent(q)}` : ''}`} replace />
  if (old === 'opens') return <Navigate to="/sales?tab=proposals&opens=1" replace />
  return <Hub layout="views" title="Sales" tabs={tabs} rememberKey="sales" actions={can('/quote') && (
    <button onClick={() => navigate('/quote')} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--brand-600)] hover:bg-[var(--brand-700)]">+ New quote</button>
  )} />
}

// ── Projects ─────────────────────────────────────────────────────────────────
export function ProjectsHub() {
  const { tabsOf } = useNav()
  const [params] = useSearchParams()
  const proposals = useStore(s => s.proposals)
  const counts = useMemo(() => {
    const won = proposals.filter(p => p.status === 'Won')
    const open = won.filter(p => !isJobClosed(p))
    return {
      jobs:      { count: proposals.filter(p => isJob(p) && !isJobClosed(p)).length },
      inspections: { count: proposals.filter(p => isJob(p) && permitTracked(p) && Object.values(boardCells(p)).some(c => c.state === 'fail')).length, countTone: 'alert' },
      calendar:  { count: open.filter(p => !p.jobData?.startDate).length, countTone: 'alert' },
    }
  }, [proposals])

  const tabs = withRender(tabsOf('projects'), {
    jobs:       () => <Jobs />,
    changeorders: () => <ChangeOrdersAll />,
    inspections: () => <InspectionBoard />,
    calendar:   () => <PMCalendar />,
    checklists: () => <Checklists />,
  }, counts)

  // Subcontractors moved to Money › Vendors
  if (params.get('tab') === 'crews') return <Navigate to="/money?tab=vendors" replace />
  // Contracts used to be a tab here — they live in Sales now
  if (params.get('tab') === 'contracts') {
    const filter = params.get('filter')
    return <Navigate to={`/sales?tab=contracts${filter ? `&filter=${encodeURIComponent(filter)}` : ''}`} replace />
  }
  return <Hub title="Projects" tabs={tabs} rememberKey="projects" />
}

// ── Insights ─────────────────────────────────────────────────────────────────
export function InsightsHub() {
  const { tabsOf } = useNav()
  const proposals = useStore(s => s.proposals)
  const costOf    = useJobCostOf()
  // Finished jobs still missing their actual costs (same rule as Home)
  const pendingCosts = useMemo(() => proposals.filter(p => p.status === 'Won' && isJobClosed(p) && !costOf(p).hasCosts).length, [proposals, costOf])

  const tabs = withRender(tabsOf('insights'), {
    overview: () => <Analytics />,
    winloss:  () => <ProposalTracker view="analytics" />,
    profit:   () => <ProfitabilityTracker />,
    expenses: () => <Finance />,
  }, { profit: { count: pendingCosts } })

  return <Hub layout="views" title="Insights" tabs={tabs} rememberKey="insights" />
}

// ── Money ────────────────────────────────────────────────────────────────────
export function MoneyHub() {
  const { tabsOf } = useNav()
  const proposals = useStore(s => s.proposals)
  const invoices  = useStore(s => s.invoices)
  const bills     = useStore(s => s.bills)
  const subDraws  = useStore(s => s.subDraws)
  const counts = useMemo(() => {
    const byId = jobIndex(proposals)
    return {
      invoices: { count: invoices.filter(i => invoiceStatus(i, byId.get(String(i.jobId))) === 'overdue').length, countTone: 'alert' },
      // Overdue bills, plus sub invoices waiting for the office to review.
      bills:    { count: bills.filter(b => billStatus(b) === 'overdue').length + (subDraws || []).filter(d => d?.status === 'submitted').length, countTone: 'alert' },
    }
  }, [proposals, invoices, bills, subDraws])
  const tabs = withRender(tabsOf('money'), {
    invoices:  () => <Invoices />,
    bills:     () => <Bills />,
    purchases: () => <Purchases />,
    vendors:   () => <Vendors />,
    jobs:      () => <MoneyJobs />,
  }, counts)
  const booksMissing = useStore(s => s.booksMissing)
  return (
    <>
      {booksMissing && (
        <div role="alert" className="bg-red-600 text-white text-sm px-4 py-2 text-center">
          The database isn't set up for invoices, bills, purchases and vendors yet (supabase/books.sql) — anything entered here won't be saved.
        </div>
      )}
      {/* A vertical toolbar (like Knowify's icon bar) instead of tabs, so the
          office finds each page where it used to be. */}
      <Hub layout="rail" title="Money" tabs={tabs} rememberKey="money" />
    </>
  )
}

// ── Catalog ──────────────────────────────────────────────────────────────────
export function CatalogHub() {
  const { tabsOf, can } = useNav()
  const [params] = useSearchParams()
  const tabs = withRender(tabsOf('catalog'), {
    items:     () => <ItemCatalog mode="catalog" />,
    rates:     () => <ItemCatalog mode="formulas" />,
    import:    () => <Analyze initialTab={params.get('mode') || 'analyze'} allowAi={can('/ai')} />,
  })
  // AI edit used to be its own tab
  if (params.get('tab') === 'assistant') return <Navigate to="/catalog?tab=import&mode=ai" replace />
  return <Hub layout="views" title="Catalog" tabs={tabs} rememberKey="catalog" />
}
