import { Navigate, useLocation } from 'react-router-dom'
import { DEMO } from '../demo'
import { getSession, signOut } from '../supabase'

// The Supabase session is resolved once in main.jsx (initAuth) before the app
// renders, so these reads are synchronous.
export function useAuth() {
  return DEMO || !!getSession()
}

export async function logout() {
  try { await signOut() } catch {}
  window.location.href = '/login'
}

export default function AuthGuard({ children }) {
  const location = useLocation()
  // Demo builds are a public sandbox with no real data — skip the login gate.
  if (DEMO) return children
  if (!getSession()) {
    // Remember where the link was going (an alert email's job or message), so
    // signing in lands there instead of on the dashboard.
    const back = `${location.pathname}${location.search}`
    return <Navigate to={back && back !== '/' ? `/login?next=${encodeURIComponent(back)}` : '/login'} replace />
  }
  return children
}
