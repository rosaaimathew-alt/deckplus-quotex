import { sendMail } from './_mailer.js'
import { logEventSafe } from './_esign.js'

// ── Welcome email when a contract is fully signed ────────────────────────────
// The wording (Settings › Contracts › Welcome Email) is copied onto the signing
// record when the contract is sent; once every party has signed, it goes to
// the customer from the company mailbox, with a link to their signed copy.
// Sent once per contract; the result is kept on the record and in the log.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const fill = (tpl, vars) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m))

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
    signedCopyLink: record.roleTokens?.client ? `${origin}/sign/${record.roleTokens.client}` : '',
  }
  const subject = fill(w.subject, vars)
  const text = fill(w.body, vars)
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#111">${
    esc(text).split('\n').map(line => {
      const link = vars.signedCopyLink && line.trim() === esc(vars.signedCopyLink)
      return link ? `<a href="${esc(vars.signedCopyLink)}">View or download your signed contract</a>` : (line || '&nbsp;')
    }).join('<br>')
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
