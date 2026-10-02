/* global process, Buffer */
// ── E-sign evidence ──────────────────────────────────────────────────────────
// Shared by the contract (/api/sign) and change-order (/api/co) signing APIs.
//
// What a signature carries, all captured on the server at the moment of signing:
//   • intent: the exact consent text the signer checked, and an "Adopt and Sign"
//     click with their typed full legal name;
//   • attribution: the signer's own IP (first hop) and the whole forwarded chain,
//     browser user agent, device details, edge geolocation, a millisecond server
//     timestamp, and the email address a 6-digit code was sent to and entered from;
//   • integrity: SHA-256 of the document as sent, re-checked at signing, SHA-256 of
//     the signature images, and an Ed25519 seal over all of it with the server key.
// Every step is also written to esign_events, the append-only hash-chained log
// (supabase/esign.sql). Nothing here ever expires or can be deleted.
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { isMailerConfigured, sendMail } from './_mailer.js'

// The exact consent wording. The signing pages show this same text
// (src/lib/esignConsent.js); the server refuses a signature without it.
export const CONSENT_TEXT = 'I agree to conduct this transaction electronically and bound my signature to this document.'

// Public half of the seal key. The private half lives only in the
// ESIGN_SEAL_PRIVATE_KEY environment variable.
export const SEAL_PUBLIC_KEY = 'MCowBQYDK2VwAyEAfgF449X9Sbthq4psk53tuv9DNPguHzqodffJx8y1QbI='
export const SEAL_KEY_ID = 'c867ed1b7fae78f8'

const OTP_TTL_MS = 10 * 60 * 1000          // a code is good for 10 minutes
const OTP_VERIFIED_FOR_MS = 60 * 60 * 1000 // and the verification for an hour
const OTP_MAX_ATTEMPTS = 5
const OTP_RESEND_MS = 30 * 1000
const OTP_MAX_SENDS = 10

// ── Hashing ──────────────────────────────────────────────────────────────────
// Canonical JSON: keys sorted at every level, so the same data always hashes
// the same no matter how it was built.
export function canonical(v) {
  if (v === undefined) return 'null'
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(x => (x === undefined ? 'null' : canonical(x))).join(',') + ']'
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}'
}
export const sha256 = (s) => crypto.createHash('sha256').update(typeof s === 'string' ? s : Buffer.from(s)).digest('hex')
export const docHashOf = (doc) => sha256(canonical(doc ?? null))
export const signatureHashOf = (signatureDataUrl, fields) => sha256(canonical({ signatureDataUrl: signatureDataUrl || null, fields: fields || {} }))

