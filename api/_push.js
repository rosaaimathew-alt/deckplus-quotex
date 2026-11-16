/* global Buffer, process */
/**
 * Pop-up alerts on a phone (Web Push), next to the email and text an alert
 * already sends (api/_notify.js).
 *
 * A phone that turned alerts on (src/lib/push.js) is saved in
 * push_subscriptions (supabase/push.sql). To reach it we encrypt a short
 * message for that phone (RFC 8291, aes128gcm) and post it to the phone
 * maker's push service, signed with this app's own key pair (VAPID, RFC 8292).
 *
 * The key pair is made once by the server and kept in the server-only vault
 * (supabase/mail.sql), its private half encrypted, so there is nothing to
 * configure and the private key is only ever readable by this function.
 */
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { encryptSecret, decryptSecret } from './_mailboxes.js'

const VAULT_KEY = 'push:vapid'
const CONTACT = 'mailto:office@deckplus.app'
// Only real push services: a saved address is never an arbitrary URL to post to.
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/i

const b64u = (buf) => Buffer.from(buf).toString('base64url')
const fromB64u = (s) => Buffer.from(String(s || ''), 'base64url')

const secret = () => process.env.ESIGN_DB_SECRET || null
const dbUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
export const pushAvailable = () => !!secret() && !!dbUrl()

let _db = null
function db() {
  if (_db) return _db
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  _db = createClient(dbUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _db
}
async function rpc(fn, args) {
  const { data, error } = await db().rpc(fn, { ...args, s: secret() })
  if (error) throw new Error(error.message)
  return data
}

// ── This app's key pair ─────────────────────────────────────────────────────
export function newVapidKeys() {
  const ecdh = crypto.createECDH('prime256v1')
  ecdh.generateKeys()
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) }
}
let _vapid = null
async function vapid() {
  if (_vapid) return _vapid
  // Kept if there is one already, so two servers starting together agree.
  // The private half is stored encrypted with the server's own secret.
  const fresh = newVapidKeys()
  const kept = await rpc('vault_init_s', { k: VAULT_KEY, v: { publicKey: fresh.publicKey, privateKeyEnc: encryptSecret(fresh.privateKey) } })
  const privateKey = kept?.privateKeyEnc ? decryptSecret(kept.privateKeyEnc) : null
  if (!kept?.publicKey || !privateKey) throw new Error('No push key')
  _vapid = { publicKey: kept.publicKey, privateKey }
  return _vapid
}
export async function pushPublicKey() {
  if (!pushAvailable()) return null
  return (await vapid()).publicKey
}

// "I am this app" for one push service, good for 12 hours.
export function vapidHeader(endpoint, keys, now = Date.now()) {
  const pub = fromB64u(keys.publicKey)
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: keys.privateKey }
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const body = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: CONTACT }))
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: crypto.createPrivateKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' })
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${keys.publicKey}`
}

// The message, readable only by that phone (RFC 8291 / RFC 8188 aes128gcm).
export function encryptFor(sub, text, { salt = crypto.randomBytes(16), sender = null } = {}) {
  const phoneKey = fromB64u(sub.p256dh), authSecret = fromB64u(sub.auth)
  const ecdh = crypto.createECDH('prime256v1')
  if (sender) ecdh.setPrivateKey(sender); else ecdh.generateKeys()
  const myKey = ecdh.getPublicKey()
  const shared = ecdh.computeSecret(phoneKey)
  const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest()
  const one = Buffer.from([1])
  const ikm = hmac(hmac(authSecret, shared), Buffer.concat([Buffer.from('WebPush: info\0'), phoneKey, myKey, one]))
  const prk = hmac(salt, ikm)
  const cek = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: aes128gcm\0'), one])).subarray(0, 16)
  const nonce = hmac(prk, Buffer.concat([Buffer.from('Content-Encoding: nonce\0'), one])).subarray(0, 12)
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce)
  const sealed = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()])
  const header = Buffer.alloc(21)
  salt.copy(header, 0); header.writeUInt32BE(4096, 16); header.writeUInt8(myKey.length, 20)
  return Buffer.concat([header, myKey, sealed])
}

export const pushHostOk = (endpoint) => {
  try { const u = new URL(endpoint); return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname) } catch { return false }
}

// One message to one phone. → { sent } | { gone } (the phone turned alerts off) | { error }
export async function sendPush(sub, payload, keys, doFetch = fetch) {
  if (!pushHostOk(sub.endpoint)) return { gone: true }
  try {
    const res = await doFetch(sub.endpoint, {
      method: 'POST',
      headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'high', Authorization: vapidHeader(sub.endpoint, keys) },
      body: encryptFor(sub, JSON.stringify(payload).slice(0, 3000)),
    })
    if (res.status === 404 || res.status === 410) return { gone: true }
    if (!res.ok) return { error: `Push ${res.status}` }
    return { sent: true }
  } catch (err) {
    return { error: `Push failed: ${String(err?.message || err).slice(0, 120)}` }
  }
}

// An alert to every phone of the people with these email addresses.
// → { pushed, reached: the addresses with at least one phone it got to, errors }
export async function pushToEmails(emails, payload, { lookup = (list) => rpc('push_subs_s', { p_emails: list }), drop = (endpoint) => rpc('push_drop_s', { p_endpoint: endpoint }), keys = null, doFetch = fetch } = {}) {
  const list = [...new Set((emails || []).map(e => String(e || '').toLowerCase()).filter(Boolean))]
  const none = { pushed: 0, reached: [], errors: [] }
  if (!list.length || (!keys && !pushAvailable())) return none
  let subs = []
  try { subs = (await lookup(list)) || [] } catch (err) { return { ...none, errors: [String(err.message).slice(0, 120)] } }
  if (!subs.length) return none
  const k = keys || await vapid()
  let pushed = 0
  const reached = new Set(), errors = []
  await Promise.all(subs.map(async (sub) => {
    const out = await sendPush(sub, payload, k, doFetch)
    if (out.sent) { pushed++; if (sub.email) reached.add(String(sub.email).toLowerCase()) }
    else if (out.gone) await Promise.resolve(drop(sub.endpoint)).catch(() => {})
    else if (out.error) errors.push(out.error)
  }))
  return { pushed, reached: [...reached], errors }
}
