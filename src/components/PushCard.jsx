// ── "Get alerts on this phone" card ─────────────────────────────────────────
// Turns on pop-up alerts (lib/push.js) for the signed-in person on this phone.
// Shown on the sub app's home and Field mode's Today until alerts are on or
// the person says not now. On an iPhone in Safari it explains the one thing
// Apple requires first: adding the app to the Home Screen.
import { useEffect, useState } from 'react'
import { Bell, Loader2, Share, SquarePlus, X } from 'lucide-react'
import { enablePush, isPhone, pushStatus, syncPush } from '../lib/push'
import { tr, getLang } from '../lib/lang'

const DISMISS_KEY = 'qx.pushDismissed'
const BLOCKED_COMPUTER = 'Your browser is blocking notifications for this site. Click "Notifications blocked" at the left of the address bar, choose Allow, then try again.'
const BLOCKED_PHONE = "Notifications are blocked for Deck Plus. Allow them in this phone's settings, then try again."
const readDismissed = () => { try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false } }

// compact: the office pages, where it sits as a slim card and not a phone-sized one
// keep: the sub app. "Not now" folds the card down to one line that stays on
// the page, so a sub who waved it away can still turn alerts on later; without
// alerts they only hear about a booking or a message by email.
export default function PushCard({ installHint = true, compact = false, keep = false }) {
  const [status, setStatus] = useState(pushStatus)
  const [dismissed, setDismissed] = useState(readDismissed)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { syncPush(getLang()) }, [])

  // Blocked in the browser or phone settings: nothing to offer, unless they
  // just tapped and need to be told why nothing happened.
  if (status === 'on' || status === 'none' || (status === 'blocked' && !error)) return null
  if (status === 'install' && !installHint) return null
  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* not remembered: fine */ }
    setDismissed(true)
  }
  const reopen = () => {
    try { localStorage.removeItem(DISMISS_KEY) } catch { /* fine */ }
    setDismissed(false)
  }
  if (dismissed) return !keep ? null : (
    <button onClick={reopen}
      className="w-full min-h-[48px] px-4 rounded-xl border border-[var(--brand-300)] bg-white flex items-center gap-2 text-base text-gray-800 text-left active:bg-gray-50">
      <Bell size={18} className="text-[var(--brand-700)] shrink-0" />
      <span className="flex-1">{tr('Alerts are off on this phone')}</span>
      <span className="font-bold text-[var(--brand-700)]">{tr('Turn on')}</span>
    </button>
  )
  const title = tr(isPhone() ? 'Get alerts on this phone' : 'Get alerts on this computer')
  const turnOn = async () => {
    setBusy(true); setError('')
    try {
      const on = await enablePush(getLang())
      // The browser said no, or kept the question hidden ("Notifications blocked" in the address bar)
      if (!on) setError(tr(isPhone() ? BLOCKED_PHONE : BLOCKED_COMPUTER))
    } catch (e) { setError(tr(e.message)) }
    setStatus(pushStatus()); setBusy(false)
  }
  return (
    <section className={`relative bg-white rounded-2xl border-2 border-[var(--brand-300)] shadow-sm p-4 space-y-3 ${compact ? 'max-w-md' : ''}`} aria-label={title}>
      <button onClick={dismiss} aria-label={tr('Not now')} className="absolute top-2 right-2 h-9 w-9 flex items-center justify-center text-gray-400"><X size={18} /></button>
      <p className="flex items-center gap-2 pr-8 text-base font-bold text-gray-900"><Bell size={20} className="text-[var(--brand-700)] shrink-0" /> {title}</p>
      {status === 'install' ? (
        <ol className="space-y-2 text-base text-gray-800">
          <li className="flex items-center gap-2 flex-wrap">
            <span className="w-6 h-6 rounded-full bg-[var(--brand-600)] text-white text-sm font-bold flex items-center justify-center shrink-0">1</span>
            {tr('Tap')} <Share size={18} className="text-[var(--brand-700)]" /> <b>{tr('Share')}</b> {tr('at the bottom of Safari')}
          </li>
          <li className="flex items-center gap-2 flex-wrap">
            <span className="w-6 h-6 rounded-full bg-[var(--brand-600)] text-white text-sm font-bold flex items-center justify-center shrink-0">2</span>
            {tr('Tap')} <SquarePlus size={18} className="text-[var(--brand-700)]" /> <b>{tr('Add to Home Screen')}</b>
          </li>
          <li className="flex items-center gap-2 flex-wrap">
            <span className="w-6 h-6 rounded-full bg-[var(--brand-600)] text-white text-sm font-bold flex items-center justify-center shrink-0">3</span>
            {tr('Open Deck Plus from your Home Screen and turn on alerts')}
          </li>
        </ol>
      ) : (
        <button onClick={turnOn} disabled={busy}
          className={`w-full ${compact ? 'h-11 text-sm' : 'h-14 text-base'} rounded-xl bg-[var(--brand-600)] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60`}>
          {busy ? <Loader2 size={20} className="animate-spin" /> : <Bell size={20} />} {tr('Turn on alerts')}
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  )
}
