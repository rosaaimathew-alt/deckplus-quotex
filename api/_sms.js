/* global process, Buffer */
// Text messages, through Twilio. Off until the account exists: with no
// TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM set on the server,
// nothing is sent and callers just carry on with email.
//   TWILIO_FROM is the Deck Plus texting number (+1…), or a Messaging
//   Service id (MG…).

export const smsConfigured = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM)

// "704-555-0100", "(704) 555 0100", "+1 704 555 0100" → "+17045550100"; anything else → null
export function usNumber(phone) {
  const d = String(phone || '').replace(/(x|ext).*$/i, '').replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return null
}

// → { sent: true } | { skipped: reason } | { error }
export async function sendSms(to, body) {
  if (!smsConfigured()) return { skipped: 'texting is not set up' }
  const num = usNumber(to)
  if (!num) return { skipped: 'no mobile number' }
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = process.env
  const form = new URLSearchParams({ To: num, Body: String(body || '').slice(0, 600) })
  form.set(from.startsWith('MG') ? 'MessagingServiceSid' : 'From', from)
  try {
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
      signal: AbortSignal.timeout(6000),
    })
    if (r.ok) return { sent: true }
    const j = await r.json().catch(() => ({}))
    return { error: `Text refused (${r.status}${j.code ? `, code ${j.code}` : ''})` }
  } catch (err) {
    return { error: `Text failed: ${err.message}` }
  }
}
