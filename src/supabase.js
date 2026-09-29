// Supabase data layer for the rows architecture.
//
// One row per record, patched per field, pushed to every device by Realtime.
// The Zustand store keeps its exact shape and action names; this module sits
// underneath it:
//   - loadOrg()      pulls every row the signed-in user may see (RLS decides:
//                    a rep gets their own deals, the office gets everyone's).
//   - armAdapter()   watches the store; each change becomes one row insert /
//                    patch / soft-delete, queued and retried while offline.
//   - Realtime       applies every committed row change to the store, so all
//                    devices converge within about a second with no merging.
import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabaseReady = !!(URL && KEY)
export const supabase = supabaseReady
  ? createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

// ── Session ──────────────────────────────────────────────────────────────────
// Resolved once in main.jsx before the app renders, so AuthGuard can read it
// synchronously; kept fresh by onAuthStateChange afterwards.
let _session = null
export async function initAuth() {
  if (!supabase) return null
  const { data: { session } } = await supabase.auth.getSession()
  _session = session
  supabase.auth.onAuthStateChange((_event, s) => { _session = s })
  return session
}
export function getSession()      { return _session }
export function currentUserId()   { return _session?.user?.id || null }
export function currentUserEmail() { return _session?.user?.email || '' }

export async function getAccessToken() {
  if (!supabase) return null
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

export async function signIn(email, password) {
  if (!supabase) throw new Error('Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  _session = data.session
  return data.session
}
export async function signOut() {
  if (supabase) await supabase.auth.signOut()
  _session = null
}

// ── Store ↔ table map ────────────────────────────────────────────────────────
// Array collections in the store → one table each (row.data is the record).
export const RECORD_TABLES = {
  proposals:              'proposals',
  catalog:                'catalog_items',
  templates:              'templates',
  scopeTemplates:         'scope_templates',
  paymentSchedules:       'payment_schedules',
  emailTemplates:         'email_templates',
  financeCards:           'finance_cards',
  subcontractors:         'subcontractors',
  standaloneChangeOrders: 'standalone_change_orders',
  plannedProjects:        'planned_projects',
  todos:                  'todos',
  checklists:             'checklists',
  expenses:               'expenses',
}
// Object-keyed-by-id collections → a table whose row id is the key.
export const MAP_TABLES = { jobCosts: 'job_costs' }
// Singletons → one org_settings row (data jsonb) per org.
export const SETTINGS_KEYS = [
  'branding', 'projectTypes', 'catalogCategories',
  'deckComponentRates', 'porchComponentRates', 'deckCustomComponents', 'porchCustomComponents',
  'deckFormulaLocked', 'porchFormulaLocked', 'deckScopeTemplate', 'porchScopeTemplate',
  'paymentScheduleLearning', 'scopeExamples', 'historyImported', 'calendarHiddenJobs',
  'contractPrefix',
]
const TABLE_TO_KEY = Object.fromEntries(
  [...Object.entries(RECORD_TABLES), ...Object.entries(MAP_TABLES)].map(([k, t]) => [t, k])
)

// ── Load ─────────────────────────────────────────────────────────────────────
const PAGE = 1000
async function fetchAll(table, orgId) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table).select('id, data')
      .eq('org_id', orgId).is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

// Everything the signed-in user may see, in the store's own shape.
export async function loadOrg() {
  const uid = currentUserId()
  if (!supabase || !uid) throw new Error('Not signed in')
  const { data: member, error: mErr } = await supabase
    .from('org_members').select('org_id, role, display_name, email').eq('user_id', uid).maybeSingle()
  if (mErr) throw mErr
  if (!member) throw new Error('This login is not a member of an organization yet. Ask an admin to add you.')
  const orgId = member.org_id

  const [{ data: members }, { data: settingsRow }] = await Promise.all([
    supabase.from('org_members').select('user_id, role, display_name, email').eq('org_id', orgId),
    supabase.from('org_settings').select('data').eq('org_id', orgId).maybeSingle(),
  ])

  const collections = {}
  await Promise.all(Object.entries(RECORD_TABLES).map(async ([key, table]) => {
    const rows = await fetchAll(table, orgId)
    collections[key] = rows.map(r => r.data)
  }))
  for (const [key, table] of Object.entries(MAP_TABLES)) {
    const rows = await fetchAll(table, orgId)
    collections[key] = Object.fromEntries(rows.map(r => [r.id, r.data]))
  }

  return {
    orgId,
    me: { id: uid, role: member.role, displayName: member.display_name, email: member.email },
    members: (members || []).map(m => ({ id: m.user_id, role: m.role, displayName: m.display_name, email: m.email })),
    settings: settingsRow?.data || {},
    collections,
  }
}

// Each session reserves a block of 1,000 ids so two reps never mint the same one.
export async function reserveIdBlock() {
  const { data, error } = await supabase.rpc('reserve_ids')
  if (error) throw error
  return Number(data)
}

// ── Write queue (survives reloads, replays when back online) ────────────────
const QUEUE_KEY = 'qx_pending_ops'
let _queue = []
let _flushing = false
try { _queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { _queue = [] }
function saveQueue() { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(_queue)) } catch {} }
function enqueue(op) { _queue.push(op); saveQueue(); flush() }

