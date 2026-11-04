// ── Evolve permit portals (Infovision "Evolve Public") ───────────────────────
// Union County NC, York County SC, Rock Hill, Lancaster County SC, Tega Cay.
// Public, no login: "Permit Search" by address lists every permit there with
// its number, status, type ("501 - Building Addition") and contractor
// ("Deck Plus, LLC"); "Permit Details" lists every inspection — building,
// electrical, mechanical, plumbing — with date, status and the inspector's
// comment (in the row's screen-reader label).
//
// The pages are ASP.NET WebForms with async postbacks: we replay them with a
// cookie jar, carrying the hidden form fields (view state) from each answer
// into the next request, exactly as the browser does.

const UA = 'Mozilla/5.0 (compatible; DeckPlusQuoteX/1.0; permit status check)'

export const EVOLVE_SITES = {
  Union:     { county: 'Union',     base: 'https://ucinspect.unioncountync.gov/EvolvePublic/' },
  York:      { county: 'York',      base: 'https://evolvepublic.yorkcountygov.com/' },
  RockHill:  { county: 'York', jurisdiction: 'Rock Hill', base: 'https://rhbuild.cityofrockhill.com/evolvepublic/' },
  Lancaster: { county: 'Lancaster', base: 'https://evolvepublic.infovisionsoftware.com/lancaster/' },
}

// ── HTTP with a cookie jar, staying on the portal's own host ────────────────
function client(base) {
  const origin = new URL(base).origin
  const jar = new Map()
  const keep = (res) => {
    const set = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') || '').split(/,(?=\s*[^;,=\s]+=)/)
    for (const c of set) {
      const [pair] = c.split(';'); const i = pair.indexOf('=')
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim())
    }
  }
  return async function request(url, { method = 'GET', body, headers = {} } = {}) {
    let next = url
    for (let hop = 0; hop < 6; hop++) {
      if (new URL(next).origin !== origin) throw new Error('Unexpected redirect off the permit site')
      const res = await fetch(next, {
        method, body, redirect: 'manual',
        headers: { 'User-Agent': UA, Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
        signal: AbortSignal.timeout(20000),
      })
      keep(res)
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        next = new URL(res.headers.get('location'), next).toString(); method = 'GET'; body = undefined; continue
      }
      if (!res.ok) throw new Error(`Permit site answered ${res.status}`)
      return { url: next, text: await res.text() }
    }
    throw new Error('Too many redirects from the permit site')
  }
}

const decode = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
const strip = (s) => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()

// Hidden fields and the form's other inputs, as the browser would post them.
function formFields(html) {
  const fields = new Map()
  for (const tag of html.match(/<input\b[^>]*>/gi) || []) {
    const attr = (n) => tag.match(new RegExp(`\\b${n}\\s*=\\s*"([^"]*)"`, 'i'))?.[1]
    const name = attr('name'); if (!name) continue
    const type = (attr('type') || 'text').toLowerCase()
    if (['submit', 'button', 'image', 'file', 'reset', 'checkbox', 'radio'].includes(type)) continue
    fields.set(decode(name), decode(attr('value') || ''))
  }
  for (const sel of html.match(/<select\b[\s\S]*?<\/select>/gi) || []) {
    const name = sel.match(/\bname="([^"]*)"/i)?.[1]; if (!name) continue
    const opt = sel.match(/<option[^>]*selected[^>]*value="([^"]*)"/i) || sel.match(/<option[^>]*value="([^"]*)"/i)
    fields.set(decode(name), decode(opt?.[1] || ''))
  }
  return fields
}

// An async-postback answer: "len|type|id|content|" records. Returns the HTML
// of the updated panels and applies hidden-field updates to `fields`.
function readDelta(text, fields) {
  let i = 0, html = ''
  while (i < text.length) {
    const a = text.indexOf('|', i); if (a < 0) break
    const len = Number(text.slice(i, a))
    const b = text.indexOf('|', a + 1); const c = text.indexOf('|', b + 1)
    if (!Number.isFinite(len) || b < 0 || c < 0) break
    const type = text.slice(a + 1, b), id = text.slice(b + 1, c)
    const content = text.slice(c + 1, c + 1 + len)
    if (type === 'hiddenField') fields.set(id, content)
    else if (type === 'updatePanel') html += content
    else if (type === 'pageRedirect') { const e = new Error('The permit site sent us back to its start page'); e.redirect = true; throw e }
    i = c + 1 + len + 1
  }
  return html
}

