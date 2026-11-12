// ── Job chat: a sub's manager and the Deck Plus PM, one conversation per job ─
// A conversation is every message with the same job and the same sub
// (supabase/sub_messages.sql). Which messages are new is kept on this device.
const KEY = 'qx_chat_seen'

export const newMessageId = () => `sm_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
export const threadKey = (proposalId, subId) => `${proposalId}:${subId}`

// The conversation for one sub on one job, oldest first.
export const threadOf = (messages, proposalId, subId) =>
  (messages || [])
    .filter(m => m && String(m.proposalId) === String(proposalId) && String(m.subId) === String(subId))
    .sort((a, b) => (a.at || '').localeCompare(b.at || ''))

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { return {} }
}
export const chatSeenAt = (proposalId, subId) => read()[threadKey(proposalId, subId)] || ''
export function markChatSeen(proposalId, subId, at = new Date().toISOString()) {
  try {
    const all = read()
    if ((all[threadKey(proposalId, subId)] || '') >= at) return
    all[threadKey(proposalId, subId)] = at
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch { /* private window: messages just stay marked new */ }
}

// Messages from the other side since this device last had the conversation open.
// side: 'pm' (Deck Plus) or 'sub'
export function unreadCount(messages, proposalId, subId, side) {
  const seen = chatSeenAt(proposalId, subId)
  return threadOf(messages, proposalId, subId).filter(m => m.from !== side && (m.at || '') > seen).length
}

// "9:42 AM" today, "Tue 9:42 AM" this week, "Nov 3, 9:42 AM" before that.
export function chatTime(iso, now = new Date()) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000)
  if (days <= 0) return time
  if (days < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}
