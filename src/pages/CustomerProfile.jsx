// ── A customer's profile (Sales › Leads › a person) ──────────────────────────
// Everything one person has with Deck Plus (src/lib/leads.js groups it by phone,
// email or street): their quotes and jobs with the drawing and 3D of each, and
// their website bookings. A new quote for them starts one of two ways, and both
// end the same: a quote, a spec drawing and a 3D.
//   Start with a drawing: the design editor opens linked to a new quote; each
//     deck and porch drawn becomes a priced line (lib/drawingQuote.js).
//   Start with the builders: a new quote with their details filled in; Draw it
//     there draws what the builders priced.
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Box, CalendarDays, FileText, Hammer, PenTool, Calculator } from 'lucide-react'
import { money0 } from '../lib/books'
import { designSummary, designUrl, editorUrl, hasDesign } from '../lib/designLink'
import { newLink, drawUrl } from '../lib/drawingLink'

const TZ = 'America/New_York'
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' }) : '')
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '')
const TONE = { Won: 'text-emerald-700', Booked: 'text-emerald-700', Lost: 'text-gray-400', Cancelled: 'text-gray-400', Archived: 'text-gray-400', Draft: 'text-gray-400', Knowify: 'text-gray-500' }

const titleOf = (p) => designSummary(p) || (p.projectTypes || []).join(', ') || (p.lines || []).find(l => !l.autoFee)?.name || 'Quote'

function ProjectRow({ r, onOpen }) {
  const p = r.proposal
  const drawn = hasDesign(p)
  const link = 'flex items-center gap-1 text-sm font-medium text-[var(--brand-700)] hover:underline'
  return (
    <li className="flex items-center gap-3 flex-wrap px-4 py-3">
      {r.kind === 'job' ? <Hammer size={16} className="shrink-0 text-gray-400" /> : <FileText size={16} className="shrink-0 text-gray-400" />}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-gray-900 truncate">{titleOf(p)}</p>
        <p className="text-sm text-gray-500">
          <span className={TONE[r.status] || 'text-amber-700'}>{r.kind === 'job' ? 'Knowify job' : r.status}</span>
          {[r.total ? money0(r.total) : '', day(r.at), p.version > 1 ? `version ${p.version}` : ''].filter(Boolean).map(t => <span key={t}> · {t}</span>)}
        </p>
      </div>
      <div className="flex items-center gap-4">
        {drawn && <a href={editorUrl(p)} target="_blank" rel="noopener" className={link}><PenTool size={14} /> Drawing</a>}
        {drawn && <a href={designUrl(p)} target="_blank" rel="noopener" className={link}><Box size={14} /> 3D</a>}
        <button type="button" onClick={() => onOpen(r)} className={link}>Open</button>
      </div>
    </li>
  )
}

export default function CustomerProfile({ lead, onBack, onOpen }) {
  const navigate = useNavigate()
  const projects = lead.records.filter(r => r.kind !== 'booking')
  const bookings = lead.records.filter(r => r.kind === 'booking')

  const start = (withDrawing) => {
    const f = { client: lead.name, email: lead.email, phone: lead.phone, address: lead.address }
    if (withDrawing) {
      // Opened from the click itself, so the browser lets the new tab through.
      f.drawLink = newLink()
      window.open(drawUrl(f.drawLink, { client: f.client, address: f.address, phone: f.phone, email: f.email }), `qx-draw-${f.drawLink}`)
    }
    sessionStorage.setItem('quote-for', JSON.stringify(f))
    navigate('/quote')
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl space-y-5">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ArrowLeft size={15} /> Leads
      </button>

      <div className="flex items-start gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{lead.name}</h1>
          <p className="text-sm text-gray-500 mt-1">{[lead.phone, lead.email, lead.address].filter(Boolean).join(' · ') || 'No contact details yet'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => start(true)}
            className="flex items-center gap-2 h-10 px-4 rounded-lg bg-[var(--brand-600)] text-white text-sm font-semibold hover:bg-[var(--brand-700)]">
            <PenTool size={15} /> Start with a drawing
          </button>
          <button type="button" onClick={() => start(false)}
            className="flex items-center gap-2 h-10 px-4 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-800 hover:bg-gray-50">
            <Calculator size={15} /> Start with the builders
          </button>
        </div>
      </div>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Quotes and jobs</h2>
        {projects.length === 0
          ? <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded-xl px-4 py-6 text-center">No quotes yet.</p>
          : <ul className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">{projects.map(r => <ProjectRow key={r.key} r={r} onOpen={onOpen} />)}</ul>}
      </section>

      {bookings.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Website bookings</h2>
          <ul className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {bookings.map(r => (
              <li key={r.key} className="flex items-center gap-3 px-4 py-3 text-sm">
                <CalendarDays size={16} className="shrink-0 text-gray-400" />
                <span className={`font-medium ${TONE[r.status] || 'text-gray-800'}`}>{r.status}</span>
                <span className="text-gray-500 min-w-0 truncate">{[r.startsAt && `for ${when(r.startsAt)}`, r.repName && `with ${r.repName}`, r.at && `booked ${day(r.at)}`].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
