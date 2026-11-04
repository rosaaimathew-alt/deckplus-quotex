// ── Project gallery: tags, search, photo processing, storage ────────────────
// The public /gallery page and the staff Gallery tab share everything here.
//
// Tags are short phrases ("White ceiling", "A-frame roof"). A project's tags
// describe the whole build; each photo has its own tags too, so a search for
// "white ceiling" can open on the photo that shows the white ceiling.
//
// Search understands what a word is describing. In "white ceiling gray
// decking", "white" belongs to "ceiling" and "gray" to "decking": a project
// matches only when one of its tags is a white ceiling and one is gray
// decking — a white railing with a stained ceiling does not count.
import { supabase, supabaseReady } from '../supabase'

// ── Tag vocabulary (the office can add their own on any project) ────────────
export const TAG_GROUPS = [
  { key: 'type', label: 'Project', tags: [
    'Screened porch', 'Open porch', 'Eze-Breeze porch', 'Sunroom', 'Porch conversion', 'Deck', 'Covered deck',
    'Porch over deck', 'Pergola', 'Gazebo', 'Patio', 'Outdoor kitchen', 'Fireplace', 'Fire pit',
  ] },
  { key: 'roof', label: 'Roof style', tags: [
    'A-frame roof', 'Shed roof', 'Hip roof', 'Flat roof', 'Tie-in roof', 'Metal roof', 'Shingle roof',
  ] },
  { key: 'ceiling', label: 'Ceiling', tags: [
    'White ceiling', 'Natural wood ceiling', 'Stained wood ceiling', 'Gray ceiling', 'Beadboard ceiling',
    'Tongue and groove ceiling', 'Vaulted ceiling', 'Flat ceiling', 'Exposed beams', 'Ceiling fan',
  ] },
  { key: 'floor', label: 'Decking & floor', tags: [
    'Gray decking', 'Brown decking', 'Tan decking', 'Dark decking', 'Composite decking', 'Pressure-treated decking',
    'Tile floor', 'LVT floor', 'Concrete floor', 'Stamped concrete', 'Pavers',
  ] },
  { key: 'railing', label: 'Railing', tags: [
    'Black aluminum railing', 'White aluminum railing', 'White vinyl railing', 'Wood railing', 'Cable railing',
    'Glass railing', 'Composite railing',
  ] },
  { key: 'trim', label: 'Columns & trim', tags: [
    'White columns', 'Black columns', 'Wood columns', 'Stone columns', 'White trim', 'Black trim', 'Gray siding',
  ] },
  { key: 'features', label: 'Features', tags: [
    'Recessed lighting', 'String lights', 'Skylights', 'Stairs', 'Wide stairs', 'Knee wall', 'Screen door',
    'TV wall', 'Privacy wall', 'Under-deck drainage', 'Two-story', 'Ground level', 'Pool area',
  ] },
]

const GROUP_OF = new Map(TAG_GROUPS.flatMap(g => g.tags.map(t => [t.toLowerCase(), g.key])))
export const groupOfTag = (tag) => GROUP_OF.get(String(tag).toLowerCase()) || 'other'

// ── Words ────────────────────────────────────────────────────────────────────
const SYNONYMS = {
  grey: 'gray', aframe: 'aframe', gable: 'aframe', gabled: 'aframe', 'a-frame': 'aframe',
  tng: 'tongue', screen: 'screened', screens: 'screened', lights: 'lighting', light: 'lighting',
  aluminium: 'aluminum', pvc: 'vinyl', ceilings: 'ceiling', roofs: 'roof', columns: 'column',
  posts: 'column', post: 'column', railings: 'railing', rails: 'railing', rail: 'railing',
  floors: 'floor', flooring: 'floor', boards: 'decking', decks: 'deck', porches: 'porch',
  patios: 'patio', beams: 'beam', fans: 'fan', stair: 'stairs', steps: 'stairs', sunrooms: 'sunroom',
  stone: 'stone', brick: 'stone', wooden: 'wood', cedar: 'wood', pine: 'wood', stained: 'stained',
}
const STOP = new Set(['a', 'an', 'the', 'and', 'with', 'of', 'in', 'on', 'for', 'or', 'to', 'my', 'show', 'me', 'like', 'that', 'has', 'have', 'style'])

// "A frame", "A-frame", "aframe" → one word; "T&G" → tongue
function normalize(text) {
  return String(text || '').toLowerCase()
    .replace(/\ba[\s-]*frame/g, 'aframe')
    .replace(/\bt\s*&\s*g\b/g, 'tongue')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
}
export function words(text) {
  return normalize(text).split(' ').filter(w => w && !STOP.has(w)).map(w => SYNONYMS[w] || w)
}

