// ── "Put this on your phone" card ────────────────────────────────────────────
// Field mode can be installed to the home screen like any other app (see
// public/manifest.webmanifest). Once installed it opens full-screen with its
// own icon — no browser bars. This card walks people through it:
//   • Android / Chrome: one Install button (the browser's own install prompt)
//   • iPhone / iPad:    Safari has no prompt, so we show the two taps
// It hides itself once the app is running installed, or after "Not now".
import { useEffect, useState } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'

const DISMISS_KEY = 'qx.installDismissed'

// Chrome fires this once, early — catch it at load so the card can use it later.
let deferredPrompt = null
const listeners = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    listeners.forEach(fn => fn())
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    listeners.forEach(fn => fn())
  })
}

const isInstalled = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)

const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

const readDismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false } }

export default function InstallCard() {
  const [, bump] = useState(0)
  const [dismissed, setDismissed] = useState(readDismissed)
  useEffect(() => {
    const fn = () => bump(n => n + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  if (dismissed || isInstalled()) return null
  const ios = isIOS()
  if (!ios && !deferredPrompt) return null // browser can't install (or already did)

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* not remembered — fine */ }
    setDismissed(true)
  }
  const install = async () => {
    const p = deferredPrompt
    if (!p) return
    p.prompt()
    try { await p.userChoice } catch { /* ignored */ }
    deferredPrompt = null
    bump(n => n + 1)
  }

  return (
    <section className="relative bg-white rounded-2xl border-2 border-[var(--brand-300)] shadow-sm p-4 space-y-3">
      <button onClick={dismiss} aria-label="Not now" className="absolute top-2 right-2 h-9 w-9 flex items-center justify-center text-gray-400">
        <X size={18} />
      </button>
      <div className="flex items-center gap-3 pr-8">
        <img src="/app/icon-192.png" alt="" className="w-12 h-12 rounded-xl border border-gray-200 shrink-0" />
        <div>
          <p className="text-base font-bold text-gray-900">Put Deck Plus on your phone</p>
          <p className="text-sm text-gray-500">Opens like any other app, one tap from your home screen.</p>
        </div>
      </div>
      {ios ? (
        <ol className="space-y-2 text-base text-gray-800">
          <li className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[var(--brand-600)] text-white text-sm font-bold flex items-center justify-center shrink-0">1</span>
            Tap <Share size={18} className="text-[var(--brand-700)]" /> <b>Share</b> at the bottom of Safari
          </li>
          <li className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[var(--brand-600)] text-white text-sm font-bold flex items-center justify-center shrink-0">2</span>
            Tap <SquarePlus size={18} className="text-[var(--brand-700)]" /> <b>Add to Home Screen</b>
          </li>
        </ol>
      ) : (
        <button onClick={install}
          className="w-full h-14 rounded-xl bg-[var(--brand-600)] text-white text-base font-bold flex items-center justify-center gap-2">
          <Download size={20} /> Install app
        </button>
      )}
    </section>
  )
}
