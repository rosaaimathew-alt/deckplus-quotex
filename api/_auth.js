/* global Buffer, process */
import { createClient } from '@supabase/supabase-js'

// Verifies the Supabase session token the app sends on every /api/ request.
// Supabase Auth mints the token; we ask Supabase who it belongs to. Returns
// { email, sub } or null. getUser(jwt) only needs an API key to reach Auth —
// the user's own JWT is what gets verified — so the anon key is enough here,
// and the service key stays optional (it is only required by the seed scripts).
let _admin = null
function admin() {
  if (_admin) return _admin
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  _admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return _admin
}

// A verified token is remembered for up to 5 minutes (never past its own
// expiry) by this function instance, so a burst of API calls doesn't ask
// Supabase Auth the same question every time.
const _verified = new Map()   // token → { user, until }
const CACHE_MS = 5 * 60_000

function tokenExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    return Number(payload.exp) * 1000 || 0
  } catch {
    return 0
  }
}

export async function verifyToken(token) {
  if (!token || typeof token !== 'string') return null
  const hit = _verified.get(token)
  if (hit && hit.until > Date.now()) return hit.user
  const sb = admin()
  if (!sb) return null   // fail closed: no Supabase key configured → nobody is authorized
  try {
    const { data, error } = await sb.auth.getUser(token)
    if (error || !data?.user) return null
    const user = { email: data.user.email, sub: data.user.id }
    const until = Math.min(Date.now() + CACHE_MS, tokenExpiry(token) || 0)
    if (until > Date.now()) {
      if (_verified.size > 500) _verified.clear()
      _verified.set(token, { user, until })
    }
    return user
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

// ── Who may look at a record ─────────────────────────────────────────────────
// Office, admin and project managers see every contract and change order. A
// sales rep sees only their own: ones they sent, or ones on a deal the
// database lets them read (proposal row-level security decides).
function asUser(token) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY
  if (!url || !key || !token) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

const _roles = new Map()   // token → { role, until }
export async function staffRole(token, staff) {
  const hit = _roles.get(token)
  if (hit && hit.until > Date.now()) return hit.role
  const sb = asUser(token)
  if (!sb || !staff?.sub) return null
  const { data } = await sb.from('org_members').select('role').eq('user_id', staff.sub).maybeSingle()
  const role = data?.role || null
  if (_roles.size > 500) _roles.clear()
  _roles.set(token, { role, until: Date.now() + CACHE_MS })
  return role
}

export async function canSeeRecord(token, staff, { createdBy, proposalId } = {}) {
  const role = await staffRole(token, staff)
  if (role === 'office' || role === 'admin' || role === 'pm') return true
  if (role !== 'rep') return false
  if (createdBy && staff?.email && String(createdBy).toLowerCase() === String(staff.email).toLowerCase()) return true
  if (proposalId == null || proposalId === '') return false
  const sb = asUser(token)
  if (!sb) return false
  const { data } = await sb.from('proposals').select('id').eq('id', String(proposalId)).maybeSingle()
  return !!data
}
