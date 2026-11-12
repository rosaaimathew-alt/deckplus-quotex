// ── Sales › Leads: the master lead list (office and admin) ──────────────────
// One row per person, from the website calendar, quotes and Knowify jobs
// (src/lib/leads.js). The office searches a caller's name, phone, email or
// street before booking them, and sees right away if they already booked
// online, already have a quote, or are a past customer.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CalendarDays, FileText, Hammer } from 'lucide-react'
import { useStore } from '../store'
import { supabase, supabaseReady } from '../supabase'
import { useScopedProposals } from '../lib/proposalScope'
import { latestIterations } from '../lib/proposalGroups'
import { buildLeads, matchesLead } from '../lib/leads'
import { openProposal } from '../lib/openProposal'
import { money0 } from '../lib/books'
import { QuickPicks, RepToggle } from '../components/FilterBar'
import StatCard from '../components/StatCard'

const TZ = 'America/New_York'
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' }) : '')
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')
const PAGE = 60

function useBookings() {
  const [state, setState] = useState({ bookings: [], reps: [], loading: supabaseReady, error: '' })
  useEffect(() => {
    if (!supabaseReady) return undefined
    let off = false
    Promise.all([
      supabase.from('rr_bookings')
        .select('id, rep_id, starts_at, created_at, status, lead_name, lead_first_name, lead_last_name, lead_email, lead_phone, address_street, address_city, address_state, address_zip, notes')
        .order('created_at', { ascending: false }).limit(5000),
      supabase.from('rr_reps').select('id, name, email'),
    ]).then(([b, r]) => {
      if (off) return
      setState({ bookings: b.data || [], reps: r.data || [], loading: false, error: b.error ? 'Website bookings could not be loaded.' : '' })
    }).catch(() => { if (!off) setState(s => ({ ...s, loading: false, error: 'Website bookings could not be loaded.' })) })
    return () => { off = true }
  }, [])
  return state
}

const TONE = {
  Booked: 'text-emerald-700', Cancelled: 'text-gray-400', Won: 'text-emerald-700', Lost: 'text-gray-400',
  Knowify: 'text-gray-500', Draft: 'text-gray-400', Archived: 'text-gray-400',
}

function RecordLine({ r, onOpen, leadName }) {
  const Icon = r.kind === 'booking' ? CalendarDays : r.kind === 'job' ? Hammer : FileText
  const what = r.kind === 'booking' ? 'Website booking' : r.kind === 'job' ? 'Knowify job' : 'Quote'
  const detail = r.kind === 'booking'
    ? [r.startsAt && `for ${when(r.startsAt)}`, r.repName && `with ${r.repName}`, r.at && `booked ${day(r.at)}`].filter(Boolean).join(' · ')
    : [r.total ? money0(r.total) : '', r.at && day(r.at), r.name !== leadName && r.name].filter(Boolean).join(' · ')
  const Tag = onOpen ? 'button' : 'div'
  return (
    <Tag type={onOpen ? 'button' : undefined} onClick={onOpen}
      className={`w-full flex items-start gap-2 text-left text-sm py-1 ${onOpen ? 'hover:text-[var(--brand-700)]' : ''}`}>
      <Icon size={14} className="mt-0.5 shrink-0 text-gray-400" />
      <span className="font-medium text-gray-800 shrink-0">{what}</span>
      <span className={`shrink-0 ${TONE[r.status] || 'text-amber-700'}`}>{r.status}</span>
      <span className="text-gray-500 min-w-0 truncate">{detail}</span>
    </Tag>
  )
}

