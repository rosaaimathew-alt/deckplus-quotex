import { createClient } from '@supabase/supabase-js'

// Verifies the Supabase session token the app sends on every /api/ request.
// Supabase Auth mints the token; we ask Supabase (with the service key) who it
// belongs to. Returns { email, sub } or null.
let _admin = null
function admin() {
  if (_admin) return _admin
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _admin
}

export async function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const sb = admin()
  if (!sb) return null   // fail closed: no service key configured → nobody is authorized
  try {
    const { data, error } = await sb.auth.getUser(token)
    if (error || !data?.user) return null
    return { email: data.user.email, sub: data.user.id }
  } catch {
    return null
  }
}

// Pulls the bearer token from the request. Returns the decoded payload, or
// sends a 401 and returns null. Guard every protected handler with:
//   if (!(await requireAuth(req, res))) return
export async function requireAuth(req, res) {
  const header = req.headers?.authorization || ''
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : (req.headers?.['x-qx-token'] || null)
  const payload = await verifyToken(token)
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized — please sign in again.' })
    return null
  }
  return payload
}
