import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { wonRevenueOf } from '../contractTotal'
import {
  Users, Search, ChevronDown, ChevronRight, Phone, Mail, MapPin,
  FileText, DollarSign, Calendar, Plus,
} from 'lucide-react'

const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const STATUS_BADGE = {
  Won:           'bg-green-100 text-green-700',
  Lost:          'bg-red-100 text-red-700',
  Draft:         'bg-gray-100 text-gray-600',
  Sent:          'bg-blue-100 text-blue-700',
  'Followed Up': 'bg-purple-100 text-purple-700',
  Negotiating:   'bg-amber-100 text-amber-700',
}

const STATUS_PRIORITY = { Won: 0, Negotiating: 1, 'Followed Up': 2, Sent: 3, Draft: 4, Lost: 5 }

export default function ClientList() {
  const navigate  = useNavigate()
  const proposals = useStore(s => s.proposals)
  const [expanded, setExpanded] = useState({})
  const [search, setSearch] = useState('')

  // Group all proposals by client name
  const clientMap = {}
  proposals.forEach(p => {
    const key = (p.client || 'Unnamed Client').trim()
    if (!clientMap[key]) clientMap[key] = { name: key, email: p.email, phone: p.phone, address: p.address, proposals: [] }
    clientMap[key].proposals.push(p)
    // Keep most complete contact info
    if (p.email && !clientMap[key].email) clientMap[key].email = p.email
    if (p.phone && !clientMap[key].phone) clientMap[key].phone = p.phone
    if (p.address && !clientMap[key].address) clientMap[key].address = p.address
  })

  // Sort proposals within each client chronologically (oldest → newest)
  const clients = Object.values(clientMap).map(c => ({
    ...c,
    proposals: [...c.proposals].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
  }))

  // Sort clients by most recent proposal date (newest client activity first)
  clients.sort((a, b) => {
    const aDate = Math.max(...a.proposals.map(p => new Date(p.createdAt || 0)))
    const bDate = Math.max(...b.proposals.map(p => new Date(p.createdAt || 0)))
    return bDate - aDate
  })

  const filtered = search.trim()
    ? clients.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase())
      )
    : clients

  const toggle = (name) => setExpanded(e => ({ ...e, [name]: !e[name] }))

  const openProposal = (p) => {
    sessionStorage.setItem('proposal', JSON.stringify({
      client: p.client, email: p.email, phone: p.phone,
      address: p.address, expiration: p.expiration,
      lines: p.lines || [], margin: 0, proposalId: p.id,
    }))
    navigate('/proposal')
  }

  const bestStatus = (proposals) => {
    return proposals.reduce((best, p) => {
      return (STATUS_PRIORITY[p.status] ?? 99) < (STATUS_PRIORITY[best] ?? 99) ? p.status : best
    }, proposals[0]?.status || 'Draft')
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Clients</h2>
          <p className="text-sm text-gray-500 mt-0.5">{clients.length} client{clients.length !== 1 ? 's' : ''} · {proposals.length} total proposals</p>
        </div>
        <button
          onClick={() => navigate('/quote')}
          className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
          style={{ backgroundColor: 'var(--brand-600)' }}
        >
          <Plus size={15} /> New Quote
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-5">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 bg-white"
          style={{ '--tw-ring-color': 'var(--brand-300)' }}
          placeholder="Search clients…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{search ? 'No clients match your search.' : 'No proposals yet. Build your first quote to get started.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(client => {
            const isOpen = expanded[client.name]
            const totalValue = client.proposals.reduce((s, p) => s + (p.total || 0), 0)
            const wonValue   = client.proposals.filter(p => p.status === 'Won').reduce((s, p) => s + wonRevenueOf(p), 0)
            const status     = bestStatus(client.proposals)
            const latest     = client.proposals[client.proposals.length - 1]

            return (
              <div key={client.name} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Client row */}
                <button
                  onClick={() => toggle(client.name)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white font-bold text-sm"
                    style={{ backgroundColor: 'var(--brand-600)' }}>
                    {client.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900">{client.name}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[status] || 'bg-gray-100 text-gray-600'}`}>
                        {status}
                      </span>
                    </div>
                    <div className="mt-0.5">
                      {client.email
                        ? <span className="text-xs text-gray-400 flex items-center gap-1 truncate"><Mail size={10} className="shrink-0" /><span className="truncate">{client.email}</span></span>
                        : client.phone
                        ? <span className="text-xs text-gray-400 flex items-center gap-1 truncate"><Phone size={10} className="shrink-0" /><span className="truncate">{client.phone}</span></span>
                        : <span className="text-xs text-gray-300">No contact info</span>}
                    </div>
                  </div>

                  <div className="text-right shrink-0 hidden sm:block">
                    <p className={`text-sm font-bold ${wonValue > 0 ? 'text-green-600' : 'text-gray-700'}`}>${fmt(wonValue > 0 ? wonValue : totalValue)}</p>
                    <p className={`text-xs ${wonValue > 0 ? 'text-green-600/70' : 'text-gray-400'}`}>{wonValue > 0 ? 'won' : 'pipeline'}</p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-gray-500">{client.proposals.length} proposal{client.proposals.length !== 1 ? 's' : ''}</p>
                    <p className="text-xs text-gray-400">
                      {latest?.createdAt
                        ? new Date(latest.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </p>
                  </div>

                  {isOpen
                    ? <ChevronDown size={16} className="text-gray-400 shrink-0" />
                    : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
                </button>

                {/* Proposal list */}
                {isOpen && (
                  <div className="border-t border-gray-100">
                    {/* Full contact — collapsed row shows only one line, all chips revealed here */}
                    {(client.email || client.phone || client.address) && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-5 py-3 bg-gray-50/60 border-b border-gray-100">
                        {client.email && <span className="text-xs text-gray-500 flex items-center gap-1.5"><Mail size={11} className="text-gray-400" />{client.email}</span>}
                        {client.phone && <span className="text-xs text-gray-500 flex items-center gap-1.5"><Phone size={11} className="text-gray-400" />{client.phone}</span>}
                        {client.address && <span className="text-xs text-gray-500 flex items-center gap-1.5"><MapPin size={11} className="text-gray-400" />{client.address}</span>}
                      </div>
                    )}
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-5 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Status</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Total</th>
                          <th className="px-5 py-2 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Version</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {client.proposals.map((p, i) => (
                          <tr
                            key={p.id}
                            onClick={() => openProposal(p)}
                            className="hover:bg-[var(--brand-50)] cursor-pointer transition-colors"
                          >
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <Calendar size={12} className="text-gray-300 shrink-0" />
                                <span className="text-gray-700">
                                  {p.createdAt
                                    ? new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                    : '—'}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_BADGE[p.status] || 'bg-gray-100 text-gray-600'}`}>
                                {p.status}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right font-semibold text-gray-900">
                              ${fmt(p.total || 0)}
                            </td>
                            <td className="px-5 py-3 text-right text-xs text-gray-400">
                              {p.parentId ? `Alt ${p.version || 2}` : `v1`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
