// ── Deck Plus contract packet — fill-in logic ────────────────────────────────
// Everything that decides WHAT goes into the blanks of the attorney-reviewed
// packet (src/contract/deckPlusAgreement.js). The wording itself lives there
// and is never touched here; this file only computes values, checkbox ids,
// and which signature fields each party owes.
import { INITIALS, PACKET_FORMS, defaultPacketForms } from './deckPlusAgreement'

export const PACKET_VERSION = 'deckplus-2026-07'

const fmtMoney = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtDate = (d) => {
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt) ? '' : dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
export const fmtShortDate = (d) => {
  const dt = d instanceof Date ? d : new Date(d)
  return isNaN(dt) ? '' : dt.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
}

// "US$ 24,500.00 (Twenty-Four Thousand Five Hundred Dollars and 00/100)"
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
function wordsBelow1000(n) {
  const parts = []
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} Hundred`); n %= 100 }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '')) }
  else if (n > 0) parts.push(ONES[n])
  return parts.join(' ')
}
export function amountInWords(amount) {
  const n = Math.round(Number(amount || 0) * 100)
  if (!Number.isFinite(n)) return ''
  let dollars = Math.floor(n / 100)
  const cents = n % 100
  if (dollars === 0) return `Zero Dollars and ${String(cents).padStart(2, '0')}/100`
  const scales = ['', 'Thousand', 'Million', 'Billion']
  const chunks = []
  let i = 0
  while (dollars > 0 && i < scales.length) {
    const c = dollars % 1000
    if (c) chunks.unshift(`${wordsBelow1000(c)}${scales[i] ? ' ' + scales[i] : ''}`)
    dollars = Math.floor(dollars / 1000)
    i++
  }
  return `${chunks.join(' ')} Dollars and ${String(cents).padStart(2, '0')}/100`
}

// The agreement prints exactly four payment lines (clause 3). Map the quote's
// milestone schedule onto them: first → at signature, second → day job starts,
// last → after 1st punch list, anything in between → the labeled third line.
export function paymentsToSlots(payments = []) {
  const p = payments.filter(x => x && Number.isFinite(Number(x.amount)))
  const out = { pay1: '', pay2: '', pay3: '', pay3Label: '', pay4: '' }
  if (!p.length) return out
  if (p.length === 1) { out.pay1 = fmtMoney(p[0].amount); return out }
  out.pay1 = fmtMoney(p[0].amount)
  out.pay4 = fmtMoney(p[p.length - 1].amount)
  if (p.length >= 3) out.pay2 = fmtMoney(p[1].amount)
  if (p.length >= 4) {
    const mid = p.slice(2, -1)
    out.pay3 = fmtMoney(mid.reduce((s, x) => s + Number(x.amount), 0))
    out.pay3Label = mid.map(x => x.label).filter(Boolean).join(' / ')
  }
  return out
}

// "123 Maple Lane, Waxhaw, NC 28173" → street / city / state / zip
export function parseAddress(addr = '') {
  const m = /^(.*?),\s*([^,]+?),\s*([A-Za-z]{2}|North Carolina|South Carolina)\s*(\d{5}(?:-\d{4})?)?\s*$/i.exec(String(addr).trim())
  if (!m) return { street: addr || '', city: '', state: '', zip: '' }
  const st = /north/i.test(m[3]) ? 'NC' : /south/i.test(m[3]) ? 'SC' : m[3].toUpperCase()
  return { street: m[1].trim(), city: m[2].trim(), state: st, zip: m[4] || '' }
}
// The contract number without its prefix, for the "DP-____" blanks in the Release.
export const contractNumDigits = (num = '') => String(num).replace(/^[A-Za-z]+[-\s]?/, '')

export const STATES = ['NC', 'SC']
export const COUNTIES = {
  NC: ['Mecklenburg', 'Union', 'Cabarrus', 'Gaston', 'Iredell', 'Lincoln', 'Rowan', 'Stanly', 'Catawba', 'Cleveland', 'Anson'],
  SC: ['York', 'Lancaster', 'Chester', 'Chesterfield'],
}

// Values the packet fills in on its own when the contract is generated. The
// sales rep can overwrite any of them; `overrides` wins where set.
export function autoContractValues({ data = {}, total = 0, payments = [], projectTypes = [], contractNum = '', me = null, saleDate = null, specialInstructions = '', directions = '', projectSummary = '', overrides = {} }) {
  const today = new Date()
  const client = data.client || ''
  const types = (projectTypes || []).join(', ')
  const addr = parseAddress(data.address || '')
  const jobState = (overrides.jobState || addr.state || '').toUpperCase()
  const auto = {
    jobState,
    propertyStreet: addr.street, propertyCity: addr.city, propertyState: addr.state, propertyZip: addr.zip,
    companyStreet: '2225 Coronation Blvd', companyCity: 'Charlotte', companyState: 'NC', companyZip: '',
    contractNumDigits: contractNumDigits(contractNum || data.contractNumber || ''),
    releaseState: jobState === 'SC' ? 'SOUTH' : jobState === 'NC' ? 'NORTH' : '',
    capitalImprovement: [types, projectSummary].filter(Boolean).join(' — '),
    signerTitle: 'Owner',
    effectiveDate:      fmtDate(today),
    clientName:         client,
    propertyAddress:    data.address || '',
    contractTotal:      fmtMoney(total),
    contractTotalWords: amountInWords(total),
    ...paymentsToSlots(payments),
    contractNum:        contractNum || data.contractNumber || '',
    projectName:        [client, types].filter(Boolean).join(' – '),
    clientPhone:        data.phone || '',
    clientEmail:        data.email || '',
    jobName:            client,
    dateSold:           fmtShortDate(saleDate || today),
    projectType:        types,
    designConsultant:   data.salesperson || me?.displayName || '',
    specialInstructions,
    directions,
  }
  const out = { ...auto }
  for (const [k, v] of Object.entries(overrides || {})) if (v !== undefined && v !== null && v !== '') out[k] = v
  if (overrides.contractNum) out.contractNumDigits = contractNumDigits(overrides.contractNum)
  return out
}

// Signature-field ids in the packet, by party. `{{sig:client-…}}` belongs to
// the client; `{{sig:contractor-…}}` to Deck Plus (the "builder" role).
export const roleOfSigId = (id) => (id.startsWith('contractor-') ? 'builder' : 'client')
export const ROLE_LABELS = { client: 'Client', builder: 'Deck Plus' }

export const INITIAL_ITEM_IDS = [...INITIALS.items1, ...INITIALS.items2, ...INITIALS.items3].map(it => it.id)

export function requiredSignFields(role, packet = []) {
  const forms = PACKET_FORMS.filter(f => packet.includes(f.key)).map(f => f.key)
  if (role === 'client') {
    return [
      'client-agreement',
      'client-scope',
      ...INITIAL_ITEM_IDS.map(id => `init:${id}`),
      'client-initials',
      'client-unforeseen',
      ...forms.filter(k => !['e589', 'york'].includes(k)).map(k => `client-${k}`),
      'client-processing',
      'client-release',
      ...forms.filter(k => ['e589', 'york'].includes(k)).map(k => `client-${k}`),
    ]
  }
  if (role === 'builder') {
    return ['contractor-agreement', 'contractor-initials', 'contractor-unforeseen', ...forms.filter(k => !['e589', 'york'].includes(k)).map(k => `contractor-${k}`)]
  }
  return []
}

// Trade forms a job gets by default, from its project types and whether the
// quote includes electrical.
export function defaultPacket({ projectTypes = [], scopeLines = [], hasElectrical = false, state = '', county = '' }) {
  const types = (projectTypes || []).join(' ') + ' ' + (scopeLines || []).map(l => l?.name || '').join(' ')
  return defaultPacketForms({ types, hasElectrical, state, county })
}

// Checkbox ids the app can pre-tick from data it already knows.
export function autoChecks({ hoa = null, power = null, lumberDrop = null, projectTypes = [] }) {
  const c = {}
  if (hoa === 'yes') c.hoaYes = true
  if (hoa === 'no') c.hoaNo = true
  if (power === 'yes') c.powerYes = true
  if (power === 'no') c.powerNo = true
  if (lumberDrop === 'left') c.driveLeft = true
  if (lumberDrop === 'right') c.driveRight = true
  const t = (projectTypes || []).join(' ').toLowerCase()
  if (/screen/.test(t)) c.jt_screen = true
  if (/open porch/.test(t)) c.jt_open = true
  if (/eze|3.?season|sunroom|conversion/.test(t)) c.jt_3season = true
  return c
}
