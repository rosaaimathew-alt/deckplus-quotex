// ── Sales › Leads: the master lead list (office and admin) ──────────────────
// One row per person, from the website calendar, quotes and Knowify jobs
// (src/lib/leads.js). The office searches a caller's name, phone, email or
// street before booking them, and sees right away if they already booked
// online, already have a quote, or are a past customer. A row opens to show
// everything that person has (bookings, quotes, jobs) and their contact details.
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, FileText, Hammer } from 'lucide-react'
import { useStore } from '../store'
import { supabase, supabaseReady } from '../supabase'
import { useScopedProposals } from '../lib/proposalScope'
import { latestIterations } from '../lib/proposalGroups'
import { buildLeads, matchesLead } from '../lib/leads'
import { openProposal } from '../lib/openProposal'
import { money0 } from '../lib/books'
import { QuickPicks, RepToggle, SearchLine } from '../components/FilterBar'
import FitTable from '../components/FitTable'

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

// Where a lead stands, from what they have: a job, a quote, a visit booked.
const STAGE_TONE = {
  Customer: 'bg-emerald-50 text-emerald-800', Quoted: 'bg-blue-50 text-blue-800',
  'Visit booked': 'bg-[var(--brand-50)] text-[var(--brand-800)]', Cancelled: 'bg-gray-100 text-gray-600',
}
function stageOf(lead) {
  if (lead.jobs > 0) return 'Customer'
  if (lead.quotes > 0) return 'Quoted'
  if (lead.liveBookings > 0) return 'Visit booked'
  return 'Cancelled'
}
function summaryOf(lead) {
  const deal = lead.records.find(r => r.kind !== 'booking')
  const first = lead.records[lead.records.length - 1]
  const visit = lead.records.filter(r => r.kind === 'booking' && r.status === 'Booked' && r.startsAt)
    .sort((a, b) => String(b.startsAt).localeCompare(String(a.startsAt)))[0]
  return {
    wants: (deal?.proposal?.projectTypes || []).join(' + '),
    from: first?.kind === 'booking' ? 'Website booking' : first?.kind === 'job' ? 'Knowify job' : 'Quote',
    booked: visit ? when(visit.startsAt) : '',
    deal,
  }
}

function LeadRow({ lead, onOpen }) {
  const [open, setOpen] = useState(false)
  const stage = stageOf(lead)
  const { wants, from, booked, deal } = summaryOf(lead)
  const other = lead.names.filter(n => n.toLowerCase() !== lead.name.toLowerCase())
  const td = 'px-4 py-2.5'
  return (
    <Fragment>
      <tr className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setOpen(o => !o)}>
        <td className={td}>
          <span className="font-semibold text-gray-900">{lead.name}</span>
          {other.length > 0 && <span className="ml-2 text-xs text-gray-400">also {other.slice(0, 2).join(', ')}</span>}
        </td>
        <td className={`${td} whitespace-nowrap text-gray-700`}>{lead.phone || <span className="text-gray-300">—</span>}</td>
        <td className={`${td} whitespace-nowrap text-gray-700`}>{wants || <span className="text-gray-300">—</span>}</td>
        <td className={`${td} whitespace-nowrap text-gray-700`}>{from}</td>
        <td className={`${td} whitespace-nowrap text-gray-700`}>{booked || <span className="text-gray-300">—</span>}</td>
        <td className={`${td} whitespace-nowrap`}>
          <span className={`inline-block text-xs font-semibold rounded px-2 py-0.5 ${STAGE_TONE[stage]}`}>{stage}</span>
          {lead.repeat && <span className="ml-2 text-xs font-semibold text-red-600">Booked {lead.liveBookings} times</span>}
        </td>
        <td className={`${td} text-right whitespace-nowrap`}>
          <button type="button" onClick={(e) => { e.stopPropagation(); deal ? onOpen(deal) : setOpen(o => !o) }}
            className="px-3 py-1 rounded-lg border border-[var(--brand-200)] bg-white text-xs font-semibold text-[var(--brand-700)] hover:bg-[var(--brand-50)]">
            {deal ? 'Open' : open ? 'Hide' : 'Details'}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-gray-50">
          <td colSpan={7} className="px-4 py-2">
            <p className="text-sm text-gray-600">{[lead.phone, lead.email, lead.address].filter(Boolean).join(' · ') || 'No contact details'}</p>
            <div className="mt-1">
              {lead.records.map(r => <RecordLine key={r.key} r={r} leadName={lead.name} onOpen={r.kind !== 'booking' ? () => onOpen(r) : null} />)}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
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
  const count = (st) => mine.filter(l => stageOf(l) === st).length
  const shown = useMemo(() => mine.filter(l =>
    (show === 'all' || (show === 'repeat' ? l.repeat : stageOf(l) === show))
    && matchesLead(l, query)), [mine, show, query])

  const open = (r) => {
    if (r.kind === 'job' || r.status === 'Won') navigate(`/projects?tab=jobs&job=${encodeURIComponent(r.proposal.id)}`)
    else openProposal(r.proposal, navigate)
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl">
      <div className="flex items-center gap-x-5 gap-y-1 flex-wrap border-b border-gray-200 mb-4">
        <SearchLine value={query} onChange={v => { setQuery(v); setLimit(PAGE) }} placeholder="Search name, phone, email or street" label="Search leads" autoFocus />
        {canChoose && <RepToggle reps={reps} repId={repId} setRep={setRep} />}
        <QuickPicks value={show} onChange={(v) => { setShow(v); setLimit(PAGE) }} options={[
          { value: 'all', label: 'Everyone', count: mine.length },
          { value: 'Visit booked', label: 'Visit booked', count: loading ? null : count('Visit booked') },
          { value: 'Quoted', label: 'Quoted', count: count('Quoted') },
          { value: 'Customer', label: 'Customers', count: count('Customer') },
          { value: 'repeat', label: 'Booked more than once', count: loading ? null : repeats },
        ]} />
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {shown.length === 0
        ? <p className="text-sm text-gray-500 py-8 text-center">{query ? `No one matches “${query}”.` : 'No one here yet.'}</p>
        : (
          <FitTable className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{['Name', 'Phone', 'Wants', 'Came from', 'Visit', 'Status', ''].map((h, i) => <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {shown.slice(0, limit).map(l => <LeadRow key={l.id} lead={l} onOpen={open} />)}
              </tbody>
            </table>
          </FitTable>
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
