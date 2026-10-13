/* global process */
/**
 * Mailer utility. Prefers the connected Gmail account (OAuth2) so each customer
 * sends from their own address; falls back to a shared mailbox over SMTP when no
 * Google account is connected:
 *   • any provider (Outlook / Microsoft 365, GoDaddy, Zoho…): SMTP_HOST,
 *     SMTP_PORT (default 587), SMTP_USER, SMTP_PASS
 *   • Gmail / Google Workspace: GMAIL_USER + GMAIL_APP_PASSWORD
 */
import nodemailer from 'nodemailer'
import { getGmailOAuthCredentials, getConnectedEmail } from './_google-drive.js'

// The shared mailbox address, or null when none is set up.
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

// Build a From header, preferring the connected account, then the SMTP account.
function fromHeader(fromName, fromEmail) {
  const name = fromName || process.env.COMPANY_NAME || 'Your Company'
  const email = fromEmail || smtpUser()
  return email ? `"${name}" <${email}>` : `"${name}"`
}

/**
 * Send an email. Uses the connected Gmail account when available.
 * @param {{ to, subject, html, text?, attachments?, fromName? }} opts
 * @returns {{ success: true, messageId } | { error }}
 */
export async function sendMail({ to, subject, html, text, attachments, fromName }) {
  // 1) Connected Gmail via OAuth2 (per-customer sending)
  try {
    const creds = await getGmailOAuthCredentials()
    if (creds) {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { type: 'OAuth2', ...creds },
      })
      const from = fromHeader(fromName, creds.user)
      const info = await transporter.sendMail({ from, to, subject, html, text, attachments })
      return { success: true, messageId: info.messageId }
    }
  } catch (err) {
    // Fall through to SMTP if the OAuth send fails
    console.error('Gmail OAuth send failed, falling back to SMTP:', err.message)
  }

  // 2) Shared SMTP fallback
  const transporter = getSmtpTransporter()
  if (!transporter) {
    return { error: 'No email account connected. Connect your Google account in Settings, or set up a sending mailbox (SMTP).' }
  }
  try {
    const info = await transporter.sendMail({
      from: fromHeader(fromName, smtpUser()),
      to, subject, html, text, attachments,
    })
    return { success: true, messageId: info.messageId }
  } catch (err) {
    return { error: err.message }
  }
}

// True if any send path is available (connected Gmail or SMTP).
export async function isMailerConfigured() {
  if (smtpUser()) return true
  try {
    return !!(await getConnectedEmail())
  } catch {
    return false
  }
}
