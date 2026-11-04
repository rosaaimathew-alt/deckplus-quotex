// ── Gallery (staff) ─────────────────────────────────────────────────────────
// Where the office builds the public project gallery: add finished projects,
// upload and fine-tune photos (brightness, contrast, color, warmth, rotate),
// and tag what's in them so customers can search "white ceiling" or
// "A-frame roof" on /gallery. Every change saves on its own.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus, Images, ExternalLink, Link2, Check, X, Upload, Trash2, ChevronLeft, ChevronRight, SlidersHorizontal,
  Star, Eye, EyeOff, Tag, Wand2, RotateCw, Loader2, Search, Code2,
} from 'lucide-react'
import { useStore } from '../store'
import {
  TAG_GROUPS, groupOfTag, galleryReady, listGallery, createGalleryProject, saveGalleryProject, deleteGalleryProject,
  uploadPhoto, saveAdjustedPhoto, removePhotoFiles, publicUrl, previewFilter, autoAdjust, DEFAULT_ADJUST,
  indexProject, searchProjects,
} from '../lib/gallery'

const galleryLink = () => `${window.location.origin}/gallery`

export default function GalleryAdmin() {
  const orgId = useStore(s => s.orgId)
  const [projects, setProjects] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState('')

  useEffect(() => {
    if (!galleryReady || !orgId) return
    let alive = true
    listGallery(orgId)
      .then(list => { if (alive) { setProjects(list); setLoaded(true) } })
      .catch(e => { if (alive) { setError(e.message); setLoaded(true) } })
    return () => { alive = false }
  }, [orgId])

  const replace = useCallback((p) => setProjects(list => list.map(x => (x.id === p.id ? p : x))), [])
  const editing = projects.find(p => p.id === editingId) || null

  const addProject = async () => {
    try {
      const p = await createGalleryProject(orgId, { title: '' })
      setProjects(list => [p, ...list])
      setEditingId(p.id)
    } catch (e) { setError(e.message) }
  }

  const closeEditor = async (p) => {
    setEditingId(null)
    // Nothing entered → don't leave an empty project behind
    if (p && !p.title.trim() && !(p.photos || []).length && !(p.tags || []).length) {
      setProjects(list => list.filter(x => x.id !== p.id))
      deleteGalleryProject(p).catch(() => {})
    }
  }

  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(''), 1800) } catch { /* blocked */ }
  }

  // Try the customer search right here
  const indexed = useMemo(() => projects.map(indexProject), [projects])
  const shown = useMemo(() => (search.trim() ? searchProjects(indexed, search).map(r => r.p) : indexed), [indexed, search])
  const published = projects.filter(p => p.published).length
  const loading = !loaded && !!orgId

  if (!galleryReady) {
    return <Notice>The gallery needs the Supabase connection (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).</Notice>
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="qx-hide-embedded text-2xl font-bold text-gray-900">Project gallery</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {projects.length} project{projects.length !== 1 ? 's' : ''} · {published} live for customers
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href="/gallery" target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
            <ExternalLink size={14} /> Open gallery
          </a>
          <button type="button" onClick={() => copy(galleryLink(), 'link')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
            {copied === 'link' ? <Check size={14} className="text-green-600" /> : <Link2 size={14} />} Copy link
          </button>
          <button type="button" title="Code to put the gallery on your website"
            onClick={() => copy(`<iframe src="${galleryLink()}?embed=1" style="width:100%;height:1400px;border:0" title="Project gallery" loading="lazy"></iframe>`, 'embed')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50">
            {copied === 'embed' ? <Check size={14} className="text-green-600" /> : <Code2 size={14} />} Website code
          </button>
          <button type="button" onClick={addProject} disabled={!orgId || !!error}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--brand-600)] hover:bg-[var(--brand-700)] disabled:opacity-50">
            <Plus size={15} /> Add project
          </button>
        </div>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {projects.length > 0 && (
        <div className="relative mb-4 max-w-xl">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} aria-label="Search like a customer"
            placeholder="Search like a customer: “white ceiling”, “A-frame roof”…"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]" />
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="aspect-[4/3] rounded-xl bg-gray-100 animate-pulse" />)}</div>
      ) : projects.length === 0 && !error ? (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
          <Images size={36} className="mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-700">Show customers your best work</p>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">Add a finished project, upload its photos and tag what’s in them. Customers can then search the gallery for exactly the look they want.</p>
          <button type="button" onClick={addProject} className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--brand-600)] hover:bg-[var(--brand-700)]">
            <Plus size={15} /> Add your first project
          </button>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-sm text-gray-500 py-10 text-center">No projects match “{search}”. Customers searching this would see nothing — tag a project with it.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map(p => (
            <button key={p.id} type="button" onClick={() => setEditingId(p.id)}
              className="group text-left bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:border-[var(--brand-300)] hover:shadow-md transition-all flex flex-col justify-start">
              <div className="relative aspect-[4/3] bg-gray-100">
                {p.photos[0]
                  ? <img src={publicUrl(p.photos[0].thumb || p.photos[0].path)} alt="" loading="lazy" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-gray-300"><Images size={28} /></div>}
                <span className={`absolute top-2 left-2 text-[11px] font-semibold px-2 py-0.5 rounded-full ${p.published ? 'bg-green-600 text-white' : 'bg-white/90 text-gray-600'}`}>
                  {p.published ? 'Live' : 'Hidden'}
                </span>
                {p.featured && <span className="absolute top-2 right-2 p-1 rounded-full bg-amber-400 text-white"><Star size={11} fill="currentColor" /></span>}
              </div>
              <div className="p-3">
                <p className="font-semibold text-gray-900 truncate">{p.title || <span className="text-gray-400 italic">Untitled project</span>}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {p.photos.length} photo{p.photos.length !== 1 ? 's' : ''} · {p.allTags.length} tag{p.allTags.length !== 1 ? 's' : ''}{p.location ? ` · ${p.location}` : ''}
                </p>
                {p.published && !p.photos.length && <p className="text-[11px] text-amber-600 mt-1">Live with no photos — add some</p>}
                {p.photos.length > 0 && p.allTags.length === 0 && <p className="text-[11px] text-amber-600 mt-1">No tags yet — customers can’t find it by search</p>}
              </div>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <ProjectEditor key={editing.id} project={editing} orgId={orgId} allProjects={projects}
          onSaved={replace} onClose={closeEditor}
          onDelete={async (p) => { setEditingId(null); setProjects(list => list.filter(x => x.id !== p.id)); try { await deleteGalleryProject(p) } catch (e) { setError(e.message) } }} />
      )}
    </div>
  )
}

