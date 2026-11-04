// ── Public project gallery ──────────────────────────────────────────────────
// What customers browse for ideas: every published project, searchable by what
// it looks like ("white ceiling", "A-frame roof", "gray decking") and filterable
// by tag. No sign-in. The address keeps the search (?q=…&tags=…&project=…) so a
// rep can text a customer exactly the projects they talked about.
//   ?embed=1  drops the header for an <iframe> on the company website
//   ?org=<id> picks the company when one deployment holds several
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, X, ChevronLeft, ChevronRight, ChevronDown, MapPin, Images, Link2, Check, Calendar, Sparkles } from 'lucide-react'
import { loadPublicGallery, indexProject, searchProjects, tagFacets, coverPhoto, publicUrl } from '../lib/gallery'

const EXAMPLES = ['white ceiling', 'A-frame roof', 'gray decking', 'black railing', 'screened porch', 'stone columns']
const fmtMonth = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '')

export default function Gallery() {
  const [params, setParams] = useSearchParams()
  const embed = params.get('embed') === '1'
  const org = params.get('org') || ''
  const [state, setState] = useState({ loading: true, error: '', company: {}, projects: [] })

  useEffect(() => {
    let alive = true
    loadPublicGallery(org)
      .then(d => { if (alive) setState({ loading: false, error: '', company: d.company, projects: d.projects }) })
      .catch(e => { if (alive) setState({ loading: false, error: e.message, company: {}, projects: [] }) })
    return () => { alive = false }
  }, [org])

  useEffect(() => { if (state.company?.name) document.title = `Project gallery · ${state.company.name}` }, [state.company])

  // URL is the source of truth for the search, so links can be shared
  const query = params.get('q') || ''
  const required = useMemo(() => (params.get('tags') || '').split('|').filter(Boolean), [params])
  const openId = params.get('project') || ''
  const update = (patch) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k) }
    setParams(next, { replace: true })
  }
  const [draft, setDraft] = useState(query)
  useEffect(() => {
    const t = setTimeout(() => { if (draft !== query) update({ q: draft.trim() ? draft : '' }) }, 250)
    return () => clearTimeout(t)
  })

  const indexed = useMemo(() => state.projects.map(indexProject), [state.projects])
  const results = useMemo(() => searchProjects(indexed, query, required), [indexed, query, required])
  const facets = useMemo(() => tagFacets(indexed), [indexed])
  const topTags = useMemo(() => facets.flatMap(g => g.tags).sort((a, b) => b.count - a.count).slice(0, 8).map(t => t.tag), [facets])

  const toggleTag = (tag) => {
    const has = required.some(t => t.toLowerCase() === tag.toLowerCase())
    const next = has ? required.filter(t => t.toLowerCase() !== tag.toLowerCase()) : [...required, tag]
    update({ tags: next.join('|') })
  }
  const clearAll = () => { setDraft(''); update({ q: '', tags: '' }) }

  const accent = state.company?.color || '#1191ad'
  const openIndex = results.findIndex(r => r.p.id === openId)
  const openProject = openIndex >= 0 ? results[openIndex] : (openId ? (() => { const p = indexed.find(x => x.id === openId); return p ? { p, m: { tags: [], photo: coverPhoto(p) } } : null })() : null)

  return (
    <div className="min-h-screen bg-white text-slate-900" style={{ '--accent': accent }}>
      {!embed && (
        <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-3">
            {state.company?.logo
              ? <img src={state.company.logo} alt={state.company.name || 'Logo'} className="h-9 w-auto max-w-[160px] object-contain" />
              : <span className="font-bold text-lg">{state.company?.name || ''}</span>}
            <span className="hidden sm:inline text-sm text-slate-400 border-l border-slate-200 pl-3">Project gallery</span>
            <a href="/book" className="ml-auto px-4 py-2 rounded-lg text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity" style={{ background: accent }}>
              Book a free estimate
            </a>
          </div>
        </header>
      )}

      {/* Search */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 sm:pt-12 pb-4">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Find your inspiration</h1>
        <p className="mt-2 text-slate-500 max-w-2xl">
          Browse porches, decks and outdoor spaces we’ve built. Search by what you love — a ceiling color, a roof style, the decking — and see every project that has it.
        </p>
        <div className="relative mt-5 max-w-2xl">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={`Try “${EXAMPLES[0]}” or “${EXAMPLES[1]}”`}
            aria-label="Search projects"
            className="w-full h-14 pl-12 pr-12 rounded-2xl border border-slate-200 bg-white text-base shadow-sm focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ '--tw-ring-color': accent }}
          />
          {draft && (
            <button type="button" onClick={() => { setDraft(''); update({ q: '' }) }} aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100">
              <X size={16} />
            </button>
          )}
        </div>
        {!query && !required.length && (topTags.length > 0 || indexed.length === 0) && (
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-slate-400 flex items-center gap-1"><Sparkles size={12} /> Popular:</span>
            {(topTags.length ? topTags : EXAMPLES).map(t => (
              <button key={t} type="button" onClick={() => toggleTag(t)}
                className="text-xs px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors">{t}</button>
            ))}
          </div>
        )}
      </section>

      {/* Filters */}
      {facets.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-2">
          <div className="flex flex-wrap gap-2">
            {facets.map(g => <FacetMenu key={g.key} group={g} selected={required} onToggle={toggleTag} accent={accent} />)}
          </div>
          {(required.length > 0 || query) && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {required.map(t => (
                <button key={t} type="button" onClick={() => toggleTag(t)}
                  className="flex items-center gap-1 text-xs font-medium pl-3 pr-2 py-1.5 rounded-full text-white" style={{ background: accent }}>
                  {t} <X size={12} />
                </button>
              ))}
              <button type="button" onClick={clearAll} className="text-xs font-medium text-slate-500 hover:text-slate-900 underline-offset-2 hover:underline">Clear all</button>
            </div>
          )}
        </section>
      )}

      {/* Results */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {state.loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="aspect-[4/3] rounded-2xl bg-slate-100 animate-pulse" />)}
          </div>
        ) : state.error ? (
          <p className="text-center text-slate-500 py-20">{state.error}</p>
        ) : indexed.length === 0 ? (
          <p className="text-center text-slate-500 py-20">New projects are on the way — check back soon.</p>
        ) : results.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-700 font-medium">No projects match {query ? `“${query}”` : 'those filters'} yet.</p>
            <p className="text-sm text-slate-500 mt-1">Try fewer words, or one of these:</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              {topTags.slice(0, 6).map(t => (
                <button key={t} type="button" onClick={() => { setDraft(''); update({ q: '', tags: t }) }}
                  className="text-xs px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200">{t}</button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-500 mb-4">
              {results.length} project{results.length !== 1 ? 's' : ''}{query || required.length ? ' match' : ''}
            </p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {results.map(({ p, m }) => (
                <ProjectCard key={p.id} p={p} m={m} accent={accent} onOpen={() => update({ project: p.id })} />
              ))}
            </div>
          </>
        )}
      </main>

      {!embed && !state.loading && indexed.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
          <div className="rounded-2xl p-6 sm:p-8 text-white flex flex-col sm:flex-row sm:items-center gap-4" style={{ background: accent }}>
            <div className="flex-1">
              <p className="text-xl font-bold">See something you love?</p>
              <p className="text-white/85 text-sm mt-1">Book a free estimate and bring your favorites — we’ll design yours around them.</p>
            </div>
            <a href="/book" className="px-5 py-3 rounded-xl bg-white text-sm font-semibold text-slate-900 hover:bg-slate-50 text-center">Book a free estimate</a>
          </div>
        </section>
      )}

      {openProject && (
        <ProjectViewer
          key={openProject.p.id}
          p={openProject.p}
          matched={openProject.m.tags}
          startPhoto={openProject.m.photo}
          accent={accent}
          position={openIndex >= 0 ? `${openIndex + 1} of ${results.length}` : ''}
          onStep={openIndex >= 0 && results.length > 1 ? (d) => update({ project: results[(openIndex + d + results.length) % results.length].p.id }) : null}
          onClose={() => update({ project: '' })}
          onTag={(t) => { update({ project: '', tags: [...new Set([...required, t])].join('|') }) }}
          showBook={!embed}
        />
      )}
    </div>
  )
}