// Parts of a build. Each ends a phrase: the words before it describe it, so
// "white ceiling" must be one tag. Whole-project words (porch, deck, sunroom…)
// stay loose on purpose — "white porch" means a porch with white in it.
const NOUNS = new Set([
  'ceiling', 'roof', 'railing', 'decking', 'floor', 'column', 'trim', 'siding', 'beam', 'fan', 'stairs',
  'wall', 'door', 'lighting', 'skylights', 'pavers', 'tile', 'drainage',
])

// A query word matches a tag word when one is the start of the other
// ("deck" ~ "decking", "screened" ~ "screened"), for words of 3+ letters.
const wordHit = (q, t) => q === t || (q.length >= 3 && t.startsWith(q)) || (t.length >= 4 && q.startsWith(t))
const phraseIn = (qs, tagWords) => qs.every(q => tagWords.some(t => wordHit(q, t)))

// "white ceiling gray decking big" → [{words:[white,ceiling]}, {words:[gray,decking]}], loose: [big]
export function parseQuery(query) {
  const ws = words(query)
  const phrases = []
  let pending = []
  for (const w of ws) {
    pending.push(w)
    if (NOUNS.has(w)) { phrases.push(pending); pending = [] }
  }
  return { phrases, loose: pending, empty: ws.length === 0 }
}

// Pre-compute the searchable parts of a project once per load
export function indexProject(p) {
  const photoTags = (p.photos || []).flatMap(ph => ph.tags || [])
  const allTags = [...new Set([...(p.tags || []), ...photoTags])]
  return {
    ...p,
    allTags,
    _tagWords: allTags.map(t => ({ tag: t, w: words(t) })),
    _textWords: words([p.title, p.summary, p.location, ...(p.photos || []).map(ph => ph.caption || '')].join(' ')),
  }
}

// Returns null when the project doesn't match, else { score, tags (matched), photo (best) }
export function matchProject(ip, parsed, required = []) {
  for (const r of required) if (!ip.allTags.some(t => t.toLowerCase() === r.toLowerCase())) return null
  if (parsed.empty) return { score: 0, tags: required, photo: coverPhoto(ip, required) }

  const matched = new Set(required)
  let score = 0
  for (const ph of parsed.phrases) {
    // The whole phrase must sit in one tag ("white ceiling" in "White ceiling")
    const hits = ip._tagWords.filter(t => phraseIn(ph, t.w))
    if (hits.length) { hits.forEach(h => matched.add(h.tag)); score += 3 * ph.length; continue }
    // A described phrase with no tag can still match the project's own words —
    // but only when it is a single word ("pergola"), never "white ceiling" loosely
    if (ph.length === 1 && phraseIn(ph, ip._textWords)) { score += 1; continue }
    return null
  }
  for (const q of parsed.loose) {
    const hits = ip._tagWords.filter(t => t.w.some(w => wordHit(q, w)))
    if (hits.length) { hits.forEach(h => matched.add(h.tag)); score += 2; continue }
    if (ip._textWords.some(w => wordHit(q, w))) { score += 1; continue }
    return null
  }
  const tags = [...matched]
  return { score: score + (ip.featured ? 0.5 : 0), tags, photo: coverPhoto(ip, tags) }
}

// The photo that best shows what was searched for (else the first one)
export function coverPhoto(p, tags = []) {
  const photos = p.photos || []
  if (!photos.length) return null
  if (!tags.length) return photos[0]
  const want = new Set(tags.map(t => t.toLowerCase()))
  let best = photos[0], bestN = 0
  for (const ph of photos) {
    const n = (ph.tags || []).filter(t => want.has(t.toLowerCase())).length
    if (n > bestN) { best = ph; bestN = n }
  }
  return best
}

export function searchProjects(indexed, query, required = []) {
  const parsed = parseQuery(query)
  return indexed
    .map(p => ({ p, m: matchProject(p, parsed, required) }))
    .filter(x => x.m)
    .sort((a, b) => b.m.score - a.m.score)
}

// Tags in use, grouped, with how many projects carry each
export function tagFacets(indexed) {
  const counts = new Map()
  for (const p of indexed) for (const t of p.allTags) counts.set(t, (counts.get(t) || 0) + 1)
  const groups = [...TAG_GROUPS.map(g => ({ key: g.key, label: g.label })), { key: 'other', label: 'More' }]
    .map(g => ({ ...g, tags: [] }))
  const byKey = Object.fromEntries(groups.map(g => [g.key, g]))
  for (const [tag, count] of counts) byKey[groupOfTag(tag)].tags.push({ tag, count })
  groups.forEach(g => g.tags.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)))
  return groups.filter(g => g.tags.length)
}

