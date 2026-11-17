// ── Money › Jobs ─────────────────────────────────────────────────────────────
// Each job's money, from the Money side: the same Summary and Money tab (budget,
// costs, price list, invoices / POs / bills) a job has in Projects, one tap
// away. Each row: the job, and (for the office) its revenue, cost and profit,
// the same numbers as Projects and Insights › Profit (lib/jobCost.js).
// /money?tab=jobs&job=<id> opens that job.
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useStore, contractNumberFor } from '../../store'
import { useNav, useJobMoney } from '../../nav'
import { isJob } from '../../lib/attention'
import { booksIndex, jobMoneyFromIndex, money0 } from '../../lib/books'
import { useJobCostOf } from '../../lib/jobCost'
import { QuickPicks, SearchLine } from '../../components/FilterBar'
import { JobMoneyTab } from '../Jobs'

const PAGE = 50
const isClosed = (p) => (p.jobData?.completedStages || []).includes('closed')
const when = (p) => p.jobData?.startDate || p.closedAt || p.createdAt || ''

export default function MoneyJobs() {
  const proposals = useStore(s => s.proposals)
  const invoices  = useStore(s => s.invoices)
  const purchases = useStore(s => s.purchases)
  const bills     = useStore(s => s.bills)
  const expenses  = useStore(s => s.expenses)
  const { tabsOf } = useNav()
  // Revenue, cost and profit: the office (the books are theirs)
  const books = useJobMoney() && tabsOf('money').some(t => ['invoices', 'bills', 'purchases'].includes(t.key))
  const costOf = useJobCostOf()
  const idx = useMemo(() => (books ? booksIndex({ invoices, purchases, bills }) : null), [books, invoices, purchases, bills])
  const [params] = useSearchParams()
  const focusId = params.get('job')
  const [open, setOpen] = useState(focusId)
  const [show, setShow] = useState('active')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const jobs = useMemo(() => proposals.filter(isJob), [proposals])
  const counts = { active: jobs.filter(p => !isClosed(p)).length, closed: jobs.filter(isClosed).length, all: jobs.length }
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return jobs.filter(p => {
      if (focusId && String(p.id) === focusId) return true
      if (show === 'active' && isClosed(p)) return false
      if (show === 'closed' && !isClosed(p)) return false
      if (s && ![p.client, p.address, p.contractDraft?.contractNum || contractNumberFor(p.id)].some(v => String(v || '').toLowerCase().includes(s))) return false
      return true
    }).sort((a, b) => (focusId ? (String(b.id) === focusId) - (String(a.id) === focusId) : 0) || String(when(b)).localeCompare(String(when(a))))
  }, [jobs, show, q, focusId])

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center gap-x-5 gap-y-1 flex-wrap border-b border-gray-200">
        <SearchLine value={q} onChange={v => { setQ(v); setLimit(PAGE) }} placeholder="Search name or contract #" />
        <QuickPicks value={show} onChange={v => { setShow(v); setLimit(PAGE) }} options={[
          { value: 'active', label: 'Active', count: counts.active },
          { value: 'closed', label: 'Closed', count: counts.closed },
          { value: 'all', label: 'All', count: counts.all },
        ]} />
      </div>

      {shown.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-500">No jobs match.</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm divide-y divide-gray-200">
          {shown.slice(0, limit).map(p => {
            const m = idx ? { ...jobMoneyFromIndex(p, idx), fin: costOf(p) } : null
            const isOpen = String(open) === String(p.id)
            const contractNum = p.contractDraft?.contractNum || contractNumberFor(p.id)
            const cost = m?.fin.hasCosts ? money0(m.fin.actualCost) : '—'
            const profit = m?.fin.hasCosts ? money0(m.fin.profit) : '—'
            const loss = m?.fin.hasCosts && m.fin.profit < 0
            return (
              <div key={p.id}>
                <button onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen}
                  className="w-full flex items-center gap-3 sm:gap-6 px-4 py-3 text-left hover:bg-gray-50">
                  {isOpen ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{p.client || 'Unnamed job'}</p>
                    <p className="text-sm text-gray-500 truncate">{[p.address, contractNum].filter(Boolean).join(' · ')}</p>
                    {m && <p className="sm:hidden text-xs text-gray-500 mt-0.5">Cost {cost} · Profit <span className={loss ? 'text-red-600' : ''}>{profit}</span></p>}
                  </div>
                  {m ? (
                    <>
                      <div className="w-24 sm:w-28 shrink-0 text-right">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400">Revenue</p>
                        <p className="text-sm font-semibold text-gray-900">{money0(m.revenue)}</p>
                      </div>
                      <div className="hidden sm:block w-28 shrink-0 text-right">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400">Cost</p>
                        <p className="text-sm font-semibold text-gray-900">{cost}</p>
                      </div>
                      <div className="hidden sm:block w-28 shrink-0 text-right">
                        <p className="text-[10px] uppercase tracking-wider text-gray-400">Profit</p>
                        <p className={`text-sm font-semibold ${loss ? 'text-red-600' : 'text-gray-900'}`}>{profit}</p>
                      </div>
                    </>
                  ) : null}
                </button>
                {isOpen && (
                  <div className="px-4 pb-5 pt-1 space-y-3">
                    <JobMoneyTab proposal={p} books={books} withSummary costCount={(expenses || []).filter(e => e.jobId === p.id).length} />
                    <Link to={`/projects?tab=jobs&job=${encodeURIComponent(p.id)}`} className="inline-block text-sm font-medium text-[var(--brand-700)] hover:underline">Open the job in Projects ›</Link>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {shown.length > limit && (
        <button onClick={() => setLimit(l => l + PAGE)} className="w-full py-3 text-sm font-medium text-[var(--brand-700)]">Show more ({shown.length - limit} more)</button>
      )}
    </div>
  )
}
