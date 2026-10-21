/* global process, Buffer */
// ── Connected mailboxes ──────────────────────────────────────────────────────
// Each team member connects their own sending mailbox in Settings: their
// address + an app password. The login is tested before it is saved, the
// password is encrypted here (AES-256-GCM) before it reaches the database, and
// the mail_accounts table can only be reached through functions that require
// the server secret (supabase/mail.sql). Nothing about the password ever goes
// back to the browser.
import crypto from 'crypto'
import nodemailer from 'nodemailer'
import { createClient } from '@supabase/supabase-js'

// Common providers → their sending server. "other" takes a host and port.
export const MAIL_PROVIDERS = {
  gmail:   { label: 'Gmail / Google Workspace',  host: 'smtp.gmail.com',           port: 587 },
  outlook: { label: 'Outlook / Microsoft 365',   host: 'smtp.office365.com',       port: 587 },
  yahoo:   { label: 'Yahoo',                     host: 'smtp.mail.yahoo.com',      port: 465 },
  icloud:  { label: 'iCloud',                    host: 'smtp.mail.me.com',         port: 587 },
  godaddy: { label: 'GoDaddy',                   host: 'smtpout.secureserver.net', port: 465 },
  zoho:    { label: 'Zoho',                      host: 'smtp.zoho.com',            port: 465 },
}

const secret = () => process.env.ESIGN_DB_SECRET || null
export const mailboxesAvailable = () => !!secret() && !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)

let _db = null
function db() {
  if (_db) return _db
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Storage is not configured.')
  _db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _db
}
async function rpc(fn, args) {
  const { data, error } = await db().rpc(fn, { ...args, s: secret() })
  if (error) throw new Error(`${fn} failed: ${error.message}`)
  return data ?? null
}

// ── Encryption ───────────────────────────────────────────────────────────────
const encKey = () => Buffer.from(crypto.hkdfSync('sha256', secret() || '', 'deckplus-mail', 'smtp-password-v1', 32))
export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv)
  const ct = Buffer.concat([c.update(String(plain), 'utf8'), c.final()])
  return `v1:${Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64')}`
}
export function decryptSecret(enc) {
  const raw = Buffer.from(String(enc).replace(/^v1:/, ''), 'base64')
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), raw.subarray(0, 12))
  d.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
}

// ── Sending through one mailbox ──────────────────────────────────────────────
export function transportFor({ host, port, username, password }) {
  const p = Number(port) || 587
  return nodemailer.createTransport({
    host, port: p, secure: p === 465,
    auth: { user: username, pass: password },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
  })
}
// A saved row → a ready transport plus its From address, or null.
// "google" rows were connected with Sign in with Google: the saved secret is
// the account's refresh token, and Gmail is reached over OAuth2 (no password).
export function transportForRow(row) {
  if (!row?.secret_enc) return null
  if (row.provider === 'google') {
    const { refresh_token } = JSON.parse(decryptSecret(row.secret_enc))
    return { transporter: googleTransport(row.email, refresh_token), email: row.email }
  }
  return { transporter: transportFor({ host: row.host, port: row.port, username: row.username, password: decryptSecret(row.secret_enc) }), email: row.email }
}
function googleTransport(email, refreshToken) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { type: 'OAuth2', user: email, clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, refreshToken },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
  })
}

// ── Sign in with Google (one click per person) ───────────────────────────────
// The person picks their Google account in Google's own window and allows
// "send email on your behalf"; Google hands back a refresh token, which is
// encrypted and saved as their mailbox. Only the gmail.send scope is asked for.
export const googleSignInReady = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) && mailboxesAvailable()
const GOOGLE_MAIL_SCOPES = 'openid email https://www.googleapis.com/auth/gmail.send'

// Signed, short-lived state so the callback knows whose mailbox this is and
// nobody can forge it.
const stateKey = () => Buffer.from(crypto.hkdfSync('sha256', secret() || '', 'deckplus-mail', 'oauth-state-v1', 32))
export function signState(obj) {
  const body = Buffer.from(JSON.stringify({ ...obj, exp: Date.now() + 15 * 60_000 })).toString('base64url')
  const mac = crypto.createHmac('sha256', stateKey()).update(body).digest('base64url')
  return `mb.${body}.${mac}`
}
export function readState(state) {
  const [tag, body, mac] = String(state || '').split('.')
  if (tag !== 'mb' || !body || !mac) return null
  const want = crypto.createHmac('sha256', stateKey()).update(body).digest('base64url')
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null
  const obj = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  return obj.exp > Date.now() ? obj : null
}