function LeadRow({ lead, onOpen }) {
  const [all, setAll] = useState(false)
  const shown = all ? lead.records : lead.records.slice(0, 4)
  const other = lead.names.filter(n => n.toLowerCase() !== lead.name.toLowerCase())
  return (
    <li className="bg-white rounded-xl border border-gray-200 px-4 py-3">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900">
            {lead.name}
            {other.length > 0 && <span className="ml-2 text-sm font-normal text-gray-400">also {other.slice(0, 2).join(', ')}</span>}
          </p>
          <p className="text-sm text-gray-500 truncate">{[lead.phone, lead.email, lead.address].filter(Boolean).join(' · ')}</p>
        </div>
        {lead.repeat && (
          <span className="text-sm font-semibold text-red-600 whitespace-nowrap">Booked {lead.liveBookings} times</span>
        )}
      </div>
      <div className="mt-2 border-t border-gray-100 pt-1.5">
        {shown.map(r => <RecordLine key={r.key} r={r} leadName={lead.name} onOpen={r.kind !== 'booking' ? () => onOpen(r) : null} />)}
        {lead.records.length > 4 && (
          <button type="button" onClick={() => setAll(a => !a)} className="text-xs font-medium text-gray-500 hover:text-gray-800 mt-1">
            {all ? 'Show less' : `${lead.records.length - 4} more`}
          </button>
        )}
      </div>
    </li>
  )
}

export default function Leads() {
  const navigate = useNavigate()
  const proposals = useStore(s => s.proposals)
  const members = useStore(s => s.members)
  const { canChoose, reps, repId, setRep } = useScopedProposals()
  const { bookings, reps: rrReps, loading, error } = useBookings()
  const [query, setQuery] = useState('')
  const [show, setShow] = useState('all')
  const [limit, setLimit] = useState(PAGE)

  const leads = useMemo(() => {
    const quotes = latestIterations(proposals.filter(p => p.status !== 'Imported'))
    const jobs = proposals.filter(p => p.status === 'Imported')
    return buildLeads({ proposals: [...quotes, ...jobs], bookings, reps: rrReps, members: members || [] })
  }, [proposals, bookings, rrReps, members])

  const mine = useMemo(() => (repId ? leads.filter(l => l.ownerIds.has(repId)) : leads), [leads, repId])
  const repeats = mine.filter(l => l.repeat).length
  const online = mine.filter(l => l.bookings > 0).length
  const shown = useMemo(() => mine.filter(l =>
    (show === 'all' || (show === 'online' && l.bookings > 0) || (show === 'repeat' && l.repeat))
    && matchesLead(l, query)), [mine, show, query])

  const open = (r) => {
    if (r.kind === 'job' || r.status === 'Won') navigate(`/projects?tab=jobs&job=${encodeURIComponent(r.proposal.id)}`)
    else openProposal(r.proposal, navigate)
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="People" value={mine.length.toLocaleString()} />
        <StatCard label="Booked on the website" value={loading ? '…' : online.toLocaleString()} onClick={() => setShow('online')} />
        <StatCard label="Booked more than once" value={loading ? '…' : repeats.toLocaleString()} tone={repeats ? 'text-red-600' : 'text-gray-900'}
          onClick={() => setShow('repeat')} />
      </div>

      <div className="flex items-center gap-x-5 gap-y-1 flex-wrap border-b border-gray-200 mb-4">
        {canChoose && <RepToggle reps={reps} repId={repId} setRep={setRep} />}
        <label className="flex items-center gap-2 h-9 text-sm min-w-0">
          <Search size={14} className="text-gray-400 shrink-0" />
          <input className="w-56 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
            placeholder="Name, phone, email or street" value={query} autoFocus
            onChange={e => { setQuery(e.target.value); setLimit(PAGE) }} aria-label="Search leads" />
        </label>
        <QuickPicks value={show} onChange={(v) => { setShow(v); setLimit(PAGE) }} options={[
          { value: 'all', label: 'Everyone' },
          { value: 'online', label: 'Booked online', count: loading ? null : online },
          { value: 'repeat', label: 'Booked more than once', count: loading ? null : repeats },
        ]} />
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {shown.length === 0
        ? <p className="text-sm text-gray-500 py-8 text-center">{query ? `No one matches “${query}”.` : 'No one here yet.'}</p>
        : (
          <ul className="space-y-2">
            {shown.slice(0, limit).map(l => <LeadRow key={l.id} lead={l} onOpen={open} />)}
          </ul>
        )}
      {shown.length > limit && (
        <button type="button" onClick={() => setLimit(n => n + PAGE)}
          className="mt-3 w-full h-10 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
          Show more ({(shown.length - limit).toLocaleString()} left)
        </button>
      )}
    </div>
  )
}
