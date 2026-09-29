/**
 * Message store abstraction.
 * - Production (Vercel): uses @vercel/kv (Redis) — requires KV_REST_API_URL env var
 * - Local dev: falls back to in-memory Map (resets on server restart, fine for testing)
 */

const localMessages = new Map()

function isKVAvailable() {
  return !!process.env.KV_REST_API_URL
}

async function getKV() {
  const { kv } = await import('@vercel/kv')
  return kv
}

export async function saveMessage(message) {
  if (isKVAvailable()) {
    const kv = await getKV()
    await kv.hset('eq:messages', { [message.id]: JSON.stringify(message) })
    await kv.zadd('eq:messages:index', {
      score: new Date(message.receivedAt).getTime(),
      member: message.id,
    })
  } else {
    localMessages.set(message.id, message)
  }
}

export async function getMessages(limit = 200) {
  if (isKVAvailable()) {
    const kv = await getKV()
    const ids = await kv.zrange('eq:messages:index', 0, limit - 1, { rev: true })
    if (!ids?.length) return []
    const raw = await kv.hmget('eq:messages', ...ids)
    return raw
      .filter(Boolean)
      .map((m) => (typeof m === 'string' ? JSON.parse(m) : m))
  } else {
    return [...localMessages.values()].sort(
      (a, b) => new Date(b.receivedAt) - new Date(a.receivedAt)
    )
  }
}

export async function deleteMessage(id) {
  if (isKVAvailable()) {
    const kv = await getKV()
    await kv.hdel('eq:messages', id)
    await kv.zrem('eq:messages:index', id)
  } else {
    localMessages.delete(id)
  }
}
