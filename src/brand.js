// ── Color conversion helpers ──────────────────────────────────────────────────

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100
  let r, g, b
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// ── Palette generation ────────────────────────────────────────────────────────

export function generatePalette(primaryHex) {
  const [h, s] = hexToHsl(primaryHex)
  const sat = Math.max(25, Math.min(s, 85))
  return {
    50:  hslToHex(h, Math.max(10, sat - 55), 97),
    100: hslToHex(h, Math.max(15, sat - 45), 93),
    200: hslToHex(h, Math.max(20, sat - 35), 84),
    300: hslToHex(h, Math.max(30, sat - 20), 73),
    400: hslToHex(h, sat, 61),
    500: hslToHex(h, sat, 51),
    600: hslToHex(h, sat, 42),
    700: hslToHex(h, sat, 33),
    800: hslToHex(h, sat, 25),
    900: hslToHex(h, sat, 18),
  }
}

// ── DOM injection ─────────────────────────────────────────────────────────────

// Darken a hex by mixing toward black (amount 0..1)
function darken(hex, amount) {
  const [h, s, l] = hexToHsl(hex)
  return hslToHex(h, s, Math.max(0, l - amount * 100))
}
// Is a color light enough that text on it should be dark?
function isLight(hex) {
  const [, , l] = hexToHsl(hex)
  return l > 62
}

// Apply the full brand theme. `opts.sidebar` sets the nav background
// independently of the primary color (so e.g. a charcoal sidebar can pair with
// a brass accent). `opts.accent` overrides the secondary highlight color.
export function applyBrandStyles(primaryHex, opts = {}) {
  const p = generatePalette(primaryHex || FREE_PRIMARY_COLOR)
  const sidebar       = opts.sidebar || p[700]
  const sidebarBorder = darken(sidebar, 0.08)
  const sidebarHover  = isLight(sidebar) ? darken(sidebar, 0.08) : p[600]
  const navText       = isLight(sidebar) ? '#1f2937' : p[100]
  const accent        = opts.accent || p[500]

  let el = document.getElementById('qx-brand')
  if (!el) { el = document.createElement('style'); el.id = 'qx-brand'; document.head.appendChild(el) }
  el.textContent = `
    :root {
      --brand-50:  ${p[50]};
      --brand-100: ${p[100]};
      --brand-200: ${p[200]};
      --brand-300: ${p[300]};
      --brand-400: ${p[400]};
      --brand-500: ${p[500]};
      --brand-600: ${p[600]};
      --brand-700: ${p[700]};
      --brand-800: ${p[800]};
      --brand-900: ${p[900]};
      --accent:         ${accent};
      --sidebar:        ${sidebar};
      --sidebar-border: ${sidebarBorder};
    }
    .brand-nav-inactive        { color: ${navText}; }
    .brand-nav-inactive:hover  { background-color: ${sidebarHover}; color: #fff; }
    .brand-nav-active          { background-color: #fff; color: ${p[700]}; }
    .brand-badge               { color: ${p[700]}; }
    .brand-footer              { color: ${navText}; }
    .brand-bg-light            { background-color: ${p[50]}; }

    /* Make the app's hard-coded blue follow the brand color, app-wide. */
    .bg-blue-600  { background-color: var(--brand-600) !important; }
    .bg-blue-700  { background-color: var(--brand-700) !important; }
    .bg-blue-500  { background-color: var(--brand-500) !important; }
    .hover\\:bg-blue-700:hover { background-color: var(--brand-700) !important; }
    .hover\\:bg-blue-600:hover { background-color: var(--brand-600) !important; }
    .hover\\:bg-blue-50:hover  { background-color: var(--brand-50)  !important; }
    .text-blue-700 { color: var(--brand-700) !important; }
    .text-blue-600 { color: var(--brand-600) !important; }
    .text-blue-500 { color: var(--brand-500) !important; }
    .text-blue-400 { color: var(--brand-400) !important; }
    .hover\\:text-blue-700:hover { color: var(--brand-700) !important; }
    .border-blue-600 { border-color: var(--brand-600) !important; }
    .border-blue-300 { border-color: var(--brand-300) !important; }
    .border-blue-200 { border-color: var(--brand-200) !important; }
    .focus\\:ring-blue-300:focus { --tw-ring-color: var(--brand-300) !important; }
    .focus\\:ring-blue-400:focus { --tw-ring-color: var(--brand-400) !important; }
    .focus\\:ring-blue-500:focus { --tw-ring-color: var(--brand-500) !important; }
  `
}

