import { getAuthUrl, handleCallback, isAuthenticated, getConnectedEmail } from '../_google-drive.js'
import { verifyToken } from '../_auth.js'

export default async function handler(req, res) {
  const action = req.query.action

  // start/status are operator actions; callback must stay public (Google hits it).
  if (action === 'start' || action === 'status') {
    const header = req.headers.authorization || ''
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : (req.headers['x-qx-token'] || null)
    if (!(await verifyToken(bearer))) return res.status(401).json({ error: 'Unauthorized' })
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
      return res.status(200).json({ authenticated: await isAuthenticated(), email: await getConnectedEmail() })
    } catch (err) {
      return res.status(200).json({ authenticated: false, error: err.message })
    }
  }

  res.status(404).json({ error: 'Unknown action' })
}
