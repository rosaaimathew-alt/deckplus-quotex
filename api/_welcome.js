import { sendMail } from './_mailer.js'
import { logEventSafe } from './_esign.js'

// ── Welcome email when a contract is fully signed ────────────────────────────
// The wording (Settings › Contracts › Welcome Email) is copied onto the signing
// record when the contract is sent; once every party has signed, it goes to
// the customer from the company mailbox. It carries no link to the signing
// page: a signed link is closed, and the office sends the signed copy.
// Sent once per contract; the result is kept on the record and in the log.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m))

// Wording saved before signed links were closed may still have the
// {signedCopyLink} fill-in: that line goes, along with a lead-in line ending in
// a colon right above it ("…your signed contract any time here:").
export function withoutSignedCopyLink(body) {
  const lines = String(body || '').split('\n')
  const out = []
  for (const line of lines) {
    if (!line.includes('{signedCopyLink}')) { out.push(line); continue }
    if (out.length && out[out.length - 1].trim().endsWith(':')) out.pop()
    out.push('We will send you a signed copy of your agreement.')
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n')
}

// eslint-disable-next-line no-unused-vars -- origin: kept for callers; the email no longer links back to the site
export async function sendWelcomeEmail(kv, { recordId, origin, ctx }) {
  const record = await kv.get(`sign:${recordId}`)
  const w = record?.welcome
  if (!w?.enabled || record.welcomeSentAt) return null
  const values = record.contractData?.dp?.values || {}
  const to = record.signerEmails?.client || values.clientEmail || record.contractData?.email || ''
  const clientName = values.clientName || record.contractData?.client || ''
  const vars = {
    firstName: String(clientName).trim().split(/\s+/)[0] || 'there',
    clientName,
    companyName: w.companyName || 'Deck Plus',
    contractNum: record.contractNum || '',
  }
  const subject = fill(w.subject, vars)
  const text = fill(withoutSignedCopyLink(w.body), vars)
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111">${
    esc(text).split('\n').map(line => line || '&nbsp;').join('<br>')
  }</div>`

  let result
  if (!to) result = { error: 'No customer email on the contract' }
  else {
    try { result = await sendMail({ to, subject, html, text, fromName: vars.companyName, sender: { orgId: w.orgId || null } }) }
    catch (err) { result = { error: err.message } }
  }
  const latest = await kv.get(`sign:${recordId}`)
  await kv.set(`sign:${recordId}`, {
    ...latest,
    ...(result?.success ? { welcomeSentAt: Date.now(), welcomeSentTo: to, welcomeSentFrom: result.sentFrom || null, welcomeError: null } : { welcomeError: result?.error || 'Not sent' }),
  })
  await logEventSafe(ctx, { recordType: 'contract', recordId, event: result?.success ? 'welcome_email_sent' : 'welcome_email_failed', signerEmail: to || null,
    detail: result?.success ? { to, from: result.sentFrom || null } : { to, error: result?.error || null } })
  return result
}
