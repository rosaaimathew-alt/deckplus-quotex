// ── Keep open tabs on the latest version ─────────────────────────────────────
// The office leaves the app open all day. A single-page app only loads new code
// on a full page load, so an open tab kept showing screens that had already
// been changed. Every few minutes (and when the tab comes back into view) this
// checks whether a newer version is live; if so, the next time someone moves
// to another page the app loads it fresh. Nothing reloads mid-task: typing in
// a form never triggers it, only moving between pages does.
const CHECK_EVERY_MS = 5 * 60 * 1000
const scriptOf = (html) => (html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/) || [])[0] || null

export function startAutoUpdate() {
  if (typeof window === 'undefined' || import.meta.env.DEV) return
  const mine = scriptOf(document.documentElement.innerHTML)
  if (!mine) return
  let stale = false
  let checking = false

  const check = async () => {
    if (stale || checking) return
    checking = true
    try {
      const r = await fetch('/', { cache: 'no-store', headers: { Accept: 'text/html' } })
      const live = r.ok ? scriptOf(await r.text()) : null
      if (live && live !== mine) stale = true
    } catch { /* offline — try again later */ } finally { checking = false }
  }

  // Load the new version on the next move to another page
  const push = window.history.pushState.bind(window.history)
  window.history.pushState = (state, title, url) => {
    push(state, title, url)
    if (stale) window.location.reload()
  }
  window.addEventListener('popstate', () => { if (stale) window.location.reload() })

  setInterval(check, CHECK_EVERY_MS)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check() })
  window.addEventListener('focus', check)
}
