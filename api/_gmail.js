// Gmail API read helper — pulls recent inbox messages for the connected account
// so replies show up in the QuoteX Inbox. Requires the gmail.readonly scope.
import { getGoogleAccessToken, getConnectedEmail } from './_google-drive.js'

const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

function b64urlDecode(data) {
  if (!data) return ''
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

function header(headers, name) {
  const h = (headers || []).find(x => x.name.toLowerCase() === name.toLowerCase())
  return h ? h.value : ''
}

// Recursively find the first part matching a mime type
function findPart(payload, mime) {
  if (!payload) return null
  if (payload.mimeType === mime && payload.body?.data) return payload.body.data
  for (const part of payload.parts || []) {
    const found = findPart(part, mime)
    if (found) return found
  }
  return null
}

// Parse "Name <email>" into { name, email }
function parseAddress(raw) {
  if (!raw) return { name: '', email: '' }
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1].trim(), email: m[2].trim() }
  return { name: '', email: raw.trim() }
}

// Fetch recent inbox messages, normalized to the QuoteX message shape.
export async function listRecentInbox({ max = 25, query = 'in:inbox newer_than:30d' } = {}) {
  const token = await getGoogleAccessToken()
  const connected = await getConnectedEmail()

  const listRes = await fetch(
    `${API}/messages?maxResults=${max}&q=${encodeURIComponent(query)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!listRes.ok) throw new Error(`Gmail list failed: ${await listRes.text()}`)
  const { messages = [] } = await listRes.json()

  const results = []
  for (const { id } of messages) {
    const msgRes = await fetch(`${API}/messages/${id}?format=full`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!msgRes.ok) continue
    const msg = await msgRes.json()
    const headers = msg.payload?.headers || []
    const from = parseAddress(header(headers, 'From'))
    const html = b64urlDecode(findPart(msg.payload, 'text/html'))
    const text = b64urlDecode(findPart(msg.payload, 'text/plain')) || msg.snippet || ''
    const dateHeader = header(headers, 'Date')
    const receivedAt = dateHeader
      ? new Date(dateHeader).toISOString()
      : new Date(Number(msg.internalDate) || Date.now()).toISOString()

    results.push({
      id: `gmail_${id}`,
      direction: 'inbound',
      from,
      to: connected ? [connected] : [],
      subject: header(headers, 'Subject') || '(no subject)',
      textBody: text,
      htmlBody: html,
      messageId: header(headers, 'Message-ID') || `gmail_${id}`,
      inReplyTo: header(headers, 'In-Reply-To') || null,
      receivedAt,
      read: !(msg.labelIds || []).includes('UNREAD'),
    })
  }
  return results
}
