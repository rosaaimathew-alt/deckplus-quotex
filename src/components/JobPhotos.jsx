// ── Photos tab (Jobs page) ───────────────────────────────────────────────────
// Every picture of a job in one place, viewed inside the app: the photos the
// office or PM added (kept on jobData.documents, lib/taskPhotos) and the ones
// the subs and painters sent from their phones (sub_tasks.photos).
import { useEffect, useRef, useState } from 'react'
import { Camera, ChevronLeft, ChevronRight, FileText, Loader, Trash2, X } from 'lucide-react'
import { useStore } from '../store'
import { deleteJobFile, jobPhotos, uploadJobFile, usePhotoUrl } from '../lib/taskPhotos'
import { subNameOf } from '../lib/subTasks'
import { PhotoDays } from './TaskPhotos'
import { btnPrimary } from '../pages/books/ui'

const dayOf = (iso) => {
  const d = new Date(iso)
  return isNaN(d) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dayName = (ymd) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : 'Earlier')

export function DocThumb({ doc, size = 'w-24 h-24', onOpen }) {
  const url = usePhotoUrl(doc)
  return (
    <button type="button" onClick={onOpen} className={`${size} shrink-0 rounded-lg overflow-hidden bg-gray-100 border border-gray-200`} aria-label={`Open ${doc.name || 'photo'}`}>
      {url ? <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" /> : null}
    </button>
  )
}

// A stored PDF (or any stored file): opens in a new tab from the app's own storage.
export function StoredLink({ doc, className = '', children }) {
  const url = usePhotoUrl(doc)
  return url
    ? <a href={url} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
    : <span className={className}>{children}</span>
}

// Full-size viewer over the page: arrows (and arrow keys) step through the list.
export function PhotoViewer({ docs, index, onIndex, onClose, onRemove }) {
  const doc = docs[index]
  const url = usePhotoUrl(doc)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight' && index < docs.length - 1) onIndex(index + 1)
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, docs.length, onClose, onIndex])
  if (!doc) return null
  const round = 'h-11 w-11 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/25'
  const stop = (fn) => (e) => { e.stopPropagation(); fn() }
  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-3" onClick={onClose} role="dialog" aria-label="Photo">
      {url ? <img src={url} alt={doc.name || ''} className="max-w-full max-h-full object-contain" /> : <Loader size={28} className="animate-spin text-white/70" />}
      <div className="absolute top-4 right-4 flex items-center gap-2">
        {onRemove && <button type="button" onClick={stop(() => onRemove(doc))} className={round} aria-label="Delete photo"><Trash2 size={18} /></button>}
        <button type="button" onClick={stop(onClose)} className={round} aria-label="Close"><X size={22} /></button>
      </div>
      {index > 0 && <button type="button" onClick={stop(() => onIndex(index - 1))} className={`${round} absolute left-3 top-1/2 -translate-y-1/2`} aria-label="Previous photo"><ChevronLeft size={24} /></button>}
      {index < docs.length - 1 && <button type="button" onClick={stop(() => onIndex(index + 1))} className={`${round} absolute right-3 top-1/2 -translate-y-1/2`} aria-label="Next photo"><ChevronRight size={24} /></button>}
      <p className="absolute bottom-4 inset-x-0 text-center text-xs text-white/70">{index + 1} of {docs.length}{doc.by ? ` · ${doc.by}` : ''}</p>
    </div>
  )
}

// canRemove: false for the paint PM, who adds photos but never deletes them.
export default function JobPhotosTab({ proposal, tasks = [], canRemove = true }) {
  const orgId = useStore(s => s.orgId)
  const me = useStore(s => s.me)
  const subs = useStore(s => s.subcontractors)
  const updateJobData = useStore(s => s.updateJobData)
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(null)   // index into photos

  const photos = jobPhotos(proposal)
  const inDrive = ((proposal.jobData || {}).documents || []).filter(d => d.link && !d.path && /^image\//.test(d.mimeType || '') && d.folder !== 'Receipts')
  const withPhotos = tasks.filter(t => (t.photos || []).length)
  const days = []
  for (const p of photos) {
    const day = dayOf(p.uploadedAt)
    if (!days.length || days[days.length - 1].day !== day) days.push({ day, list: [] })
    days[days.length - 1].list.push(p)
  }

  const latestDocs = () => (useStore.getState().proposals.find(p => String(p.id) === String(proposal.id))?.jobData || {}).documents || []
  const add = async (files) => {
    const list = [...(files || [])]
    if (!list.length) return
    setError(''); setBusy(list.length)
    const added = []
    try {
      for (const file of list) {
        const f = await uploadJobFile({ orgId, proposalId: proposal.id, file })
        added.push({ ...f, folder: 'Photos', shareMobile: false, uploadedAt: new Date().toISOString(), by: me?.displayName || me?.email || '' })
        setBusy(b => Math.max(1, b - 1))
      }
    } catch (e) {
      setError(e.message)
    } finally {
      if (added.length) updateJobData(proposal.id, { documents: [...latestDocs(), ...added] })
      setBusy(0)
    }
  }
  const remove = (d) => {
    if (!window.confirm('Delete this photo from the job?')) return
    setOpen(null)
    updateJobData(proposal.id, { documents: latestDocs().filter(x => x.id !== d.id) })
    deleteJobFile(d)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="flex-1" />
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { add(e.target.files); e.target.value = '' }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy}
          className={btnPrimary}>
          {busy ? <Loader size={14} className="animate-spin" /> : <Camera size={14} />} {busy ? `Adding ${busy}…` : 'Add photos'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      {!photos.length && !withPhotos.length && !inDrive.length && (
        <p className="text-center py-8 text-sm text-gray-400 border border-dashed border-gray-200 rounded-xl">No photos yet</p>
      )}
      {days.map(({ day, list }) => (
        <div key={day}>
          <p className="text-xs font-semibold text-gray-500 mb-1.5">{dayName(day)} · {list.length} photo{list.length > 1 ? 's' : ''}</p>
          <div className="flex flex-wrap gap-2">
            {list.map(p => <DocThumb key={p.id} doc={p} onOpen={() => setOpen(photos.indexOf(p))} />)}
          </div>
        </div>
      ))}
      {withPhotos.map(t => (
        <div key={t.id} className="border-t border-gray-100 pt-3">
          <p className="text-sm font-semibold text-gray-800 mb-1.5">{subNameOf(t, subs)}{t.title ? ` · ${t.title}` : ''}</p>
          <PhotoDays task={t} big />
        </div>
      ))}
      {inDrive.length > 0 && (
        <div className="border-t border-gray-100 pt-3 space-y-1">
          <p className="text-xs font-semibold text-gray-500">Still in Google Drive</p>
          {inDrive.map(d => (
            <a key={d.id} href={d.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-gray-700 hover:underline">
              <FileText size={14} className="text-gray-400 shrink-0" /><span className="truncate">{d.name}</span>
            </a>
          ))}
        </div>
      )}
      {open != null && <PhotoViewer docs={photos} index={open} onIndex={setOpen} onClose={() => setOpen(null)} onRemove={canRemove ? remove : undefined} />}
    </div>
  )
}