// One portal session: start page, then postbacks that keep the view state.
async function session(site) {
  const request = client(site.base)
  const start = await request(site.base)
  const fields = formFields(start.text)
  const scriptManager = start.text.match(/Sys\.WebForms\.PageRequestManager\._initialize\('([^']+)'/)?.[1] || 'ScriptManager1'
  // Some links reload the whole page instead of one panel (Lancaster's
  // menu): then post the form normally and read the new page.
  // `button`: a submit button clicked (sent with this request only).
  async function postback(target, panel, extra = {}, argument = '', { full = false, button = null } = {}) {
    const body = new URLSearchParams()
    for (const [k, v] of fields) body.set(k, v)
    for (const [k, v] of Object.entries(extra)) { body.set(k, v); fields.set(k, v) }
    if (button) body.set(button.name, button.value)
    body.set('__EVENTTARGET', target); body.set('__EVENTARGUMENT', argument)
    if (!full) { body.set(scriptManager, `${panel}|${target || button?.name || ''}`); body.set('__ASYNCPOST', 'true') }
    const res = await request(start.url, {
      method: 'POST', body: body.toString(),
      headers: full
        ? { 'Content-Type': 'application/x-www-form-urlencoded', Referer: start.url }
        : { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-MicrosoftAjax': 'Delta=true', 'X-Requested-With': 'XMLHttpRequest', Referer: start.url },
    })
    if (full) {
      for (const [k, v] of formFields(res.text)) fields.set(k, v)
      return res.text
    }
    try { return readDelta(res.text, fields) } catch (e) {
      if (e.redirect) return postback(target, panel, extra, argument, { full: true, button })
      throw e
    }
  }
  return { postback, start }
}

const toIsoDate = (mdy) => {
  const m = String(mdy || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : ''
}
const span = (html, id) => strip(html.match(new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</span>`, 'i'))?.[1] || '')

// "202507480 (Issued 10/29/2025)" → { record, status, date }
function parseLine3(s) {
  const m = s.match(/^(\S+)\s*\((\w[\w ]*?)\s+(\d{1,2}\/\d{1,2}\/\d{4})\)/)
  return m ? { record: m[1], status: m[2], date: toIsoDate(m[3]) } : { record: s.split(' ')[0], status: '', date: '' }
}

// ── Search by address ────────────────────────────────────────────────────────
// query: "405 Appomatox" (house number + street name). Keeps the session so a
// result's details can be opened from the same list.
export async function searchAddress(site, query) {
  const s = await session(site)
  // The "Permit Search" link is in a different menu / position on each site
  const menu = decode(s.start.text).match(/__doPostBack\('(BL_Menu\d*)','(\d+)'\)"[^>]*>\s*Permit Search\s*</i)
  if (!menu) throw new Error('No "Permit Search" link on the permit site')
  let form = await s.postback(menu[1], 'UP_MenuLeft', {}, menu[2])
  // Search by address: "Address or Location" (one box) or "Address" (house
  // number and street in separate boxes), whichever this site offers.
  const option = decode(form.match(/<select[^>]*name="DL_SearchType"[\s\S]*?<\/select>/i)?.[0]
    ?.match(/<option[^>]*value="(Address[^"]*)"/i)?.[1] || 'Address')
  const [, number = '', street = query] = String(query).match(/^\s*(\d+)\s+(.+)$/) || []
  const split = /name="TB_SearchText2"/.test(form)
  const values = split
    ? { DL_SearchType: option, TB_SearchText1: number, TB_SearchText2: street }
    : { DL_SearchType: option, TB_SearchText1: query }
  // A real submit button (York, Lancaster) posts its own name; a link posts
  // itself as the event target (Union, Rock Hill).
  const submit = /<input[^>]*name="BT_Search"[^>]*type="submit"|<input[^>]*type="submit"[^>]*name="BT_Search"/i.test(form)
  const html = submit
    ? await s.postback('', 'UP_Search', values, '', { button: { name: 'BT_Search', value: 'Search' } })
    : await s.postback('BT_Search', 'UP_Search', values)
  return { rows: parseResults(html), session: s }
}

// Two result layouts: Union / Rock Hill list each permit as
//   address / "202507480 (Issued 10/29/2025)" / "501 - Building Addition" / contractor
// York / Lancaster as
//   type letter (R, E, M…) / "202602524 (Issued)" / address / contractor
export function parseResults(html) {
  const rows = []
  for (let k = 0; html.includes(`ItemsList_LBT_ResultsLine1_${k}"`); k++) {
    rows.push({
      index: k, target: `ItemsList$ctl${String(k).padStart(2, '0')}$BT_ResultsAction`,
      address: span(html, `ItemsList_LBT_ResultsLine1_${k}`),
      ...parseLine3(span(html, `ItemsList_LBT_ResultsLine3_${k}`)),
      type: span(html, `ItemsList_LBT_ResultsLine2_${k}`),
      contractor: span(html, `ItemsList_LBT_ResultsLine4_${k}`),
    })
  }
  for (let k = 0; html.includes(`GV_SearchResults_LBT_ResultsLine1_${k}"`); k++) {
    const link = (id) => strip(html.match(new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</a>`, 'i'))?.[1] || '')
    const line1 = link(`GV_SearchResults_LBT_ResultsLine1_${k}`).match(/^(\S+)\s*\(([^)]*)\)/) || []
    const letter = span(html, `GV_SearchResults_LB_ResultsIndicator_${k}`)
    rows.push({
      index: k,
      target: decode(html).match(new RegExp(`id="GV_SearchResults_LBT_ResultsDetails_${k}"[^>]*href="javascript:__doPostBack\\('([^']+)'`, 'i'))?.[1]
        || `GV_SearchResults$ctl${String(k + 2).padStart(2, '0')}$LBT_ResultsDetails`,
      record: line1[1] || '', status: line1[2] || '', date: '',
      address: link(`GV_SearchResults_LBT_ResultsLine2_${k}`),
      contractor: link(`GV_SearchResults_LBT_ResultsLine3_${k}`),
      type: ({ R: 'Residential', E: 'Electrical', M: 'Mechanical', P: 'Plumbing', B: 'Building', G: 'Gas' })[letter] || letter,
    })
  }
  return rows
}

// ── Permit details: inspections with comments ──────────────────────────────
const STATUS = (s) => /^not approved|^disapproved|^fail/i.test(s) ? 'Failed'
  : /^approved|^pass/i.test(s) ? 'Passed'
    : /partial/i.test(s) ? 'Partial Approval' : s

// Which trade an inspection belongs to, from its name
const tradeOf = (name) => /electric|meter|saw service/i.test(name) ? 'ELC'
  : /mechanical|gas line|hvac/i.test(name) ? 'MEC'
    : /plumb|water line|sewer|shower pan/i.test(name) ? 'PLM' : ''

const CODES = [
  [/footing|foundation|pier/i, 'FT'], [/slab|ditch/i, 'SL'], [/fram/i, 'FR'],
  [/rough/i, 'RF'], [/insulation/i, 'IN'], [/final/i, 'FI'],
]
const codeOf = (name) => (CODES.find(([re]) => re.test(name)) || [null, '?'])[1]

export async function permitDetails(searchResult, row) {
  const html = await searchResult.session.postback(row.target, 'UP_Results')
  const lines = strip(html).split(/\s{2,}/)
  // "Label" then its value: a DetailsFieldValue span (Union / Rock Hill) or
  // the next table cell (York / Lancaster)
  const field = (label) => {
    const m = html.match(new RegExp(`>\\s*${label}\\s*<[\\s\\S]{0,400}?class="DetailsFieldValue"[^>]*>([\\s\\S]*?)</span>`, 'i'))
      || html.match(new RegExp(`>\\s*${label}\\s*</td>\\s*<td[^>]*>([\\s\\S]*?)</td>`, 'i'))
    return m ? strip(m[1]) : ''
  }
  const inspections = []
  // York / Lancaster: a plain table — Name | Status | Date
  const table = html.match(/<table[^>]*id="GV_PermitInspections"[\s\S]*?<\/table>/i)?.[0] || ''
  if (table && !table.includes('GV_PermitInspections_LB_InspectionName_')) {
    const trs = table.split(/<tr\b/i).slice(1).map(tr => [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => strip(m[1]))).filter(c => c.length >= 3)
    trs.forEach(([name, rawStatus, date], k) => {
      if (!date || !/\d/.test(date)) return
      inspections.push({ id: `${row.record}-${k}`, date: toIsoDate(date), name, rawStatus, result: STATUS(rawStatus), code: codeOf(name), trade: tradeOf(name), notes: [] })
    })
  }
  for (let k = 0; ; k++) {
    if (!html.includes(`GV_PermitInspections_LB_InspectionName_${k}"`)) break
    const date = span(html, `GV_PermitInspections_LB_InspectionDate_${k}`)
    const name = span(html, `GV_PermitInspections_LB_InspectionName_${k}`)
    const rawStatus = span(html, `GV_PermitInspections_LB_InspectionStatus_${k}`)
    if (!date) continue   // a required inspection not done or scheduled yet
    // The comment follows "<date> inspection <name> <status>" in the label
    const label = decode(html.match(new RegExp(`id="GV_PermitInspections_LB_ADA_${k}"[^>]*aria-label="([^"]*)"`, 'i'))?.[1] || '')
    const comment = label.replace(/^\S+\s+inspection\s+/i, '').replace(name, '').replace(rawStatus, '')
      .replace(/\d+\.\d{2} Fee Charged/i, '').replace(/\s+/g, ' ').trim()
    inspections.push({
      id: `${row.record}-${k}`, date: toIsoDate(date), name, rawStatus,
      result: STATUS(rawStatus), code: codeOf(name), trade: tradeOf(name),
      notes: comment ? [{ by: '', at: date, text: comment }] : [],
    })
  }
  return {
    record: row.record, status: row.status, type: row.type, address: row.address, contractor: row.contractor,
    description: field('Description'), owner: field('Owner Name'), jurisdiction: field('Jurisdiction'),
    inspections, text: lines.length,
  }
}
