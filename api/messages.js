import { getMessages, saveMessage, deleteMessage } from './_store.js'
import { requireAuth } from './_auth.js'
import { listRecentInbox } from './_gmail.js'

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return

  if (req.method === 'GET') {
    try {
      // Optional: pull recent replies from the connected Gmail before returning.
      if (req.query.sync === '1') {
        try {
          const inbound = await listRecentInbox({ max: 25 })
          await Promise.all(inbound.map(saveMessage))
        } catch (err) {
          // Not connected / scope not granted — just return stored messages.
          console.error('Gmail sync skipped:', err.message)
        }
      }
      const messages = await getMessages(200)
      return res.status(200).json({ messages })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  if (req.method === 'POST') {
    // Save an outbound message (called after a reply is sent)
    try {
      const message = req.body
      if (!message?.id) return res.status(400).json({ error: 'Message id required' })
      await saveMessage(message)
      return res.status(200).json({ ok: true })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id required' })
    try {
      await deleteMessage(id)
      return res.status(200).json({ ok: true })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
