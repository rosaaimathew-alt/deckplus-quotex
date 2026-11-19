// ── Permitting at a glance ───────────────────────────────────────────────────
// The top of the permitting Today page (OfficeHome permits): how many permits
// are waiting on the county or HOA, which aren't submitted yet, this week's
// inspections and anything failed or about to expire. Read from each job's
// steps and permit records (lib/permitTracking.js), the same data as the job's
// Permits tab and Projects › Inspections.
import { useNavigate } from 'react-router-dom'
import { usePermitDesk } from '../lib/permitDesk'
import StatCard from './StatCard'

const short = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—')
const weekday = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const TAG = {
  'Not submitted': 'bg-gray-100 text-gray-700', Submitted: 'bg-blue-50 text-blue-800', Approved: 'bg-emerald-50 text-emerald-800',
  Scheduled: 'bg-[var(--brand-50)] text-[var(--brand-800)]', 'Failed · re-inspect': 'bg-red-50 text-red-800', 'Not scheduled': 'bg-amber-50 text-amber-800',
}
const Tag = ({ t }) => <span className={`inline-block text-xs font-semibold rounded px-2 py-0.5 whitespace-nowrap ${TAG[t] || 'bg-gray-100 text-gray-700'}`}>{t}</span>

function Head({ title, link, to }) {
  const navigate = useNavigate()
  return (
    <div className="flex items-baseline mb-2">
      <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
      {link && <button onClick={() => navigate(to)} className="ml-auto text-sm text-[var(--brand-700)] hover:underline">{link}</button>}
    </div>
  )
}

export default function PermitDesk() {
  const navigate = useNavigate()
  const d = usePermitDesk()
  const openJob = (id) => navigate(`/projects?tab=jobs&job=${id}`)
  const th = 'px-4 py-2.5 text-xs font-semibold text-gray-500 text-left whitespace-nowrap'
  const td = 'px-4 py-2.5 whitespace-nowrap'

  const alerts = [
    ...d.inspections.filter(i => i.status !== 'Scheduled').map(i => ({ tone: 'bg-red-500', title: `Re-inspect ${i.what.toLowerCase()} · ${i.name}`, sub: i.date ? `Failed ${short(i.date)}` : 'Failed', id: i.id, cta: 'Open job' })),
    ...d.expiring.map(x => ({ tone: x.days < 0 ? 'bg-red-500' : 'bg-amber-500', title: `Permit ${x.days < 0 ? 'expired' : `expires in ${x.days} day${x.days === 1 ? '' : 's'}`} · ${x.name}`, sub: `Expires ${short(x.date)}`, id: x.id, cta: 'Open job' })),
    ...d.permits.filter(x => x.status === 'Submitted' && x.days >= 14).map(x => ({ tone: 'bg-amber-500', title: `${x.permit} waiting ${x.days} days · ${x.name}`, sub: `${x.where} · submitted ${short(x.submitted)}`, id: x.id, cta: 'Open job' })),
    // One line per job for what's not submitted yet
    ...Object.values(d.permits.filter(x => x.status === 'Not submitted').reduce((m, x) => {
      (m[x.id] ||= { id: x.id, name: x.name, where: x.where, list: [] }).list.push(x.permit)
      return m
    }, {})).map(j => ({ tone: 'bg-[var(--brand-500)]', title: `Submit ${j.list.length === 1 ? j.list[0] : 'permits'} · ${j.name}`, sub: `${j.list.length > 1 ? `${j.list.join(', ')} · ` : ''}${j.where}`, id: j.id, cta: 'Open job' })),
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Permits waiting" value={d.waiting} sub={d.waiting ? `longest ${d.longest} day${d.longest === 1 ? '' : 's'} in review` : 'none in review'} onClick={() => navigate('/projects?tab=jobs')} />
        <StatCard label="Not submitted" value={d.notSubmitted} sub="on open jobs" tone={d.notSubmitted ? 'text-amber-700' : 'text-gray-900'} onClick={() => navigate('/projects?tab=jobs')} />
        <StatCard label="Inspections this week" value={d.scheduled} sub={d.failed ? `${d.failed} failed · re-inspect` : 'none failed'} onClick={() => navigate('/projects?tab=inspections')} />
        <StatCard label="Expiring in 30 days" value={d.expiring.length} sub="permits" tone={d.expiring.length ? 'text-red-700' : 'text-gray-900'} onClick={() => navigate('/projects?tab=jobs')} />
      </div>

      <section>
        <Head title="Permits in progress" link="Open jobs" to="/projects?tab=jobs" />
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          {d.permits.length === 0 ? <p className="px-4 py-6 text-sm text-gray-400">No permits waiting.</p> : (
            <table className="w-full text-sm tabular-nums">
              <thead><tr className="bg-gray-50 border-b border-gray-200"><th className={th}>Job</th><th className={th}>Permit</th><th className={th}>County / HOA</th><th className={th}>Submitted</th><th className={`${th} text-right`}>Days</th><th className={th}>Status</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {d.permits.map((x, i) => (
                  <tr key={i} onClick={() => openJob(x.id)} className="cursor-pointer hover:bg-gray-50">
                    <td className={`${td} font-semibold text-gray-900`}>{x.name}</td><td className={td}>{x.permit}</td><td className={td}>{x.where}</td>
                    <td className={td}>{short(x.submitted)}</td><td className={`${td} text-right`}>{x.days ?? '—'}</td>
                    <td className={td}><Tag t={x.status} />{x.status === 'Approved' && x.approved ? <span className="ml-2 text-xs text-gray-500">{short(x.approved)}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <section>
          <Head title="Inspections this week" link="Open inspections" to="/projects?tab=inspections" />
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            {d.inspections.length === 0 ? <p className="px-4 py-6 text-sm text-gray-400">Nothing scheduled this week.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="bg-gray-50 border-b border-gray-200"><th className={th}>Job</th><th className={th}>Inspection</th><th className={th}>Date</th><th className={th}>Result</th></tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {d.inspections.map((x, i) => (
                    <tr key={i} onClick={() => openJob(x.id)} className="cursor-pointer hover:bg-gray-50">
                      <td className={`${td} font-semibold text-gray-900`}>{x.name}</td><td className={td}>{x.what}</td><td className={td}>{x.date ? weekday(x.date) : '—'}</td><td className={td}><Tag t={x.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
        <section>
          <Head title="Needs attention" />
          <div className="bg-white rounded-xl border border-gray-200">
            {alerts.length === 0 ? <p className="px-4 py-6 text-sm text-gray-400">Nothing waiting on you.</p> : (
              <ul className="divide-y divide-gray-100">
                {alerts.slice(0, 8).map((a, i) => (
                  <li key={i}>
                    <button onClick={() => openJob(a.id)} className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${a.tone}`} />
                      <span className="flex-1 min-w-0"><span className="block text-sm font-medium text-gray-900">{a.title}</span><span className="block text-xs text-gray-500 truncate">{a.sub}</span></span>
                      <span className="text-xs font-medium text-[var(--brand-700)] shrink-0">{a.cta}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