export function googleMailboxAuthUrl({ origin, userId, orgId, loginHint }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/google-auth/callback`,
    response_type: 'code',
    scope: GOOGLE_MAIL_SCOPES,
    access_type: 'offline',
    prompt: 'consent select_account',
    state: signState({ userId, orgId: orgId || null, origin }),
  })
  if (loginHint) params.set('login_hint', loginHint)
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// Google sent the person back: swap the code for tokens, check Gmail accepts
// them, and save the mailbox. Returns the connected address.
export async function finishGoogleMailbox(code, st) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${st.origin}/api/google-auth/callback`, grant_type: 'authorization_code',
    }),
  })
  const tok = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`Google didn't finish the sign-in (${tok.error_description || tok.error || r.status}).`)
  if (!String(tok.scope || '').includes('gmail.send')) throw new Error('Please tick "Send email on your behalf" on the Google screen — Deck Plus needs it to send your quotes.')
  if (!tok.refresh_token) throw new Error('Google didn\'t return a long-term sign-in. Please try again.')
  const who = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${tok.access_token}` } }).then(x => x.json()).catch(() => ({}))
  const email = who.email
  if (!email) throw new Error('Google didn\'t share which address was picked. Please try again.')
  try { await googleTransport(email, tok.refresh_token).verify() }
  catch (err) { throw new Error(`Gmail didn't accept the sign-in for ${email}: ${err.message}`) }
  const prev = await mailboxForUser(st.userId)   // reconnecting keeps "use for company emails"
  await saveMailbox({
    userId: st.userId, orgId: st.orgId, email, provider: 'google', host: 'smtp.gmail.com', port: 465,
    username: email, password: JSON.stringify({ refresh_token: tok.refresh_token }), companyDefault: !!prev?.company_default,
  })
  return email
}

// Who really hosts an address's mail (from its MX records), so a login sent to
// the wrong provider can say which one to pick. null when unknown.
const MX_HOSTS = [
  [/google\.com$|googlemail\.com$/i, 'gmail', 'Google'],
  [/outlook\.com$|protection\.outlook\.com$/i, 'outlook', 'Microsoft 365 / Outlook'],
  [/secureserver\.net$/i, 'godaddy', 'GoDaddy'],
  [/yahoodns\.net$/i, 'yahoo', 'Yahoo'],
  [/icloud\.com$/i, 'icloud', 'iCloud'],
  [/zoho\.(com|eu|in)$/i, 'zoho', 'Zoho'],
]
export async function mailHostOf(email) {
  const domain = String(email || '').split('@')[1]
  if (!domain) return null
  try {
    const dns = await import('dns')
    const mx = await Promise.race([dns.promises.resolveMx(domain), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))])
    const top = mx.sort((a, b) => a.priority - b.priority)[0]?.exchange || ''
    const hit = MX_HOSTS.find(([re]) => re.test(top.replace(/\.$/, '')))
    return hit ? { provider: hit[1], name: hit[2], domain } : { provider: 'other', name: top, domain }
  } catch { return null }
}

// Plain-English reason a login failed.
export function friendlyMailError(err, { provider, host, port, email } = {}) {
  const m = String(err?.message || err || '')
  if (err?.code === 'EAUTH' || /\b(535|534|530)\b|invalid login|authentication|username and password/i.test(m)) {
    if (provider === 'gmail') {
      // 534 5.7.9 = a normal Google password was used where an App Password is required.
      if (/5\.7\.9|application-specific password/i.test(m)) return 'Google says that\'s your normal Google password. Gmail needs an App Password instead: turn on 2-Step Verification, create one at myaccount.google.com/apppasswords, and paste the 16 letters here.'
      // 535 5.7.8 = this address + password pair isn't accepted.
      return `Google didn't accept ${email || 'that address'} with that App Password. Check that: (1) the App Password was created while signed in to ${email || 'this same Google account'}, (2) you pasted all 16 letters, and (3) it hasn't been removed — changing your Google password deletes all App Passwords, so make a new one if you changed it.`
    }
    if (provider === 'outlook') return 'Microsoft turned down the login. Use an app password if your account has two-step sign-in. Some Microsoft 365 companies switch password sending off — your IT admin can turn on "Authenticated SMTP" for your mailbox.'
    if (provider === 'yahoo' || provider === 'icloud') return 'The login was turned down. This provider needs an app password from your account security settings, not your normal password.'
    return 'The mail server turned down that email and password. Check them, or use an app password if your account has two-step sign-in.'
  }
  if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND|ECONNECTION|ESOCKET|timeout/i.test(`${err?.code || ''} ${m}`)) {
    return `Couldn't reach the mail server ${host || ''}${port ? `:${port}` : ''}. Check the server name and port.`
  }
  return m || 'Could not connect to that mailbox.'
}

