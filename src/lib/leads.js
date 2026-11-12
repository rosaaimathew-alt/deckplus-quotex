// ── The master lead list ─────────────────────────────────────────────────────
// Everyone who has ever reached Deck Plus, in one list the office can check
// before booking: website calendar bookings (rr_bookings, past and cancelled
// too), quotes, and jobs brought over from Knowify. Records that share a
// phone number, an email or a street address are the same person, so a
// caller who already booked online, or already has a quote, shows up as one
// row with everything they have.

// "(704) 555-0100", "+1 704…", "518) 369-2624", "(248) 225-3770\t28209" → "7045550100"
export function phoneKey(phone) {
  const d = String(phone || '').replace(/\D/g, '')
  if (d.length >= 11 && d[0] === '1') return d.slice(1, 11)
  return d.length >= 10 ? d.slice(0, 10) : ''
}

export function emailKey(email) {
  const m = String(email || '').toLowerCase().match(/[^\s@()<>,;"']+@[^\s@()<>,;"']+\.[a-z]{2,}/)
  return m ? m[0] : ''
}

// "4201 Shepherdleas Ln, Charlotte" and "4201 shepherdleas lane" → "4201 shepherdleas"
export function addressKey(street) {
  const m = String(street || '').toLowerCase().trim().match(/^(\d+[a-z]?)\s+(?:(?:n|s|e|w|north|south|east|west)\.?\s+)?([a-z0-9]+)/)
  return m ? `${m[1]} ${m[2]}` : ''
}

// "Umstead, Jason" → "Jason Umstead"
export function displayName(name) {
  const s = String(name || '').replace(/\s+/g, ' ').trim()
  const m = s.match(/^([^,]+),\s*(.+)$/)
  return m ? `${m[2]} ${m[1]}` : s
}

const bookingAddress = (b) => {
  const city = [b.address_city, [b.address_state, b.address_zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [b.address_street, city].filter(Boolean).join(', ')
}

// One proposal row → a lead record
function fromProposal(p) {
  const imported = p.status === 'Imported'
  return {
    key: `p:${p.id}`,
    kind: imported ? 'job' : 'quote',
    name: displayName(p.client),
    phone: p.phone || '', email: p.email || '', address: p.address || '',
    status: imported ? 'Knowify' : p.status,
    total: Number(p.total) || 0,
    ownerId: p.ownerId || null,
    at: p.sentAt || p.createdAt || '',
    proposal: p,
  }
}

function fromBooking(b, repOf) {
  const rep = repOf(b.rep_id)
  return {
    key: `b:${b.id}`,
    kind: 'booking',
    name: displayName(b.lead_name || [b.lead_first_name, b.lead_last_name].filter(Boolean).join(' ')),
    phone: b.lead_phone || '', email: b.lead_email || '',
    address: bookingAddress(b), street: b.address_street || '',
    status: b.status === 'cancelled' ? 'Cancelled' : 'Booked',
    ownerId: rep.memberId, repName: rep.name,
    at: b.created_at || '', startsAt: b.starts_at || '',
    notes: b.notes || '',
  }
}

// proposals: the store's proposals (versions already collapsed by the caller)
// bookings: rr_bookings rows; reps: rr_reps rows; members: the team
export function buildLeads({ proposals = [], bookings = [], reps = [], members = [] }) {
  const memberByEmail = new Map(members.filter(m => m.email).map(m => [m.email.toLowerCase(), m]))
  const firstName = (s) => String(s || '').trim().split(/\s+/)[0].toLowerCase()
  const repById = new Map(reps.map(r => {
    const m = (r.email && memberByEmail.get(r.email.toLowerCase()))
      || members.find(x => x.role === 'rep' && firstName(x.displayName) && firstName(x.displayName) === firstName(r.name))
    return [r.id, { name: r.name || '', memberId: m?.id || null }]
  }))
  const repOf = (id) => repById.get(id) || { name: '', memberId: null }

  const records = [
    ...bookings.map(b => fromBooking(b, repOf)),
    ...proposals.filter(p => p && !p.deletedAt).map(fromProposal),
  ]

  // Same phone, email or street address → same person
  const up = new Map()
  const find = (k) => { while (up.get(k) !== k) { up.set(k, up.get(up.get(k))); k = up.get(k) } return k }
  const join = (a, b) => { if (!up.has(b)) up.set(b, b); const ra = find(a), rb = find(b); if (ra !== rb) up.set(ra, rb) }
  for (const r of records) {
    up.set(r.key, r.key)
    r.phoneKey = phoneKey(r.phone)
    r.emailKey = emailKey(r.email)
    r.addressKey = addressKey(r.street || r.address)
  }
  for (const r of records) {
    if (r.phoneKey) join(r.key, `ph:${r.phoneKey}`)
    if (r.emailKey) join(r.key, `em:${r.emailKey}`)
    if (r.addressKey) join(r.key, `ad:${r.addressKey}`)
  }

  const groups = new Map()
  for (const r of records) {
    const g = find(r.key)
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g).push(r)
  }

  const time = (s) => new Date(s || 0).getTime() || 0
  return [...groups.entries()].map(([id, recs]) => {
    recs.sort((a, b) => time(b.at) - time(a.at))
    const pick = (f) => recs.find(r => r[f])?.[f] || ''
    const bookingsOf = recs.filter(r => r.kind === 'booking')
    const live = bookingsOf.filter(r => r.status === 'Booked')
    return {
      id,
      name: pick('name') || 'No name',
      names: [...new Set(recs.map(r => r.name).filter(Boolean))],
      phone: pick('phone'), email: pick('email'), address: pick('address'),
      records: recs,
      bookings: bookingsOf.length,
      liveBookings: live.length,
      quotes: recs.filter(r => r.kind === 'quote').length,
      jobs: recs.filter(r => r.kind === 'job' || r.status === 'Won').length,
      repeat: live.length > 1,
      ownerIds: new Set(recs.map(r => r.ownerId).filter(Boolean)),
      latest: time(recs[0]?.at),
      haystack: recs.map(r => [r.name, r.email, r.address, r.repName].join(' ')).join(' ').toLowerCase(),
      digits: recs.map(r => r.phoneKey).join(' '),
    }
  }).sort((a, b) => b.latest - a.latest)
}

// Search by any part of a name, email, address, or phone digits
export function matchesLead(lead, query) {
  const q = String(query || '').toLowerCase().trim()
  if (!q) return true
  const digits = q.replace(/\D/g, '')
  if (digits.length >= 4 && digits.length === q.replace(/[\s().+-]/g, '').length) {
    return lead.digits.includes(digits) || lead.haystack.includes(q)
  }
  return q.split(/\s+/).every(w => lead.haystack.includes(w))
}
