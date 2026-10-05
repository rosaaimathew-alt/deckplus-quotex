import crypto from 'crypto'
import { verifyToken, canSeeRecord } from '../_auth.js'
import { getKV } from '../_kv.js'
import { CONSENT_TEXT, docHashOf, requestContext, logEventSafe, otpRequired, otpStatus, otpSend, otpVerify, maskEmail, buildSignature, verifyRecord } from '../_esign.js'
import { isMailerConfigured } from '../_mailer.js'

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const token = req.query.token
  if (!token) return res.status(400).json({ error: 'Missing token' })

  // Admin actions (create links / look up full record incl. tokens) require a
  // signed-in operator. Client signing via role tokens stays public.
  const isAdminAction = token === 'create' || token.startsWith('record-') || token.startsWith('verify-')
  const header = req.headers.authorization || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-qx-token'] || null)
  let staff = null
  if (isAdminAction) {
    staff = await verifyToken(bearer)
    if (!staff) return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const kv = await getKV()
    // Change-order signing records are permanent: no expiry, ever (supabase/esign.sql).

    // ── CREATE ────────────────────────────────────────────────────────────
    if (token === 'create') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
      const { coData } = req.body || {}
      if (!coData) return res.status(400).json({ error: 'Missing coData' })

      const recordId = crypto.randomUUID()
      const tokens = { client: crypto.randomUUID(), builder: crypto.randomUUID() }

      const docHash = docHashOf(coData)
      await kv.set(`co:${recordId}`, {
        coData,
        status: 'pending',
        createdAt: Date.now(),
        createdBy: staff?.email || null,
        docHash,
        signerEmails: { client: coData.email || '', builder: staff?.email || '' },
        signatures: {},
        tokens,
      })

      await Promise.all([
        kv.set(`co-link:${tokens.client}`,  { recordId, role: 'client' }),
        kv.set(`co-link:${tokens.builder}`, { recordId, role: 'builder' }),
      ])
      await logEventSafe(requestContext(req), { recordType: 'change_order', recordId, event: 'link_created', signerEmail: staff?.email, docHash,
        detail: { coNumber: coData.coNumber || '', contractNum: coData.contractNum || '', createdBy: staff?.email || null, roles: ['client', 'builder'] } })

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
      if (!rec) return res.status(404).json({ error: 'Change order record not found' })
      if (!(await canSeeRecord(bearer, staff, { createdBy: rec.createdBy, proposalId: rec.coData?.proposalId }))) return res.status(403).json({ error: 'You can only view your own change orders.' })
      const { tokens, ...safe } = rec
      return res.json({ recordId, ...safe, docHash: rec.docHash || docHashOf(rec.coData) })
    }

    // ── VERIFY + AUDIT TRAIL: /api/co/verify-<recordId> ───────────────────
    if (token.startsWith('verify-') && req.method === 'GET') {
      const recordId = token.slice('verify-'.length)
      const rec = await kv.get(`co:${recordId}`)
      if (!rec) return res.status(404).json({ error: 'Change order record not found' })
      if (!(await canSeeRecord(bearer, staff, { createdBy: rec.createdBy, proposalId: rec.coData?.proposalId }))) return res.status(403).json({ error: 'You can only view your own change orders.' })
      const report = await verifyRecord({ recordType: 'change_order', recordId, record: rec, doc: rec.coData, emailOnFile: rec.signerEmails?.client })
      return res.json({ ...report, contractNum: rec.coData?.contractNum || '', createdAt: rec.createdAt, createdBy: rec.createdBy || null, status: rec.status,
        title: `${rec.coData?.coNumber || 'Change Order'} — Contract #${rec.coData?.contractNum || ''}`, client: rec.coData?.client || '' })
    }

    // ── ROLE TOKEN ────────────────────────────────────────────────────────
    const link = await kv.get(`co-link:${token}`)
    if (!link) return res.status(404).json({ error: 'Change order link not found' })

    const record = await kv.get(`co:${link.recordId}`)
    if (!record) return res.status(404).json({ error: 'Change order record not found' })

    const recordId    = link.recordId
    const docHash     = record.docHash || docHashOf(record.coData)
    const emailOnFile = record.signerEmails?.[link.role] || (link.role === 'client' ? (record.coData?.email || '') : '')
    const logBase     = { recordType: 'change_order', recordId, role: link.role }
    const companyName = record.coData?.branding?.companyName || process.env.COMPANY_NAME || 'Deck Plus'

    if (req.method === 'GET') {
      // Every open is logged. The office checking a link is marked as staff.
      const viewer = bearer ? await verifyToken(bearer) : null
      await logEventSafe(requestContext(req), { ...logBase, event: viewer ? 'staff_viewed' : 'opened', docHash, detail: viewer ? { staff: viewer.email } : null })
      const { verified } = await otpStatus(kv, token)
      return res.json({
        role: link.role,
        coData: record.coData,
        status: record.status,
        signatures: record.signatures || {},
        alreadySigned: !!(record.signatures?.[link.role]),
        docHash,
        esign: {
          consentText:  CONSENT_TEXT,
          otpRequired:  await otpRequired(),
          otpAvailable: await isMailerConfigured(),
          emailHint:    maskEmail(emailOnFile),
          hasEmailOnFile: !!emailOnFile,
          verified,
        },
      })
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const ctx = requestContext(req, body.device)

      if (body.action === 'event') {
        const allowed = ['disclosure_accepted', 'consent_checked', 'consent_unchecked', 'signature_adopted']
        if (!allowed.includes(body.event)) return res.status(400).json({ error: 'Unknown event' })
        await logEventSafe(ctx, { ...logBase, event: body.event, docHash, signerName: body.printedName || null,
          detail: body.event.startsWith('consent') ? { text: CONSENT_TEXT } : null })
        return res.json({ ok: true })
      }
      if (body.action === 'otp-send') {
        const label = `${record.coData?.coNumber || 'your change order'}${record.coData?.contractNum ? ` (Contract #${record.coData.contractNum})` : ''}`
        const r = await otpSend(kv, { token, email: body.email, emailOnFile, companyName, docLabel: label, ctx, logBase })
        return res.status(r.status).json(r.body)
      }
      if (body.action === 'otp-verify') {
        const r = await otpVerify(kv, { token, code: body.code, ctx, logBase })
        return res.status(r.status).json(r.body)
      }

      if (!body.signatureDataUrl) return res.status(400).json({ error: 'Missing signature' })
      const signatures = record.signatures || {}
      if (signatures[link.role]) return res.status(409).json({ error: `Already signed as ${link.role}` })

      const built = await buildSignature(kv, req, { token, recordType: 'change_order', recordId, role: link.role, doc: record.coData, storedDocHash: record.docHash, emailOnFile })
      if (built.error) return res.status(built.status).json({ error: built.error })
      signatures[link.role] = built.entry

      const allSigned = ['client', 'builder'].every(r => signatures[r])
      await kv.set(`co:${recordId}`, {
        ...record,
        docHash: record.docHash || docHash,
        signatures,
        status: allSigned ? 'signed' : 'partial',
      })
      if (allSigned) await logEventSafe(built.ctx, { recordType: 'change_order', recordId, event: 'completed', docHash })

      return res.json({ ok: true, allSigned, eventHash: built.entry.eventHash })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
