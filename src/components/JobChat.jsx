// ── Job chat ────────────────────────────────────────────────────────────────
// The conversation between a sub's manager and the Deck Plus PM about one
// job (lib/subChat). Shown on the sub manager's job screen, on the PM's job
// screen in Field mode and on the job's Subs tab in the office.
import { useEffect, useRef, useState } from 'react'
import { Send, MessageSquare, ChevronDown } from 'lucide-react'
import { useStore } from '../store'
import { threadOf, markChatSeen, chatTime, unreadCount } from '../lib/subChat'
import { tasksForJob, subNameOf } from '../lib/subTasks'

// side: 'pm' (Deck Plus staff) or 'sub' (the sub's manager).  big: phone-sized controls.
export default function JobChat({ proposalId, subId, subUserId, client = '', side, big = false, placeholder }) {
  const messages = useStore(s => s.subMessages)
  const addSubMessage = useStore(s => s.addSubMessage)
  const thread = threadOf(messages, proposalId, subId)
  const [text, setText] = useState('')
  const end = useRef(null)
  const last = thread[thread.length - 1]?.at || ''

  // Having it open is having read it; keep the newest message in view.
  useEffect(() => {
    if (last) markChatSeen(proposalId, subId, last)
    end.current?.scrollIntoView?.({ block: 'nearest' })
  }, [proposalId, subId, last])

  const send = (e) => {
    e?.preventDefault?.()
    const t = text.trim()
    if (!t) return
    addSubMessage({ proposalId, subId, subUserId, client, from: side, text: t })
    setText('')
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
                  <p className={`${big ? 'text-base' : 'text-sm'} whitespace-pre-wrap break-words`}>{m.text}</p>
                  <p className={`text-[11px] mt-0.5 ${mine ? 'text-white/80' : 'text-gray-500'}`}>{mine ? '' : `${m.byName || (m.from === 'pm' ? 'Deck Plus' : 'Sub')} · `}{chatTime(m.at)}</p>
                </div>
              </li>
            )
          })}
          <li ref={end} aria-hidden="true" />
        </ul>
      )}
      <form onSubmit={send} className="flex items-end gap-2">
        <textarea value={text} onChange={e => setText(e.target.value.slice(0, 2000))} rows={1} aria-label="Message"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !big) send(e) }}
          placeholder={placeholder || 'Write a message…'}
          className={`flex-1 min-w-0 resize-none rounded-xl border border-gray-300 bg-white text-gray-900 outline-none focus:border-[var(--brand-600)] ${big ? 'min-h-12 px-3 py-3 text-base' : 'px-2.5 py-1.5 text-sm'}`} />
        <button type="submit" disabled={!text.trim()} aria-label="Send message"
          className={`shrink-0 rounded-xl bg-[var(--brand-600)] text-white font-semibold disabled:opacity-40 flex items-center justify-center gap-1.5 ${big ? 'h-12 px-4 text-base' : 'h-8 px-3 text-xs'}`}>
          <Send size={big ? 18 : 13} /> Send
        </button>
      </form>
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