function FacetMenu({ group, selected, onToggle, accent }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  const sel = new Set(selected.map(s => s.toLowerCase()))
  const n = group.tags.filter(t => sel.has(t.tag.toLowerCase())).length
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className={`h-9 pl-3.5 pr-2.5 rounded-full border text-sm flex items-center gap-1.5 transition-colors ${n ? 'text-white border-transparent' : 'border-slate-200 text-slate-700 hover:border-slate-400 bg-white'}`}
        style={n ? { background: accent } : undefined}>
        {group.label}{n > 0 && <span className="text-xs bg-white/25 rounded-full px-1.5">{n}</span>}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-2 w-64 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl p-1.5">
          {group.tags.map(({ tag, count }) => {
            const on = sel.has(tag.toLowerCase())
            return (
              <button key={tag} type="button" onClick={() => onToggle(tag)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-left hover:bg-slate-50">
                <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'border-transparent text-white' : 'border-slate-300'}`} style={on ? { background: accent } : undefined}>
                  {on && <Check size={11} />}
                </span>
                <span className="flex-1 text-slate-700">{tag}</span>
                <span className="text-xs text-slate-400 tabular-nums">{count}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ProjectCard({ p, m, accent, onOpen }) {
  const photo = m.photo || coverPhoto(p)
  const shown = m.tags.length ? m.tags : (p.tags || [])
  return (
    <button type="button" onClick={onOpen} className="group text-left focus:outline-none flex flex-col justify-start">
      <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 ring-offset-2 group-focus-visible:ring-2" style={{ '--tw-ring-color': accent }}>
        {photo
          ? <img src={publicUrl(photo.thumb || photo.path)} alt={photo.caption || p.title} loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          : <div className="w-full h-full flex items-center justify-center text-slate-300"><Images size={32} /></div>}
        {(p.photos || []).length > 1 && (
          <span className="absolute bottom-2 right-2 text-xs font-medium text-white bg-black/55 rounded-full px-2 py-0.5 flex items-center gap-1">
            <Images size={12} /> {p.photos.length}
          </span>
        )}
      </div>
      <div className="pt-3">
        <p className="font-semibold text-slate-900 group-hover:underline underline-offset-2">{p.title || 'Untitled project'}</p>
        {p.location && <p className="text-sm text-slate-500 flex items-center gap-1 mt-0.5"><MapPin size={13} /> {p.location}</p>}
        {shown.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {shown.slice(0, 4).map(t => (
              <span key={t} className={`text-xs px-2 py-0.5 rounded-full ${m.tags.includes(t) ? 'text-white' : 'bg-slate-100 text-slate-600'}`}
                style={m.tags.includes(t) ? { background: accent } : undefined}>{t}</span>
            ))}
            {shown.length > 4 && <span className="text-xs text-slate-400 py-0.5">+{shown.length - 4}</span>}
          </div>
        )}
      </div>
    </button>
  )
}

function ProjectViewer({ p, matched, startPhoto, accent, position, onStep, onClose, onTag, showBook }) {
  const photos = p.photos || []
  const [idx, setIdx] = useState(() => Math.max(0, photos.findIndex(ph => ph.id === startPhoto?.id)))
  const [copied, setCopied] = useState(false)
  const i = Math.min(idx, Math.max(0, photos.length - 1))
  const photo = photos[i]
  const go = (d) => photos.length && setIdx((i + d + photos.length) % photos.length)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  })

  // Swipe between photos on phones
  const touch = useRef(null)
  const onTouchStart = (e) => { touch.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    if (touch.current == null) return
    const dx = e.changedTouches[0].clientX - touch.current
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1)
    touch.current = null
  }

  const share = async () => {
    try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* blocked */ }
  }
  const projectTags = p.tags || []
  const photoTags = photo?.tags || []

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-stretch sm:items-center justify-center sm:p-6" role="dialog" aria-modal="true" aria-label={p.title}>
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative bg-white w-full max-w-6xl sm:rounded-2xl overflow-hidden flex flex-col lg:flex-row max-h-full">
        {/* Photo */}
        <div className="relative bg-black lg:flex-1 flex items-center justify-center min-h-[45vh] lg:min-h-[70vh]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {photo
            ? <img key={photo.id} src={publicUrl(photo.path)} alt={photo.caption || p.title} className="max-h-[60vh] lg:max-h-[85vh] w-full object-contain" />
            : <Images size={40} className="text-white/30" />}
          {photos.length > 1 && (
            <>
              <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/85 hover:bg-white text-slate-800 shadow"><ChevronLeft size={20} /></button>
              <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/85 hover:bg-white text-slate-800 shadow"><ChevronRight size={20} /></button>
              <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs text-white bg-black/55 rounded-full px-2.5 py-0.5">{i + 1} / {photos.length}</span>
            </>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className="absolute top-3 right-3 p-2 rounded-full bg-white/85 hover:bg-white text-slate-800 shadow lg:hidden"><X size={18} /></button>
        </div>

        {/* Details */}
        <div className="lg:w-[360px] flex flex-col overflow-y-auto">
          <div className="flex items-center gap-1 px-4 pt-3">
            {onStep && (
              <>
                <button type="button" onClick={() => onStep(-1)} className="text-xs text-slate-500 hover:text-slate-900 flex items-center px-1.5 py-1 rounded hover:bg-slate-100"><ChevronLeft size={14} /> Prev</button>
                <button type="button" onClick={() => onStep(1)} className="text-xs text-slate-500 hover:text-slate-900 flex items-center px-1.5 py-1 rounded hover:bg-slate-100">Next <ChevronRight size={14} /></button>
                <span className="text-xs text-slate-400 ml-1">{position}</span>
              </>
            )}
            <button type="button" onClick={onClose} aria-label="Close" className="ml-auto p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hidden lg:block"><X size={18} /></button>
          </div>
          <div className="px-5 pb-5 pt-2">
            <h2 className="text-xl font-bold text-slate-900">{p.title || 'Untitled project'}</h2>
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-sm text-slate-500">
              {p.location && <span className="flex items-center gap-1"><MapPin size={13} /> {p.location}</span>}
              {p.completedOn && <span className="flex items-center gap-1"><Calendar size={13} /> {fmtMonth(p.completedOn)}</span>}
            </div>
            {photo?.caption && <p className="mt-3 text-sm text-slate-700 italic">{photo.caption}</p>}
            {p.summary && <p className="mt-3 text-sm text-slate-600 leading-relaxed whitespace-pre-line">{p.summary}</p>}

            {photoTags.length > 0 && <TagList title="In this photo" tags={photoTags} matched={matched} accent={accent} onTag={onTag} />}
            {projectTags.length > 0 && <TagList title="This project" tags={projectTags} matched={matched} accent={accent} onTag={onTag} />}

            {photos.length > 1 && (
              <div className="mt-5 grid grid-cols-5 gap-1.5">
                {photos.map((ph, n) => (
                  <button key={ph.id} type="button" onClick={() => setIdx(n)} aria-label={`Photo ${n + 1}`}
                    className={`aspect-square rounded-md overflow-hidden ring-2 ${n === i ? '' : 'ring-transparent opacity-70 hover:opacity-100'}`}
                    style={n === i ? { '--tw-ring-color': accent } : undefined}>
                    <img src={publicUrl(ph.thumb || ph.path)} alt="" loading="lazy" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-2">
              {showBook && (
                <a href="/book" className="w-full text-center px-4 py-3 rounded-xl text-sm font-semibold text-white hover:opacity-90" style={{ background: accent }}>
                  I love this — book a free estimate
                </a>
              )}
              <button type="button" onClick={share} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {copied ? <><Check size={15} className="text-green-600" /> Link copied</> : <><Link2 size={15} /> Copy link to this project</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function TagList({ title, tags, matched, accent, onTag }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map(t => {
          const hit = matched.includes(t)
          return (
            <button key={t} type="button" onClick={() => onTag(t)} title={`Show every project with ${t.toLowerCase()}`}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${hit ? 'text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              style={hit ? { background: accent } : undefined}>{t}</button>
          )
        })}
      </div>
    </div>
  )
}
