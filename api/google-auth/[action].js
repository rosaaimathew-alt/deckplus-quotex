/* global process */
import { getAuthUrl, handleCallback, isAuthenticated, getConnectedEmail } from '../_google-drive.js'
import { verifyToken, staffMembership } from '../_auth.js'
import { smtpUser, sendMail } from '../_mailer.js'
import { MAIL_PROVIDERS, mailboxesAvailable, mailboxForUser, companyMailbox, saveMailbox, clearMailbox, verifyLogin } from '../_mailboxes.js'

// Account connections. Google sign-in (start / callback / status) plus each
// person's own sending mailbox (mailbox-status / -connect / -test / -disconnect).
const MAILBOX_ACTIONS = ['mailbox-status', 'mailbox-connect', 'mailbox-test', 'mailbox-disconnect']
const MAIL_PORTS = [25, 465, 587, 2525]
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || ''))
// A public mail server name — never an IP address or an internal host.
const validHost = (h) => /^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/i.test(String(h || '')) && !/(^|\.)(localhost|internal|local)$/i.test(h)

export default async function handler(req, res) {
  const action = req.query.action

  // Everything but the callback is for signed-in staff (Google hits the callback).
  let staff = null, bearer = null
  if (action === 'start' || action === 'status' || MAILBOX_ACTIONS.includes(action)) {
    const header = req.headers.authorization || ''
    bearer = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-qx-token'] || null)
    staff = await verifyToken(bearer)
    if (!staff) return res.status(401).json({ error: 'Unauthorized' })
  }

  if (MAILBOX_ACTIONS.includes(action)) {
    if (!mailboxesAvailable()) return res.status(503).json({ error: 'Mailbox storage is not set up on the server.' })
    const pub = (row) => row && { email: row.email, provider: row.provider, host: row.host, port: row.port, companyDefault: !!row.company_default, updatedAt: row.updated_at }
    try {
      const member = await staffMembership(bearer, staff)
      const isOffice = member?.role === 'office' || member?.role === 'admin'

      if (action === 'mailbox-status') {
        const mine = await mailboxForUser(staff.sub)
        const company = await companyMailbox(member?.org_id || null)
        return res.status(200).json({
          mine: pub(mine), company: company ? { email: company.email } : null,
          canSetCompany: isOffice, providers: MAIL_PROVIDERS, serverMailbox: smtpUser(),
        })
      }

      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
      const body = req.body || {}

      if (action === 'mailbox-connect') {
        const provider = MAIL_PROVIDERS[body.provider] ? body.provider : 'other'
        const preset = MAIL_PROVIDERS[provider]
        const email = String(body.email || '').trim()
        const password = String(body.password || '').replace(provider === 'gmail' ? /\s+/g : /^$/, '')
        const host = preset ? preset.host : String(body.host || '').trim().toLowerCase()
        const port = preset ? preset.port : Number(body.port) || 587
        const username = String(body.username || '').trim() || email
        if (!validEmail(email)) return res.status(400).json({ error: 'Enter the email address quotes should come from.' })
        if (!password) return res.status(400).json({ error: 'Enter the app password for that mailbox.' })
        if (!validHost(host)) return res.status(400).json({ error: 'Enter your mail server name (for example smtp.yourprovider.com).' })
        if (!MAIL_PORTS.includes(port)) return res.status(400).json({ error: `Port must be one of ${MAIL_PORTS.join(', ')}.` })
        // Log in for real before saving anything.
        const check = await verifyLogin({ host, port, username, password, provider, email })
        if (!check.ok) return res.status(400).json({ error: check.error })
        await saveMailbox({ userId: staff.sub, orgId: member?.org_id || null, email, provider, host, port, username, password, companyDefault: isOffice && !!body.companyDefault })
        return res.status(200).json({ ok: true, mine: pub(await mailboxForUser(staff.sub)) })
      }

      if (action === 'mailbox-test') {
        const mine = await mailboxForUser(staff.sub)
        if (!mine) return res.status(400).json({ error: 'Connect your mailbox first.' })
        const sent = await sendMail({
          to: staff.email || mine.email,
          subject: 'Deck Plus test email — your mailbox is connected',
          html: `<p>This test came from <strong>${mine.email}</strong> through Deck Plus.</p><p>Quotes, follow-ups and reminders you send from the app will come from this address.</p>`,
          sender: { userId: staff.sub },
        })
        if (sent.error) return res.status(502).json({ error: sent.error })
        if (sent.sentFrom !== mine.email) return res.status(502).json({ error: `Your mailbox ${mine.email} refused to send, so the test went out from ${sent.sentFrom} instead. Reconnect your mailbox with a fresh app password.` })
        return res.status(200).json({ ok: true, sentTo: staff.email || mine.email, sentFrom: sent.sentFrom })
      }

      if (action === 'mailbox-disconnect') {
        await clearMailbox(staff.sub)
        return res.status(200).json({ ok: true })
      }
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  if (action === 'start') {
    try {
      const origin   = req.query.origin   || 'http://localhost:5173'
      const returnTo = req.query.returnTo || '/contract'
      return res.status(200).json({ url: getAuthUrl(origin, returnTo) })
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  if (action === 'callback') {
    const { code, state } = req.query
    if (!code) return res.status(400).send('Missing code')
    try {
      const redirectUrl = await handleCallback(code, state)
      const reqHost = req.headers['x-forwarded-host'] || req.headers.host
      let safe = false
      if (typeof redirectUrl === 'string' && redirectUrl) {
        if (redirectUrl.startsWith('/') && !redirectUrl.startsWith('//')) {
          safe = true
        } else {
          try {
            const parsed = new URL(redirectUrl)
            if (parsed.host === reqHost) safe = true
          } catch {
            safe = false
          }
        }
      }
      if (safe) return res.redirect(`${redirectUrl}?google=connected`)
      return res.redirect('/settings?google=connected')
    } catch (err) {
      return res.redirect(`/settings?google=error&msg=${encodeURIComponent(err.message)}`)
    }
  }

  if (action === 'status') {
    try {
      // googleReady: the Google sign-in keys are set on the server.
      // mailbox: the shared SMTP mailbox quotes go out from when no Google account is connected.
      return res.status(200).json({ authenticated: await isAuthenticated(), email: await getConnectedEmail(), googleReady: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), mailbox: smtpUser() })
    } catch (err) {
      return res.status(200).json({ authenticated: false, error: err.message, googleReady: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), mailbox: smtpUser() })
    }
  }

  res.status(404).json({ error: 'Unknown action' })
}
