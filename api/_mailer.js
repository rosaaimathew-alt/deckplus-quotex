/**
 * Mailer utility. Prefers the connected Gmail account (OAuth2) so each customer
 * sends from their own address; falls back to a shared Gmail SMTP account
 * (GMAIL_USER + GMAIL_APP_PASSWORD) when no Google account is connected.
 */
import nodemailer from 'nodemailer'
import { getGmailOAuthCredentials, getConnectedEmail } from './_google-drive.js'

function getSmtpTransporter() {
  const user = process.env.GMAIL_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
}

// Build a From header, preferring the connected account, then the SMTP account.
function fromHeader(fromName, fromEmail) {
  const name = fromName || process.env.COMPANY_NAME || 'Your Company'
  const email = fromEmail || process.env.GMAIL_USER
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
    return { error: 'No email account connected. Connect your Google account in Settings, or set GMAIL_USER and GMAIL_APP_PASSWORD.' }
  }
  try {
    const info = await transporter.sendMail({
      from: fromHeader(fromName, process.env.GMAIL_USER),
      to, subject, html, text, attachments,
    })
    return { success: true, messageId: info.messageId }
  } catch (err) {
    return { error: err.message }
  }
}

// True if any send path is available (connected Gmail or SMTP).
export async function isMailerConfigured() {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) return true
  try {
    return !!(await getConnectedEmail())
  } catch {
    return false
  }
}