// ── Photos ──────────────────────────────────────────────────────────────────
export const DEFAULT_ADJUST = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, rotate: 0 }
export const isAdjusted = (a) => !!a && Object.keys(DEFAULT_ADJUST).some(k => (a[k] || 0) !== 0)

// Live preview (CSS) — close to what applyAdjust bakes in
export function previewFilter(a = DEFAULT_ADJUST) {
  const b = 1 + (a.brightness || 0) / 100
  const c = 1 + (a.contrast || 0) / 100
  const s = 1 + (a.saturation || 0) / 100
  const w = (a.warmth || 0) / 100
  return `brightness(${b}) contrast(${c}) saturate(${s})${w > 0 ? ` sepia(${(w * 0.35).toFixed(3)})` : w < 0 ? ` hue-rotate(${(w * 12).toFixed(1)}deg)` : ''}`
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image'))
    img.src = src
  })
}

const canvasBlob = (canvas, quality = 0.86) =>
  new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Could not save the image'))), 'image/jpeg', quality))

// Scale a picture down to `max` px on its long edge (phone photos are huge)
function drawScaled(img, max, rotate = 0) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height   // an <img> or a canvas
  const scale = Math.min(1, max / Math.max(iw, ih))
  const w = Math.round(iw * scale), h = Math.round(ih * scale)
  const turn = ((rotate % 360) + 360) % 360
  const canvas = document.createElement('canvas')
  canvas.width = turn % 180 ? h : w
  canvas.height = turn % 180 ? w : h
  const ctx = canvas.getContext('2d')
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate((turn * Math.PI) / 180)
  ctx.drawImage(img, -w / 2, -h / 2, w, h)
  return canvas
}

// Brightness / contrast / saturation / warmth, pixel by pixel (works in every
// browser — Safari ignores canvas filters)
function adjustPixels(canvas, a) {
  if (!isAdjusted({ ...a, rotate: 0 })) return canvas
  const ctx = canvas.getContext('2d')
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = data.data
  const bright = (a.brightness || 0) * 1.28
  const cf = (259 * ((a.contrast || 0) * 1.28 + 255)) / (255 * (259 - (a.contrast || 0) * 1.28))
  const sat = 1 + (a.saturation || 0) / 100
  const warm = (a.warmth || 0) * 0.3
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i], g = px[i + 1], b = px[i + 2]
    r += bright; g += bright; b += bright
    r = cf * (r - 128) + 128; g = cf * (g - 128) + 128; b = cf * (b - 128) + 128
    const l = 0.299 * r + 0.587 * g + 0.114 * b
    r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat
    r += warm; b -= warm
    px[i] = r < 0 ? 0 : r > 255 ? 255 : r
    px[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g
    px[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b
  }
  ctx.putImageData(data, 0, 0)
  return canvas
}

// One-click "Auto": lift dark photos, add punch to flat ones, neutralize
// a strong color cast. Returns slider values the office can still tweak.
export async function autoAdjust(src) {
  const img = await loadImage(src)
  const c = drawScaled(img, 200)
  const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let sum = 0, sumSq = 0, rs = 0, bs = 0, n = 0, sat = 0
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2]
    const l = 0.299 * r + 0.587 * g + 0.114 * b
    sum += l; sumSq += l * l; rs += r; bs += b; n++
    sat += Math.max(r, g, b) - Math.min(r, g, b)
  }
  const mean = sum / n
  const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean))
  const clamp = (v, lo, hi) => Math.round(Math.max(lo, Math.min(hi, v)))
  return {
    ...DEFAULT_ADJUST,
    brightness: clamp((125 - mean) / 2.2, -20, 30),
    contrast: clamp((58 - sd) / 1.2, -10, 30),
    saturation: clamp((70 - sat / n) / 2, -10, 25),
    warmth: clamp(((bs - rs) / n) / 2, -20, 20),
  }
}

// Read a picked file into a resized JPEG (the "original" we keep)
export async function prepareUpload(file, max = 2400) {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const canvas = drawScaled(img, max)
    return { blob: await canvasBlob(canvas), width: canvas.width, height: canvas.height }
  } finally { URL.revokeObjectURL(url) }
}

// Bake adjustments into a full-size image and a small thumbnail
export async function renderEdited(src, adjust) {
  const img = await loadImage(src)
  const full = adjustPixels(drawScaled(img, 2400, adjust.rotate || 0), adjust)
  const thumb = drawScaled(full, 900)
  return { full: await canvasBlob(full), thumb: await canvasBlob(thumb, 0.8), width: full.width, height: full.height }
}

