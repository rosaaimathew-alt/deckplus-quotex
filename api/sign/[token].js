import crypto from 'crypto'
import { uploadToDrive } from '../_google-drive.js'
import { verifyToken } from '../_auth.js'
import { getKV } from '../_kv.js'
import { CONSENT_TEXT, docHashOf, requestContext, logEvent, logEventSafe, otpRequired, otpStatus, otpSend, otpVerify, maskEmail, buildSignature, verifyRecord } from '../_esign.js'
import { isMailerConfigured } from '../_mailer.js'

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

const ROLES = ['client', 'builder', 'gc']

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  const token = req.query.token
  if (!token) return res.status(400).json({ error: 'Missing token' })

  // Admin actions (create links / recover links / look up by contract number)
  // require a signed-in operator. Client signing via role tokens stays public.
  const isAdminAction = token === 'create' || token === 'pcreate' || token.startsWith('recover-') || token.startsWith('lookup-') || token.startsWith('record-') || token.startsWith('pdata-') || token.startsWith('verify-')
  const header = req.headers.authorization || ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-qx-token'] || null)
  let staff = null
  if (isAdminAction) {
    staff = await verifyToken(bearer)
    if (!staff) return res.status(401).json({ error: 'Unauthorized' })
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
    const kv = await getKV()

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
      // Signing records are permanent: no expiry, ever (see supabase/esign.sql).
      const docHash = docHashOf(contractData)
      const signerEmails = {
        client:  contractData?.dp?.values?.clientEmail || contractData?.email || '',
        builder: staff?.email || '',
        gc:      '',
      }
      await kv.set(`sign:${recordId}`, {
        contractData,
        contractNum: contractNum || '',
        status:      'pending',
        createdAt:   Date.now(),
        createdBy:   staff?.email || null,
        docHash,
        signerEmails,
        signatures:  {},
        roleTokens,
      })

      await Promise.all(ROLES.map(role =>
        kv.set(`link:${roleTokens[role]}`, { recordId, role })
      ))

      if (contractNum) {
        await kv.set(`sign-by-contract:${contractNum}`, recordId)
      }
      await logEvent(requestContext(req), { recordType: 'contract', recordId, event: 'link_created', signerEmail: staff?.email, docHash,
        detail: { contractNum: contractNum || '', createdBy: staff?.email || null, roles: ROLES } })

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
      if (!rec) return res.status(404).json({ error: 'Record not found' })
      return res.json({
        recordId,
        docHash:      rec.docHash || docHashOf(rec.contractData),
        contractData: rec.contractData,
        contractNum:  rec.contractNum,
        status:       rec.status,
        createdAt:    rec.createdAt,
        signatures:   rec.signatures || {},
      })
    }

    // ── Verification report + audit trail: /api/sign/verify-<recordId> ──
    if (token.startsWith('verify-') && req.method === 'GET') {
      const recordId = token.slice('verify-'.length)
      const rec = await kv.get(`sign:${recordId}`)
      if (!rec) return res.status(404).json({ error: 'Record not found' })
      const report = await verifyRecord({ recordType: 'contract', recordId, record: rec, doc: rec.contractData, emailOnFile: rec.signerEmails?.client })
      return res.json({ ...report, contractNum: rec.contractNum, createdAt: rec.createdAt, createdBy: rec.createdBy || null, status: rec.status,
        title: `Contract #${rec.contractNum || ''}`, client: rec.contractData?.dp?.values?.clientName || rec.contractData?.client || '' })
    }

    // ── Recover signing links from a record: /api/sign/recover-<recordId> ──
    if (token.startsWith('recover-') && req.method === 'GET') {
      const recordId = token.slice('recover-'.length)
      const rec = await kv.get(`sign:${recordId}`)
      if (!rec) return res.status(404).json({ error: 'Record not found' })
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
      if (!rec) return res.status(404).json({ error: 'Signing record not found' })
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
    if (!link) return res.status(404).json({ error: 'Signing link not found' })

    const record = await kv.get(`sign:${link.recordId}`)
    if (!record) return res.status(404).json({ error: 'Contract record not found' })

    const recordId  = link.recordId
    const docHash   = record.docHash || docHashOf(record.contractData)
    const emailOnFile = record.signerEmails?.[link.role] || (link.role === 'client' ? (record.contractData?.dp?.values?.clientEmail || record.contractData?.email || '') : '')
    const logBase   = { recordType: 'contract', recordId, role: link.role }
    const companyName = record.contractData?.branding?.companyName || process.env.COMPANY_NAME || 'Deck Plus'

    if (req.method === 'GET') {
      // Every open is logged. The office checking a link is marked as staff.
      const viewer = bearer ? await verifyToken(bearer) : null
      await logEventSafe(requestContext(req), { ...logBase, event: viewer ? 'staff_viewed' : 'opened', docHash, detail: viewer ? { staff: viewer.email } : null })
      const { verified } = await otpStatus(kv, token)
      return res.json({
        role:         link.role,
        recordId,
        contractData: record.contractData,
        contractNum:  record.contractNum,
        status:       record.status,
        signatures:   record.signatures || {},
        alreadySigned: !!(record.signatures && record.signatures[link.role]),
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

      // Steps before the signature: each is logged with the server's time.
      if (body.action === 'event') {
        const allowed = ['disclosure_accepted', 'consent_checked', 'consent_unchecked', 'signature_adopted']
        if (!allowed.includes(body.event)) return res.status(400).json({ error: 'Unknown event' })
        await logEventSafe(ctx, { ...logBase, event: body.event, docHash, signerName: body.printedName || null,
          detail: body.event.startsWith('consent') ? { text: CONSENT_TEXT } : null })
        return res.json({ ok: true })
      }
      if (body.action === 'otp-send') {
        const r = await otpSend(kv, { token, email: body.email, emailOnFile, companyName, docLabel: `Contract #${record.contractNum || ''}`, ctx, logBase })
        return res.status(r.status).json(r.body)
      }
      if (body.action === 'otp-verify') {
        const r = await otpVerify(kv, { token, code: body.code, ctx, logBase })
        return res.status(r.status).json(r.body)
      }

      const signatures = record.signatures || {}
      if (signatures[link.role]) return res.status(409).json({ error: `Already signed as ${link.role}` })

      const built = await buildSignature(kv, req, { token, recordType: 'contract', recordId, role: link.role, doc: record.contractData, storedDocHash: record.docHash, emailOnFile })
      if (built.error) return res.status(built.status).json({ error: built.error })
      signatures[link.role] = built.entry

      const required  = ['client', 'builder']
      const allSigned = required.every(r => signatures[r])
      await kv.set(`sign:${recordId}`, {
        ...record,
        docHash: record.docHash || docHash,
        signatures,
        status: allSigned ? 'signed' : 'partial',
      })
      if (allSigned) await logEventSafe(built.ctx, { recordType: 'contract', recordId, event: 'completed', docHash })

      let driveResult = null
      if (body.pdfBase64 && body.fileName) {
        try { driveResult = await uploadToDrive({ pdfBase64: body.pdfBase64, fileName: body.fileName }) } catch {}
      }
      return res.json({ ok: true, allSigned, driveResult, eventHash: built.entry.eventHash })
    }

    res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
