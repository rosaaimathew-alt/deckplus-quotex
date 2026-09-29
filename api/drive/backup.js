import { backupJsonToDrive, isAuthenticated } from '../_google-drive.js'
import { requireAuth } from '../_auth.js'

export const config = { api: { bodyParser: { sizeLimit: '25mb' } } }

const META_KEY = 'drive:backup:meta'

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return
  try {
    const { kv } = await import('@vercel/kv')

    if (req.method === 'GET') {
      const [meta, authenticated] = await Promise.all([kv.get(META_KEY), isAuthenticated()])
      return res.json({ meta: meta || null, authenticated })
    }

    if (req.method === 'POST') {
      const { storeData } = req.body || {}
      if (!storeData) return res.status(400).json({ error: 'Missing storeData' })

      const meta       = (await kv.get(META_KEY)) || {}
      const jsonString = JSON.stringify({ ...storeData, backedUpAt: new Date().toISOString() })

      let fileId = await backupJsonToDrive({ jsonString, existingFileId: meta.fileId || null })
      if (!fileId) {
        // File was deleted from Drive — create a fresh one
        fileId = await backupJsonToDrive({ jsonString, existingFileId: null })
      }

      const newMeta = { fileId, backedUpAt: Date.now() }
      await kv.set(META_KEY, newMeta)
      return res.json({ ok: true, ...newMeta })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
