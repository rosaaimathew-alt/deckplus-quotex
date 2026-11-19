// ── Office manager home ──────────────────────────────────────────────────────
// The office's start page: jump straight into the day-to-day screens, see
// what's overdue, and the contract-jobs overview. Shown to Office logins
// (and to anyone at /?home=office).
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useStore } from '../store'
import { useNav } from '../nav'
import { officeOverview, money, allVendors, vendorDocProblems } from '../lib/books'
import PermitDesk from '../components/PermitDesk'
import { usePermitDesk } from '../lib/permitDesk'

// Text only, no icons (the owner's call).
function Tile({ label, note, tone = 'amber', onClick }) {
  return (
    <button onClick={onClick} className="w-full text-left bg-white rounded-xl border border-gray-200 px-4 py-3.5 hover:border-[var(--brand-300)] hover:shadow-sm transition-all">
      <span className="block text-[15px] font-semibold text-gray-900">{label}</span>
      {note && <span className="flex items-center gap-1.5 text-xs text-gray-500 mt-1"><span className={`w-1.5 h-1.5 rounded-full ${tone === 'red' ? 'bg-red-500' : 'bg-amber-500'}`} />{note}</span>}
    </button>
  )
}

// permits: the permitting version (picked per person in Settings › Team):
// permits and inspections first, then the jump-in tiles led by Permitting.
export default function OfficeHome({ permits = false }) {
  const navigate = useNavigate()
  const { can, tabsOf } = useNav()
  const me = useStore(s => s.me)
  const branding = useStore(s => s.branding)
  const proposals = useStore(s => s.proposals)
  const invoices = useStore(s => s.invoices)
  const purchases = useStore(s => s.purchases)
  const bills = useStore(s => s.bills)
  const vendors = useStore(s => s.vendors)
  const subs = useStore(s => s.subcontractors)

  const o = useMemo(() => officeOverview({ proposals, invoices, purchases, bills }), [proposals, invoices, purchases, bills])
  const paperwork = useMemo(() => allVendors(vendors || [], subs || []).filter(v => v.active && vendorDocProblems(v).length).length, [vendors, subs])
  const pendingCos = useMemo(() => proposals.reduce((n, p) => n + (p.jobData?.changeOrders || []).filter(c => c.status === 'Pending' || c.status === 'Sent for Signature').length, 0), [proposals])
  const first = (me?.displayName || '').split(' ')[0] || 'there'
  // Each Money tab can be switched off per person (Settings › Team › Access).
  const mt = new Set(tabsOf('money').map(t => t.key))
  const books = mt.size > 0
  const desk = usePermitDesk()
  const inspections = tabsOf('projects').some(t => t.key === 'inspections')

  const permitting = { title: 'Permitting', tiles: [
    inspections && { label: 'Inspections', note: [desk.scheduled && `${desk.scheduled} this week`, desk.failed && `${desk.failed} failed`].filter(Boolean).join(' · '), tone: desk.failed ? 'red' : 'amber', to: '/projects?tab=inspections' },
    can('/jobs') && { label: 'Permits', note: [desk.waiting && `${desk.waiting} waiting`, desk.notSubmitted && `${desk.notSubmitted} not submitted`].filter(Boolean).join(' · '), to: '/projects?tab=jobs' },
  ] }
  const sections = [
    ...(permits ? [permitting] : []),
    { title: 'Core', tiles: [
      can('/jobs') && { label: 'Contract jobs', note: o.activeJobs ? `${o.activeJobs} active` : '', to: '/projects?tab=jobs' },
      can('/contracts') && { label: 'Contracts', to: '/sales?tab=contracts' },
    ] },
    { title: 'Transactions', tiles: [
      mt.has('purchases') && { label: 'Purchases', note: o.openPos ? `${o.openPos} open POs` : '', to: '/money?tab=purchases' },
      mt.has('bills') && { label: 'Bills', note: o.overdueBills ? `${o.overdueBills} overdue` : '', tone: 'red', to: '/money?tab=bills' },
      mt.has('invoices') && { label: 'Invoices', note: o.overdueInvoices ? `${o.overdueInvoices} overdue` : '', tone: 'red', to: '/money?tab=invoices' },
    ] },
    { title: 'Activity', tiles: [
      can('/scheduler') && { label: 'Scheduling', to: '/projects?tab=calendar' },
      tabsOf('projects').some(t => t.key === 'changeorders') && { label: 'Change orders', note: pendingCos ? `${pendingCos} waiting on signature` : '', to: '/projects?tab=changeorders' },
      can('/checklists') && { label: 'Tasks', to: '/projects?tab=checklists' },
    ] },
    { title: 'Insights', tiles: [
      can('/analytics') && { label: 'Dashboard', to: '/insights?tab=overview' },
      can('/profitability') && { label: 'Job profit', to: '/insights?tab=profit' },
    ] },
    { title: 'Company', tiles: [
      can('/tracker') && { label: 'Clients', to: '/sales?tab=proposals' },
      mt.has('vendors') && { label: 'Vendors', note: paperwork ? `${paperwork} paperwork problem${paperwork === 1 ? '' : 's'}` : '', tone: 'red', to: '/money?tab=vendors' },
      can('/catalog') && { label: 'Catalog', to: '/catalog?tab=items' },
    ] },
  ].map(s => ({ ...s, tiles: s.tiles.filter(Boolean) })).filter(s => s.tiles.length)
    // Five columns: the permitting page drops Insights for its Permitting group
    .filter(s => !permits || s.title !== 'Insights').slice(0, 5)

  const alerts = [
    mt.has('invoices') && o.overdueInvoices && { label: `${o.overdueInvoices} overdue invoice${o.overdueInvoices === 1 ? '' : 's'}`, to: '/money?tab=invoices' },
    mt.has('bills') && o.overdueBills && { label: `${o.overdueBills} overdue bill${o.overdueBills === 1 ? '' : 's'}`, to: '/money?tab=bills' },
    mt.has('vendors') && paperwork && { label: `${paperwork} vendor${paperwork === 1 ? '' : 's'} with expired or missing GL / WC / W-9`, to: '/money?tab=vendors' },
  ].filter(Boolean)

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-7">
      <div>
        <p className="text-sm text-gray-500">Home{branding?.companyName ? ` | ${branding.companyName}` : ''}</p>
        <h1 className="qx-greeting text-2xl sm:text-3xl font-bold text-gray-900">Welcome, <span className="text-[var(--brand-600)]">{first}</span></h1>
      </div>

      {permits && <PermitDesk />}

      <div>
        <p className="text-sm font-semibold text-gray-800 mb-3">Jump right into</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-x-5 gap-y-5">
          {sections.map(s => (
            <div key={s.title} className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">{s.title}</p>
              {s.tiles.map(t => <Tile key={t.label} label={t.label} note={t.note} tone={t.tone} onClick={() => navigate(t.to)} />)}
            </div>
          ))}
        </div>
      </div>

      {!permits && <div className="grid lg:grid-cols-2 gap-5">
        {books && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-gray-900">Contract jobs overview</p>
              <button onClick={() => navigate('/projects?tab=jobs')} className="text-sm text-[var(--brand-700)] hover:underline">View jobs</button>
            </div>
            <div className="grid grid-cols-2 gap-y-6">
              <div><p className="text-2xl font-bold text-gray-900">{o.activeJobs}</p><p className="text-sm text-gray-600">Active</p></div>
              <div className="text-right"><p className="text-2xl font-bold text-gray-900">{money(o.unbilled)}</p><p className="text-sm text-gray-600"><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5" />Unbilled value</p></div>
              <div><p className="text-2xl font-bold text-gray-900">{o.bidsAndCos}</p><p className="text-sm text-gray-600">Bids & pending change orders</p></div>
              <div className="text-right"><p className="text-2xl font-bold text-gray-900">{money(o.opportunity)}</p><p className="text-sm text-gray-600"><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5" />Opportunity value</p></div>
            </div>
          </div>
        )}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="font-semibold text-gray-900 mb-3">Needs attention</p>
          {alerts.length === 0 ? <p className="text-sm text-gray-400">Nothing overdue. Nice.</p> : (
            <div className="space-y-1.5">
              {alerts.map(a => (
                <button key={a.label} onClick={() => navigate(a.to)} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-red-50 hover:bg-red-100 text-left text-sm text-red-800">
                  <span className="flex-1">{a.label}</span><ChevronRight size={15} />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>}
    </div>
  )
}
