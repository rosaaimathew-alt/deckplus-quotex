// ── Mecklenburg County permit portal (Accela Citizen Access) ─────────────────
// Reads a permit's status and inspections from the public record page:
//   https://aca-prod.accela.com/MECKLENBURG/Cap/CapDetail.aspx?…capID1..3…
//
// The record page itself never lists the inspections; the browser fills them in
// with an ASP.NET "async postback" (the Inspections panel's hidden refresh
// button). We do the same: load the page with a cookie jar, then post its
// form back with __EVENTTARGET = that button, and read the panel HTML that
// comes back.
//
// A completed inspection reads, in the returned HTML:
//   <span>Passed</span> <span>FT - Footing (232867)</span><br>
//   <span>Result by: Bryan Guzman Lopez on 10/31/2025 at 05:05 PM</span>
//
// The inspector's notes are on each inspection's "View Details" page, and a
// job's permit is found with the Building search form (street number + name),
// whose results list the record, its type, project name (our client name),
// address and status.

const ORIGIN = 'https://aca-prod.accela.com'
const BASE = `${ORIGIN}/MECKLENBURG`
const UA = 'Mozilla/5.0 (compatible; DeckPlusQuoteX/1.0; permit status check)'
const REFRESH_BTN = 'ctl00$PlaceHolderMain$InspectionList$btnRefreshGridView'
const UPDATE_PANEL = 'ctl00$PlaceHolderMain$InspectionList$inspectionUpdatePanel'

// "RES-ADD-26-000807", "RES-ALT-26-001778"
export const RECORD_RE = /^[A-Z]{2,5}-[A-Z]{2,5}-\d{2}-\d{4,7}$/
// capID1..3 of a record page link, e.g. REC26 / 00000 / 026G2
const CAP_ID_RE = /^[A-Z0-9]{1,10}$/

export function capIdsFromUrl(url) {
  try {
    const u = new URL(url)
    if (u.origin !== ORIGIN) return null
    const ids = ['capID1', 'capID2', 'capID3'].map(k => u.searchParams.get(k) || '')
    return ids.every(v => CAP_ID_RE.test(v)) ? ids : null
  } catch { return null }
}

export function recordUrl([id1, id2, id3]) {
  return `${BASE}/Cap/CapDetail.aspx?Module=Building&TabName=Building&capID1=${id1}&capID2=${id2}&capID3=${id3}&agencyCode=MECKLENBURG&IsToShowInspection=`
}

// ── Tiny HTTP client with a cookie jar (the postback needs the session) ─────
function client() {
  const jar = new Map()
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  const keep = (res) => {
    const set = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') || '').split(/,(?=\s*[^;,=\s]+=)/)
    for (const c of set) {
      const [pair] = c.split(';')
      const i = pair.indexOf('=')
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim())
    }
  }
  return async function request(url, { method = 'GET', body, headers = {} } = {}) {
    let next = url
    for (let hop = 0; hop < 6; hop++) {
      if (!next.startsWith(ORIGIN + '/')) throw new Error('Unexpected redirect off the county site')
      const res = await fetch(next, {
        method, body, redirect: 'manual',
        headers: { 'User-Agent': UA, Cookie: cookieHeader(), ...headers },
        signal: AbortSignal.timeout(20000),
      })
      keep(res)
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        next = new URL(res.headers.get('location'), next).toString()
        method = 'GET'; body = undefined
        continue
      }
      if (!res.ok) throw new Error(`County site answered ${res.status}`)
      return { url: next, text: await res.text() }
    }
    throw new Error('Too many redirects from the county site')
  }
}

// ── HTML helpers ─────────────────────────────────────────────────────────────
const decode = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
const textOf = (html) => decode(String(html || '')
  .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<[^>]+>/g, '\n'))
  .split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean)

