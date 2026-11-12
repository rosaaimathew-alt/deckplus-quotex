/**
 * Merged email handler — routes by req.body.action:
 *   (none / 'proposal')   → send proposal email or reply
 *   'payment-reminder'    → payment milestone reminder
 *   'followup'            → quote follow-up
 *   'closeout'            → project completion email
 *
 * Consolidates 4 endpoints into 1 to stay within Vercel Hobby's 12-function limit.
 */
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import dotenv from 'dotenv'
import { saveMessage } from './_store.js'
import { sendMail, isMailerConfigured, smtpUser } from './_mailer.js'
import { sendNotification } from './_notify.js'
import { requireAuth } from './_auth.js'
import { getKV } from './_kv.js'
import { buildProposalEmail, signatureOf, loadSignature, saveSignature } from './_proposalEmail.js'

// Company name shown in customer emails (per-instance; set COMPANY_NAME in the env).
const COMPANY = process.env.COMPANY_NAME || 'Your Company'

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })

const fmt = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Escape user-supplied text before interpolating into email HTML
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

// ── Payment reminder HTML ─────────────────────────────────────────────────────
function buildReminderHtml({ client, amount, milestone, dueDate, contractNum, address, projectType }) {
  const company = COMPANY
  const dueLine = dueDate
    ? new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : null
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#0f172a;padding:28px 40px;">
        <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${company}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Payment Reminder</p>
      </td></tr>
      <tr><td style="padding:32px 40px 24px;">
        <p style="margin:0 0 16px;font-size:15px;color:#1e293b;">Hi ${esc(client) || 'there'},</p>
        <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.7;">
          This is a friendly reminder that a payment is due for your ongoing project with ${company}.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;padding:20px 24px;margin-bottom:20px;">
          ${contractNum ? `<tr><td style="padding:4px 0;font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Contract</td><td style="padding:4px 0;font-size:13px;color:#1e293b;font-weight:600;text-align:right;">${esc(contractNum)}</td></tr>` : ''}
          ${address ? `<tr><td style="padding:4px 0;font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Project Address</td><td style="padding:4px 0;font-size:13px;color:#1e293b;text-align:right;">${esc(address)}</td></tr>` : ''}
          ${projectType ? `<tr><td style="padding:4px 0;font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Project Type</td><td style="padding:4px 0;font-size:13px;color:#1e293b;text-align:right;">${esc(projectType)}</td></tr>` : ''}
          ${milestone ? `<tr><td style="padding:4px 0;font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Payment Milestone</td><td style="padding:4px 0;font-size:13px;color:#1e293b;text-align:right;">${esc(milestone)}</td></tr>` : ''}
          ${dueLine ? `<tr><td style="padding:4px 0;font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Due Date</td><td style="padding:4px 0;font-size:13px;color:#dc2626;font-weight:700;text-align:right;">${dueLine}</td></tr>` : ''}
          ${amount ? `<tr><td style="padding:12px 0 0;border-top:1px solid #e2e8f0;" colspan="2">
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#94a3b8;font-weight:700;">Amount Due</span>
            <span style="float:right;font-size:22px;font-weight:800;color:#0f172a;">$${fmt(amount)}</span>
          </td></tr>` : ''}
        </table>
        <p style="margin:0;font-size:14px;color:#475569;line-height:1.7;">
          Please reply to this email or call us to arrange payment. Thank you for your continued business!
        </p>
      </td></tr>
      <tr><td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:12px;color:#94a3b8;"><strong style="color:#475569;">${company}</strong> · Reply to this email with any questions</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`
}

