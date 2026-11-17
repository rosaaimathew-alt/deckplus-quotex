import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Root from './Root'
import { initAuth, getAccessToken } from './supabase'
import { applyCachedBrand } from './brand'
import { startAutoUpdate } from './lib/autoUpdate'

// iPhone zooms the whole page in when you tap a box whose text is under 16px
// and leaves it zoomed, so the screen then has to be dragged sideways. Turn that
// zoom off on iPhone / iPad only (pinching to zoom still works there; other
// phones don't zoom on a tap, so they keep the standard setting).
if (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover')
}

// Company colors from the last visit, before anything paints (login page too).
applyCachedBrand()
// Open tabs pick up a new version on the next page change (lib/autoUpdate.js)
startAutoUpdate()

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
      <Root />
    </StrictMode>,
  )
})
