// ── Pop-up alerts on this phone ──────────────────────────────────────────────
// The same alerts that go out by email (api/_notify.js) can pop up on a phone
// that turned them on here. The phone's browser hands us an address and two
// keys; we save them for the signed-in person (supabase/push.sql) and the
// server sends to it (api/_push.js). public/sw.js shows the pop-up.
//
// iPhone: Apple only allows this for an app added to the Home Screen
// (iOS 16.4 and later), so on an iPhone in Safari the status is 'install'.
import { supabase } from '../supabase'
import { DEMO } from '../demo'

const ON_KEY = 'qx.pushOn'
const flag = () => { try { return localStorage.getItem(ON_KEY) === '1' } catch { return false } }
const setFlag = (on) => { try { if (on) localStorage.setItem(ON_KEY, '1'); else localStorage.removeItem(ON_KEY) } catch { /* not remembered: fine */ } }

const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

// 'on' | 'ask' (can be turned on) | 'install' (iPhone: add to Home Screen first)
// | 'blocked' (turned off in the phone's settings) | 'none' (this browser can't)
export function pushStatus() {
  if (DEMO || !supabase || typeof window === 'undefined') return 'none'
  const can = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!can) return isIOS() && !isInstalled() ? 'install' : 'none'
  if (Notification.permission === 'denied') return 'blocked'
  return Notification.permission === 'granted' && flag() ? 'on' : 'ask'
}

const keyBytes = (b64u) => {
  const s = atob(String(b64u).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, c => c.charCodeAt(0))
}
const sameKey = (buf, bytes) => {
  if (!buf) return false
  const a = new Uint8Array(buf)
  return a.length === bytes.length && a.every((v, i) => v === bytes[i])
}

async function subscribe(lang) {
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const res = await fetch('/api/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'push-key' }) })
  const { key } = await res.json().catch(() => ({}))
  if (!key) throw new Error('Alerts are not set up yet. Try again later.')
  const bytes = keyBytes(key)
  let sub = await reg.pushManager.getSubscription()
  // one made for another key can't be sent to: start over
  if (sub && !sameKey(sub.options?.applicationServerKey, bytes)) { await sub.unsubscribe(); sub = null }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes })
  const j = sub.toJSON()
  const { data, error } = await supabase.rpc('push_subscribe', { p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_lang: lang || null })
  if (error || !data) throw new Error('Could not save this phone for alerts. Try again.')
  setFlag(true)
  return true
}

// Asks the phone's permission (must come from a tap), then saves this phone.
export async function enablePush(lang) {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return false
  return subscribe(lang)
}

// On opening the app: keep this phone's entry current (the address can change,
// and a shared phone belongs to whoever is signed in now). Never asks anything.
export function syncPush(lang) {
  if (pushStatus() !== 'on') return
  subscribe(lang).catch(() => { /* next time */ })
}

export async function disablePush() {
  if (!flag() || !('serviceWorker' in navigator)) return
  setFlag(false)
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) { await supabase.rpc('push_unsubscribe', { p_endpoint: sub.endpoint }); await sub.unsubscribe() }
  } catch { /* already off */ }
}
