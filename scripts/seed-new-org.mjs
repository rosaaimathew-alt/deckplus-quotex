#!/usr/bin/env node
// Seeds the new company's org from an export of today's QuoteX data, carrying
// every catalog item, template and scope description and blanking every price.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... ORG_NAME="New Company" \
//   node scripts/seed-new-org.mjs path/to/quotex-backup.json
//
// Accepts either the Settings → Export file ({ catalog, templates, ... }) or a
// raw store dump ({ state: { ... } }). Never writes proposals, customers,
// expenses, todos or job costs. Only reads the export; never touches the
// source instance. Idempotent by record id.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
const ORG_NAME = process.env.ORG_NAME || 'New Company'
const file = process.argv[2]
if (!url || !key || !file) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... ORG_NAME="..." node scripts/seed-new-org.mjs export.json')
  process.exit(1)
}

const raw = JSON.parse(readFileSync(file, 'utf8'))
const src = raw?.state || raw

// Money-looking keys are zeroed; descriptions, names, units, quantities and
// percentages are kept. Applied recursively so template line items and custom
// deck/porch components are covered too.
const PRICE_KEY = /price|rate|cost|margin|amount|total|labor|material/i
const KEEP_KEY  = /^(qty|quantity|count|confidence|pct|percent|order|id|days|lf|sqft|width|length|depth|height)$/i
function blankPrices(v) {
  if (Array.isArray(v)) return v.map(blankPrices)
  if (v && typeof v === 'object') {
    const out = {}
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === 'number' && PRICE_KEY.test(k) && !KEEP_KEY.test(k)) out[k] = 0
      else out[k] = blankPrices(val)
    }
    return out
  }
  return v
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
const fail = (step, error) => { console.error(`${step}: ${error.message || error}`); process.exit(1) }

const { data: org, error: orgErr } = await sb.from('orgs').select('id').eq('name', ORG_NAME).maybeSingle()
if (orgErr) fail('find org', orgErr)
if (!org) fail('find org', new Error(`org "${ORG_NAME}" not found — run scripts/seed-users.mjs first`))

async function upsertAll(table, records) {
  const rows = (records || [])
    .filter(r => r && r.id != null)
    .map(r => ({ id: String(r.id), org_id: org.id, data: blankPrices(r), deleted_at: null }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 500), { onConflict: 'org_id,id' })
    if (error) fail(`upsert ${table}`, error)
  }
  console.log(`${table.padEnd(26)} ${rows.length} rows`)
}

await upsertAll('catalog_items',     src.catalog)
await upsertAll('templates',         src.templates)
await upsertAll('scope_templates',   src.scopeTemplates)
await upsertAll('payment_schedules', src.paymentSchedules)   // percentages, not prices
await upsertAll('email_templates',   src.emailTemplates)
await upsertAll('subcontractors',    src.subcontractors)

// Settings: carry types, categories and scope text; blank rates; leave branding.
const settingsPatch = {}
for (const k of ['projectTypes', 'catalogCategories', 'deckScopeTemplate', 'porchScopeTemplate', 'scopeExamples']) {
  if (src[k] !== undefined) settingsPatch[k] = src[k]
}
for (const k of ['deckComponentRates', 'porchComponentRates', 'deckCustomComponents', 'porchCustomComponents']) {
  if (src[k] !== undefined) settingsPatch[k] = blankPrices(src[k])
}
settingsPatch.deckFormulaLocked = false
settingsPatch.porchFormulaLocked = false
if (Object.keys(settingsPatch).length) {
  const { data: cur } = await sb.from('org_settings').select('data').eq('org_id', org.id).maybeSingle()
  const { error } = await sb.from('org_settings')
    .upsert({ org_id: org.id, data: { ...(cur?.data || {}), ...settingsPatch } }, { onConflict: 'org_id' })
  if (error) fail('settings', error)
  console.log(`org_settings              ${Object.keys(settingsPatch).length} keys`)
}

console.log('\nDone. No proposals, customers, expenses, todos or job costs were written.')
