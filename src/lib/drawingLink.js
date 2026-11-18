// ── The drawing drives the price ─────────────────────────────────────────────
// The Deck Builder and the Porch Builder open the design editor linked to
// themselves ("Draw it"). Each change in the drawing writes its measurements to
// this browser's storage (qx-drawing:<link>, see takeoff() in
// public/design-editor.html); the builder in the other tab picks them up and
// fills its own fields, so nothing is typed twice. The link is kept on the
// quote line (builder.state.drawLink), so the drawing reopens as it was left.
import { useEffect, useEffectEvent, useState } from 'react'
import { designParts } from './designLink'

export const newLink = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
const KEY = (link) => `qx-drawing:${link}`

// The editor, opened on what the builder holds now (when no drawing exists yet for this link).
export function drawUrl(link, parts) {
  return `/design-editor.html?design=${encodeURIComponent(JSON.stringify({ decks: [], porches: [], patios: [], ...parts }))}&link=${encodeURIComponent(link)}`
}
export const deckParts = (state) => ({ decks: designParts([{ builder: { tool: 'deck', state } }]).decks })
export const porchParts = (inp) => ({ porches: designParts([{ porchBuild: inp }]).porches })

// Follow the drawing: `apply` runs with each new set of measurements while `follow` is on.
export function useDrawingLink(savedLink, apply) {
  const [link, setLink] = useState(savedLink || null)
  const [last, setLast] = useState(null)
  const [follow, setFollow] = useState(true)
  const onDrawing = useEffectEvent((d) => {
    setLast(d)
    if (follow) apply(d)
  })
  useEffect(() => {
    if (!link) return undefined
    const onStorage = (ev) => {
      if (ev.key !== KEY(link) || !ev.newValue) return
      try { onDrawing(JSON.parse(ev.newValue)) } catch { /* not a drawing */ }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [link])
  const open = (parts) => {
    const l = link || newLink()
    if (!link) setLink(l)
    setFollow(true)
    // Named window: a second click brings the same drawing back to the front.
    window.open(drawUrl(l, parts), `qx-draw-${l}`)
  }
  // Pick up the drawing again (after following was off): apply what it shows now.
  const resume = () => {
    setFollow(true)
    if (last) apply(last)
  }
  return { link, last, follow, setFollow, open, resume }
}

const r1 = (v) => Math.round((Number(v) || 0) * 10) / 10

// Decks → the Deck Builder. The main deck is the height with the most deck; pieces at that
// height price together (one rectangle → W × D; anything else → total SF and open edge).
// Stair runs off it, and landings they reach, come with their links. Other heights are
// listed so the rep can add them as their own deck line.
export function deckFromDrawing(d) {
  const decks = d?.decks || []
  if (!decks.length) return null
  const byH = new Map()
  decks.forEach(x => byH.set(x.h, (byH.get(x.h) || 0) + x.area))
  const H = [...byH.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const main = decks.filter(x => x.h === H)
  const one = main.length === 1 && main[0].rect ? main[0] : null
  const lid = (id) => `dl${id}`
  const stairs = [], landings = [], seen = new Set()
  const walk = (hosts, from) => {
    for (const s of (d.stairs || []).filter(x => hosts.has(x.from))) {
      const L = (d.landings || []).find(l => l.id === s.to)
      stairs.push({ id: `ds${s.id}`, across: r1(s.across) || 4, steps: Number(s.steps) || 0, style: s.boxed ? 'Box' : 'Regular', auto: true, from: from(s), to: L ? lid(L.id) : 'grade' })
      if (L && !seen.has(L.id)) {
        seen.add(L.id)
        landings.push({ id: lid(L.id), width: r1(L.width), depth: r1(L.depth), height: r1(L.h) })
        walk(new Set([L.id]), () => lid(L.id))
      }
    }
  }
  walk(new Set(main.map(x => x.id)), () => 'deck')
  const area = main.reduce((a, x) => a + x.area, 0)
  return {
    sizeMode: one ? 'dims' : 'sf',
    width: one ? one.width : Math.max(...main.map(x => x.width)),
    depth: one ? one.depth : Math.max(...main.map(x => x.depth)),
    areaSF: one ? '' : area,
    openEdgeLF: one ? '' : main.reduce((a, x) => a + x.openLF, 0),
    height: H,
    freestanding: !main.some(x => x.house),
    stairs, landings,
    railLF: main.reduce((a, x) => a + x.railLF, 0),
    others: decks.filter(x => x.h !== H).map(x => ({ size: x.rect ? `${x.width}′×${x.depth}′` : `${x.area} SF`, h: x.h })),
  }
}

// One porch → the Porch Builder: size, type, roof and its tie-in, floor and height, walls,
// door wall, gable-end glass, step width and landing. `id` keeps following the same porch.
export function porchFromDrawing(d, id) {
  const ps = d?.porches || []
  const p = ps.find(x => x.id === id) || ps[0]
  if (!p) return null
  const free = p.tie === 'free'
  const sides = free ? 'All 4 walls' : p.enclose === 'front0' ? 'Front only' : p.enclose === 'front1' ? 'Front + 1 side' : 'Front + 2 sides'
  const gable = p.roof === 'gable' || p.roof === 'semivault'
  return {
    id: p.id,
    pitch: p.pitch,
    patch: {
      width: r1(p.w), depth: r1(p.d), type: p.ptype, tie: p.tie, roof: p.roof, floor: p.floor,
      ...(p.floor === 'deck' ? { deckHeightFt: r1(p.h) } : {}),
      wallHeightIn: Math.round((Number(p.wallH) || 8) * 12), sides,
      doorWall: p.doorWall === 'front' ? 'front' : 'side',
      glassEnds: gable && p.gableEnd === 'glass' ? (free ? 2 : 1) : 0,
    },
    stairWidthFt: p.steps ? r1(p.stairW) || 4 : null,
    landings: p.steps && p.landing && p.landing !== 'none' ? 1 : 0,
  }
}
