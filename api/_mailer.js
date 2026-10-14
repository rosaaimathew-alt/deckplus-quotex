/* global process */
/**
 * Mailer utility. Picks the mailbox an email goes out from, in this order:
 *   1. the sender's own connected mailbox (Settings › Email Account)
 *   2. the mailbox of the team member with the sender's email address
 *      (e.g. signing codes go out from the rep who sent the contract)
 *   3. the company mailbox (one marked for company emails, else an office /
 *      admin member's, else any connected one)
 *   4. a Google account connected with the Connect Google button
 *   5. a mailbox set on the server: SMTP_HOST / SMTP_PORT / SMTP_USER /
 *      SMTP_PASS, or GMAIL_USER + GMAIL_APP_PASSWORD
 * If one mailbox refuses to send, the next one is tried.
 */
import nodemailer from 'nodemailer'
import { getGmailOAuthCredentials, getConnectedEmail } from './_google-drive.js'
import { mailboxForUser, mailboxForEmail, companyMailbox, transportForRow } from './_mailboxes.js'

// The server-set mailbox address, or null when none is set up.
export function smtpUser() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) return process.env.SMTP_USER
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return process.env.GMAIL_USER
  return null
}

function getSmtpTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    const port = Number(SMTP_PORT) || 587
    return nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } })
  }
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
}

function fromHeader(fromName, email) {
  const name = fromName || process.env.COMPANY_NAME || 'Your Company'
  return email ? `"${name}" <${email}>` : `"${name}"`
}

const safe = async (fn) => { try { return await fn() } catch (err) { console.error(err.message); return null } }

// Every mailbox that could send this email, best first.
async function candidates(sender = {}) {
  const out = []
  const seen = new Set()
  const addRow = (row, label) => {
    if (!row || seen.has(row.user_id)) return
    seen.add(row.user_id)
    const t = safe(() => transportForRow(row))
    out.push({ label, load: async () => { const r = await t; return r && { transporter: r.transporter, email: r.email } } })
  }
  if (sender.userId) addRow(await safe(() => mailboxForUser(sender.userId)), 'your mailbox')
  if (sender.email)  addRow(await safe(() => mailboxForEmail(sender.email)), 'the sender\'s mailbox')
  addRow(await safe(() => companyMailbox(sender.orgId || null)), 'the company mailbox')
  out.push({ label: 'the connected Google account', load: async () => {
    const creds = await safe(() => getGmailOAuthCredentials())
    return creds && { transporter: nodemailer.createTransport({ service: 'gmail', auth: { type: 'OAuth2', ...creds } }), email: creds.user }
  } })
  out.push({ label: 'the server mailbox', load: async () => {
    const t = getSmtpTransporter()
    return t && { transporter: t, email: smtpUser() }
  } })
  return out
}

/**
 * Send an email from the best available mailbox.
 * @param {{ to, subject, html, text?, attachments?, fromName?, sender?: { userId?, email?, orgId? } }} opts
 * @returns {{ success: true, messageId, sentFrom } | { error }}
 */
export async function sendMail({ to, subject, html, text, attachments, fromName, sender }) {
  let firstError = null
  for (const c of await candidates(sender)) {
    const m = await c.load()
    if (!m) continue
    try {
      const info = await m.transporter.sendMail({ from: fromHeader(fromName, m.email), to, subject, html, text, attachments })
      return { success: true, messageId: info.messageId, sentFrom: m.email }
    } catch (err) {
      console.error(`Send via ${c.label} (${m.email}) failed:`, err.message)
      if (!firstError) firstError = `Sending from ${m.email} failed: ${err.message}`
    }
  }
  return { error: firstError || 'No email account connected. Connect your mailbox in Settings › Email Account.' }
}

// True if any mailbox could send for this sender (or for the company).
export async function isMailerConfigured(sender = {}) {
  if (smtpUser()) return true
  if (sender.userId && await safe(() => mailboxForUser(sender.userId))) return true
  if (await safe(() => companyMailbox(sender.orgId || null))) return true
  return !!(await safe(() => getConnectedEmail()))
}