async function runOp(op) {
  let error
  if (op.kind === 'upsert') {
    ({ error } = await supabase.from(op.table)
      .upsert({ id: op.id, org_id: op.orgId, data: op.data, deleted_at: null }, { onConflict: 'org_id,id' }))
  } else if (op.kind === 'patch') {
    ({ error } = await supabase.rpc('patch_record', { tbl: op.table, rid: op.id, patch: op.patch }))
  } else if (op.kind === 'delete') {
    ({ error } = await supabase.rpc('delete_record', { tbl: op.table, rid: op.id }))
  } else if (op.kind === 'settings') {
    ({ error } = await supabase.rpc('patch_settings', { patch: op.patch }))
  }
  if (error) throw error
}

export async function flush() {
  if (_flushing || !supabase || !_queue.length) return
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  _flushing = true
  try {
    while (_queue.length) {
      const op = _queue[0]
      try {
        await runOp(op)
      } catch (e) {
        const msg = String(e?.message || e)
        // A policy/validation refusal will never succeed on retry: drop it and
        // report. A network failure keeps the op for the next flush.
        const permanent = /permission|policy|violates|unknown table|invalid input|JWT|401|403|400/i.test(msg)
        console.error('[quotex] write failed', op.kind, op.table, msg)
        if (!permanent) break
      }
      _queue.shift(); saveQueue()
    }
  } finally {
    _flushing = false
  }
}
if (typeof window !== 'undefined') {
  window.addEventListener('online', flush)
  setInterval(flush, 10000)
}
export function pendingWrites() { return _queue.length }

// ── Adapter: store → rows, rows → store ─────────────────────────────────────
let _armed = false, _applyingRemote = false, _orgId = null, _channel = null
const _snap = {}   // collection key → Map(idStr → record); settings → object

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b)

// Only the top-level keys that changed, so two people editing different
// fields of one record both land (the database shallow-merges them).
function shallowPatch(oldRec, newRec) {
  const patch = {}
  for (const k of new Set([...Object.keys(oldRec || {}), ...Object.keys(newRec || {})])) {
    const a = oldRec?.[k], b = newRec?.[k]
    if (!same(a, b)) patch[k] = b === undefined ? null : b
  }
  return patch
}

const mapAsRecords = (obj) => Object.entries(obj || {}).map(([id, rec]) => ({ ...rec, id }))

function snapshot(key, records) {
  const m = new Map()
  for (const rec of records || []) if (rec && rec.id != null) m.set(String(rec.id), rec)
  _snap[key] = m
}

function diffRecords(key, table, current) {
  const snap = _snap[key] || new Map()
  const seen = new Set()
  for (const rec of current) {
    if (!rec || rec.id == null) continue
    const idStr = String(rec.id)
    seen.add(idStr)
    const old = snap.get(idStr)
    if (!old) {
      enqueue({ kind: 'upsert', table, orgId: _orgId, id: idStr, data: rec })
    } else if (old !== rec) {
      const patch = shallowPatch(old, rec)
      if (Object.keys(patch).length) enqueue({ kind: 'patch', table, id: idStr, patch })
    }
    snap.set(idStr, rec)
  }
  for (const idStr of [...snap.keys()]) {
    if (!seen.has(idStr)) { enqueue({ kind: 'delete', table, id: idStr }); snap.delete(idStr) }
  }
  _snap[key] = snap
}