// ── Server seal (Ed25519) ────────────────────────────────────────────────────
function sealKey() {
  const raw = process.env.ESIGN_SEAL_PRIVATE_KEY
  if (!raw) return null
  try { return crypto.createPrivateKey({ key: Buffer.from(raw, 'base64'), format: 'der', type: 'pkcs8' }) } catch { return null }
}
export function seal(evidence) {
  const digest = sha256(canonical(evidence))
  const key = sealKey()
  if (!key) return { alg: 'Ed25519', keyId: SEAL_KEY_ID, digest, signature: null, error: 'Seal key not configured' }
  const signature = crypto.sign(null, Buffer.from(digest), key).toString('base64')
  return { alg: 'Ed25519', keyId: SEAL_KEY_ID, digest, signature }
}
export function verifySeal(evidence, s) {
  if (!s?.signature) return { ok: false, reason: 'No seal' }
  const digest = sha256(canonical(evidence))
  if (digest !== s.digest) return { ok: false, reason: 'Evidence was changed after it was sealed' }
  try {
    const pub = crypto.createPublicKey({ key: Buffer.from(SEAL_PUBLIC_KEY, 'base64'), format: 'der', type: 'spki' })
    const ok = crypto.verify(null, Buffer.from(digest), pub, Buffer.from(s.signature, 'base64'))
    return ok ? { ok: true } : { ok: false, reason: 'Seal signature does not match' }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
}

// ── Who is on the other end ──────────────────────────────────────────────────
export function requestContext(req, device) {
  const h = req.headers || {}
  const chain = String(h['x-forwarded-for'] || '').trim()
  const first = chain.split(',')[0].trim()
  const ip = String(h['x-real-ip'] || '').trim() || first || req.socket?.remoteAddress || 'unknown'
  const dec = (v) => { try { return v ? decodeURIComponent(String(v)) : undefined } catch { return String(v) } }
  const geo = {
    city: dec(h['x-vercel-ip-city']), region: dec(h['x-vercel-ip-country-region']), country: dec(h['x-vercel-ip-country']),
    postal: dec(h['x-vercel-ip-postal-code']), latitude: dec(h['x-vercel-ip-latitude']), longitude: dec(h['x-vercel-ip-longitude']),
    timezone: dec(h['x-vercel-ip-timezone']),
  }
  Object.keys(geo).forEach(k => geo[k] === undefined && delete geo[k])
  return {
    ip,
    ipChain: chain || ip,
    userAgent: String(h['user-agent'] || 'unknown').slice(0, 1000),
    device: cleanDevice(device),
    geo: Object.keys(geo).length ? geo : null,
  }
}

// Device details the browser reports; anything unexpected is dropped.
function cleanDevice(d) {
  if (!d || typeof d !== 'object') return null
  const out = {}
  const keys = ['platform', 'language', 'languages', 'timezone', 'tzOffset', 'screen', 'viewport', 'pixelRatio', 'touchPoints',
    'cores', 'memory', 'mobile', 'brands', 'vendor', 'cookies', 'clientTime']
  for (const k of keys) {
    const v = d[k]
    if (v == null) continue
    if (typeof v === 'string') out[k] = v.slice(0, 200)
    else if (Array.isArray(v)) out[k] = v.slice(0, 10).map(x => String(x).slice(0, 80))
    else if (typeof v === 'object') { const j = JSON.stringify(v); if (j.length <= 500) out[k] = JSON.parse(j) }
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v
  }
  return Object.keys(out).length ? out : null
}

// ── Audit log ────────────────────────────────────────────────────────────────
let _sb = null
function db() {
  if (_sb) return _sb
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Storage is not configured')
  _sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _sb
}
const secret = () => process.env.ESIGN_DB_SECRET || null

// Writes one event. Throws if the log can't be written — a signature is never
// accepted without its audit entry.
export async function logEvent(ctx, { recordType, recordId, role, event, signerName, signerEmail, docHash, detail }) {
  const { data, error } = await db().rpc('esign_log', {
    s: secret(), p_record_type: recordType, p_record_id: recordId, p_role: role || null, p_event: event,
    p_ip: ctx?.ip || null, p_ip_chain: ctx?.ipChain || null, p_user_agent: ctx?.userAgent || null,
    p_device: ctx?.device || null, p_geo: ctx?.geo || null, p_signer_name: signerName || null,
    p_signer_email: signerEmail || null, p_doc_hash: docHash || null, p_detail: detail || null,
  })
  if (error) throw new Error(`Audit log write failed: ${error.message}`)
  return data   // { seq, at_ms, event_hash }
}
// For events that must not block the page (a view, a bad code): log, never throw.
export async function logEventSafe(ctx, e) {
  try { return await logEvent(ctx, e) } catch (err) { console.error(err.message); return null }
}
export async function eventsFor(recordType, recordId) {
  const { data, error } = await db().rpc('esign_events_for', { s: secret(), p_record_type: recordType, p_record_id: recordId })
  if (error) throw new Error(error.message)
  return data || []
}
export async function verifyChain() {
  const { data, error } = await db().rpc('esign_verify_chain', { s: secret() })
  if (error) throw new Error(error.message)
  return data
}

// ── Email verification code ──────────────────────────────────────────────────
// Required whenever the server can send email (or ESIGN_REQUIRE_OTP is on).
export async function otpRequired() {
  if (/^(1|true|on|yes)$/i.test(process.env.ESIGN_REQUIRE_OTP || '')) return true
  return isMailerConfigured()
}
export const maskEmail = (e) => {
  const [u, d] = String(e || '').split('@')
  if (!u || !d) return ''
  return `${u[0]}${'•'.repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d}`
}
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''))
const codeHash = (token, code) => sha256(`${token}:${String(code).trim()}`)

