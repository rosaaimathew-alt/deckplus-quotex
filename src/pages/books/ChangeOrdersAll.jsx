// ── Change orders, every job (Projects › Change orders) ─────────────────────
// Read across all jobs; a row opens its job (where change orders are built,
// sent for signature and edited).
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../../store'
import { allChangeOrders, money, todayISO, downloadCsv, jobLabel } from '../../lib/books'
import { SearchBox, DateRange, ExportButton, usePaged, Th, sortRows, Empty } from './ui'

const CO_STYLE = {
  Approved: 'bg-gray-500 text-white', Pending: 'bg-amber-100 text-amber-800', 'Sent for Signature': 'bg-blue-100 text-blue-700',
  Draft: 'bg-gray-100 text-gray-600', Rejected: 'bg-red-100 text-red-700',
}
const fmtDay = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : '—')

export default function ChangeOrdersAll() {
  const proposals = useStore(s => s.proposals)
  const navigate = useNavigate()
  const all = useMemo(() => allChangeOrders(proposals), [proposals])
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [range, setRange] = useState({ from: '', to: '' })
  const [sort, setSort] = useState({ key: 'updated', dir: 'desc' })

  const statuses = useMemo(() => ['all', ...new Set(all.map(c => c.status || 'Draft'))], [all])
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const out = all.filter(c => {
      if (status !== 'all' && (c.status || 'Draft') !== status) return false
      const d = String(c.updated || '').slice(0, 10)
      if (range.from && d < range.from) return false
      if (range.to && d > range.to) return false
      if (s && ![c.description, c.coNumber, c.job?.client, c.job?.address].some(v => String(v || '').toLowerCase().includes(s))) return false
      return true
    })
    return sortRows(out, sort, { updated: c => c.updated || '', value: c => Number(c.amount) || 0, number: c => String(c.coNumber || ''), job: c => c.job?.client || '' })
  }, [all, q, status, range, sort])
  const { slice, pager } = usePaged(shown)
  const approvedTotal = shown.filter(c => c.status === 'Approved').reduce((s, c) => s + (Number(c.amount) || 0), 0)

  const exportCsv = () => downloadCsv(`change-orders-${todayISO()}.csv`, [
    ['Job', c => c.job?.client], ['Change order', c => c.description], ['Status', c => c.status], ['CO #', c => c.coNumber],
    ['Value', c => (Number(c.amount) || 0).toFixed(2)], ['Last updated', c => String(c.updated || '').slice(0, 10)],
  ], shown)

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search job or change order" />
        <select value={status} onChange={e => setStatus(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-2.5 py-2 bg-white" aria-label="Status">
          {statuses.map(s => <option key={s} value={s}>{s === 'all' ? 'All statuses' : s}</option>)}
        </select>
        <DateRange from={range.from} to={range.to} label="Updated" onChange={(from, to) => setRange({ from, to })} />
        <div className="flex-1" />
        <ExportButton onClick={exportCsv} />
      </div>
      {shown.length > 0 && <p className="text-xs text-gray-500">{shown.length} change order{shown.length === 1 ? '' : 's'} · approved {money(approvedTotal)}</p>}
      {shown.length === 0 ? <Empty>{all.length ? 'No change orders match.' : 'No change orders yet. They’re created on a job (Jobs › Change Orders).'}</Empty> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="border-b border-gray-200 text-left">
              <tr>
                <Th sortKey="job" sort={sort} setSort={setSort}>Project | change order</Th>
                <Th>Status</Th>
                <Th sortKey="number" sort={sort} setSort={setSort} className="text-center">CO #</Th>
                <Th sortKey="value" sort={sort} setSort={setSort} className="text-right">Value</Th>
                <Th sortKey="updated" sort={sort} setSort={setSort}>Last updated</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {slice.map(c => (
                <tr key={`${c.jobId}-${c.id}`} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/projects?tab=jobs&job=${encodeURIComponent(c.jobId)}`)}>
                  <td className="px-3 py-2.5"><p className="font-medium text-gray-900 truncate max-w-[360px]">{c.description || 'Addendum'}</p><p className="text-xs text-gray-500">{jobLabel(c.job)}</p></td>
                  <td className="px-3 py-2.5"><span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${CO_STYLE[c.status] || CO_STYLE.Draft}`}>{c.status || 'Draft'}</span></td>
                  <td className="px-3 py-2.5 text-center">{c.coNumber || '—'}</td>
                  <td className={`px-3 py-2.5 text-right font-medium ${Number(c.amount) < 0 ? 'text-red-600' : ''}`}>{money(c.amount)}</td>
                  <td className="px-3 py-2.5 text-gray-600">{fmtDay(c.updated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end px-3 py-2 border-t border-gray-100">{pager}</div>
        </div>
      )}
    </div>
  )
}
