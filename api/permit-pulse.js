/* global process */
/**
 * Mecklenburg County inspection pulse.
 *   POST /api/permit-pulse  { jobs: [{ id, address, client, pick?, knownNotes? }] }
 *     → { results: { [id]: { permits, candidates, needsPick, error, siteError, checkedAt } } }
 *
 * Office / admin only. For each job it finds the county permit by the job's
 * OWN address (street number + street name, then the exact number, street
 * and ZIP are checked on every result), so a customer who shares a last name
 * with another can never pick up their permit. The client name only chooses
 * between permits at that one address; if that still leaves more than one,
 * nothing is guessed: the job comes back with needsPick and the candidates,
 * and the office picks once (the pick is sent back here as `pick`).
 *
 * Alongside the building permit it reads the trade permits (electrical,
 * mechanical, plumbing) filed for the same project, since rough and final
 * electrical inspections are recorded on those.
 */
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import dotenv from 'dotenv'
import { requireAuth, staffRole } from './_auth.js'
import { sendPermitAlert } from './_permit-alert.js'
import { EVOLVE_SITES, searchAddress as evolveSearch, permitDetails as evolveDetails } from './_evolve.js'
import { SITES, searchByAddress, searchByRecord, fetchPermit, fetchInspectionNotes, recordUrl, RECORD_RE } from './_accela.js'

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })

const MAX_JOBS = 8          // per request; the app sends the rest in further requests
const MAX_NEW_NOTES = 12    // "View Details" pages read per job per pulse

// Connected counties: which site to read, how it numbers building and trade
// (electrical / mechanical / plumbing) permits, and whether its "project
// name" is the client (Mecklenburg) or the contractor (Cabarrus) — in which
// case only the address picks the permit.
export const COUNTIES = {
  Mecklenburg: { site: SITES.Mecklenburg, building: /^RES-(ADD|ALT|NEW|ACC|DEM)-/i, trade: /^RES-(ELC|MEC|PLM)-/i, byName: true },
  Cabarrus:    { site: SITES.Cabarrus,    building: /^BU\d/i,                      trade: /^(EL|ME|MC|PL)\d/i,   byName: false },
  // Evolve portals: one permit carries every trade's inspections
  Union:       { evolve: EVOLVE_SITES.Union },
  York:        { evolve: EVOLVE_SITES.York },
  'Rock Hill': { evolve: EVOLVE_SITES.RockHill },
  Lancaster:   { evolve: EVOLVE_SITES.Lancaster },
}

// Ours, on an Evolve permit: we file as Deck Plus, or our permit expediter
// (Kent's Consulting Services) files for us.
const OUR_CONTRACTOR = /deck\s*plus|kent'?s\s+consulting/i
const NOT_BUILDING = /electric|mechanic|plumb|^gas$|^z$|fire|sign|pool/i
const CLOSED = /complet|closed|expired|void|withdrawn|cancel|^co$|final/i

// Street names one or two letters apart ("Kestrell" / "Kestrel", "Chacelot" /
// "Chancelot") — safe because the house number has to match exactly.
function closeStreet(a, b) {
  a = a.split(' ')[0]; b = b.split(' ')[0]
  if (!a || !b) return false
  if (a.startsWith(b) || b.startsWith(a)) return true
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  }
  return d[a.length][b.length] <= 2
}

async function checkEvolveJob(job, site) {
  const addr = parseAddress(job.address)
  if (!addr.number || !addr.name) return { error: 'The job has no street address to search the county by.' }
  // Search by the house number and the street's first letters, then keep the
  // results whose number matches exactly and whose street is close enough.
  const ours = (sr) => sr.rows.filter(r => {
    const c = parseAddress(r.address)
    return c.number === addr.number && closeStreet(addr.name, c.name)
  })
  // Three letters first; two only if that found nothing (a typo in the third)
  let search = await evolveSearch(site, `${addr.number} ${addr.name.slice(0, 3)}`)
  let rows = ours(search)
  if (!rows.length) { search = await evolveSearch(site, `${addr.number} ${addr.name.slice(0, 2)}`); rows = ours(search) }
  const building = rows.filter(r => !NOT_BUILDING.test(r.type))
  const sum = (r) => ({ record: r.record, type: r.type, description: '', projectName: r.contractor, address: r.address, status: r.status, date: r.date, capIds: [r.record], url: site.base })

  let main = null
  if (Array.isArray(job.pick) && job.pick.length === 1) {
    main = building.find(r => r.record === job.pick[0]) || null
    if (!main) return { error: 'The permit picked for this job is no longer listed at its address.', candidates: building.map(sum), needsPick: building.length > 0 }
  } else if (job.record) {
    main = building.find(r => r.record === job.record) || null
  }
  if (!main) {
    const ours = building.filter(r => OUR_CONTRACTOR.test(r.contractor))
    const open = ours.filter(r => !CLOSED.test(r.status))
    const pool = open.length ? open : ours
    if (pool.length === 1) main = pool[0]
    else if (!building.length) return { error: 'No building permit found at this address on the county site.' }
    else return { needsPick: true, candidates: (pool.length ? pool : building).map(sum) }
  }

  const d = await evolveDetails(search, main)
  // Split the permit's inspections by trade, so electrical and mechanical land
  // in their own columns like the other counties' separate trade permits.
  const base = { ...sum(main), description: d.description, recordStatus: main.status, upcoming: [] }
  const groups = { '': [], ELC: [], MEC: [], PLM: [] }
  for (const i of d.inspections) (groups[i.trade] || groups['']).push(i)
  const permits = [{ ...base, role: 'building', completed: groups[''] }]
  for (const kind of ['ELC', 'MEC', 'PLM']) {
    if (groups[kind].length) permits.push({ ...base, role: 'trade', kind, completed: groups[kind] })
  }
  return { permits, owner: d.owner }
}