// ── Extract dominant color from an image (canvas sampling) ────────────────────

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [h * 360, s * 100, l * 100]
}

export function extractDominantColor(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const size = 80
      const canvas = document.createElement('canvas')
      canvas.width = size; canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, size, size)
      const { data } = ctx.getImageData(0, 0, size, size)

      const buckets = {}
      for (let i = 0; i < data.length; i += 4) {
        const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
        if (a < 100) continue
        const [h, s, l] = rgbToHsl(r, g, b)
        if (s < 25 || l < 10 || l > 88) continue  // skip grays, near-black, near-white
        const bucket = Math.round(h / 12) * 12      // 12° buckets
        buckets[bucket] = (buckets[bucket] || 0) + 1
      }

      const entries = Object.entries(buckets)
      if (!entries.length) { resolve(null); return }
      const dominantHue = parseInt(entries.sort((a, b) => b[1] - a[1])[0][0])
      resolve(hslToHex(dominantHue, 65, 33))  // saturated, medium-dark
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

export const DEFAULT_BRAND_COLOR = '#0369a1'  // sky-700 equivalent (legacy fallback)

// Standard/free tier default identity: charcoal sidebar + brass accent
export const FREE_PRIMARY_COLOR = '#b0894f'  // brass
export const FREE_SIDEBAR_COLOR = '#26262b'  // charcoal

// Curated presets offered to Pro customers in the theme customizer
export const BRAND_PRESETS = [
  { label: 'Charcoal & Brass', primary: '#b0894f', sidebar: '#26262b' },
  { label: 'Deep Blue',       primary: '#0369a1', sidebar: '#075985' },
  { label: 'Forest',           primary: '#3f7d54', sidebar: '#1f3a2b' },
  { label: 'Terracotta',       primary: '#c0603f', sidebar: '#3a2420' },
  { label: 'Slate',            primary: '#475569', sidebar: '#1e293b' },
  { label: 'Plum',             primary: '#7c4d70', sidebar: '#2e1f2b' },
  { label: 'Crimson',          primary: '#b23b47', sidebar: '#2c1518' },
  { label: 'Teal',             primary: '#2f8080', sidebar: '#123333' },
]

// ── Dark mode injection ───────────────────────────────────────────────────────
// Overrides the Tailwind utility colors the app uses with dark equivalents.
// Uses !important so no component files need to be touched. Tinted surfaces
// (status pills, banners, stat cards) are generated for every hue so none are
// left as bright pastels; colored text is lifted so it reads on charcoal.

const SURFACE = '#26262b'   // cards
const GROUND  = '#1c1c20'   // page
const RAISED  = '#303036'
const LINE    = '#3a3a41'
const LINE_SOFT = '#2f2f35'

// Tailwind hue → [500, 400, 300, 200]
const HUES = {
  red:     ['#ef4444', '#f87171', '#fca5a5', '#fecaca'],
  orange:  ['#f97316', '#fb923c', '#fdba74', '#fed7aa'],
  amber:   ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a'],
  yellow:  ['#eab308', '#facc15', '#fde047', '#fef08a'],
  lime:    ['#84cc16', '#a3e635', '#bef264', '#d9f99d'],
  green:   ['#22c55e', '#4ade80', '#86efac', '#bbf7d0'],
  emerald: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0'],
  teal:    ['#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4'],
  cyan:    ['#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc'],
  sky:     ['#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd'],
  indigo:  ['#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe'],
  violet:  ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'],
  purple:  ['#a855f7', '#c084fc', '#d8b4fe', '#e9d5ff'],
  fuchsia: ['#d946ef', '#e879f9', '#f0abfc', '#f5d0fe'],
  pink:    ['#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8'],
  rose:    ['#f43f5e', '#fb7185', '#fda4af', '#fecdd3'],
}
const tint = (hex, pct) => `color-mix(in srgb, ${hex} ${pct}%, ${SURFACE})`
const NEUTRALS = ['gray', 'slate', 'zinc', 'stone', 'neutral']