// Log in to the mail server without sending anything.
export async function verifyLogin(cfg) {
  try { await transportFor(cfg).verify(); return { ok: true } }
  catch (err) {
    // The server's own reply (never the password) for the logs.
    console.error(`Mailbox login failed for ${cfg.email || cfg.username} at ${cfg.host}:${cfg.port}: ${err?.code || ''} ${err?.responseCode || ''} ${String(err?.response || err?.message || '').slice(0, 200)}`)
    // Append the server's short reply code (e.g. "535-5.7.8 BadCredentials") so
    // support can tell the cause from what the user sees.
    const code = String(err?.response || err?.message || '').match(/\b[45]\d\d[- ][45]\.\d\.\d+\b.{0,40}/)?.[0]
    let error = friendlyMailError(err, cfg) + (code ? ` (Server reply: ${code.trim().replace(/\s+https?:\S+.*$/, '')})` : '')
    // Wrong provider picked? e.g. a company address hosted by Microsoft tried on Gmail.
    const real = await mailHostOf(cfg.email || cfg.username)
    if (real && cfg.provider && real.provider !== cfg.provider) {
      error = `${real.domain} email isn't handled by ${MAIL_PROVIDERS[cfg.provider]?.label || 'that provider'} — it's handled by ${real.name}. ${real.provider !== 'other' ? `Pick "${MAIL_PROVIDERS[real.provider]?.label}" as the provider and try again.` : 'Pick "Other" and enter your provider\'s outgoing (SMTP) server.'}`
    }
    return { ok: false, error }
  }
}

// ── Lookups ──────────────────────────────────────────────────────────────────
export async function mailboxForUser(userId) {
  if (!userId || !mailboxesAvailable()) return null
  return rpc('mail_account_get_s', { p_user: userId })
}
export async function mailboxForEmail(email) {
  if (!email || !mailboxesAvailable()) return null
  return rpc('mail_account_by_email_s', { p_email: String(email) })
}
export async function companyMailbox(orgId = null) {
  if (!mailboxesAvailable()) return null
  return rpc('mail_account_company_s', { p_org: orgId || null })
}
export async function saveMailbox({ userId, orgId, email, provider, host, port, username, password, companyDefault }) {
  await rpc('mail_account_set_s', {
    p_user: userId, p_org: orgId || null, p_email: email, p_provider: provider || 'other',
    p_host: host, p_port: Number(port) || 587, p_username: username, p_secret_enc: encryptSecret(password),
    p_company_default: !!companyDefault,
  })
}
// Turn "use for company emails" on or off for a mailbox that's already connected.
export async function setCompanyDefault(userId, on) {
  const row = await mailboxForUser(userId)
  if (!row) return null
  await rpc('mail_account_set_s', {
    p_user: userId, p_org: row.org_id || null, p_email: row.email, p_provider: row.provider || 'other',
    p_host: row.host, p_port: Number(row.port) || 587, p_username: row.username, p_secret_enc: row.secret_enc,
    p_company_default: !!on,
  })
  return mailboxForUser(userId)
}
export async function clearMailbox(userId) {
  await rpc('mail_account_clear_s', { p_user: userId })
}

// ── Server-only secrets (the Google sign-in token) ──────────────────────────
export const vaultGet = (k) => rpc('vault_get_s', { k })
export const vaultSet = (k, v) => rpc('vault_set_s', { k, v })