// ── Address ──────────────────────────────────────────────────────────────────
const SUFFIXES = new Set(('dr drive ln lane rd road ct court st street ave avenue blvd boulevard pl place way wy cir circle ' +
  'tr trl trail ter terrace pkwy parkway hwy highway cv cove xing crossing run loop pt point sq square row path pass ' +
  'trce trace walk vw view rdg ridge holw hollow crk creek grn').split(' '))
const DIRS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'north', 'south', 'east', 'west'])

export function parseAddress(address) {
  const a = String(address || '')
  const [street = ''] = a.split(',')
  const m = street.trim().match(/^(\d+)\s+(.+)$/)
  // The ZIP is the last 5-digit number after the street, never the house number
  const rest = a.slice(street.length)
  const zip = (rest.match(/\b(\d{5})(?:-\d{4})?\b(?![\s\S]*\b\d{5}\b)/) || [])[1] || ''
  if (!m) return { number: '', name: '', zip }
  const words = m[2].toLowerCase().replace(/[.#]/g, ' ').split(/\s+/).filter(Boolean)
  while (words.length > 1 && (SUFFIXES.has(words[words.length - 1]) || DIRS.has(words[words.length - 1]))) words.pop()
  while (words.length > 1 && DIRS.has(words[0])) words.shift()
  return { number: m[1], name: words.join(' '), zip }
}

// A county result belongs to this job only if number, street name and ZIP agree.
function sameAddress(job, countyAddress) {
  const c = parseAddress(countyAddress)
  if (!c.number || c.number !== job.number) return false
  if (job.zip && c.zip && job.zip !== c.zip) return false
  const a = job.name.replace(/\s+/g, ''), b = c.name.replace(/\s+/g, '')
  return a === b || a.startsWith(b) || b.startsWith(a)
}

// ── Client name ──────────────────────────────────────────────────────────────
const nameWords = (s) => String(s || '').toLowerCase().replace(/[^a-z\s,/&-]/g, ' ').split(/[\s,/&-]+/).filter(w => w.length > 1)
// County project names read "Ashley, Sara" or "Keith Allen 24kw"; ours vary.
// The surname must appear in ours, and if the county lists a first name too,
// one of its first names must as well.
function sameClient(ourClient, projectName) {
  const ours = new Set(nameWords(ourClient))
  if (!ours.size) return false
  const [last, first] = String(projectName || '').includes(',')
    ? projectName.split(',').map(nameWords)
    : [nameWords(projectName), []]
  if (!last.some(w => ours.has(w))) return false
  if (first.length && ours.size > 1 && !first.some(w => ours.has(w))) return false
  return true
}

const summary = (r, site) => ({
  record: r.record, type: r.type, description: r.description, projectName: r.projectName,
  address: r.address, status: r.status, date: r.date, capIds: r.capIds, url: recordUrl(r.capIds, site),
})

// ── One job ──────────────────────────────────────────────────────────────────
export async function checkJob(job) {
  // A city that inspects its own jobs (Rock Hill) is looked up before its county
  const rule = (job.jurisdiction ? COUNTIES[job.jurisdiction] : COUNTIES[job.county || 'Mecklenburg'])
  if (!rule) return { unsupported: true, error: `${job.jurisdiction || job.county || 'This county'}'s permit site isn't connected yet. Record its results by hand.` }
  if (rule.evolve) return checkEvolveJob(job, rule.evolve)
  const { site } = rule
  const sum = (r) => summary(r, site)
  const addr = parseAddress(job.address)
  if (!addr.number || !addr.name) return { error: 'The job has no street address to search the county by.' }

  let rows = await searchByAddress(addr.number, addr.name, site)
  if (!rows.length && addr.name.includes(' ')) rows = await searchByAddress(addr.number, addr.name.split(' ')[0], site)
  rows = rows.filter(r => sameAddress(addr, r.address))
  const building = rows.filter(r => rule.building.test(r.record))

  // A permit # the office typed in: used only if it's for this same house
  // number, so it can never land on another customer's permit.
  if (!job.pick && job.record) {
    const [hit] = await searchByRecord(job.record, site)
    if (hit && parseAddress(hit.address).number === addr.number && rule.building.test(hit.record)) {
      job.pick = hit.capIds
      if (!rows.some(r => r.record === hit.record)) rows.push(hit)
      if (!building.some(r => r.record === hit.record)) building.push(hit)
    }
  }

  let main = null
  if (Array.isArray(job.pick) && job.pick.length === 3) {
    main = building.find(r => r.capIds.join('-') === job.pick.join('-')) || null
    if (!main) return { error: 'The permit picked for this job is no longer listed at its address.', candidates: building.map(sum), needsPick: building.length > 0 }
  } else {
    // Where the county's project name is the contractor, the address alone
    // narrows it down; two open permits at one address still ask the office.
    const named = rule.byName ? building.filter(r => sameClient(job.client, r.projectName)) : building
    const open = named.filter(r => !/closed|finaled|void|withdrawn|expired|cancel/i.test(r.status))
    const pool = open.length ? open : named
    if (pool.length === 1) main = pool[0]
    else if (!building.length) return { error: 'No building permit found at this address on the county site.' }
    else return { needsPick: true, candidates: building.map(sum) }
  }

  // Trade permits filed for the same project: same address (already), within
  // 60 days of the building permit, and — where project names are clients —
  // the same project name.
  const near = (d) => !d || !main.date || Math.abs(new Date(d) - new Date(main.date)) <= 60 * 86400000
  const trades = rows.filter(r => rule.trade.test(r.record) && near(r.date) && (!rule.byName ||
    nameWords(r.projectName).join(' ') === nameWords(main.projectName).join(' ') || r.description === main.description))

  // The permits side by side, then the notes we don't have yet, a few at a
  // time — the first check of a job reads them all, so this is what's slow.
  const known = new Set((job.knownNotes || []).map(String))
  const pages = await Promise.all([main, ...trades].map(r => fetchPermit(r.capIds, site)))
  const todo = []
  pages.forEach((p, k) => {
    const r = k === 0 ? main : trades[k - 1]
    for (const ins of p.completed) if (!known.has(ins.id)) todo.push({ ins, record: p.record, capIds: r.capIds })
  })
  await inBatches(todo.slice(0, MAX_NEW_NOTES), 4, async (t) => {
    if (Date.now() > job.deadline) return   // out of time: the next pulse reads the rest
    try { t.ins.notes = await fetchInspectionNotes(t.record, t.capIds, t.ins.id, site) } catch { /* next pulse tries again */ }
  })
  const permits = pages.map((p, k) => {
    const r = k === 0 ? main : trades[k - 1]
    return { ...sum(r), role: k === 0 ? 'building' : 'trade', recordStatus: p.recordStatus, expires: p.expires, upcoming: p.upcoming, completed: p.completed }
  })
  return { permits }
}

async function inBatches(items, size, fn) {
  const out = []
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)))
  return out
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  // County connection alert emails ride along on this function
  const raw = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  if (raw.alert) return sendPermitAlert(req, res, raw.alert)
  const staff = await requireAuth(req, res)
  if (!staff) return
  const token = (req.headers.authorization || '').replace(/^Bearer /, '') || req.headers['x-qx-token']
  const role = await staffRole(token, staff)
  if (role !== 'office' && role !== 'admin') return res.status(403).json({ error: 'Only the office can run the permit check.' })

  const body = raw
  const jobs = (Array.isArray(body.jobs) ? body.jobs : []).slice(0, MAX_JOBS).map(j => ({
    id: String(j?.id ?? ''),
    address: String(j?.address || '').slice(0, 200),
    client: String(j?.client || '').slice(0, 120),
    county: Object.hasOwn(COUNTIES, String(j?.county || '')) ? String(j.county) : (j?.county ? String(j.county).slice(0, 40) : 'Mecklenburg'),
    jurisdiction: String(j?.jurisdiction || '').slice(0, 40),
    pick: Array.isArray(j?.pick) ? j.pick.map(String).slice(0, 3) : null,
    record: RECORD_RE.test(String(j?.record || '').trim().toUpperCase()) ? String(j.record).trim().toUpperCase() : '',
    knownNotes: Array.isArray(j?.knownNotes) ? j.knownNotes.slice(0, 500) : [],
  })).filter(j => j.id)

  const results = {}
  const deadline = Date.now() + 40000   // leave room inside the 60 s limit
  await inBatches(jobs.map(j => ({ ...j, deadline })), 3, async (job) => {
    const checkedAt = new Date().toISOString()
    try {
      results[job.id] = { ...(await checkJob(job)), checkedAt }
    } catch (e) {
      if (process.env.NODE_ENV !== 'production') console.error('[permit-pulse]', job.id, e)
      // siteError: the county site itself failed (down, blocked, or its pages
      // changed so they can't be read) — what the connection alerts watch for.
      results[job.id] = { error: `Couldn't read the county site: ${e.message}`, siteError: true, checkedAt }
    }
  })
  res.status(200).json({ results })
}
