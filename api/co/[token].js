import crypto from 'crypto'
import { verifyToken } from '../_auth.js'

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const token = req.query.token
  if (!token) return res.status(400).json({ error: 'Missing token' })

  // Admin actions (create links / look up full record incl. tokens) require a
  // signed-in operator. Client signing via role tokens stays public.
  const isAdminAction = token === 'create' || token.startsWith('record-')
  if (isAdminAction) {
    const header = req.headers.authorization || ''
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-qx-token'] || null)
    if (!(await verifyToken(bearer))) return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const { kv } = await import('@vercel/kv')
    const TTL = 60 * 60 * 24 * 90 // 90 days

    // ── CREATE ────────────────────────────────────────────────────────────
    if (token === 'create') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
      const { coData } = req.body || {}
      if (!coData) return res.status(400).json({ error: 'Missing coData' })

      const recordId = crypto.randomUUID()
      const tokens = { client: crypto.randomUUID(), builder: crypto.randomUUID() }

      await kv.set(`co:${recordId}`, {
        coData,
        status: 'pending',
        createdAt: Date.now(),
        signatures: {},
        tokens,
      }, { ex: TTL })

      await Promise.all([
        kv.set(`co-link:${tokens.client}`,  { recordId, role: 'client' },  { ex: TTL }),
        kv.set(`co-link:${tokens.builder}`, { recordId, role: 'builder' }, { ex: TTL }),
      ])

      const host  = req.headers['x-forwarded-host'] || req.headers.host || process.env.PUBLIC_HOST || 'localhost:5173'
      const proto = host.includes('localhost') ? 'http' : 'https'
      return res.json({
        recordId,
        links: {
          client:  `${proto}://${host}/co/${tokens.client}`,
          builder: `${proto}://${host}/co/${tokens.builder}`,
        },
      })
    }

    // ── RECORD LOOKUP: /api/co/record-<recordId> ──────────────────────────
    if (token.startsWith('record-') && req.method === 'GET') {
      const recordId = token.slice('record-'.length)
      const rec = await kv.get(`co:${recordId}`)
      if (!rec) return res.status(404).json({ error: 'Change order record not found or expired' })
      const { tokens, ...safe } = rec
      return res.json({ recordId, ...safe })
    }

    // ── ROLE TOKEN ────────────────────────────────────────────────────────
    const link = await kv.get(`co-link:${token}`)
    if (!link) return res.status(404).json({ error: 'Change order link not found or expired' })

    const record = await kv.get(`co:${link.recordId}`)
    if (!record) return res.status(404).json({ error: 'Change order record not found' })

    if (req.method === 'GET') {
      return res.json({
        role: link.role,
        coData: record.coData,
        status: record.status,
        signatures: record.signatures || {},
        alreadySigned: !!(record.signatures?.[link.role]),
      })
    }

    if (req.method === 'POST') {
      const { signatureDataUrl, printedName } = req.body || {}
      if (!signatureDataUrl) return res.status(400).json({ error: 'Missing signature' })

      const signatures = record.signatures || {}
      if (signatures[link.role]) return res.status(409).json({ error: `Already signed as ${link.role}` })

      signatures[link.role] = {
        signatureDataUrl,
        printedName: printedName || '',
        signedAt: Date.now(),
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
      }

      const allSigned = ['client', 'builder'].every(r => signatures[r])
      await kv.set(`co:${link.recordId}`, {
        ...record,
        signatures,
        status: allSigned ? 'signed' : 'partial',
      }, { ex: TTL })

      return res.json({ ok: true, allSigned })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
