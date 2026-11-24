// ── Job chat ────────────────────────────────────────────────────────────────
// The conversation between a sub's manager and the Deck Plus PM about one
// job (lib/subChat). Shown on the sub manager's job screen, on the PM's job
// screen in Field mode and on the job's Subs tab in the office.
import { useEffect, useRef, useState } from 'react'
import { Send, MessageSquare, ChevronDown, Camera, X, Loader2 } from 'lucide-react'
import { useStore } from '../store'
import { threadOf, markChatSeen, chatTime, unreadCount } from '../lib/subChat'
import { tasksForJob, subNameOf } from '../lib/subTasks'
import { uploadChatPhoto } from '../lib/taskPhotos'
import { Thumb } from './TaskPhotos'
import ZoomImage from './ZoomImage'
import { tr } from '../lib/lang'

// side: 'pm' (Deck Plus staff) or 'sub' (the sub's manager).  big: phone-sized controls.
export default function JobChat({ proposalId, subId, subUserId, client = '', side, big = false, placeholder }) {
  const messages = useStore(s => s.subMessages)
  const addSubMessage = useStore(s => s.addSubMessage)
  const thread = threadOf(messages, proposalId, subId)
  const [text, setText] = useState('')
  const end = useRef(null)
  const last = thread[thread.length - 1]?.at || ''
  // Photos: stored with this sub's booking on the job (their latest), so both sides can open them
  const orgId = useStore(s => s.orgId)
  const booking = tasksForJob(useStore(s => s.subTasks), proposalId)
    .filter(t => t && String(t.subId) === String(subId) && (!subUserId || !t.subUserId || String(t.subUserId) === String(subUserId)))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0]
  const [pics, setPics] = useState([])        // uploaded, waiting to be sent
  const [uploading, setUploading] = useState(0)
  const [picError, setPicError] = useState('')
  const [open, setOpen] = useState(null)      // a photo opened full screen
  const fileRef = useRef(null)
  const addPhotos = async (files) => {
    const list = [...(files || [])].slice(0, Math.max(0, 6 - pics.length))
    if (!list.length) return
    setPicError(''); setUploading(n => n + list.length)
    for (const file of list) {
      try {
        const p = await uploadChatPhoto({ orgId, taskId: booking?.id, file })
        setPics(cur => [...cur, p].slice(0, 6))
      } catch (e) { setPicError(tr(e.message || 'The photo did not upload.')) }
      setUploading(n => n - 1)
    }
  }

  // Having it open is having read it; keep the newest message in view.
  useEffect(() => {
    if (last) markChatSeen(proposalId, subId, last)
    end.current?.scrollIntoView?.({ block: 'nearest' })
  }, [proposalId, subId, last])

  const send = (e) => {
    e?.preventDefault?.()
    const t = text.trim()
    if ((!t && !pics.length) || uploading) return
    addSubMessage({ proposalId, subId, subUserId, client, from: side, text: t, photos: pics })
    setText(''); setPics([])
  }

  return (
    <div className="space-y-2">
      {thread.length > 0 && (
        <ul aria-label="Messages" className={`space-y-1.5 overflow-y-auto pr-1 ${big ? 'max-h-80' : 'max-h-64'}`}>
          {thread.map(m => {
            const mine = m.from === side
            return (
              <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${mine ? 'bg-[var(--brand-600)] text-white' : 'bg-gray-100 text-gray-900'}`}>
                  {(m.photos || []).length > 0 && (
                    <div className="flex flex-wrap gap-1.5 py-1">
                      {m.photos.map(p => <Thumb key={p.id} photo={p} size={big ? 'w-24 h-24' : 'w-20 h-20'} onOpen={setOpen} />)}
                    </div>
                  )}
                  {m.text && <p className={`${big ? 'text-base' : 'text-sm'} whitespace-pre-wrap break-words`}>{m.text}</p>}
                  <p className={`text-[11px] mt-0.5 ${mine ? 'text-white/80' : 'text-gray-500'}`}>{mine ? '' : `${m.byName || (m.from === 'pm' ? 'Deck Plus' : 'Sub')} · `}{chatTime(m.at)}</p>
                </div>
              </li>
            )
          })}
          <li ref={end} aria-hidden="true" />
        </ul>
      )}
      {(pics.length > 0 || uploading > 0) && (
        <div className="flex flex-wrap gap-1.5" aria-label="Photos to send">
          {pics.map(p => (
            <div key={p.id} className="relative">
              <Thumb photo={p} size="w-16 h-16" onOpen={setOpen} />
              <button type="button" onClick={() => setPics(cur => cur.filter(x => x.id !== p.id))} aria-label="Remove photo"
                className="absolute -top-1.5 -right-1.5 h-6 w-6 rounded-full bg-gray-800 text-white flex items-center justify-center"><X size={13} /></button>
            </div>
          ))}
          {uploading > 0 && <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center"><Loader2 size={18} className="animate-spin text-gray-400" /></div>}
        </div>
      )}
      {picError && <p className="text-sm text-red-600">{picError}</p>}
      <form onSubmit={send} className="flex items-end gap-2">
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={pics.length + uploading >= 6} aria-label={tr('Add a photo')} title={tr('Add a photo')}
          className={`shrink-0 rounded-xl border border-gray-300 bg-white text-gray-600 hover:text-[var(--brand-700)] disabled:opacity-40 flex items-center justify-center ${big ? 'h-12 w-12' : 'h-8 w-8'}`}>
          <Camera size={big ? 20 : 15} />
        </button>
        <textarea value={text} onChange={e => setText(e.target.value.slice(0, 2000))} rows={1} aria-label="Message"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !big) send(e) }}
          placeholder={placeholder || tr('Write a message…')}
          className={`flex-1 min-w-0 resize-none rounded-xl border border-gray-300 bg-white text-gray-900 outline-none focus:border-[var(--brand-600)] ${big ? 'min-h-12 px-3 py-3 text-base' : 'px-2.5 py-1.5 text-sm'}`} />
        <button type="submit" disabled={(!text.trim() && !pics.length) || uploading > 0} aria-label="Send message"
          className={`shrink-0 rounded-xl bg-[var(--brand-600)] text-white font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5 ${big ? 'h-12 px-4 text-base' : 'h-8 px-3 text-xs'}`}>
          <Send size={big ? 18 : 13} /> {tr('Send')}
        </button>
      </form>
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-3" role="dialog" aria-label="Photo">
          <ZoomImage key={open} src={open} onTap={() => setOpen(null)} />
          <button type="button" onClick={() => setOpen(null)} className="absolute top-4 right-4 h-11 w-11 rounded-full bg-white/15 text-white flex items-center justify-center" aria-label="Close"><X size={22} /></button>
        </div>
      )}
    </div>
  )
}

// Deck Plus side: one conversation per sub booked on the job (subs with an
// app login), each folded shut until opened, with a count of new messages.
export function SubChats({ proposal, big = false }) {
  const tasks = tasksForJob(useStore(s => s.subTasks), proposal.id)
  const subs = useStore(s => s.subcontractors)
  const messages = useStore(s => s.subMessages)
  const chatMissing = useStore(s => s.chatMissing)   // the chat table isn't in this database yet
  const [open, setOpen] = useState(null)
  const seen = new Set()
  const threads = tasks.filter(t => t && !t.paint && t.subUserId && !seen.has(String(t.subId)) && seen.add(String(t.subId)))
  if (!threads.length || chatMissing) return null
  return (
    <div className="space-y-2">
      <p className={`${big ? 'text-base' : 'text-xs'} font-semibold text-gray-900 flex items-center gap-1.5`}><MessageSquare size={big ? 18 : 13} className="text-gray-500" /> Messages</p>
      {threads.map(t => {
        const id = String(t.subId)
        const name = subNameOf(t, subs)
        const isOpen = open === id
        const unread = isOpen ? 0 : unreadCount(messages, proposal.id, t.subId, 'pm')
        const count = threadOf(messages, proposal.id, t.subId).length
        return (
          <div key={id} className={`border rounded-xl ${unread ? 'border-[var(--brand-600)]' : 'border-gray-200'}`}>
            <button onClick={() => setOpen(isOpen ? null : id)} aria-expanded={isOpen} aria-label={`Messages with ${name}`}
              className={`w-full text-left flex items-center gap-2 ${big ? 'px-3 py-3 text-base' : 'px-3 py-2 text-sm'}`}>
              <span className="flex-1 min-w-0 truncate font-medium text-gray-900">{name}</span>
              {unread > 0
                ? <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--brand-600)] text-white">{unread} new</span>
                : <span className="shrink-0 text-xs text-gray-500">{count ? `${count} message${count === 1 ? '' : 's'}` : 'No messages yet'}</span>}
              <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className={big ? 'px-3 pb-3' : 'px-3 pb-2.5'}>
                <JobChat proposalId={proposal.id} subId={t.subId} subUserId={t.subUserId} client={proposal.client || ''} side="pm" big={big} placeholder={`Message ${name}…`} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
