import { uploadToDrive } from '../_google-drive.js'
import { requireAuth } from '../_auth.js'

export const config = { api: { bodyParser: { sizeLimit: '25mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!(await requireAuth(req, res))) return
  try {
    const { pdfBase64, fileName, mimeType } = req.body || {}
    if (!pdfBase64 || !fileName) return res.status(400).json({ error: 'Missing pdfBase64 or fileName' })
    const result = await uploadToDrive({ pdfBase64, fileName, mimeType })
    res.status(200).json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
