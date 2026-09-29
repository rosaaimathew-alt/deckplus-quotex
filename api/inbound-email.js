/**
 * Inbound email webhook — receives emails forwarded by Resend (or any service
 * that POSTs a JSON payload).
 *
 * To set up with Resend:
 *   1. Add your domain in Resend Dashboard → Domains
 *   2. Set MX records on your domain to: feedback-smtp.us-east-1.resend.com (priority 10)
 *   3. Go to Resend Dashboard → Inbound → Create route
 *   4. Point to: https://your-vercel-app.vercel.app/api/inbound-email
 *   5. Optionally add INBOUND_WEBHOOK_SECRET to verify requests
 */

import { saveMessage } from './_store.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Require a webhook secret — reject if unset so the endpoint is never open
  const secret = process.env.INBOUND_WEBHOOK_SECRET
  if (!secret) {
    return res.status(503).json({ error: 'Inbound email not configured' })
  }
  const provided = req.headers['x-webhook-secret'] || req.headers['authorization']?.replace('Bearer ', '')
  if (provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const payload = req.body

    // Normalize across email providers (Resend, Postmark, Mailgun, etc.)
    const message = normalizePayload(payload)
    if (!message) {
      return res.status(400).json({ error: 'Unrecognized email payload format' })
    }

    await saveMessage(message)
    return res.status(200).json({ ok: true, id: message.id })
  } catch (err) {
    console.error('inbound-email error:', err)
    return res.status(500).json({ error: err.message })
  }
}

function normalizePayload(payload) {
  // Resend inbound format
  if (payload?.from && (payload?.text !== undefined || payload?.html !== undefined)) {
    const fromRaw = payload.from
    const { name: fromName, email: fromEmail } = parseAddress(fromRaw)
    const toList = Array.isArray(payload.to) ? payload.to : [payload.to].filter(Boolean)

    return {
      id: `in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      direction: 'inbound',
      from: { name: fromName, email: fromEmail },
      to: toList.map(t => (typeof t === 'string' ? t : t?.email || t)),
      subject: payload.subject || '(no subject)',
      textBody: payload.text || '',
      htmlBody: payload.html || '',
      messageId: payload.messageId || payload.message_id || null,
      inReplyTo: payload.inReplyTo || payload.in_reply_to || null,
      receivedAt: new Date().toISOString(),
      read: false,
    }
  }

  // Postmark inbound format
  if (payload?.FromFull && payload?.TextBody !== undefined) {
    return {
      id: `in_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      direction: 'inbound',
      from: { name: payload.FromName || '', email: payload.From },
      to: (payload.ToFull || []).map(t => t.Email).filter(Boolean),
      subject: payload.Subject || '(no subject)',
      textBody: payload.TextBody || '',
      htmlBody: payload.HtmlBody || '',
      messageId: payload.MessageID || null,
      inReplyTo: payload.Headers?.find(h => h.Name === 'In-Reply-To')?.Value || null,
      receivedAt: payload.Date || new Date().toISOString(),
      read: false,
    }
  }

  return null
}

function parseAddress(raw) {
  if (!raw) return { name: '', email: '' }
  const match = raw.match(/^(.*?)\s*<(.+?)>$/)
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() }
  return { name: '', email: raw.trim() }
}
