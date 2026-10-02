// ── E-sign consent wording + device details ──────────────────────────────────
// The server (api/_esign.js) refuses a signature unless the signer checked this
// exact text, so keep the two copies identical.
export const CONSENT_TEXT = 'I agree to conduct this transaction electronically and bound my signature to this document.'

// What the browser can tell us about the device, recorded with each signing
// step alongside the IP and user agent the server sees.
export function deviceInfo() {
  try {
    const n = window.navigator || {}
    const s = window.screen || {}
    const uad = n.userAgentData
    return {
      platform: uad?.platform || n.platform || '',
      mobile: uad?.mobile ?? undefined,
      brands: uad?.brands ? uad.brands.map(b => `${b.brand} ${b.version}`) : undefined,
      vendor: n.vendor || '',
      language: n.language || '',
      languages: Array.isArray(n.languages) ? n.languages.slice(0, 5) : undefined,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      tzOffset: new Date().getTimezoneOffset(),
      screen: `${s.width || 0}x${s.height || 0}`,
      viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
      pixelRatio: window.devicePixelRatio || 1,
      touchPoints: n.maxTouchPoints || 0,
      cores: n.hardwareConcurrency || undefined,
      memory: n.deviceMemory || undefined,
      cookies: !!n.cookieEnabled,
      clientTime: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

// Fire-and-forget step log (disclosure accepted, consent checked…).
export function logStep(api, event, extra = {}) {
  try {
    fetch(api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'event', event, device: deviceInfo(), ...extra }),
      keepalive: true,
    }).catch(() => {})
  } catch { /* logging must never block signing */ }
}
