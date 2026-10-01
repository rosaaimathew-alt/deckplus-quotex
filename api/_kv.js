// Key/value storage for the serverless API (signing records and links,
// proposal view links, Google Drive tokens).
//
// Backed by Supabase: the app_kv table plus the kv_get / kv_set / kv_del
// SECURITY DEFINER functions (see supabase/schema.sql). The table itself is
// closed to API keys; a caller must know the exact key — keys are random UUID
// tokens — so this is as private as the Redis store it replaces. If a Vercel KV
// / Upstash store is attached (KV_REST_API_URL set), that is used instead.
//
//   const kv = await getKV()
//   await kv.set('sign:abc', { ... }, { ex: 60 * 60 * 24 * 60 })
//   const rec = await kv.get('sign:abc')
import { createClient } from '@supabase/supabase-js'

let _sb = null
function supabase() {
  if (_sb) return _sb
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Storage is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (or attach a KV store).')
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _sb
}

const supabaseKV = {
  async get(key) {
    const { data, error } = await supabase().rpc('kv_get', { k: key })
    if (error) throw new Error(`kv_get failed: ${error.message}`)
    return data ?? null
  },
  async set(key, value, opts = {}) {
    const ttl = Number.isFinite(Number(opts?.ex)) ? Math.round(Number(opts.ex)) : null
    const { error } = await supabase().rpc('kv_set', { k: key, v: value ?? null, ttl_seconds: ttl })
    if (error) throw new Error(`kv_set failed: ${error.message}`)
    return 'OK'
  },
  async del(key) {
    const { error } = await supabase().rpc('kv_del', { k: key })
    if (error) throw new Error(`kv_del failed: ${error.message}`)
    return 1
  },
}

export async function getKV() {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const { kv } = await import('@vercel/kv')
    return kv
  }
  return supabaseKV
}
