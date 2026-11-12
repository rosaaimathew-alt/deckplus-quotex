// ── Job photos on a sub task ─────────────────────────────────────────────────
// Thumbnails grouped by day (tap for full size) and the "Take photos" button.
// Used by the sub app, the PM's phone Subs card and the Jobs page Subs tab.
import { useRef, useState } from 'react'
import { tr } from '../lib/lang'
import { Camera, X, Loader2 } from 'lucide-react'
import { useStore } from '../store'
import { photosByDay, uploadTaskPhoto, usePhotoUrl } from '../lib/taskPhotos'

const dayName = (ymd) => new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

function Thumb({ photo, size, onOpen }) {
  const url = usePhotoUrl(photo)
  return (
    <button type="button" onClick={() => url && onOpen(url)} className={`${size} shrink-0 rounded-lg overflow-hidden bg-gray-100 border border-gray-200`} aria-label="Open photo">
      {url ? <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" /> : null}
    </button>
  )
}

export function PhotoDays({ task, big = false, maxDays = 30 }) {
  const [open, setOpen] = useState(null)
  const days = photosByDay(task).slice(0, maxDays)
  if (!days.length) return null
  const size = big ? 'w-20 h-20' : 'w-14 h-14'
  return (
    <div className="space-y-2">
      {days.map(([day, list]) => (
        <div key={day}>
          <p className={`${big ? 'text-sm' : 'text-[11px]'} font-semibold text-gray-500 mb-1`}>{dayName(day)} · {list.length} photo{list.length > 1 ? 's' : ''}</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {list.map(p => <Thumb key={p.id} photo={p} size={size} onOpen={setOpen} />)}
          </div>
        </div>
      ))}
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-3" onClick={() => setOpen(null)}>
          <img src={open} alt="" className="max-w-full max-h-full object-contain" />
          <button type="button" onClick={() => setOpen(null)} className="absolute top-4 right-4 h-11 w-11 rounded-full bg-white/15 text-white flex items-center justify-center" aria-label="Close"><X size={22} /></button>
        </div>
      )}
    </div>
  )
}

// Opens the camera (or the photo library); several photos at once.
export function AddPhotosButton({ task, className = '', label = 'Take photos', onAdded }) {
  const orgId = useStore(s => s.orgId)
  const me = useStore(s => s.me)
  const addSubTaskPhoto = useStore(s => s.addSubTaskPhoto)
  const ref = useRef(null)
  const [busy, setBusy] = useState(0)
  const [err, setErr] = useState('')
  const add = async (files) => {
    const list = [...(files || [])]
    if (!list.length) return
    setErr(''); setBusy(list.length)
    let done = 0
    for (const file of list) {
      try {
        const photo = await uploadTaskPhoto({ orgId, task, file, by: me?.displayName || me?.email || '' })
        addSubTaskPhoto(task.id, photo)
        done++
      } catch (e) { setErr(e.message); break } finally { setBusy(b => Math.max(0, b - 1)) }
    }
    setBusy(0)
    if (done) onAdded?.(done)
  }
  return (
    <div className="space-y-1.5">
      <button type="button" onClick={() => ref.current?.click()} disabled={!!busy} className={className}>
        {busy ? <><Loader2 size={20} className="animate-spin" /> {tr('Sending')} {busy}…</> : <><Camera size={20} /> {label}</>}
      </button>
      <input ref={ref} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { add(e.target.files); e.target.value = '' }} />
      {err && <p className="text-sm text-red-600">{err}</p>}
    </div>
  )
}