export async function otpStatus(kv, token) {
  const o = await kv.get(`otp:${token}`)
  const verified = !!(o?.verifiedAt && Date.now() - o.verifiedAt < OTP_VERIFIED_FOR_MS)
  return { otp: o, verified, verifiedEmail: verified ? o.email : null }
}

export async function otpSend(kv, { token, email, emailOnFile, companyName, docLabel, ctx, logBase }) {
  const to = String(email || emailOnFile || '').trim().toLowerCase()
  if (!validEmail(to)) return { status: 400, body: { error: 'Enter a valid email address to receive your code.' } }
  if (!(await isMailerConfigured())) return { status: 503, body: { error: 'Email codes are not available right now. Please contact the office.' } }
  const prev = await kv.get(`otp:${token}`)
  if (prev?.sentAt && Date.now() - prev.sentAt < OTP_RESEND_MS) return { status: 429, body: { error: 'A code was just sent. Please wait 30 seconds before asking again.' } }
  if ((prev?.sends || 0) >= OTP_MAX_SENDS) return { status: 429, body: { error: 'Too many codes requested for this link. Please contact the office.' } }
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0')
  const company = companyName || process.env.COMPANY_NAME || 'Deck Plus'
  const sent = await sendMail({
    to,
    subject: `${code} is your ${company} signing code`,
    text: `Your verification code to sign ${docLabel} is ${code}.\n\nIt expires in 10 minutes. If you did not request this, ignore this email.`,
    html: `<p>Your verification code to sign <strong>${escapeHtml(docLabel)}</strong> is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
    fromName: company,
  })
  if (sent?.error) return { status: 502, body: { error: `Could not send the code: ${sent.error}` } }
  const matchesFile = !!emailOnFile && to === String(emailOnFile).trim().toLowerCase()
  await kv.set(`otp:${token}`, {
    codeHash: codeHash(token, code), email: to, emailMatchesFile: matchesFile,
    sentAt: Date.now(), expiresAt: Date.now() + OTP_TTL_MS, attempts: 0, sends: (prev?.sends || 0) + 1,
    verifiedAt: null,
  })
  await logEvent(ctx, { ...logBase, event: 'otp_sent', signerEmail: to, detail: { emailMatchesFile: matchesFile, messageId: sent?.messageId || null } })
  return { status: 200, body: { ok: true, sentTo: maskEmail(to) } }
}

export async function otpVerify(kv, { token, code, ctx, logBase }) {
  const o = await kv.get(`otp:${token}`)
  if (!o?.codeHash) return { status: 400, body: { error: 'Request a code first.' } }
  if (Date.now() > o.expiresAt) return { status: 400, body: { error: 'That code has expired. Request a new one.' } }
  if ((o.attempts || 0) >= OTP_MAX_ATTEMPTS) return { status: 429, body: { error: 'Too many wrong codes. Request a new one.' } }
  const good = crypto.timingSafeEqual(Buffer.from(codeHash(token, code)), Buffer.from(o.codeHash))
  if (!good) {
    await kv.set(`otp:${token}`, { ...o, attempts: (o.attempts || 0) + 1 })
    await logEventSafe(ctx, { ...logBase, event: 'otp_failed', signerEmail: o.email, detail: { attempt: (o.attempts || 0) + 1 } })
    return { status: 400, body: { error: 'That code is not right. Check the email and try again.' } }
  }
  const at = Date.now()
  await kv.set(`otp:${token}`, { ...o, codeHash: null, verifiedAt: at })
  const ev = await logEvent(ctx, { ...logBase, event: 'otp_verified', signerEmail: o.email, detail: { emailMatchesFile: !!o.emailMatchesFile } })
  return { status: 200, body: { ok: true, verified: true, email: maskEmail(o.email), eventHash: ev?.event_hash } }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// ── The signing gate ─────────────────────────────────────────────────────────
// Checks every guardrail for a signature POST and, if they all pass, returns the
// sealed signature entry to store. Returns { error, status } otherwise.
export async function buildSignature(kv, req, { token, recordType, recordId, role, doc, storedDocHash, emailOnFile }) {
  const b = req.body || {}
  const ctx = requestContext(req, b.device)
  const logBase = { recordType, recordId, role }
  const printedName = String(b.printedName || '').trim()
  const signatureDataUrl = b.signatureDataUrl || null
  const fields = b.fieldSignatures || {}

  if (!signatureDataUrl && !Object.keys(fields).length) return { status: 400, error: 'Missing signature' }
  if (b.consent !== true || b.consentText !== CONSENT_TEXT) {
    await logEventSafe(ctx, { ...logBase, event: 'rejected', signerName: printedName, detail: { reason: 'consent missing' } })
    return { status: 400, error: 'You must check the box agreeing to sign electronically.' }
  }
  if (b.adopt !== true || printedName.length < 2) {
    await logEventSafe(ctx, { ...logBase, event: 'rejected', signerName: printedName, detail: { reason: 'adopt-and-sign missing' } })
    return { status: 400, error: 'Type your full legal name and press Adopt and Sign.' }
  }

  const currentHash = docHashOf(doc)
  if (storedDocHash && storedDocHash !== currentHash) {
    await logEventSafe(ctx, { ...logBase, event: 'rejected', docHash: currentHash, detail: { reason: 'document changed since sent', storedDocHash } })
    return { status: 409, error: 'This document was changed after it was sent. Ask the office to send it again.' }
  }
  if (b.docHash !== currentHash) {
    await logEventSafe(ctx, { ...logBase, event: 'rejected', docHash: currentHash, detail: { reason: 'signer viewed a different version', viewedHash: b.docHash || null } })
    return { status: 409, error: 'The document you are viewing is out of date. Reload the page and review it again before signing.' }
  }

  const needOtp = await otpRequired()
  const { otp, verified } = await otpStatus(kv, token)
  if (needOtp && !verified) {
    await logEventSafe(ctx, { ...logBase, event: 'rejected', detail: { reason: 'email code not verified' } })
    return { status: 403, error: 'Verify your email code before signing.' }
  }

  const signedAt = Date.now()
  // The consent and adoption, logged first, each with their own server time.
  const consentEv = await logEvent(ctx, { ...logBase, event: 'consent', signerName: printedName, signerEmail: verified ? otp.email : null, docHash: currentHash,
    detail: { text: CONSENT_TEXT, checkedAtClient: b.consentCheckedAt || null, disclosureAcceptedAtClient: b.agreementAgreedAt || null } })

  const evidence = {
    v: 1,
    recordType, recordId, role,
    docHash: currentHash,
    signatureHash: signatureHashOf(signatureDataUrl, fields),
    fieldsSigned: Object.keys(fields).sort(),
    printedName,
    signedAt,
    signedAtIso: new Date(signedAt).toISOString(),
    ip: ctx.ip, ipChain: ctx.ipChain, userAgent: ctx.userAgent, device: ctx.device, geo: ctx.geo,
    consent: { text: CONSENT_TEXT, checked: true, checkedAtClient: b.consentCheckedAt || null, eventHash: consentEv?.event_hash || null },
    disclosureAcceptedAtClient: b.agreementAgreedAt || null,
    adopt: { method: 'Adopt and Sign', adoptedAtClient: b.adoptedAt || null },
    emailVerification: verified
      ? { method: 'email code', email: otp.email, emailMatchesFile: !!otp.emailMatchesFile, verifiedAt: otp.verifiedAt }
      : { method: 'none', reason: needOtp ? 'required' : 'email sending not configured' },
    emailOnFile: emailOnFile || null,
  }
  const sealed = seal(evidence)
  const signedEv = await logEvent(ctx, { ...logBase, event: 'signed', signerName: printedName, signerEmail: verified ? otp.email : null, docHash: currentHash,
    detail: { evidence, seal: sealed } })

  return {
    ctx,
    entry: {
      signatureDataUrl,
      fields,
      printedName,
      signedAt,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      esignConsent: true,
      esignConsentAt: signedAt,
      agreementAgreedAt: b.agreementAgreedAt || null,
      evidence,
      seal: sealed,
      eventHash: signedEv?.event_hash || null,
    },
  }
}

// ── Verification report ──────────────────────────────────────────────────────
const PARTY = { client: 'Client', builder: 'Deck Plus', gc: 'General Contractor' }

export async function verifyRecord({ recordType, recordId, record, doc, emailOnFile }) {
  const checks = []
  const currentHash = docHashOf(doc)
  if (record.docHash) {
    checks.push({ label: 'Document unchanged since it was sent', ok: record.docHash === currentHash, detail: `SHA-256 ${currentHash}` })
  } else {
    checks.push({ label: 'Document hash recorded when sent', ok: null, detail: 'Sent before document hashing was added; current SHA-256 ' + currentHash })
  }
  const signers = []
  for (const [role, s] of Object.entries(record.signatures || {})) {
    if (!s?.evidence) {
      signers.push({ role, printedName: s?.printedName, signedAt: s?.signedAt, ip: s?.ip, userAgent: s?.userAgent, legacy: true })
      checks.push({ label: `${PARTY[role] || role}: signature evidence`, ok: null, detail: 'Signed before the sealed evidence was added — IP, time and browser were recorded without a seal.' })
      continue
    }
    const sigOk = signatureHashOf(s.signatureDataUrl, s.fields) === s.evidence.signatureHash
    const docOk = s.evidence.docHash === currentHash
    const sealRes = verifySeal(s.evidence, s.seal)
    checks.push({ label: `${PARTY[role] || role}: signature image matches what was signed`, ok: sigOk })
    checks.push({ label: `${PARTY[role] || role}: signed this exact document`, ok: docOk })
    checks.push({ label: `${PARTY[role] || role}: server seal valid`, ok: sealRes.ok, detail: sealRes.ok ? `Ed25519 key ${s.seal?.keyId}` : sealRes.reason })
    signers.push({ role, ...s.evidence, seal: s.seal, eventHash: s.eventHash, signatureDataUrl: s.signatureDataUrl })
  }
  let events = []
  let chain = null
  try {
    events = await eventsFor(recordType, recordId)
    chain = await verifyChain()
    checks.push({ label: 'Audit log hash chain intact', ok: !!chain?.ok, detail: chain?.ok ? `${chain.checked} events checked` : `Broken at event #${chain?.first_bad_seq}` })
    for (const r of signers.filter(x => x.eventHash)) {
      const ev = events.find(e => e.event_hash === r.eventHash)
      checks.push({ label: `${PARTY[r.role] || r.role}: signature is in the audit log`, ok: !!ev && ev.event === 'signed' })
    }
  } catch (e) {
    checks.push({ label: 'Audit log readable', ok: false, detail: e.message })
  }
  const failed = checks.filter(c => c.ok === false)
  return {
    recordType, recordId,
    ok: failed.length === 0,
    verifiedAt: new Date().toISOString(),
    docHash: currentHash,
    emailOnFile: emailOnFile || null,
    sealPublicKey: SEAL_PUBLIC_KEY, sealKeyId: SEAL_KEY_ID,
    checks, signers, events, chain,
  }
}
