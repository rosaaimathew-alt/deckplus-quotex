// ── Paver collections and their laying patterns ──────────────────────────────
// Shared by the design editor's plan (design-editor.html) and the 3D (porch-3d.html).
// Sizes are the makers' nominal sizes in inches, joint included (Techo-Bloc lists
// them that way; Keystone and brick are close enough at plan scale):
//   Techo-Bloc Blu 60: 6½×13, 13×13, 19½×13 (modular pallet ≈ 22/44/33 % by area); 6×13 format 6½×13
//   Techo-Bloc Blu Grande: 19½×32½        Techo-Bloc Eva: 8¾ wide × 4⅜ / 8¾ / 13³⁄₁₆ (≈ 27/40/33 %)
//   Techo-Bloc Para: 500 × 250 / 500 / 750 mm (modular 25/50/25 %)   Techo-Bloc Antika: small antique stones
//   Keystone Plaza: 3×6, 6×6, 6×9          Keystone Panorama: Demi 4×8, 8×8, 8×12; Supra 8×16, 16×16, 16×24
//   Clay brick 4×8                          Travertine French (Versailles): 8×8, 8×16, 16×16, 16×24
// QX_PAVERS.layout(collection, pattern, seed) → { period: [px, py], stones: [{ pts, s }] }: one
// repeat of the pattern (stones that cross its edge carry on into the next repeat), in inches,
// x along the house and y out into the yard; s is a small shade change per stone.
(function () {
  const MM = 1 / 25.4
  const COLORS = {
    'Shale Grey': '#8b8883', 'Champlain Grey': '#a9a6a0', 'Chestnut Brown': '#7d5d48', 'Sandlewood': '#bfa98a',
    'Chocolate Brown': '#5b4536', 'Onyx Black': '#3e3e40', 'Beige Cream': '#d3c6ad', 'Caffè Crema': '#b59d80',
    'Greyed Nickel': '#9a9993', 'Silver Granite': '#b7b6b1', 'Charcoal blend': '#5f5d5a', 'Tan blend': '#b8a286',
    'Red blend': '#8e5544', 'Red': '#9b4a37', 'Full range': '#8a5240', 'Clay': '#b98a68', 'Charcoal': '#55504c',
    'Ivory': '#e2d6bf', 'Walnut': '#a58360', 'Silver': '#c4c0b6', 'Noce': '#b48e6c',
  }
  const TB = ['Shale Grey', 'Champlain Grey', 'Chestnut Brown', 'Sandlewood', 'Beige Cream', 'Greyed Nickel', 'Caffè Crema', 'Chocolate Brown', 'Onyx Black']
  const COLLECTIONS = [
    { key: 'blu60', name: 'Techo-Bloc Blu 60 (Slate / Smooth)', joint: 0.28, colors: TB,
      patterns: [['modular', 'Modular, 3 sizes'], ['linear6x13', '6×13 linear'], ['herring6x13', '6×13 herringbone']] },
    { key: 'blugrande', name: 'Techo-Bloc Blu Grande', joint: 0.28, colors: ['Champlain Grey', 'Shale Grey', 'Greyed Nickel', 'Beige Cream', 'Chestnut Brown', 'Onyx Black'],
      patterns: [['linear', 'Linear'], ['herring', 'Herringbone']] },
    { key: 'eva', name: 'Techo-Bloc Eva', joint: 0.2, colors: ['Shale Grey', 'Champlain Grey', 'Chestnut Brown', 'Sandlewood', 'Onyx Black'],
      patterns: [['modular', 'Modular, 3 lengths']] },
    { key: 'para', name: 'Techo-Bloc Para', joint: 0.12, colors: ['Beige Cream', 'Greyed Nickel', 'Silver Granite', 'Caffè Crema', 'Onyx Black'],
      patterns: [['linear', 'Linear (500×750)'], ['modular', 'Modular, 3 sizes'], ['herring', 'Herringbone (500×750)']] },
    { key: 'antika', name: 'Techo-Bloc Antika', joint: 0.3, colors: ['Shale Grey', 'Chestnut Brown', 'Chocolate Brown', 'Sandlewood', 'Onyx Black'],
      patterns: [['random', 'Random']] },
    { key: 'plaza2', name: 'Keystone Plaza, 2-piece', joint: 0.25, colors: ['Charcoal blend', 'Tan blend', 'Red blend'],
      patterns: [['random', 'Random (6×6 + 6×9)'], ['herring', 'Herringbone 6×9']] },
    { key: 'plaza3', name: 'Keystone Plaza, 3-piece', joint: 0.25, colors: ['Charcoal blend', 'Tan blend', 'Red blend'],
      patterns: [['random', 'Random (3×6, 6×6, 6×9)']] },
    { key: 'demi', name: 'Keystone Panorama Demi', joint: 0.12, colors: ['Charcoal blend', 'Tan blend', 'Red blend'],
      patterns: [['random', 'Random (4×8, 8×8, 8×12)']] },
    { key: 'supra', name: 'Keystone Panorama Supra', joint: 0.12, colors: ['Charcoal blend', 'Tan blend', 'Red blend'],
      patterns: [['random', 'Random (8×16, 16×16, 16×24)']] },
    { key: 'brick', name: 'Clay brick 4×8', joint: 0.2, colors: ['Red', 'Full range', 'Clay', 'Charcoal'],
      patterns: [['running', 'Running bond'], ['herring90', 'Herringbone 90°'], ['herring45', 'Herringbone 45°'], ['basket', 'Basket weave'], ['stack', 'Stack bond']] },
    { key: 'travertine', name: 'Travertine', joint: 0.12, colors: ['Ivory', 'Walnut', 'Silver', 'Noce'],
      patterns: [['versailles', 'French / Versailles'], ['running16x24', '16×24 running bond']] },
  ]
  const DEFAULT = { paver: 'blu60', pattern: 'modular', color: 'Champlain Grey' }

  // seeded random, so a patio looks the same every time it is drawn
  const rng = (seed) => { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
  const box = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]

  // Rows of one height, filled with pieces of several lengths in the given shares of area.
  // Lengths are whole multiples of `unit`, so every row closes exactly on the repeat width.
  function rows(R, h, lens, share, unit, nRows, cols) {
    const P = unit * cols, stones = []
    const w = lens.map((L, i) => share[i] / L), tot = w.reduce((a, b) => a + b, 0)
    const pick = () => { let t = R() * tot; for (let i = 0; i < lens.length; i++) { t -= w[i]; if (t <= 0) return lens[i] } return lens[lens.length - 1] }
    let prev = []
    for (let r = 0; r < nRows; r++) {
      let cuts, tries = 0
      do {
        const row = []; let x = 0
        while (x < P - 1e-6) { let L = pick(); if (x + L > P + 1e-6) L = lens.filter(l => x + l <= P + 1e-6).pop() || unit; row.push([x, L]); x += L }
        const shift = Math.floor(R() * cols) * unit
        cuts = row.map(([x0, L]) => [(x0 + shift) % P, L])
        tries++
      } while (tries < 12 && cuts.some(([x0]) => prev.some(p => Math.abs(p - x0) < unit * 0.6 || Math.abs(Math.abs(p - x0) - P) < unit * 0.6)))
      prev = cuts.map(c => c[0])
      cuts.forEach(([x0, L]) => stones.push({ pts: box(x0, r * h, L, h), s: R() }))
    }
    return { period: [P, h * nRows], stones }
  }
  function running(R, L, h, offset = 0.5) {
    return { period: [L, 2 * h], stones: [{ pts: box(0, 0, L, h), s: R() }, { pts: box(L * offset, h, L, h), s: R() }] }
  }
  // 90° herringbone of L×W pieces: one flat and one upright piece, repeated along (W, W) and
  // (L, −L). It repeats squarely every X = kW + nL, where kW = nL (k, n the smallest whole
  // numbers that make it so). rot45 turns it 45°: then it repeats every X·√2.
  function herring(R, L, W, rot45 = false) {
    let n = 1; while (n < 40 && Math.abs(n * L / W - Math.round(n * L / W)) > 1e-3) n++
    const k = Math.round(n * L / W), X = k * W + n * L, c = Math.SQRT1_2
    const rot = rot45 ? ([x, y]) => [(x - y) * c, (x + y) * c] : (q) => q, Q = rot45 ? X * Math.SQRT2 : X
    const stones = [], span = Math.ceil(2 * Q / Math.min(W, L)) + 4
    for (let i = -span; i <= span; i++) for (let j = -span; j <= span; j++) {
      const o = rot([i * W + j * L, i * W - j * L])
      if (o[0] < -1e-6 || o[0] >= Q - 1e-6 || o[1] < -1e-6 || o[1] >= Q - 1e-6) continue
      const [ox, oy] = [i * W + j * L, i * W - j * L]
      stones.push({ pts: box(ox, oy, L, W).map(rot), s: R() }, { pts: box(ox, oy + W, W, L).map(rot), s: R() })
    }
    return { period: [Q, Q], stones }
  }
  function basket(R, L) {
    const W = L / 2, stones = []
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const x = i * L, y = j * L
      if ((i + j) % 2 === 0) { stones.push({ pts: box(x, y, L, W), s: R() }, { pts: box(x, y + W, L, W), s: R() }) }
      else { stones.push({ pts: box(x, y, W, L), s: R() }, { pts: box(x + W, y, W, L), s: R() }) }
    }
    return { period: [2 * L, 2 * L], stones }
  }
  // French / Versailles: a 48″ square of 4 × 8×8, 2 × 8×16, 4 × 16×16 and 2 × 16×24, repeated
  function versailles(R) {
    const v = [[0, 0, 24, 16], [24, 0, 8, 16], [32, 0, 16, 24], [0, 16, 16, 16], [16, 16, 16, 16], [32, 24, 16, 16], [32, 40, 16, 8],
      [0, 32, 16, 16], [16, 32, 8, 8], [24, 32, 8, 8], [16, 40, 8, 8], [24, 40, 8, 8]]
    return { period: [48, 48], stones: v.map(([x, y, w, h]) => ({ pts: box(x, y, w, h), s: R() })) }
  }
  // Antika: small antique stones in rows of random lengths
  function antika(R) {
    const stones = [], P = 60, h = 4.4
    for (let r = 0; r < 14; r++) { const x0 = R() * 3; let x = x0
      while (x < x0 + P - 1e-6) { let L = 3.3 + R() * 2.6; if (x0 + P - x - L < 2.5) L = x0 + P - x; stones.push({ pts: box(x, r * h, L, h), s: R() }); x += L } }
    return { period: [P, 14 * h], stones }
  }

  function layout(paver, pattern, seed = 7) {
    const R = rng(seed)
    switch (`${paver}:${pattern}`) {
      case 'blu60:modular': return rows(R, 13, [6.5, 13, 19.5], [22, 44, 33], 6.5, 9, 18)
      case 'blu60:linear6x13': return running(R, 13, 6.5)
      case 'blu60:herring6x13': return herring(R, 13, 6.5)
      case 'blugrande:linear': return running(R, 32.5, 19.5)
      case 'blugrande:herring': return herring(R, 32.5, 19.5)
      case 'eva:modular': return rows(R, 8.75, [4.375, 8.75, 13.125], [27, 40, 33], 4.375, 12, 26)
      case 'para:linear': return running(R, 750 * MM, 500 * MM)
      case 'para:modular': return rows(R, 500 * MM, [250 * MM, 500 * MM, 750 * MM], [25, 50, 25], 250 * MM, 6, 14)
      case 'para:herring': return herring(R, 750 * MM, 500 * MM)
      case 'antika:random': return antika(R)
      case 'plaza2:random': return rows(R, 6, [6, 9], [40, 60], 3, 16, 32)
      case 'plaza2:herring': return herring(R, 9, 6)
      case 'plaza3:random': return rows(R, 6, [3, 6, 9], [20, 35, 45], 3, 16, 32)
      case 'demi:random': return rows(R, 8, [4, 8, 12], [17, 33, 50], 4, 12, 24)
      case 'supra:random': return rows(R, 16, [8, 16, 24], [17, 33, 50], 8, 6, 12)
      case 'brick:running': return running(R, 8, 4)
      case 'brick:stack': return { period: [8, 4], stones: [{ pts: box(0, 0, 8, 4), s: R() }] }
      case 'brick:basket': return basket(R, 8)
      case 'brick:herring90': return herring(R, 8, 4)
      case 'brick:herring45': return herring(R, 8, 4, true)
      case 'travertine:versailles': return versailles(R)
      case 'travertine:running16x24': return running(R, 24, 16)
      default: return layout(DEFAULT.paver, DEFAULT.pattern, seed)
    }
  }
  const collection = (key) => COLLECTIONS.find(c => c.key === key) || COLLECTIONS[0]
  // The paver settings of a patio, filled in with the defaults
  function spec(p) {
    const c = collection(p?.paver || DEFAULT.paver)
    const pattern = c.patterns.some(([k]) => k === p?.pattern) ? p.pattern : c.patterns[0][0]
    const color = c.colors.includes(p?.pcolor) ? p.pcolor : (c.colors.includes(DEFAULT.color) ? DEFAULT.color : c.colors[0])
    return { paver: c.key, pattern, color, hex: COLORS[color] || '#9a9993', joint: c.joint, name: c.name, patternName: (c.patterns.find(([k]) => k === pattern) || [])[1] || '' }
  }
  // Every stone of the pattern over [x0, x1] × [y0, y1] (inches): the repeat tiled across.
  function tile(pat, x0, y0, x1, y1) {
    const [px, py] = pat.period, out = []
    const i0 = Math.floor(x0 / px) - 2, i1 = Math.ceil(x1 / px) + 1, j0 = Math.floor(y0 / py) - 2, j1 = Math.ceil(y1 / py) + 1
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) pat.stones.forEach(st => {
      const pts = st.pts.map(([x, y]) => [x + i * px, y + j * py]), xs = pts.map(p => p[0]), ys = pts.map(p => p[1])
      if (Math.max(...xs) < x0 || Math.min(...xs) > x1 || Math.max(...ys) < y0 || Math.min(...ys) > y1) return
      out.push({ pts, s: st.s })
    })
    return out
  }
  window.QX_PAVERS = { COLLECTIONS, COLORS, DEFAULT, layout, spec, tile, collection }
})()