function onStoreChange(state, prev) {
  if (!_armed || _applyingRemote) return
  for (const [key, table] of Object.entries(RECORD_TABLES)) {
    if (state[key] !== prev[key]) diffRecords(key, table, state[key] || [])
  }
  for (const [key, table] of Object.entries(MAP_TABLES)) {
    if (state[key] !== prev[key]) diffRecords(key, table, mapAsRecords(state[key]))
  }
  const patch = {}
  for (const k of SETTINGS_KEYS) {
    if (state[k] !== prev[k] && !same(_snap.settings?.[k], state[k])) {
      patch[k] = state[k] === undefined ? null : state[k]
      _snap.settings = { ...(_snap.settings || {}), [k]: state[k] }
    }
  }
  if (Object.keys(patch).length) enqueue({ kind: 'settings', patch })
}

function applyRemote(store, table, payload) {
  const key = TABLE_TO_KEY[table]
  const row = (payload.new && Object.keys(payload.new).length) ? payload.new : payload.old
  if (!key || !row) return
  const idStr = String(row.id)
  const gone  = payload.eventType === 'DELETE' || !!row.deleted_at
  const rec   = row.data
  const state = store.getState()
  _applyingRemote = true
  try {
    if (key in MAP_TABLES) {
      const cur = state[key] || {}
      if (gone) {
        if (!(idStr in cur)) return
        const next = { ...cur }; delete next[idStr]
        store.setState({ [key]: next }); _snap[key]?.delete(idStr)
      } else {
        if (same(cur[idStr], rec)) return
        store.setState({ [key]: { ...cur, [idStr]: rec } }); _snap[key]?.set(idStr, { ...rec, id: idStr })
      }
      return
    }
    const cur = state[key] || []
    const idx = cur.findIndex(r => r && String(r.id) === idStr)
    if (gone) {
      if (idx < 0) return
      store.setState({ [key]: cur.filter((_, i) => i !== idx) }); _snap[key]?.delete(idStr)
      return
    }
    if (idx >= 0) {
      if (same(cur[idx], rec)) { _snap[key]?.set(idStr, cur[idx]); return }   // our own echo
      const next = cur.slice(); next[idx] = rec
      store.setState({ [key]: next })
    } else {
      store.setState({ [key]: key === 'proposals' ? [rec, ...cur] : [...cur, rec] })
    }
    _snap[key]?.set(idStr, rec)
  } finally {
    _applyingRemote = false
  }
}

function applyRemoteSettings(store, payload) {
  const data = payload.new?.data
  if (!data) return
  const patch = {}
  const state = store.getState()
  for (const k of SETTINGS_KEYS) if (k in data && !same(state[k], data[k])) patch[k] = data[k]
  _snap.settings = { ...(_snap.settings || {}), ...data }
  if (!Object.keys(patch).length) return
  _applyingRemote = true
  try { store.setState(patch) } finally { _applyingRemote = false }
}

// Call once after loadOrg()'s result has been put into the store.
export function armAdapter(store, orgId, settings) {
  _orgId = orgId
  const s = store.getState()
  for (const key of Object.keys(RECORD_TABLES)) snapshot(key, s[key])
  for (const key of Object.keys(MAP_TABLES))    snapshot(key, mapAsRecords(s[key]))
  _snap.settings = { ...(settings || {}) }
  if (!_armed) { store.subscribe(onStoreChange); _armed = true }

  if (_channel) supabase.removeChannel(_channel)
  let ch = supabase.channel(`org:${orgId}`)
  for (const table of [...Object.values(RECORD_TABLES), ...Object.values(MAP_TABLES)]) {
    ch = ch.on('postgres_changes',
      { event: '*', schema: 'public', table, filter: `org_id=eq.${orgId}` },
      (p) => applyRemote(store, table, p))
  }
  ch = ch.on('postgres_changes',
    { event: '*', schema: 'public', table: 'org_settings', filter: `org_id=eq.${orgId}` },
    (p) => applyRemoteSettings(store, p))
  _channel = ch.subscribe()
  flush()
}

export function disarmAdapter() {
  _armed = false
  if (_channel && supabase) supabase.removeChannel(_channel)
  _channel = null
}
