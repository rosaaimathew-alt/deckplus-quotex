// Deck Plus service worker: pop-up alerts only (src/lib/push.js, api/_push.js).
// It does not cache or intercept anything, so the app always loads from the
// network exactly as it does without it.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { body: event.data ? event.data.text() : '' } }
  event.waitUntil(self.registration.showNotification(d.title || 'Deck Plus', {
    body: d.body || '',
    icon: '/app/icon-192.png',
    badge: '/app/icon-192.png',
    data: { url: d.url || '/' },
  }))
})

// Tapping the alert opens that job (only ever a page of this app).
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  let url = self.location.origin + '/'
  try {
    const u = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin)
    if (u.origin === self.location.origin) url = u.href
  } catch { /* keep the home page */ }
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of open) {
      try {
        await c.focus()
        if (c.navigate) await c.navigate(url)
        return
      } catch { /* try the next window, or open a new one */ }
    }
    await self.clients.openWindow(url)
  })())
})