// ── Storage + data ───────────────────────────────────────────────────────────
const BUCKET = 'gallery'
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

export const galleryReady = supabaseReady

export function publicUrl(path) {
  if (!path || !supabase) return ''
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

async function put(path, blob) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '31536000' })
  if (error) throw new Error(error.message || 'Upload failed')
  return path
}

// Upload a new photo: keep the resized original, publish an (unadjusted) copy + thumbnail
export async function uploadPhoto(orgId, projectId, file) {
  const id = uid()
  const base = `${orgId}/${projectId}/${id}`
  const { blob } = await prepareUpload(file)
  await put(`${base}-orig.jpg`, blob)
  const origUrl = URL.createObjectURL(blob)
  try {
    const out = await renderEdited(origUrl, DEFAULT_ADJUST)
    await put(`${base}-v1.jpg`, out.full)
    await put(`${base}-v1-t.jpg`, out.thumb)
    return {
      id, original: `${base}-orig.jpg`, path: `${base}-v1.jpg`, thumb: `${base}-v1-t.jpg`,
      v: 1, width: out.width, height: out.height, caption: '', tags: [], adjust: { ...DEFAULT_ADJUST },
    }
  } finally { URL.revokeObjectURL(origUrl) }
}

// Re-render a photo from its original with new adjustments (new file names, so
// browsers and the CDN never show the old version)
export async function saveAdjustedPhoto(orgId, projectId, photo, adjust) {
  const v = (photo.v || 1) + 1
  const base = `${orgId}/${projectId}/${photo.id}`
  const out = await renderEdited(publicUrl(photo.original || photo.path), adjust)
  await put(`${base}-v${v}.jpg`, out.full)
  await put(`${base}-v${v}-t.jpg`, out.thumb)
  const stale = [photo.path, photo.thumb].filter(p => p && p !== photo.original)
  if (stale.length) await supabase.storage.from(BUCKET).remove(stale).catch(() => {})
  return { ...photo, v, path: `${base}-v${v}.jpg`, thumb: `${base}-v${v}-t.jpg`, width: out.width, height: out.height, adjust: { ...adjust } }
}

export async function removePhotoFiles(photos) {
  const paths = photos.flatMap(p => [p.original, p.path, p.thumb]).filter(Boolean)
  if (paths.length) await supabase.storage.from(BUCKET).remove([...new Set(paths)]).catch(() => {})
}

const fromRow = (r) => ({
  id: r.id, title: r.title || '', summary: r.summary || '', location: r.location || '',
  completedOn: r.completed_on || '', tags: r.tags || [], photos: r.photos || [],
  published: !!r.published, featured: !!r.featured, sortOrder: r.sort_order || 0, updatedAt: r.updated_at,
})
const toRow = (p) => ({
  title: p.title || '', summary: p.summary || '', location: p.location || '',
  completed_on: p.completedOn || null, tags: p.tags || [], photos: p.photos || [],
  published: !!p.published, featured: !!p.featured, sort_order: p.sortOrder || 0,
})

export async function listGallery(orgId) {
  const { data, error } = await supabase.from('gallery_projects').select('*').eq('org_id', orgId)
    .order('featured', { ascending: false }).order('sort_order').order('created_at', { ascending: false })
  if (error) throw new Error(/relation|does not exist|schema cache/i.test(error.message)
    ? 'The gallery isn’t set up yet — run supabase/gallery.sql in the Supabase SQL editor.' : error.message)
  return (data || []).map(fromRow)
}

export async function createGalleryProject(orgId, fields = {}) {
  const { data, error } = await supabase.from('gallery_projects').insert({ org_id: orgId, ...toRow(fields) }).select().single()
  if (error) throw new Error(error.message)
  return fromRow(data)
}

export async function saveGalleryProject(p) {
  const { data, error } = await supabase.from('gallery_projects').update(toRow(p)).eq('id', p.id).select().single()
  if (error) throw new Error(error.message)
  return fromRow(data)
}

export async function deleteGalleryProject(p) {
  await removePhotoFiles(p.photos || [])
  const { error } = await supabase.from('gallery_projects').delete().eq('id', p.id)
  if (error) throw new Error(error.message)
}

// The public page
export async function loadPublicGallery(orgId) {
  if (!supabase) throw new Error('The gallery is not available right now.')
  const { data, error } = await supabase.rpc('gallery_public', orgId ? { p_org: orgId } : {})
  if (error) throw new Error('The gallery is not available right now.')
  return { company: data?.company || {}, projects: (data?.projects || []) }
}
