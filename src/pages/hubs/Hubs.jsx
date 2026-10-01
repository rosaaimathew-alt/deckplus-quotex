// ── The tabbed destinations ──────────────────────────────────────────────────
// Each destination groups pages that belong to one job-to-be-done. The pages
// themselves are unchanged; the destination decides which one is on screen,
// counts what needs attention in each tab, and offers the one primary action.
import { useMemo } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import Hub from '../../components/Hub'
import { useNav } from '../../nav'
import { useStore } from '../../store'
import { nextReminderDate, isJobClosed } from '../../lib/attention'

import ProposalTracker from '../ProposalTracker'
import ClientList from '../ClientList'
import Jobs from '../Jobs'
import ContractsList from '../ContractsList'
import PMCalendar from '../PMCalendar'
import Subcontractors from '../Subcontractors'
import Checklists from '../Checklists'
import Analytics from '../Analytics'
import ProfitabilityTracker from '../ProfitabilityTracker'
import Finance from '../Finance'
import ItemCatalog from '../ItemCatalog'
import Analyze from '../Analyze'
import AiChat from '../AiChat'

function NewQuoteButton() {
  const navigate = useNavigate()
  const { can } = useNav()
  if (!can('/quote')) return null
  return (
    <button onClick={() => navigate('/quote')}
      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm bg-[var(--brand-600)] hover:bg-[var(--brand-700)] transition-colors">
      <Plus size={15} /> New quote
    </button>
  )
}

const withRender = (tabs, renderers, counts = {}) =>
  tabs.map(t => ({ ...t, render: renderers[t.key] || (() => null), ...(counts[t.key] || {}) }))

// ── Sales ────────────────────────────────────────────────────────────────────
export function SalesHub() {
  const { tabsOf } = useNav()
  const [params] = useSearchParams()
  const proposals = useStore(s => s.proposals)
  const status = params.get('status') || undefined
  const q = params.get('q') || ''

  const dueCount = useMemo(() => proposals.reduce((n, p) =>
    n + (p.reminders || []).filter(r => { const d = nextReminderDate(r); return d && new Date(d + 'T00:00:00') <= new Date() }).length, 0), [proposals])

  const tabs = withRender(tabsOf('sales'), {
    proposals: () => <ProposalTracker view="list" initialStatus={status} />,
    pipeline:  () => <ProposalTracker view="pipeline" initialStatus={status} />,
    clients:   () => <ClientList initialQuery={q} />,
    opens:     () => <ProposalTracker view="activity" />,
  }, { proposals: { count: dueCount, countTone: 'alert' } })

  return <Hub title="Sales" subtitle="Every quote from first draft to signed — and who you sent it to." tabs={tabs} actions={<NewQuoteButton />} rememberKey="sales" />
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
      jobs:      { count: open.length },
      calendar:  { count: open.filter(p => !p.jobData?.startDate).length, countTone: 'alert' },
    }
  }, [proposals])

  const tabs = withRender(tabsOf('projects'), {
    jobs:       () => <Jobs />,
    calendar:   () => <PMCalendar />,
    crews:      () => <Subcontractors />,
    checklists: () => <Checklists />,
  }, counts)

  // Contracts used to be a tab here — send old links to their own page
  if (params.get('tab') === 'contracts') {
    const filter = params.get('filter')
    return <Navigate to={`/contracts${filter ? `?filter=${encodeURIComponent(filter)}` : ''}`} replace />
  }
  return <Hub title="Projects" subtitle="Won work: the build, the schedule and the crews." tabs={tabs} rememberKey="projects" />
}

// ── Contracts ────────────────────────────────────────────────────────────────
// Its own place because both sales and management live in it.
export function ContractsHub() {
  const { tabsOf } = useNav()
  const [params] = useSearchParams()
  const tabs = withRender(tabsOf('contracts'), {
    all: () => <ContractsList initialFilter={params.get('filter') || undefined} />,
  })
  return <Hub title="Contracts" subtitle="Prepare, send and track signatures for every won job." tabs={tabs} />
}

// ── Insights ─────────────────────────────────────────────────────────────────
export function InsightsHub() {
  const { tabsOf } = useNav()
  const proposals = useStore(s => s.proposals)
  const jobCosts  = useStore(s => s.jobCosts)
  // Finished jobs still missing their actual costs (same rule as Home)
  const pendingCosts = useMemo(() => proposals.filter(p => p.status === 'Won' && isJobClosed(p) && !(jobCosts || {})[p.id]).length, [proposals, jobCosts])

  const tabs = withRender(tabsOf('insights'), {
    overview: () => <Analytics />,
    winloss:  () => <ProposalTracker view="analytics" />,
    profit:   () => <ProfitabilityTracker />,
    expenses: () => <Finance />,
  }, { profit: { count: pendingCosts } })

  return <Hub title="Insights" subtitle="How the business is doing — revenue, wins, margins and spend." tabs={tabs} rememberKey="insights" />
}

// ── Catalog ──────────────────────────────────────────────────────────────────
export function CatalogHub() {
  const { tabsOf } = useNav()
  const tabs = withRender(tabsOf('catalog'), {
    items:     () => <ItemCatalog mode="catalog" />,
    rates:     () => <ItemCatalog mode="formulas" />,
    import:    () => <Analyze />,
    assistant: () => <AiChat />,
  })
  return <Hub title="Catalog" subtitle="Your prices and the rates the deck and porch builders use." tabs={tabs} actions={<NewQuoteButton />} rememberKey="catalog" />
}