// ── Follow-up HTML ────────────────────────────────────────────────────────────
function buildFollowupHtml({ client, total, address, projectType, sentDaysAgo, expiration, contractNum }) {
  const company  = COMPANY
  const isUrgent = sentDaysAgo >= 14
  const expiryLine = expiration
    ? new Date(expiration + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null
  const ctaText = isUrgent
    ? `We wanted to follow up one more time on your proposal. If you're still interested, we'd love to get your project scheduled — our calendar is filling up and we want to make sure we can accommodate you.`
    : `We wanted to follow up on the proposal we sent you. Have you had a chance to review it? We're happy to answer any questions or adjust the scope to fit your needs.`
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#0f172a;padding:28px 40px;">
        <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${company}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Proposal Follow-Up</p>
      </td></tr>
      <tr><td style="padding:32px 40px 24px;">
        <p style="margin:0 0 16px;font-size:15px;color:#1e293b;">Hi ${esc(client) || 'there'},</p>
        <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.7;">${ctaText}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;padding:20px 24px;margin-bottom:20px;">
          ${contractNum ? `<tr><td style="padding:4px 0;font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Quote #</td><td style="padding:4px 0;font-size:13px;color:#1e293b;font-weight:600;text-align:right;">${esc(contractNum)}</td></tr>` : ''}
          ${address ? `<tr><td style="padding:4px 0;font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Project Address</td><td style="padding:4px 0;font-size:13px;color:#1e293b;text-align:right;">${esc(address)}</td></tr>` : ''}
          ${projectType ? `<tr><td style="padding:4px 0;font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Project</td><td style="padding:4px 0;font-size:13px;color:#1e293b;text-align:right;">${esc(projectType)}</td></tr>` : ''}
          ${expiryLine ? `<tr><td style="padding:4px 0;font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Proposal Valid Until</td><td style="padding:4px 0;font-size:13px;color:#dc2626;font-weight:700;text-align:right;">${expiryLine}</td></tr>` : ''}
          ${total ? `<tr><td style="padding:12px 0 0;border-top:1px solid #e2e8f0;" colspan="2">
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#94a3b8;font-weight:700;">Proposal Total</span>
            <span style="float:right;font-size:22px;font-weight:800;color:#0f172a;">$${fmt(total)}</span>
          </td></tr>` : ''}
        </table>
        <p style="margin:0;font-size:14px;color:#475569;line-height:1.7;">Simply reply to this email or give us a call — we're happy to chat through any details.</p>
      </td></tr>
      ${isUrgent ? `<tr><td style="padding:0 40px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef9c3;border-radius:8px;border-left:4px solid #eab308;">
          <tr><td style="padding:14px 18px;font-size:13px;color:#854d0e;line-height:1.6;">Our schedule fills up quickly. A deposit can lock in your start date now.</td></tr>
        </table>
      </td></tr>` : ''}
      <tr><td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #e2e8f0;">
        <p style="margin:0;font-size:12px;color:#94a3b8;"><strong style="color:#475569;">${company}</strong> · Reply to this email or call us to get started</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`
}

// ── Close-out HTML ────────────────────────────────────────────────────────────
function buildCloseoutHtml({ client, contractNum, address, projectType, completionDate }) {
  const company = COMPANY
  const completionFormatted = completionDate
    ? new Date(completionDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : 'recently'
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#064e3b;padding:28px 40px;">
        <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;">${company}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#6ee7b7;">Project Complete ✓</p>
      </td></tr>
      <tr><td style="padding:32px 40px 24px;">
        <p style="margin:0 0 16px;font-size:15px;color:#1e293b;">Hi ${esc(client) || 'there'},</p>
        <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.7;">
          We're thrilled to let you know that your project has been completed on <strong>${completionFormatted}</strong>.
          It was a genuine pleasure working with you, and we hope you love the final result!
        </p>
        ${address ? `<p style="margin:0 0 16px;font-size:13px;color:#64748b;">Project address: <strong>${esc(address)}</strong></p>` : ''}
        ${projectType ? `<p style="margin:0 0 16px;font-size:13px;color:#64748b;">Project type: <strong>${esc(projectType)}</strong></p>` : ''}
        <p style="margin:0;font-size:14px;color:#475569;line-height:1.7;">
          If you have any warranty concerns down the road, don't hesitate to reach out — we stand behind our work.
          And if you know anyone looking for outdoor living improvements, a referral is the greatest compliment we can receive!
        </p>
      </td></tr>
      <tr><td style="background:#f0fdf4;padding:20px 40px;border-top:1px solid #d1fae5;">
        <p style="margin:0;font-size:12px;color:#6b7280;"><strong style="color:#374151;">${company}</strong> · Thank you for choosing us!</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  // Alerts about a sub's job are open to every login on the team (a technician
  // tapping "Completed" tells the PM); the database decides who is told what.
  if (req.body?.action === 'notify') return sendNotification(req, res, req.body)
  const staff = await requireAuth(req, res)
  if (!staff) return
  const { action, ...body } = req.body || {}

  // ── The signed-in person's email signature (name, title, cell…) ───────────
  if (action === 'signature' || action === 'signature-save') {
    const kv = await getKV()
    const saved = await loadSignature(kv, staff.sub)
    if (action === 'signature') return res.status(200).json({ signature: signatureOf(null, saved), saved: !!saved })
    const signature = signatureOf(body.signature, saved)
    await saveSignature(kv, staff.sub, signature)
    return res.status(200).json({ signature, saved: true })
  }

  // Emails go out from the signed-in person's own connected mailbox when they have one.
  const mailSender = { userId: staff.sub, email: staff.email }
  if (!(await isMailerConfigured(mailSender))) {
    return res.status(500).json({ error: 'No email account connected. Connect your mailbox in Settings › Email Account.' })
  }

  // ── Payment reminder ──────────────────────────────────────────────────────
  if (action === 'payment-reminder') {
    const { toEmail, client, amount, milestone, dueDate, contractNum, address, projectType } = body
    if (!toEmail) return res.status(400).json({ error: 'Recipient email is required.' })
    const subject = `Payment Reminder — ${contractNum || 'Your Project'} · ${COMPANY}`
    const result  = await sendMail({ to: toEmail, subject, html: buildReminderHtml({ client, amount, milestone, dueDate, contractNum, address, projectType }), sender: mailSender })
    if (result.error) return res.status(500).json({ error: result.error })
    return res.status(200).json({ success: true })
  }

  // ── Follow-up ─────────────────────────────────────────────────────────────
  if (action === 'followup') {
    const { toEmail, client, total, address, projectType, sentAt, expiration, contractNum } = body
    if (!toEmail) return res.status(400).json({ error: 'Recipient email is required.' })
    const sentDaysAgo = sentAt ? Math.round((Date.now() - new Date(sentAt)) / 86400000) : 7
    const result = await sendMail({
      to: toEmail,
      subject: `Following Up — Your ${COMPANY} Proposal`,
      html: buildFollowupHtml({ client, total, address, projectType, sentDaysAgo, expiration, contractNum }),
      sender: mailSender,
    })
    if (result.error) return res.status(500).json({ error: result.error })
    return res.status(200).json({ success: true })
  }

  // ── Change Order signature request ───────────────────────────────────────
  if (action === 'co-signature-request') {
    const { to, client, coNumber, description, amount, signLink } = body
    if (!to) return res.status(400).json({ error: 'Recipient email is required.' })
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td style="background:#0f172a;padding:32px 40px;">
        <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">${COMPANY}</p>
        <p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Change Order · ${esc(coNumber)}</p>
      </td></tr>
      <tr><td style="padding:32px 40px;">
        <p style="margin:0 0 12px;font-size:15px;color:#1e293b;">Hi ${esc(client) || 'there'},</p>
        <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.7;">
          We have a change order for your project that requires your signature. Please review the details below and sign at your earliest convenience.
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin-bottom:24px;">
          <tr><td style="padding:4px 0;font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Change Order #</td><td style="padding:4px 0;font-size:13px;color:#1e293b;font-weight:600;text-align:right;">${esc(coNumber)}</td></tr>
          <tr><td style="padding:4px 0;font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Description</td><td style="padding:4px 0;font-size:13px;color:#1e293b;text-align:right;">${esc(description)}</td></tr>
          <tr><td style="padding:4px 0;font-size:12px;color:#94a3b8;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;border-top:1px solid #e2e8f0;padding-top:12px;">Amount</td><td style="padding:4px 0;font-size:16px;color:#1e293b;font-weight:700;text-align:right;border-top:1px solid #e2e8f0;padding-top:12px;">$${fmt(amount)}</td></tr>
        </table>
        <div style="text-align:center;margin:28px 0;">
          <a href="${signLink}" style="display:inline-block;background:#0f172a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:-0.01em;">Review &amp; Sign Change Order</a>
        </div>
        <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
          Or copy this link: <a href="${signLink}" style="color:#3b82f6;">${signLink}</a>
        </p>
      </td></tr>
      <tr><td style="background:#f8fafc;padding:20px 40px;text-align:center;">
        <p style="margin:0;font-size:11px;color:#94a3b8;">${COMPANY} · Licensed &amp; Insured</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
    const result = await sendMail({ to, subject: `Change Order Requires Your Signature — ${coNumber}`, html, sender: mailSender })
    if (result.error) return res.status(500).json({ error: result.error })
    return res.status(200).json({ success: true })
  }

  // ── Close-out ─────────────────────────────────────────────────────────────
  if (action === 'closeout') {
    const { toEmail, client, contractNum, address, projectType, completionDate } = body
    if (!toEmail) return res.status(400).json({ error: 'Recipient email is required.' })
    const result = await sendMail({
      to: toEmail,
      subject: `Your Project is Complete — Thank You! · ${contractNum || COMPANY}`,
      html: buildCloseoutHtml({ client, contractNum, address, projectType, completionDate }),
      sender: mailSender,
    })
    if (result.error) return res.status(500).json({ error: result.error })
    return res.status(200).json({ success: true })
  }

  // ── Proposal email (default) ──────────────────────────────────────────────
  const { proposal, fromName, replyText, inReplyTo, subject: customSubject, viewUrl } = body
  const recipientEmail = proposal?.email
  if (!recipientEmail) return res.status(400).json({ error: 'Recipient email is required.' })

  const isReply = !!replyText
  let html, subject, text, senderName
  if (isReply) {
    html    = `<div style="font-family:-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;max-width:600px;margin:0 auto;padding:24px;">${replyText.replace(/\n/g, '<br>')}</div>`
    subject = customSubject || `Re: Your Proposal`
    senderName = esc(fromName) || esc(proposal?.companyName || COMPANY)
  } else {
    // The customer gets the link only (no PDF), so every look at the proposal
    // is an open we can see. No link, no email.
    if (!viewUrl || !/^https?:\/\//i.test(viewUrl)) {
      return res.status(400).json({ error: 'The proposal link could not be created, so nothing was sent. Please try again.' })
    }
    // The sender's signature: what they just typed, else what they saved.
    let signature = signatureOf(body.signature, null, fromName)
    try {
      const kv = await getKV()
      const saved = await loadSignature(kv, staff.sub)
      signature = signatureOf(body.signature, saved, fromName)
      if (body.signature && JSON.stringify(signature) !== JSON.stringify(saved)) await saveSignature(kv, staff.sub, signature)
    } catch (err) { console.error('Email signature:', err.message) }
    const host = req.headers['x-forwarded-host'] || req.headers.host || ''
    const logoUrl = host ? `${host.includes('localhost') ? 'http' : 'https'}://${host}/deckplus-logo.png` : ''
    ;({ subject, html, text } = buildProposalEmail({ client: proposal?.client, viewUrl, signature, logoUrl }))
    senderName = signature.name.replace(/["<>]/g, '') || esc(proposal?.companyName || COMPANY)
  }

  const result = await sendMail({ to: recipientEmail, subject, html, text, fromName: senderName, sender: mailSender })
  if (result.error) return res.status(500).json({ error: result.error })

  const msgId = `out_${result.messageId || Date.now()}`
  await saveMessage({
    id: msgId, direction: 'outbound',
    from: { name: fromName || 'You', email: result.sentFrom || smtpUser() || 'noreply' },
    to: [recipientEmail], subject,
    textBody: isReply ? replyText : (text || ''),
    htmlBody: html,
    messageId: result.messageId || msgId,
    inReplyTo: inReplyTo || null,
    receivedAt: new Date().toISOString(),
    read: true,
  })
  return res.status(200).json({ success: true, id: result.messageId })
}
