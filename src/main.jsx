import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initAuth, getAccessToken } from './supabase'

// Attach the Supabase session token to every same-origin /api/ request. Doing
// it once here means no fetch call site can forget it, and public signing
// pages (which have no session) simply send nothing and hit the public
// endpoints as before.
const _fetch = window.fetch.bind(window)
window.fetch = async (input, init = {}) => {
  try {
    const url = typeof input === 'string' ? input : input?.url || ''
    const isApi = url.startsWith('/api/') || url.includes(`${window.location.origin}/api/`)
    const token = isApi ? await getAccessToken() : null
    if (token) {
      const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined) || {})
      if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
      init = { ...init, headers }
    }
  } catch {
    // If anything goes wrong building headers, fall through to a normal fetch.
  }
  return _fetch(input, init)
}

// Resolve the session before the first render so the auth guard and the org
// bootstrap can read it synchronously.
initAuth().finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
