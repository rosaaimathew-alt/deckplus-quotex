/* global process */
/**
 * Mecklenburg County inspection pulse.
 *   POST /api/permit-pulse  { jobs: [{ id, address, client, pick?, knownNotes? }] }
 *     → { results: { [id]: { permits, candidates, needsPick, error, checkedAt } } }
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
import { searchByAddress, fetchPermit, fetchInspectionNotes, recordUrl } from './_accela.js'

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })

const MAX_JOBS = 8          // per request; the app sends the rest in further requests
const MAX_NEW_NOTES = 12    // "View Details" pages read per job per pulse
const BUILDING_RE = /^RES-(ADD|ALT|NEW|ACC|DEM)-/i
const TRADE_RE = /^RES-(ELC|MEC|PLM)-/i

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

const summary = (r) => ({
  record: r.record, type: r.type, description: r.description, projectName: r.projectName,
  address: r.address, status: r.status, date: r.date, capIds: r.capIds, url: recordUrl(r.capIds),
})

// ── One job ──────────────────────────────────────────────────────────────────
export async function checkJob(job) {
  const addr = parseAddress(job.address)
  if (!addr.number || !addr.name) return { error: 'The job has no street address to search the county by.' }

  let rows = await searchByAddress(addr.number, addr.name)
  if (!rows.length && addr.name.includes(' ')) rows = await searchByAddress(addr.number, addr.name.split(' ')[0])
  rows = rows.filter(r => sameAddress(addr, r.address))
  const building = rows.filter(r => BUILDING_RE.test(r.record))

  let main = null
  if (Array.isArray(job.pick) && job.pick.length === 3) {
    main = building.find(r => r.capIds.join('-') === job.pick.join('-')) || null
    if (!main) return { error: 'The permit picked for this job is no longer listed at its address.', candidates: building.map(summary), needsPick: building.length > 0 }
  } else {
    const named = building.filter(r => sameClient(job.client, r.projectName))
    const open = named.filter(r => !/closed|finaled|void|withdrawn|expired|cancel/i.test(r.status))
    const pool = open.length ? open : named
    if (pool.length === 1) main = pool[0]
    else if (!building.length) return { error: 'No building permit found at this address on the county site.' }
    else return { needsPick: true, candidates: building.map(summary) }
  }

  // Trade permits filed for the same project: same address (already), same
  // project name, within 60 days of the building permit.
  const near = (d) => !d || !main.date || Math.abs(new Date(d) - new Date(main.date)) <= 60 * 86400000
  const trades = rows.filter(r => TRADE_RE.test(r.record) && near(r.date) &&
    (nameWords(r.projectName).join(' ') === nameWords(main.projectName).join(' ') || r.description === main.description))

  // The permits side by side, then the notes we don't have yet, a few at a
  // time — the first check of a job reads them all, so this is what's slow.
  const known = new Set((job.knownNotes || []).map(String))
  const pages = await Promise.all([main, ...trades].map(r => fetchPermit(r.capIds)))
  const todo = []
  pages.forEach((p, k) => {
    const r = k === 0 ? main : trades[k - 1]
    for (const ins of p.completed) if (!known.has(ins.id)) todo.push({ ins, record: p.record, capIds: r.capIds })
  })
  await inBatches(todo.slice(0, MAX_NEW_NOTES), 4, async (t) => {
    if (Date.now() > job.deadline) return   // out of time: the next pulse reads the rest
    try { t.ins.notes = await fetchInspectionNotes(t.record, t.capIds, t.ins.id) } catch { /* next pulse tries again */ }
  })
  const permits = pages.map((p, k) => {
    const r = k === 0 ? main : trades[k - 1]
    return { ...summary(r), role: k === 0 ? 'building' : 'trade', recordStatus: p.recordStatus, expires: p.expires, upcoming: p.upcoming, completed: p.completed }
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
  const staff = await requireAuth(req, res)
  if (!staff) return
  const token = (req.headers.authorization || '').replace(/^Bearer /, '') || req.headers['x-qx-token']
  const role = await staffRole(token, staff)
  if (role !== 'office' && role !== 'admin') return res.status(403).json({ error: 'Only the office can run the permit check.' })

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const jobs = (Array.isArray(body.jobs) ? body.jobs : []).slice(0, MAX_JOBS).map(j => ({
    id: String(j?.id ?? ''),
    address: String(j?.address || '').slice(0, 200),
    client: String(j?.client || '').slice(0, 120),
    pick: Array.isArray(j?.pick) ? j.pick.map(String).slice(0, 3) : null,
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
      results[job.id] = { error: `Couldn't read the county site: ${e.message}`, checkedAt }
    }
  })
  res.status(200).json({ results })
}
