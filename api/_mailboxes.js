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
export function transportForRow(row) {
  if (!row?.secret_enc) return null
  return { transporter: transportFor({ host: row.host, port: row.port, username: row.username, password: decryptSecret(row.secret_enc) }), email: row.email }
}

// Plain-English reason a login failed.
export function friendlyMailError(err, { provider, host, port } = {}) {
  const m = String(err?.message || err || '')
  if (err?.code === 'EAUTH' || /\b(535|534|530)\b|invalid login|authentication|username and password/i.test(m)) {
    if (provider === 'gmail') return 'Google turned down the login. Gmail needs an App Password (not your normal password): turn on 2-Step Verification, then create one at myaccount.google.com/apppasswords and paste the 16 letters here.'
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
  catch (err) { return { ok: false, error: friendlyMailError(err, cfg) } }
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
export async function clearMailbox(userId) {
  await rpc('mail_account_clear_s', { p_user: userId })
}

// ── Server-only secrets (the Google sign-in token) ──────────────────────────
export const vaultGet = (k) => rpc('vault_get_s', { k })
export const vaultSet = (k, v) => rpc('vault_set_s', { k, v })
