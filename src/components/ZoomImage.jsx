// ── A photo you can zoom into ────────────────────────────────────────────────
// The full-screen photo viewers (job photos, booking photos, chat photos):
//   pinch, double-tap (double-click) or the mouse wheel to zoom in and out,
//   drag to move around a zoomed photo,
//   swipe left / right for the next photo (onSwipe), a single tap closes (onTap).
// It fills its parent; give it a key per photo so each one opens unzoomed.
import { useRef, useState } from 'react'

const MAX = 5
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export default function ZoomImage({ src, alt = '', onTap, onSwipe }) {
  const box = useRef(null)
  const [t, setT] = useState({ s: 1, x: 0, y: 0 })
  const [held, setHeld] = useState(false)   // a finger is down: follow it without easing
  const pts = useRef(new Map())
  const start = useRef(null)
  const moved = useRef(false)
  const lastTap = useRef(0)
  const tapTimer = useRef(null)

  const rect = () => box.current?.getBoundingClientRect() || { left: 0, top: 0, width: 1, height: 1 }
  // keep the photo from sliding off screen
  const fit = (s, x, y) => {
    const r = rect()
    const mx = (r.width * (s - 1)) / 2, my = (r.height * (s - 1)) / 2
    return { s, x: clamp(x, -mx, mx), y: clamp(y, -my, my) }
  }
  // zoom to s, keeping the screen point (px, py) where it is
  const zoomAt = (cur, s, px, py) => {
    s = clamp(s, 1, MAX)
    if (s === 1) return { s: 1, x: 0, y: 0 }
    const r = rect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2
    return fit(s, px - cx - (s * (px - cx - cur.x)) / cur.s, py - cy - (s * (py - cy - cur.y)) / cur.s)
  }

  const begin = () => {
    const [a, b] = [...pts.current.values()]
    start.current = b
      ? { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, t }
      : { px: a.x, py: a.y, t }
  }
  const down = (e) => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.current.size === 1) { moved.current = false; setHeld(true) }
    begin()
  }
  const move = (e) => {
    if (!pts.current.has(e.pointerId)) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const st = start.current
    if (!st) return
    if (pts.current.size >= 2 && st.dist) {
      const [a, b] = [...pts.current.values()]
      moved.current = true
      setT(zoomAt(st.t, (st.t.s * Math.hypot(a.x - b.x, a.y - b.y)) / st.dist, st.mx, st.my))
    } else if (pts.current.size === 1 && st.px != null) {
      const dx = e.clientX - st.px, dy = e.clientY - st.py
      if (Math.abs(dx) + Math.abs(dy) > 8) moved.current = true
      if (st.t.s > 1) setT(fit(st.t.s, st.t.x + dx, st.t.y + dy))
    }
  }
  const up = (e) => {
    const st = start.current
    const p = pts.current.get(e.pointerId)
    pts.current.delete(e.pointerId)
    if (pts.current.size) { begin(); return }   // one finger still down after a pinch: keep moving
    start.current = null
    setHeld(false)
    // a swipe on an unzoomed photo: the next / previous one
    if (moved.current && t.s === 1 && st?.px != null && p && onSwipe) {
      const dx = p.x - st.px, dy = p.y - st.py
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1)
      return
    }
    if (moved.current) return
    // a tap: two quick ones zoom in (or back out), one closes the viewer
    const now = Date.now()
    if (now - lastTap.current < 300) {
      clearTimeout(tapTimer.current)
      lastTap.current = 0
      setT(t.s > 1 ? { s: 1, x: 0, y: 0 } : zoomAt(t, 2.5, e.clientX, e.clientY))
      return
    }
    lastTap.current = now
    clearTimeout(tapTimer.current)
    if (t.s === 1 && onTap) tapTimer.current = setTimeout(onTap, 300)
  }
  const wheel = (e) => setT(cur => zoomAt(cur, cur.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), e.clientX, e.clientY))

  return (
    <div ref={box} className="absolute inset-0 flex items-center justify-center overflow-hidden select-none p-3"
      style={{ touchAction: 'none', cursor: t.s > 1 ? 'grab' : 'zoom-in' }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel}>
      <img src={src} alt={alt} draggable={false}
        className="max-w-full max-h-full object-contain pointer-events-none"
        style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})`, transition: held ? 'none' : 'transform 120ms ease-out' }} />
    </div>
  )
}
