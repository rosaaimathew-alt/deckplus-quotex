// ── Paint colors on a job ────────────────────────────────────────────────────
// A job often has more than one color: rails one, ceiling another, trim a
// third. Each entry is a color with its product, sheen and what it goes on
// (jobData.paint.colors). Jobs saved before this had a single color in
// paint.product / .color / .sheen / .areas: that reads as the first entry.
export const COLOR_FIELDS = ['product', 'sheen', 'color', 'areas']
export const blankColor = () => ({ product: '', sheen: '', color: '', areas: '' })
export const tidyColor = (c) => Object.fromEntries(COLOR_FIELDS.map(k => [k, String(c?.[k] ?? '').trim()]))
export const hasColor = (c) => COLOR_FIELDS.some(k => c[k])

export function paintColorsOf(paint) {
  const list = Array.isArray(paint?.colors) ? paint.colors.map(tidyColor).filter(hasColor) : []
  if (list.length) return list
  const old = tidyColor(paint)
  return hasColor(old) ? [old] : []
}