// Every field the page's form would post back.
function formFields(html) {
  const fields = new URLSearchParams()
  const form = html.match(/<form[^>]*id="aspnetForm"[\s\S]*?<\/form>/i)?.[0] || html
  for (const tag of form.match(/<input\b[^>]*>/gi) || []) {
    const attr = (n) => tag.match(new RegExp(`\\b${n}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
    const name = attr('name'); if (!name) continue
    const type = (attr('type')?.[1] || attr('type')?.[2] || 'text').toLowerCase()
    if (['submit', 'button', 'image', 'file', 'reset'].includes(type)) continue
    if ((type === 'checkbox' || type === 'radio') && !/\bchecked\b/i.test(tag)) continue
    const value = attr('value')
    fields.set(decode(name[1] ?? name[2]), decode(value ? (value[1] ?? value[2]) : ''))
  }
  for (const sel of form.match(/<select\b[\s\S]*?<\/select>/gi) || []) {
    const name = sel.match(/\bname="([^"]*)"/i); if (!name) continue
    const opt = sel.match(/<option[^>]*\bselected\b[^>]*value="([^"]*)"/i) || sel.match(/<option[^>]*value="([^"]*)"[^>]*\bselected\b/i) || sel.match(/<option[^>]*value="([^"]*)"/i)
    fields.set(decode(name[1]), decode(opt?.[1] || ''))
  }
  return fields
}

function headerInfo(html) {
  const lines = textOf(html)
  const after = (label) => { const i = lines.indexOf(label); return i >= 0 ? lines[i + 1] || '' : '' }
  const recIdx = lines.indexOf('Record')
  return {
    record: recIdx >= 0 && RECORD_RE.test(lines[recIdx + 1] || '') ? lines[recIdx + 1] : '',
    recordType: recIdx >= 0 && lines[recIdx + 2] === ':' ? lines[recIdx + 3] || '' : '',
    recordStatus: after('Record Status:'),
    expires: after('Expiration Date:'),
  }
}

const toIsoDate = (mdy) => {
  const m = String(mdy || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  return m ? `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : ''
}

// One row of the Upcoming or Completed grid → an inspection.
//   ["Passed", "FT - Footing (232867)", "Result by: Bryan Guzman Lopez on 10/31/2025 at 05:05 PM"]
//   ["Scheduled", "FR - Framing (271234)", "11/04/2026 AM", "Inspector: …"]
function parseRow(lines, section) {
  const joined = lines.join(' | ')
  const head = joined.match(/^(.*?)\s*\|?\s*([A-Z]{1,4} - [^|()]+?)\s*\((\d+)\)/)
  if (!head) return null
  // Completed rows start with the result ("Passed"); upcoming rows with
  // "10/29/2026 at TBD Scheduled".
  const lead = head[1].replace(/\|/g, ' ').replace(/\s+/g, ' ').trim()
  const leadDate = lead.match(/(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+at\s+([^A-Za-z]*[AP]M|TBD))?/i)
  const status = lead.replace(/\d{1,2}\/\d{1,2}\/\d{4}(?:\s+at\s+(?:[\d:]+\s*[AP]M|TBD))?/i, '').trim()
  const [code, ...rest] = head[2].split(' - ')
  const by = joined.match(/Result by:\s*(.+?)\s+on\s+(\d{1,2}\/\d{1,2}\/\d{4})(?:\s+at\s+([\d:]+\s*[AP]M))?/i)
  const anyDate = joined.slice(head.index + head[0].length).match(/(\d{1,2}\/\d{1,2}\/\d{4})/)
  const inspector = by?.[1] || joined.match(/Inspector:\s*([^|]+)/i)?.[1]?.trim() || ''
  return {
    id: head[3],
    code: code.trim(),
    name: rest.join(' - ').trim(),
    result: section === 'completed' ? status : '',
    status: section === 'completed' ? 'completed' : (status || 'Scheduled'),
    date: toIsoDate(by?.[2] || leadDate?.[1] || anyDate?.[1]),
    time: by?.[3] || (leadDate?.[2] && leadDate[2] !== 'TBD' ? leadDate[2] : ''),
    inspector,
  }
}

function parseGrid(html, gridId, section) {
  const grid = html.match(new RegExp(`<table[^>]*id="[^"]*${gridId}"[\\s\\S]*?</table>\\s*</td>\\s*</tr>\\s*</table>`, 'i'))?.[0]
    || html.match(new RegExp(`id="[^"]*${gridId}"[\\s\\S]*?(?=<div id="ctl00_PlaceHolderMain_InspectionList_(?:completedPanel|divInspectionListCompleted)|$)`, 'i'))?.[0]
    || ''
  const rows = grid.split(/<tr class="InspectionListRow/i).slice(1)
  return rows.map(r => parseRow(textOf('<x ' + r).filter(l => l !== 'View Details' && !/^Actions?$/i.test(l)), section)).filter(Boolean)
}

export function parseInspections(panelHtml) {
  const completedAt = panelHtml.search(/id="[^"]*InspectionList_completedPanel"/i)
  const upcomingHtml = completedAt > 0 ? panelHtml.slice(0, completedAt) : panelHtml
  const completedHtml = completedAt > 0 ? panelHtml.slice(completedAt) : ''
  return {
    upcoming: parseGrid(upcomingHtml, 'gvListUpcoming', 'upcoming'),
    completed: parseGrid(completedHtml, 'gvListCompleted', 'completed'),
  }
}

// ── Public: everything we can read about one permit ─────────────────────────
// capIds: [capID1, capID2, capID3] from the record page link.
export async function fetchPermit(capIds) {
  const request = client()
  const url = recordUrl(capIds)
  const page = await request(url)
  const info = headerInfo(page.text)
  if (!info.record) throw new Error('Permit page not found on the county site')

  const fields = formFields(page.text)
  fields.set('ctl00$ScriptManager1', `${UPDATE_PANEL}|${REFRESH_BTN}`)
  fields.set('__EVENTTARGET', REFRESH_BTN)
  fields.set('__EVENTARGUMENT', '')
  fields.set('__ASYNCPOST', 'true')
  const delta = await request(page.url, {
    method: 'POST',
    body: fields.toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-MicrosoftAjax': 'Delta=true',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: page.url,
    },
  })
  if (!/InspectionList/.test(delta.text)) throw new Error('County site did not return the inspection list')
  const { upcoming, completed } = parseInspections(delta.text)
  return { ...info, url, upcoming, completed, checkedAt: new Date().toISOString() }
}

// ── Inspector notes ("Result Comments" on the View Details page) ────────────
export async function fetchInspectionNotes(record, capIds, inspectionId) {
  if (!RECORD_RE.test(record) || !/^\d{1,10}$/.test(String(inspectionId))) return []
  const [id1, id2, id3] = capIds
  const url = `${BASE}/Inspection/InspectionDetails.aspx?agencyCode=MECKLENBURG&RecordAltID=${record}` +
    `&RecordID1=${id1}&RecordID2=${id2}&RecordID3=${id3}&Module=Building&PublicUserID=PUBLICUSER0` +
    `&ScheduledType=Unknown&Action=ViewDetails&ID=${inspectionId}&IsFromWizardPage=False&RequestDayOption=0` +
    `&ContactChangeOption=Unknown&isPopup=Y&Status=Unknown&NavigationBeginPage=ViewDetails&TimeOption=Unknow`
  const { text } = await client()(url)
  return parseNotes(textOf(text))
}

// Lines after the second "Result Comments" heading ("Showing 1-1 of 1"):
//   Alberto Galigniana / (8/4/2026 4:35 PM) / Pool and back deck footing …
export function parseNotes(lines) {
  let i = lines.findIndex((l, k) => l === 'Result Comments' && /^Showing /.test(lines[k + 1] || ''))
  if (i < 0) return []
  i += 2
  const end = lines.indexOf('Related Inspections', i)
  const part = lines.slice(i, end < 0 ? undefined : end)
  const notes = []
  for (let k = 0; k < part.length; k++) {
    const when = (part[k + 1] || '').match(/^\((.+)\)$/)
    if (when) { notes.push({ by: part[k], at: when[1], text: '' }); k++; continue }
    if (notes.length) notes[notes.length - 1].text = `${notes[notes.length - 1].text} ${part[k]}`.trim()
  }
  return notes.filter(n => n.text)
}

// ── Find a job's permit by address ──────────────────────────────────────────
const SEARCH_URL = `${BASE}/Cap/CapHome.aspx?module=Building&TabName=Building`
const F = 'ctl00$PlaceHolderMain$generalSearchForm$'

// A record by its number ("RES-ADD-26-000807"), via the same search form.
export async function searchByRecord(record) {
  const rec = String(record || '').trim().toUpperCase()
  if (!RECORD_RE.test(rec)) return []
  return runSearch({ [`${F}txtGSPermitNumber`]: rec })
}

export async function searchByAddress(number, street) {
  const num = String(number || '').replace(/\D/g, '').slice(0, 8)
  const name = String(street || '').replace(/[^A-Za-z0-9 '-]/g, '').trim().slice(0, 40)
  if (!num || !name) return []
  return runSearch({ [`${F}txtGSNumber$ChildControl0`]: num, [`${F}txtGSStreetName`]: name })
}

async function runSearch(values) {
  const request = client()
  const page = await request(SEARCH_URL)
  const fields = formFields(page.text)
  for (const [k, v] of Object.entries(values)) fields.set(k, v)
  fields.set('ctl00$ScriptManager1', 'ctl00$PlaceHolderMain$updatePanel|ctl00$PlaceHolderMain$btnNewSearch')
  fields.set('__EVENTTARGET', 'ctl00$PlaceHolderMain$btnNewSearch')
  fields.set('__EVENTARGUMENT', '')
  fields.set('__ASYNCPOST', 'true')
  const res = await request(page.url, {
    method: 'POST',
    body: fields.toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-MicrosoftAjax': 'Delta=true',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: page.url,
    },
  })
  const rows = parseSearchResults(res.text)
  if (rows.length) return rows
  // A single match skips the list: the response just redirects to the record.
  const redirect = res.text.match(/\|pageRedirect\|\|([^|]+)\|/)
  if (!redirect) return []
  const capIds = capIdsFromUrl(new URL(decodeURIComponent(redirect[1]), ORIGIN).toString())
  if (!capIds) return []
  const detail = await request(recordUrl(capIds))
  return [rowFromDetail(detail.text, capIds)].filter(r => r.record)
}

// The same fields a search-results row has, read off a record page.
function rowFromDetail(html, capIds) {
  const info = headerInfo(html)
  const lines = textOf(html)
  const loc = lines.indexOf('Work Location')
  const address = loc >= 0 ? `${lines[loc + 1] || ''}, ${lines[loc + 2] || ''}` : ''
  const pd = lines.indexOf('Project Description:')
  const own = pd >= 0 ? lines.indexOf('Owner:', pd) : -1
  const desc = pd >= 0 ? lines.slice(pd + 1, own > pd ? own : pd + 4) : []
  return {
    date: '', record: info.record, type: info.recordType, description: desc.slice(1).join(' / '),
    projectName: desc[0] || '', address, status: info.recordStatus, capIds,
  }
}

export function parseSearchResults(html) {
  const rows = html.split(/<tr class="ACA_TabRow_(?:Odd|Even)/i).slice(1)
  const span = (row, id) => decode(row.match(new RegExp(`id="[^"]*_${id}"[^>]*>([^<]*)<`, 'i'))?.[1] || '').trim()
  return rows.map(row => {
    const href = decode(row.match(/href="([^"]*CapDetail\.aspx[^"]*)"/i)?.[1] || '')
    const capIds = href ? capIdsFromUrl(new URL(href, ORIGIN).toString()) : null
    return {
      date: toIsoDate(span(row, 'lblUpdatedTime')),
      record: span(row, 'lblPermitNumber1'),
      type: span(row, 'lblType'),
      description: span(row, 'lblDescription'),
      projectName: span(row, 'lblProjectName'),
      address: span(row, 'lblAddress'),
      status: span(row, 'lblStatus'),
      capIds,
    }
  }).filter(r => r.record && r.capIds)
}
