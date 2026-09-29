import crypto from 'crypto'
import { uploadToDrive } from '../_google-drive.js'
import { verifyToken } from '../_auth.js'

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

const ROLES = ['client', 'builder', 'gc']

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const token = req.query.token
  if (!token) return res.status(400).json({ error: 'Missing token' })

  // Admin actions (create links / recover links / look up by contract number)
  // require a signed-in operator. Client signing via role tokens stays public.
  const isAdminAction = token === 'create' || token === 'pcreate' || token.startsWith('recover-') || token.startsWith('lookup-') || token.startsWith('record-') || token.startsWith('pdata-')
  if (isAdminAction) {
    const header = req.headers.authorization || ''
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-qx-token'] || null)
    if (!(await verifyToken(bearer))) return res.status(401).json({ error: 'Unauthorized' })
  }

  // Health check
  if (token === 'ping') {
    return res.json({
      ok: true,
      ts: new Date().toISOString(),
      version: 'recovery-v1',
    })
  }

  try {
    const { kv } = await import('@vercel/kv')

    // ── CREATE new signing request with 3 role-specific links ────────
    if (token === 'create') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
      const { contractData, contractNum } = req.body || {}
      if (!contractData) return res.status(400).json({ error: 'Missing contractData' })

      const recordId    = crypto.randomUUID()
      const roleTokens  = {
        client:  crypto.randomUUID(),
        builder: crypto.randomUUID(),
        gc:      crypto.randomUUID(),
      }
      const ttl = 60 * 60 * 24 * 60

      await kv.set(`sign:${recordId}`, {
        contractData,
        contractNum: contractNum || '',
        status:      'pending',
        createdAt:   Date.now(),
        signatures:  {},
        roleTokens,
      }, { ex: ttl })

      await Promise.all(ROLES.map(role =>
        kv.set(`link:${roleTokens[role]}`, { recordId, role }, { ex: ttl })
      ))

      if (contractNum) {
        await kv.set(`sign-by-contract:${contractNum}`, recordId, { ex: ttl })
      }

      const host  = req.headers['x-forwarded-host'] || req.headers.host || process.env.PUBLIC_HOST || 'localhost:5173'
      const proto = host.includes('localhost') ? 'http' : 'https'
      return res.json({
        recordId,
        links: {
          client:  `${proto}://${host}/sign/${roleTokens.client}`,
          builder: `${proto}://${host}/sign/${roleTokens.builder}`,
          gc:      `${proto}://${host}/sign/${roleTokens.gc}`,
        },
      })
    }

    // ── CREATE a tracked proposal-view link (auth) ───────────────────
    // Stores a display-only snapshot of the proposal under a permanent token
    // (no TTL) so the customer's link never expires, and logs every open.
    if (token === 'pcreate') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
      const { proposalId, snapshot } = req.body || {}
      if (!snapshot) return res.status(400).json({ error: 'Missing snapshot' })
      // Reuse the same link for a given proposal across re-sends so the open
      // history stays on one link instead of fragmenting.
      let viewToken = proposalId != null ? await kv.get(`pview-by-proposal:${proposalId}`) : null
      if (viewToken) {
        const existing = await kv.get(`pview:${viewToken}`)
        if (existing) await kv.set(`pview:${viewToken}`, { ...existing, snapshot, updatedAt: Date.now() })
        else viewToken = null
      }
      if (!viewToken) {
        viewToken = crypto.randomUUID()
        await kv.set(`pview:${viewToken}`, { proposalId: proposalId ?? null, snapshot, opens: [], createdAt: Date.now() })
        if (proposalId != null) await kv.set(`pview-by-proposal:${proposalId}`, viewToken)
      }
      const host  = req.headers['x-forwarded-host'] || req.headers.host || process.env.PUBLIC_HOST || 'localhost:5173'
      const proto = host.includes('localhost') ? 'http' : 'https'
      // No customer PII in the URL (leaks via logs/history/referrer). Contact info
      // is read separately through the authenticated pdata- lookup by token.
      return res.json({ token: viewToken, url: `${proto}://${host}/p/${viewToken}` })
    }

    // ── PUBLIC: open a tracked proposal — records the view ────────────
    if (token.startsWith('popen-')) {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      const viewToken = token.slice('popen-'.length)
      const rec = await kv.get(`pview:${viewToken}`)
      if (!rec) return res.status(404).json({ error: 'Proposal not found' })
      // Don't let email-security scanners / link-preview crawlers inflate the
      // count — still render the page for them, just don't log it as an open.
      const ua = req.headers['user-agent'] || ''
      const isBot = /bot|crawler|spider|preview|scanner|facebookexternalhit|slackbot|whatsapp|telegram|proofpoint|mimecast|barracuda|googleimageproxy|bingpreview|linkpreview|curl|wget|python-requests|headless/i.test(ua)
      let opens = rec.opens || []
      if (!isBot) {
        opens = [...opens, {
          at: Date.now(),
          ua: ua.slice(0, 200),
          ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim(),
        }].slice(-1000)
        await kv.set(`pview:${viewToken}`, { ...rec, opens })
      }
      // Strip contact PII from the PUBLIC response — the quote page doesn't need
      // the customer's email/phone, so don't expose it to anyone holding the link.
      const { email, phone, ...publicSnapshot } = rec.snapshot || {}
      return res.json({ snapshot: publicSnapshot, openCount: opens.length })
    }

    // ── ADMIN: open history + customer contact for the activity log / sender agent.
    // Auth-gated (isAdminAction), so contact PII is only ever returned to a
    // signed-in operator/agent — never in the URL or the public page.
    if (token.startsWith('pdata-')) {
      if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
      const viewToken = token.slice('pdata-'.length)
      const rec = await kv.get(`pview:${viewToken}`)
      const opens = rec?.opens || []
      const s = rec?.snapshot || {}
      return res.json({
        opens,
        openCount: opens.length,
        contact: { name: s.client || '', email: s.email || '', phone: s.phone || '' },
      })
    }

    // ── Admin record lookup: /api/sign/record-<recordId> ─────────────
    if (token.startsWith('record-') && req.method === 'GET') {
      const recordId = token.slice('record-'.length)
      const rec = await kv.get(`sign:${recordId}`)
      if (!rec) return res.status(404).json({ error: 'Record not found or expired' })
      return res.json({
        recordId,
        contractData: rec.contractData,
        contractNum:  rec.contractNum,
        status:       rec.status,
        createdAt:    rec.createdAt,
        signatures:   rec.signatures || {},
      })
    }

    // ── Recover signing links from a record: /api/sign/recover-<recordId> ──
    if (token.startsWith('recover-') && req.method === 'GET') {
      const recordId = token.slice('recover-'.length)
      const rec = await kv.get(`sign:${recordId}`)
      if (!rec) return res.status(404).json({ error: 'Record not found or expired' })
      if (!rec.roleTokens) return res.status(404).json({ error: 'No role tokens stored — this record predates link recovery support' })

      const host  = req.headers['x-forwarded-host'] || req.headers.host || process.env.PUBLIC_HOST || 'localhost:5173'
      const proto = host.includes('localhost') ? 'http' : 'https'
      return res.json({
        recordId,
        status:     rec.status,
        signatures: rec.signatures || {},
        links: {
          client:  `${proto}://${host}/sign/${rec.roleTokens.client}`,
          builder: `${proto}://${host}/sign/${rec.roleTokens.builder}`,
          gc:      `${proto}://${host}/sign/${rec.roleTokens.gc}`,
        },
      })
    }

    // ── Lookup by contract number: /api/sign/lookup-<contractNum> ────────────
    if (token.startsWith('lookup-') && req.method === 'GET') {
      const contractNum = decodeURIComponent(token.slice('lookup-'.length))
      const recordId    = await kv.get(`sign-by-contract:${contractNum}`)
      if (!recordId) return res.status(404).json({ error: 'No signing record found for this contract number' })

      const rec = await kv.get(`sign:${recordId}`)
      if (!rec) return res.status(404).json({ error: 'Signing record has expired' })
      if (!rec.roleTokens) return res.status(404).json({ error: 'No role tokens stored in this record' })

      const host  = req.headers['x-forwarded-host'] || req.headers.host || process.env.PUBLIC_HOST || 'localhost:5173'
      const proto = host.includes('localhost') ? 'http' : 'https'
      return res.json({
        recordId,
        status:      rec.status,
        contractNum: rec.contractNum,
        signatures:  rec.signatures || {},
        links: {
          client:  `${proto}://${host}/sign/${rec.roleTokens.client}`,
          builder: `${proto}://${host}/sign/${rec.roleTokens.builder}`,
          gc:      `${proto}://${host}/sign/${rec.roleTokens.gc}`,
        },
      })
    }

    // ── Existing role-specific token ──────────────────────────────────
    const link = await kv.get(`link:${token}`)
    if (!link) return res.status(404).json({ error: 'Signing link not found or expired' })

    const record = await kv.get(`sign:${link.recordId}`)
    if (!record) return res.status(404).json({ error: 'Contract record not found' })

    if (req.method === 'GET') {
      return res.json({
        role:         link.role,
        recordId:     link.recordId,
        contractData: record.contractData,
        contractNum:  record.contractNum,
        status:       record.status,
        signatures:   record.signatures || {},
        alreadySigned: !!(record.signatures && record.signatures[link.role]),
      })
    }

    if (req.method === 'POST') {
      const { signatureDataUrl, fieldSignatures, printedName, pdfBase64, fileName, esignConsent, agreementAgreedAt } = req.body || {}
      if (!signatureDataUrl && !fieldSignatures) return res.status(400).json({ error: 'Missing signature' })

      const signatures = record.signatures || {}
      if (signatures[link.role]) return res.status(409).json({ error: `Already signed as ${link.role}` })

      signatures[link.role] = {
        signatureDataUrl: signatureDataUrl || null,
        fields:           fieldSignatures  || {},
        printedName:      printedName || '',
        signedAt:         Date.now(),
        ip:               req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown',
        userAgent:        req.headers['user-agent'] || 'unknown',
        esignConsent:     !!esignConsent,          // ESIGN/UETA consent captured at signing
        esignConsentAt:   esignConsent ? Date.now() : null,
        agreementAgreedAt: agreementAgreedAt || null,  // binding-agreement accepted on open
      }

      const required  = ['client', 'builder']
      const allSigned = required.every(r => signatures[r])
      const ttl       = 60 * 60 * 24 * 60
      await kv.set(`sign:${link.recordId}`, {
        ...record,
        signatures,
        status: allSigned ? 'signed' : 'partial',
      }, { ex: ttl })

      let driveResult = null
      if (pdfBase64 && fileName) {
        try { driveResult = await uploadToDrive({ pdfBase64, fileName }) } catch {}
      }
      return res.json({ ok: true, allSigned, driveResult })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
