// ── Job photos on sub tasks ──────────────────────────────────────────────────
// A sub must send photos every day a task is in progress (started / near
// completion), and before each status change. Photos are shrunk on the phone
// (longest side 1600px, JPEG) and stored in the private Supabase Storage
// bucket 'job-photos' at <org>/<task>/<yyyy-mm-dd>/<id>.jpg
// (supabase/sub_photos.sql). The task keeps the list:
//   task.photos = [{ id, path, date: 'yyyy-mm-dd', at: ISO, by }]
// In the demo there's no storage: the shrunk photo is kept as a data URL.
import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { DEMO } from '../demo'
import { statusKey } from './subTasks'

export const BUCKET = 'job-photos'
const MAX_SIDE = 1600

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const photosOn = (t, day = localDay()) => (t?.photos || []).filter(p => p.date === day)
export const hasPhotosToday = (t) => photosOn(t).length > 0
// In progress = photos are due today.
export const photosDue = (t) => ['started', 'near'].includes(statusKey(t))
export const missingTodaysPhotos = (t) => photosDue(t) && !hasPhotosToday(t)

// Photos grouped by day, newest day first.
export function photosByDay(t) {
  const m = new Map()
  for (const p of t?.photos || []) { if (!m.has(p.date)) m.set(p.date, []); m.get(p.date).push(p) }
  return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
}

// Shrink a camera photo to a JPEG blob.
async function shrink(file) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error(`"${file.name}" isn't a photo this phone can read.`)); i.src = url
    })
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale)
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
    return await new Promise((resolve, reject) => c.toBlob(b => (b ? resolve(b) : reject(new Error('Could not process the photo.'))), 'image/jpeg', 0.8))
  } finally {
    URL.revokeObjectURL(url)
  }
}
const blobToDataUrl = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob) })

// Upload one photo for a task; returns the entry to add to task.photos.
export async function uploadTaskPhoto({ orgId, task, file, by }) {
  const blob = await shrink(file)
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const date = localDay()
  const entry = { id, date, at: new Date().toISOString(), by: by || '' }
  if (DEMO || !supabase) return { ...entry, dataUrl: await blobToDataUrl(blob) }
  if (!orgId) throw new Error('Not signed in to a company yet. Reload and try again.')
  const path = `${orgId}/${task.id}/${date}/${id}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error(/fetch|network/i.test(error.message) ? 'No signal: the photo did not upload. Try again when you have service.' : error.message)
  return { ...entry, path }
}

// A viewable URL for a stored photo: a signed link good for 12 hours,
// fetched once per photo per visit.
const _urls = new Map()   // path → signed url
export function usePhotoUrl(photo) {
  const direct = photo?.dataUrl || null
  const path = photo?.path || null
  const [got, setGot] = useState(null)   // { path, url } once the link arrives
  useEffect(() => {
    if (direct || !path || !supabase || _urls.has(path)) return
    let live = true
    supabase.storage.from(BUCKET).createSignedUrl(path, 12 * 3600).then(({ data }) => {
      if (!data?.signedUrl) return
      _urls.set(path, data.signedUrl)
      if (live) setGot({ path, url: data.signedUrl })
    })
    return () => { live = false }
  }, [direct, path])
  if (direct) return direct
  if (!path) return null
  return _urls.get(path) || (got?.path === path ? got.url : null)
}