function hueRules() {
  const r = []
  for (const [h, [c500, c400, c300, c200]] of Object.entries(HUES)) {
    r.push(`html.dark .bg-${h}-50, html.dark .hover\\:bg-${h}-50:hover { background-color: ${tint(c500, 12)} !important; }`)
    r.push(`html.dark .bg-${h}-100, html.dark .hover\\:bg-${h}-100:hover { background-color: ${tint(c500, 20)} !important; }`)
    r.push(`html.dark .bg-${h}-200 { background-color: ${tint(c500, 30)} !important; }`)
    r.push(`html.dark .text-${h}-500 { color: ${c400} !important; }`)
    r.push(`html.dark .text-${h}-600, html.dark .text-${h}-700, html.dark .hover\\:text-${h}-700:hover { color: ${c300} !important; }`)
    r.push(`html.dark .text-${h}-800, html.dark .text-${h}-900 { color: ${c200} !important; }`)
    r.push(`html.dark .border-${h}-100, html.dark .border-${h}-200 { border-color: ${tint(c500, 32)} !important; }`)
    r.push(`html.dark .border-${h}-300 { border-color: ${tint(c500, 50)} !important; }`)
  }
  return r.join('\n    ')
}

function neutralRules() {
  const r = []
  for (const n of NEUTRALS) {
    r.push(`html.dark .bg-${n}-50, html.dark .bg-${n}-50\\/40, html.dark .bg-${n}-50\\/50, html.dark .bg-${n}-50\\/60, html.dark .bg-${n}-50\\/70 { background-color: ${GROUND} !important; }`)
    r.push(`html.dark .bg-${n}-100 { background-color: ${RAISED} !important; }`)
    r.push(`html.dark .bg-${n}-200 { background-color: #3a3a41 !important; }`)
    r.push(`html.dark .bg-${n}-300 { background-color: #4a4a52 !important; }`)
    r.push(`html.dark .hover\\:bg-${n}-50:hover  { background-color: #2b2b31 !important; }`)
    r.push(`html.dark .hover\\:bg-${n}-100:hover, html.dark .hover\\:bg-${n}-200:hover { background-color: #35353c !important; }`)
    r.push(`html.dark .text-${n}-900, html.dark .hover\\:text-${n}-900:hover { color: #f9fafb !important; }`)
    r.push(`html.dark .text-${n}-800, html.dark .hover\\:text-${n}-800:hover { color: #f3f4f6 !important; }`)
    r.push(`html.dark .text-${n}-700, html.dark .hover\\:text-${n}-700:hover { color: #e5e7eb !important; }`)
    r.push(`html.dark .text-${n}-600, html.dark .hover\\:text-${n}-600:hover { color: #d1d5db !important; }`)
    r.push(`html.dark .text-${n}-500 { color: #a1a1aa !important; }`)
    r.push(`html.dark .text-${n}-400 { color: #8b8b94 !important; }`)
    r.push(`html.dark .text-${n}-300 { color: #5b5b63 !important; }`)
    r.push(`html.dark .border-${n}-50, html.dark .border-${n}-100 { border-color: ${LINE_SOFT} !important; }`)
    r.push(`html.dark .border-${n}-200, html.dark .hover\\:border-${n}-200:hover { border-color: ${LINE} !important; }`)
    r.push(`html.dark .border-${n}-300, html.dark .hover\\:border-${n}-300:hover { border-color: #4a4a52 !important; }`)
    r.push(`html.dark .divide-${n}-50 > *, html.dark .divide-${n}-100 > *, html.dark .divide-${n}-200 > * { border-color: ${LINE_SOFT} !important; }`)
  }
  return r.join('\n    ')
}

