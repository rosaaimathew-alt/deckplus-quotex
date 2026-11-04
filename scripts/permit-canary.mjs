// County permit connection self-test — run by .github/workflows/permit-canary.yml
// twice a day (before the 8 AM and 1 PM inspection checks) and by hand:
//   node scripts/permit-canary.mjs
//
// Reads one known permit through the same code the app's inspection check
// uses (api/_accela.js), step by step, so a county site that's down, blocks
// us, or changes its pages shows up here even on days nobody opens the app.
// Prints one PASS/FAIL line per step and exits 1 if anything failed.
//
// PERMIT_CANARY_RECORD: a Mecklenburg permit with finished inspections and
// inspector notes (defaults to one of ours).
import { searchByRecord, searchByAddress, fetchPermit, fetchInspectionNotes } from '../api/_accela.js'

const record = (process.env.PERMIT_CANARY_RECORD || 'RES-ADD-25-000149').trim().toUpperCase()
const results = []
async function step(name, fn) {
  try {
    results.push({ name, ok: true, detail: await fn() })
  } catch (err) {
    results.push({ name, ok: false, detail: err.message })
    throw err
  }
}

let row, permit
try {
  await step('Mecklenburg: find a permit by its number', async () => {
    ;[row] = await searchByRecord(record)
    if (!row?.capIds) throw new Error(`Search for ${record} returned nothing — the search form may have changed`)
    return `${row.record} · ${row.status}`
  })
  await step('Mecklenburg: read the permit and its inspection list', async () => {
    permit = await fetchPermit(row.capIds)
    if (permit.record !== record) throw new Error(`Opened ${permit.record || 'an unreadable page'} instead of ${record}`)
    if (!permit.completed.length) throw new Error('No finished inspections read — the inspection list may have changed')
    const bad = permit.completed.filter(i => !i.result || !i.date || !i.code)
    if (bad.length) throw new Error(`${bad.length} inspection(s) read without a result, date or code`)
    return `${permit.completed.length} finished inspection(s), latest ${permit.completed.at(-1).code} ${permit.completed.at(-1).result}`
  })
  await step('Mecklenburg: read an inspector\'s notes', async () => {
    const withNotes = await fetchInspectionNotes(record, row.capIds, permit.completed[0].id)
    if (!withNotes.length) throw new Error('No notes read from "View Details" — that page may have changed')
    return `${withNotes.length} note(s)`
  })
  await step('Mecklenburg: find the permit by its address', async () => {
    const [, number, street] = String(row.address).match(/^(\d+)\s+([A-Za-z]+)/) || []
    if (!number) throw new Error(`Couldn't read the permit's address (${row.address})`)
    const rows = await searchByAddress(number, street)
    if (!rows.some(r => r.record === record)) throw new Error('The address search no longer lists the permit')
    return `${rows.length} record(s) at the address`
  })
} catch { /* reported below */ }

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name} — ${r.detail}`)
process.exit(results.every(r => r.ok) ? 0 : 1)
