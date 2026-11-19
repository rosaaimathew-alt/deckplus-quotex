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
async function shrink(file, maxSide = MAX_SIDE) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error(`"${file.name}" isn't a photo this device can read.`)); i.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
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

// A photo sent in the job chat (components/JobChat), either way between the
// Deck Plus PM and the sub. Kept with that sub's booking photos, at
// <org>/<booking>/chat/<id>.jpg, so the same people can open it.
export async function uploadChatPhoto({ orgId, taskId, file }) {
  const blob = await shrink(file)
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  if (DEMO || !supabase) return { id, dataUrl: await blobToDataUrl(blob) }
  if (!orgId || !taskId) throw new Error('Not signed in to a company yet. Reload and try again.')
  const path = `${orgId}/${taskId}/chat/${id}.jpg`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw new Error(/fetch|network/i.test(error.message) ? 'No signal: the photo did not upload. Try again when you have service.' : error.message)
  return { id, path }
}

// A sub's invoice file (lib/subDraws): a photo of the paper invoice, or the
// PDF itself. Stored next to that job's photos (same bucket, same access) at
// <org>/<task>/invoices/<id>.<jpg|pdf>. Photos are shrunk but kept large
// enough to read; PDFs go up as they are (10 MB max).
const MAX_FILE = 10 * 1024 * 1024
export async function uploadInvoiceFile({ orgId, taskId, file }) {
  const pdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')
  if (!pdf && !/^image\//.test(file.type || '') && !/\.(jpe?g|png|heic|webp)$/i.test(file.name || '')) {
    throw new Error(`"${file.name}" isn't a photo or a PDF.`)
  }
  const blob = pdf ? file : await shrink(file, 2400)
  if (blob.size > MAX_FILE) throw new Error(`"${file.name}" is too big (10 MB max).`)
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const entry = { id, name: file.name || (pdf ? 'invoice.pdf' : 'invoice.jpg'), type: pdf ? 'pdf' : 'photo' }
  if (DEMO || !supabase) return { ...entry, dataUrl: await blobToDataUrl(blob) }
  if (!orgId) throw new Error('Not signed in to a company yet. Reload and try again.')
  const path = `${orgId}/${taskId}/invoices/${id}.${pdf ? 'pdf' : 'jpg'}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: pdf ? 'application/pdf' : 'image/jpeg', upsert: false })
  if (error) throw new Error(/fetch|network/i.test(error.message) ? 'No signal: the file did not upload. Try again when you have service.' : error.message)
  return { ...entry, path }
}

// A job's own files (Jobs › Photos and Documents): photos and PDFs are kept in
// the app, in the same private bucket, at <org>/job-<proposal id>/<id>.<jpg|pdf>
// (supabase/job_files.sql), not in Google Drive. Photos are shrunk first, so a
// large phone photo still goes up. The job keeps the list on
// jobData.documents: { id, name, path, mimeType, folder, uploadedAt, by }.
const isPdfFile = (file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')
const isPhotoFile = (file) => /^image\//.test(file.type || '') || /\.(jpe?g|png|heic|webp)$/i.test(file.name || '')
export const keptInApp = (file) => isPdfFile(file) || isPhotoFile(file)
// A stored file (not a Drive link), and whether it is a picture.
export const isStored = (d) => !!(d?.path || d?.dataUrl)
export const isStoredPhoto = (d) => isStored(d) && /^image\//.test(d.mimeType || '')

// A job's own photos, newest first: stored pictures in any folder but Receipts
// (job money).
export const jobPhotos = (proposal) => ((proposal.jobData || {}).documents || [])
  .filter(d => isStoredPhoto(d) && d.folder !== 'Receipts')
  .sort((a, b) => String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')))
export const jobPhotoCount = (proposal, tasks = []) => jobPhotos(proposal).length + tasks.reduce((n, t) => n + (t.photos || []).length, 0)

export async function uploadJobFile({ orgId, proposalId, file, readable = false }) {
  const pdf = isPdfFile(file)
  const blob = pdf ? file : await shrink(file, readable ? 2400 : MAX_SIDE)
  if (blob.size > MAX_FILE) throw new Error(`"${file.name}" is too big (10 MB max).`)
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const entry = { id, name: file.name || (pdf ? 'file.pdf' : 'photo.jpg'), mimeType: pdf ? 'application/pdf' : 'image/jpeg' }
  if (DEMO || !supabase) return { ...entry, dataUrl: await blobToDataUrl(blob) }
  if (!orgId) throw new Error('Not signed in to a company yet. Reload and try again.')
  const path = `${orgId}/job-${proposalId}/${id}.${pdf ? 'pdf' : 'jpg'}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: entry.mimeType, upsert: false })
  if (error) throw new Error(/fetch|network/i.test(error.message) ? `No connection: "${entry.name}" did not upload. Try again.` : error.message)
  return { ...entry, path }
}

// Taking a file off a job also deletes it from storage (office and admins;
// for anyone else it just leaves the job's list).
export function deleteJobFile(d) {
  if (d?.path && supabase) supabase.storage.from(BUCKET).remove([d.path]).catch(() => {})
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

// The same viewable link, outside React (printing): the data URL, a link already
// fetched this visit, or a fresh 12-hour signed link. null when there is none.
export async function photoUrl(photo) {
  if (photo?.dataUrl) return photo.dataUrl
  const path = photo?.path
  if (!path || !supabase) return null
  if (_urls.has(path)) return _urls.get(path)
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 12 * 3600)
  if (data?.signedUrl) _urls.set(path, data.signedUrl)
  return data?.signedUrl || null
}