export function applyTheme(isDark) {
  let el = document.getElementById('qx-theme')
  if (!el) { el = document.createElement('style'); el.id = 'qx-theme'; document.head.appendChild(el) }

  if (!isDark) {
    el.textContent = ''
    document.documentElement.classList.remove('dark')
    return
  }

  document.documentElement.classList.add('dark')
  // Screen only: printed/PDF output always stays light.
  el.textContent = `@media screen {
    html.dark {
      color-scheme: dark;
      /* Light brand tints become dark ones (pills, chips, selected rows). */
      --brand-50:  ${GROUND};
      --brand-100: color-mix(in srgb, var(--brand-500) 22%, ${SURFACE});
      --brand-200: color-mix(in srgb, var(--brand-500) 34%, ${SURFACE});
    }
    html.dark body { background-color: ${GROUND}; }

    /* Surfaces — neutral charcoal family to match the sidebar */
    html.dark .bg-white, html.dark .hover\\:bg-white:hover { background-color: ${SURFACE} !important; }
    html.dark .bg-white\\/50, html.dark .bg-white\\/80, html.dark .bg-white.bg-opacity-60 { background-color: rgba(38,38,43,0.85) !important; }
    html.dark .bg-brand-50, html.dark .brand-bg-light { background-color: ${GROUND} !important; }
    html.dark .divide-white > * { border-color: ${LINE} !important; }
    html.dark .hover\\:bg-black\\/5:hover { background-color: rgba(255,255,255,0.06) !important; }

    ${neutralRules()}

    ${hueRules()}

    /* Brand-colored text — lift the dark brand shades so they read on charcoal */
    html.dark .text-\\[var\\(--brand-600\\)\\], html.dark .text-\\[var\\(--brand-700\\)\\], html.dark .text-\\[var\\(--brand-800\\)\\],
    html.dark .hover\\:text-\\[var\\(--brand-600\\)\\]:hover, html.dark .hover\\:text-\\[var\\(--brand-700\\)\\]:hover,
    html.dark .hover\\:text-\\[var\\(--brand-800\\)\\]:hover,
    html.dark .text-blue-600, html.dark .text-blue-700, html.dark .text-blue-800, html.dark .brand-badge { color: var(--brand-300) !important; }
    html.dark .bg-blue-50 { background-color: color-mix(in srgb, var(--brand-500) 14%, ${SURFACE}) !important; }
    html.dark .bg-blue-100 { background-color: var(--brand-100) !important; }
    html.dark .border-blue-100, html.dark .border-blue-200 { border-color: var(--brand-200) !important; }

    /* Sidebar: the selected item is a soft highlight, not a white slab */
    html.dark .brand-nav-active { background-color: rgba(255,255,255,0.10) !important; color: #fff !important; box-shadow: inset 3px 0 0 var(--brand-400) !important; }

    /* Inputs */
    html.dark input:not([type="checkbox"]):not([type="radio"]):not([type="color"]):not([type="range"]),
    html.dark textarea,
    html.dark select {
      background-color: ${GROUND} !important;
      color: #f3f4f6 !important;
      border-color: ${LINE} !important;
    }
    html.dark input::placeholder, html.dark textarea::placeholder { color: #6b6b74 !important; }

    /* Chart grid lines drawn with light SVG strokes */
    html.dark svg [stroke="#f3f4f6"], html.dark svg [stroke="#e5e7eb"] { stroke: ${LINE} !important; }
    html.dark svg [fill="#d1d5db"] { fill: #6b6b74 !important; }

    /* Shadows — deepen them in dark mode */
    html.dark .shadow-sm  { box-shadow: 0 1px 2px rgba(0,0,0,0.5)  !important; }
    html.dark .shadow-md  { box-shadow: 0 4px 10px rgba(0,0,0,0.45) !important; }
    html.dark .shadow-lg  { box-shadow: 0 10px 15px rgba(0,0,0,0.6) !important; }
    html.dark .shadow-xl  { box-shadow: 0 20px 25px rgba(0,0,0,0.7) !important; }
    html.dark .shadow-2xl { box-shadow: 0 25px 50px rgba(0,0,0,0.8) !important; }

    /* White text on solid colored backgrounds stays white */
    html.dark .bg-blue-600, html.dark .bg-green-600, html.dark .bg-sky-600, html.dark .bg-sky-700,
    html.dark .bg-red-500, html.dark .bg-red-600, html.dark .bg-amber-400, html.dark .bg-emerald-600 { color: #fff !important; }
  }`
}
