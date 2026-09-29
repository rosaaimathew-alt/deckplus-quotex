#!/usr/bin/env node
// Creates the new company's org, its placeholder logins and its settings.
//
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_KEY=eyJ... \
//   ORG_NAME="New Company" SEED_PASSWORD='ChangeMe123!' SEED_EMAIL_DOMAIN=example.com \
//   node scripts/seed-users.mjs
//
// Idempotent: re-running updates roles/names and never duplicates anything.
// Placeholder emails/passwords are meant to be replaced in the Supabase Auth
// dashboard (or by re-running with real values) before real use.
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (the service_role key, never the anon key).')
  process.exit(1)
}

const ORG_NAME = process.env.ORG_NAME        || 'New Company'
const PASSWORD = process.env.SEED_PASSWORD   || 'ChangeMe123!'
const DOMAIN   = process.env.SEED_EMAIL_DOMAIN || 'example.com'
const PREFIX   = process.env.CONTRACT_PREFIX || 'DP'

// Three reps, two PMs, the office login and one admin.
const USERS = [
  { email: `rep1@${DOMAIN}`,   role: 'rep',    name: 'Sales Rep 1' },
  { email: `rep2@${DOMAIN}`,   role: 'rep',    name: 'Sales Rep 2' },
  { email: `rep3@${DOMAIN}`,   role: 'rep',    name: 'Sales Rep 3' },
  { email: `pm1@${DOMAIN}`,    role: 'pm',     name: 'Project Manager 1' },
  { email: `pm2@${DOMAIN}`,    role: 'pm',     name: 'Project Manager 2' },
  { email: `office@${DOMAIN}`, role: 'office', name: 'Office' },
  { email: `admin@${DOMAIN}`,  role: 'admin',  name: 'Admin' },
]

const DEFAULT_SETTINGS = {
  branding: { companyName: ORG_NAME.toUpperCase(), tagline: 'Smart Contractor Pricing', logo: null },
  contractPrefix: PREFIX,
  projectTypes: ['Open Deck', 'Screen Porches', 'Eze-Breeze Porches', 'Open Porches', 'Porch Conversions', 'Sunrooms', 'Hardscapes'],
  catalogCategories: ['Fencing', 'Gates', 'Demo', 'Materials', 'Labor', 'Framing', 'Concrete', 'Electrical',
    'Plumbing', 'Roofing', 'Flooring', 'Drywall', 'Painting', 'HVAC', 'Windows', 'Doors', 'Tile', 'Insulation', 'Siding', 'General'],
}

const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
const fail = (step, error) => { console.error(`${step}: ${error.message || error}`); process.exit(1) }

// Org
let { data: org, error: orgErr } = await sb.from('orgs').select('id').eq('name', ORG_NAME).maybeSingle()
if (orgErr) fail('find org', orgErr)
if (!org) {
  const res = await sb.from('orgs').insert({ name: ORG_NAME }).select('id').single()
  if (res.error) fail('create org', res.error)
  org = res.data
  console.log(`created org "${ORG_NAME}" (${org.id})`)
} else {
  console.log(`org "${ORG_NAME}" exists (${org.id})`)
}

// Settings: only seed when the org has none, so a re-run never resets branding.
const { data: existingSettings } = await sb.from('org_settings').select('org_id').eq('org_id', org.id).maybeSingle()
if (!existingSettings) {
  const res = await sb.from('org_settings').insert({ org_id: org.id, data: DEFAULT_SETTINGS })
  if (res.error) fail('seed settings', res.error)
  console.log(`seeded settings (contract prefix ${PREFIX})`)
}

// Users + memberships
const { data: list, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 })
if (listErr) fail('list users', listErr)
for (const u of USERS) {
  let user = list.users.find(x => (x.email || '').toLowerCase() === u.email.toLowerCase())
  if (!user) {
    const res = await sb.auth.admin.createUser({
      email: u.email, password: PASSWORD, email_confirm: true, user_metadata: { name: u.name },
    })
    if (res.error) fail(`create ${u.email}`, res.error)
    user = res.data.user
  }
  const res = await sb.from('org_members').upsert(
    { user_id: user.id, org_id: org.id, role: u.role, display_name: u.name, email: u.email },
    { onConflict: 'user_id,org_id' },
  )
  if (res.error) fail(`membership ${u.email}`, res.error)
  console.log(`${u.role.padEnd(6)} ${u.email}`)
}

console.log(`\nDone. Password for every placeholder login: ${PASSWORD}`)
console.log('Change these in Supabase → Authentication → Users before real use.')