function Notice({ children, tone }) {
  return <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-600'}`}>{children}</div>
}

// ── Editor ──────────────────────────────────────────────────────────────────
function ProjectEditor({ project, orgId, allProjects, onSaved, onClose, onDelete }) {
  const [p, setP] = useState(project)
  const [status, setStatus] = useState('saved')       // saved | saving | error
  const [uploads, setUploads] = useState(0)
  const [err, setErr] = useState('')
  const [tagging, setTagging] = useState(null)         // photo id
  const [adjusting, setAdjusting] = useState(null)     // photo id
  const [dragOver, setDragOver] = useState(false)
  const latest = useRef(p)
  const timer = useRef(null)
  const fileRef = useRef(null)

  const persist = useCallback(async () => {
    clearTimeout(timer.current)
    setStatus('saving')
    try {
      const saved = await saveGalleryProject(latest.current)
      onSaved(saved)
      setStatus('saved')
    } catch (e) { setStatus('error'); setErr(e.message) }
  }, [onSaved])

  // Every edit saves itself shortly after
  const change = (patch, now = false) => {
    setP(prev => {
      const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }
      latest.current = next
      return next
    })
    setStatus('saving')
    clearTimeout(timer.current)
    timer.current = setTimeout(persist, now ? 0 : 700)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  const close = async () => {
    await persist()
    onClose(latest.current)
  }
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !tagging && !adjusting) close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const addFiles = async (files) => {
    const list = [...files].filter(f => /^image\//.test(f.type))
    if (!list.length) return
    setErr('')
    setUploads(n => n + list.length)
    for (const f of list) {
      try {
        const ph = await uploadPhoto(orgId, p.id, f)
        change(prev => ({ photos: [...prev.photos, ph] }), true)
      } catch (e) { setErr(`${f.name}: ${e.message}`) }
      setUploads(n => n - 1)
    }
  }

  const setPhoto = (id, patch) => change(prev => ({ photos: prev.photos.map(ph => (ph.id === id ? { ...ph, ...patch } : ph)) }))
  const movePhoto = (i, d) => change(prev => {
    const photos = [...prev.photos]
    const j = d === 'first' ? 0 : i + d
    if (j < 0 || j >= photos.length) return {}
    const [ph] = photos.splice(i, 1)
    photos.splice(j, 0, ph)
    return { photos }
  }, true)
  const deletePhoto = (ph) => {
    if (!window.confirm('Remove this photo from the project?')) return
    change(prev => ({ photos: prev.photos.filter(x => x.id !== ph.id) }), true)
    removePhotoFiles([ph])
  }

  // Custom tags the team has used elsewhere — offered alongside the presets
  const knownCustom = useMemo(() => [...new Set(allProjects.flatMap(x => [...(x.tags || []), ...(x.photos || []).flatMap(ph => ph.tags || [])]))]
    .filter(t => groupOfTag(t) === 'other'), [allProjects])

  const tagPhoto = p.photos.find(ph => ph.id === tagging)
  const adjustPhoto = p.photos.find(ph => ph.id === adjusting)

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Edit gallery project">
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <div className="relative w-full max-w-4xl h-full bg-white shadow-2xl flex flex-col">
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
          <p className="font-semibold text-gray-900 truncate flex-1">{p.title || 'New project'}</p>
          <span className="text-xs text-gray-400 flex items-center gap-1">
            {uploads > 0 ? <><Loader2 size={12} className="animate-spin" /> Uploading {uploads}…</>
              : status === 'saving' ? <><Loader2 size={12} className="animate-spin" /> Saving…</>
              : status === 'error' ? <span className="text-red-600">Not saved</span>
              : <><Check size={12} className="text-green-600" /> Saved</>}
          </span>
          <button type="button" onClick={close} aria-label="Close" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {err && <Notice tone="error">{err}</Notice>}

          {/* Visibility */}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => change({ published: !p.published }, true)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border ${p.published ? 'bg-green-50 border-green-200 text-green-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              {p.published ? <><Eye size={14} /> Live for customers</> : <><EyeOff size={14} /> Hidden — click to publish</>}
            </button>
            <button type="button" onClick={() => change({ featured: !p.featured }, true)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border ${p.featured ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <Star size={14} fill={p.featured ? 'currentColor' : 'none'} /> {p.featured ? 'Featured first' : 'Feature'}
            </button>
          </div>

          {/* Details */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Project name" className="sm:col-span-2">
              <input value={p.title} onChange={e => change({ title: e.target.value })} placeholder="e.g. Screened porch with vaulted white ceiling"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]" autoFocus={!p.title} />
            </Field>
            <Field label="Area (shown to customers)">
              <input value={p.location} onChange={e => change({ location: e.target.value })} placeholder="e.g. Huntersville, NC — never the street address"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]" />
            </Field>
            <Field label="Finished">
              <input type="date" value={p.completedOn || ''} onChange={e => change({ completedOn: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]" />
            </Field>
            <Field label="About this project" className="sm:col-span-2">
              <textarea value={p.summary} onChange={e => change({ summary: e.target.value })} rows={3}
                placeholder="What the homeowner wanted, the materials and colors, what makes it special."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]" />
            </Field>
          </div>

          {/* Project tags */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900">What’s in this project</h3>
            <p className="text-xs text-gray-500 mb-2">Customers find projects by these. Tag the whole build here; tag single photos below so the right photo shows first.</p>
            <TagPicker value={p.tags} onChange={(tags) => change({ tags })} known={knownCustom} />
          </section>

          {/* Photos */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900">Photos <span className="text-gray-400 font-normal">· the first one is the cover</span></h3>
              <button type="button" onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[var(--brand-600)] hover:bg-[var(--brand-700)]">
                <Upload size={13} /> Add photos
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            </div>
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
              className={`rounded-xl border-2 border-dashed p-3 transition-colors ${dragOver ? 'border-[var(--brand-400)] bg-[var(--brand-50)]' : 'border-gray-200'}`}>
              {p.photos.length === 0 && uploads === 0 ? (
                <button type="button" onClick={() => fileRef.current?.click()} className="w-full py-10 text-center text-sm text-gray-500">
                  <Upload size={22} className="mx-auto mb-2 text-gray-300" />
                  Drop photos here or click to choose. Big phone photos are resized automatically.
                </button>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {p.photos.map((ph, i) => (
                    <div key={ph.id} className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                      <div className="relative aspect-[4/3] bg-gray-100 group">
                        <img src={publicUrl(ph.thumb || ph.path)} alt="" className="w-full h-full object-cover" />
                        {i === 0 && <span className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/60 text-white">COVER</span>}
                        <div className="absolute top-1.5 right-1.5 flex gap-1">
                          <IconBtn label="Move left" onClick={() => movePhoto(i, -1)} disabled={i === 0}><ChevronLeft size={13} /></IconBtn>
                          <IconBtn label="Move right" onClick={() => movePhoto(i, 1)} disabled={i === p.photos.length - 1}><ChevronRight size={13} /></IconBtn>
                          {i > 0 && <IconBtn label="Make cover" onClick={() => movePhoto(i, 'first')}><Star size={12} /></IconBtn>}
                          <IconBtn label="Remove photo" onClick={() => deletePhoto(ph)}><Trash2 size={12} /></IconBtn>
                        </div>
                      </div>
                      <div className="p-2 space-y-1.5">
                        <input value={ph.caption || ''} onChange={e => setPhoto(ph.id, { caption: e.target.value })} placeholder="Caption (optional)"
                          className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-[var(--brand-300)]" />
                        <div className="flex flex-wrap gap-1 min-h-[20px]">
                          {(ph.tags || []).map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{t}</span>)}
                        </div>
                        <div className="flex gap-1.5">
                          <button type="button" onClick={() => setTagging(ph.id)} className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded border border-gray-200 text-[11px] font-medium text-gray-700 hover:bg-gray-50">
                            <Tag size={11} /> Tags{ph.tags?.length ? ` (${ph.tags.length})` : ''}
                          </button>
                          <button type="button" onClick={() => setAdjusting(ph.id)} className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded border border-gray-200 text-[11px] font-medium text-gray-700 hover:bg-gray-50">
                            <SlidersHorizontal size={11} /> Fine-tune
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {uploads > 0 && Array.from({ length: uploads }).map((_, n) => (
                    <div key={`up${n}`} className="aspect-[4/3] rounded-lg bg-gray-100 flex items-center justify-center text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <div className="pt-2 border-t border-gray-100">
            <button type="button" onClick={() => { if (window.confirm('Delete this project and its photos? This can’t be undone.')) onDelete(latest.current) }}
              className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700">
              <Trash2 size={14} /> Delete project
            </button>
          </div>
        </div>
      </div>

      {tagPhoto && (
        <Modal title="Tag this photo" onClose={() => setTagging(null)}>
          <img src={publicUrl(tagPhoto.thumb || tagPhoto.path)} alt="" className="w-full max-h-56 object-cover rounded-lg mb-3" />
          <p className="text-xs text-gray-500 mb-2">Pick what this photo shows. A customer searching “white ceiling” will open the project on the photo tagged White ceiling.</p>
          <TagPicker value={tagPhoto.tags || []} onChange={(tags) => setPhoto(tagPhoto.id, { tags })} known={knownCustom}
            suggest={p.tags} />
        </Modal>
      )}

      {adjustPhoto && (
        <PhotoAdjuster photo={adjustPhoto} onClose={() => setAdjusting(null)}
          onSave={async (adjust) => {
            const next = await saveAdjustedPhoto(orgId, p.id, adjustPhoto, adjust)
            change(prev => ({ photos: prev.photos.map(x => (x.id === next.id ? next : x)) }), true)
            setAdjusting(null)
          }} />
      )}
    </div>
  )
}

function Field({ label, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  )
}

function IconBtn({ label, onClick, disabled, children }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className="p-1 rounded bg-white/90 text-gray-700 hover:bg-white shadow-sm disabled:opacity-30">
      {children}
    </button>
  )
}

function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-full flex flex-col`}>
        <div className="flex items-center px-4 py-3 border-b border-gray-100">
          <p className="font-semibold text-gray-900 flex-1">{title}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="p-4 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ── Tags ────────────────────────────────────────────────────────────────────
function TagPicker({ value = [], onChange, known = [], suggest = [] }) {
  const [custom, setCustom] = useState('')
  const has = (t) => value.some(v => v.toLowerCase() === t.toLowerCase())
  const toggle = (t) => onChange(has(t) ? value.filter(v => v.toLowerCase() !== t.toLowerCase()) : [...value, t])
  const addCustom = () => {
    const t = custom.trim().replace(/\s+/g, ' ')
    if (!t) return
    const nice = t.charAt(0).toUpperCase() + t.slice(1)
    if (!has(nice)) onChange([...value, nice])
    setCustom('')
  }
  const extra = [...new Set([...suggest.filter(t => !has(t)), ...known])]
  const chip = (t) => (
    <button key={t} type="button" onClick={() => toggle(t)} aria-pressed={has(t)}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${has(t)
        ? 'bg-[var(--brand-600)] border-[var(--brand-600)] text-white'
        : 'border-gray-200 text-gray-600 hover:border-gray-400 bg-white'}`}>
      {t}
    </button>
  )
  return (
    <div className="space-y-2.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pb-2 border-b border-gray-100">
          {value.map(t => (
            <button key={t} type="button" onClick={() => toggle(t)}
              className="text-xs pl-2.5 pr-1.5 py-1 rounded-full bg-[var(--brand-600)] text-white flex items-center gap-1">
              {t} <X size={11} />
            </button>
          ))}
        </div>
      )}
      {extra.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{suggest.length ? 'From this project & your own' : 'Your own tags'}</p>
          <div className="flex flex-wrap gap-1.5">{extra.map(chip)}</div>
        </div>
      )}
      {TAG_GROUPS.map(g => (
        <div key={g.key}>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{g.label}</p>
          <div className="flex flex-wrap gap-1.5">{g.tags.map(chip)}</div>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <input value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
          placeholder="Add your own, e.g. Cedar ceiling, Sherwin-Williams Agreeable Gray"
          className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]" />
        <button type="button" onClick={addCustom} disabled={!custom.trim()}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40">Add</button>
      </div>
    </div>
  )
}

// ── Fine-tune a photo ───────────────────────────────────────────────────────
const SLIDERS = [
  { key: 'brightness', label: 'Brightness' },
  { key: 'contrast',   label: 'Contrast' },
  { key: 'saturation', label: 'Color' },
  { key: 'warmth',     label: 'Warmth' },
]

function PhotoAdjuster({ photo, onClose, onSave }) {
  const [a, setA] = useState({ ...DEFAULT_ADJUST, ...(photo.adjust || {}) })
  const [before, setBefore] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const src = publicUrl(photo.original || photo.path)
  const turn = ((a.rotate || 0) % 360 + 360) % 360

  const auto = async () => {
    setBusy('auto'); setErr('')
    try { setA({ ...(await autoAdjust(src)), rotate: a.rotate || 0 }) } catch (e) { setErr(e.message) }
    setBusy('')
  }
  const save = async () => {
    setBusy('save'); setErr('')
    try { await onSave(a) } catch (e) { setErr(e.message); setBusy('') }
  }

  return (
    <Modal title="Fine-tune photo" onClose={busy === 'save' ? () => {} : onClose} wide>
      <div className="relative bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center h-[42vh] select-none"
        onPointerDown={() => setBefore(true)} onPointerUp={() => setBefore(false)} onPointerLeave={() => setBefore(false)}>
        <img src={src} alt="" crossOrigin="anonymous" draggable={false}
          className="max-w-full max-h-full object-contain transition-[filter] duration-100"
          style={{ filter: before ? 'none' : previewFilter(a), transform: `rotate(${before ? 0 : turn}deg)`, maxHeight: turn % 180 ? '42vw' : undefined }} />
        <span className="absolute bottom-2 left-2 text-[11px] text-white/80 bg-black/50 rounded px-2 py-0.5">{before ? 'Before' : 'Press and hold to compare'}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {SLIDERS.map(s => (
          <label key={s.key} className="block">
            <span className="flex justify-between text-xs text-gray-600 mb-1"><span>{s.label}</span><span className="tabular-nums text-gray-400">{a[s.key] > 0 ? '+' : ''}{a[s.key]}</span></span>
            <input type="range" min={-50} max={50} value={a[s.key]} onChange={e => setA(x => ({ ...x, [s.key]: Number(e.target.value) }))}
              onDoubleClick={() => setA(x => ({ ...x, [s.key]: 0 }))} className="w-full accent-[var(--brand-600)]" />
          </label>
        ))}
      </div>
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={auto} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {busy === 'auto' ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Auto-enhance
        </button>
        <button type="button" onClick={() => setA(x => ({ ...x, rotate: (x.rotate || 0) + 90 }))} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <RotateCw size={14} /> Rotate
        </button>
        <button type="button" onClick={() => setA({ ...DEFAULT_ADJUST })} disabled={!!busy} className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-gray-800">Reset</button>
        <div className="flex-1" />
        <button type="button" onClick={onClose} disabled={busy === 'save'} className="px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
        <button type="button" onClick={save} disabled={!!busy} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--brand-600)] hover:bg-[var(--brand-700)] disabled:opacity-60">
          {busy === 'save' ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save photo'}
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mt-2">Edits always start from the original upload, so you can come back and change them any time.</p>
    </Modal>
  )
}
