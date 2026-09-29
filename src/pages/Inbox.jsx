import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store'
import { getModel } from '../gemini'
import {
  Mail, Send, RefreshCw, Trash2, Plus, X, Search,
  ChevronRight, Loader, Inbox as InboxIcon, PenLine,
  ArrowLeft, FileText, Sparkles, Gauge, Check, Pencil,
} from 'lucide-react'

const SUGGEST_SYSTEM = `You are a sales analyst for a home-improvement contractor. Given a customer's email replies, rate how likely they are to hire us (close the deal), from 0 to 100, and give one short reason. Consider tone, urgency, objections, and buying signals. Respond ONLY with JSON: {"score": <number 0-100>, "reason": "<one short sentence>"}.`

const POLL_INTERVAL = 30_000

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function avatarColor(email = '') {
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-amber-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
  ]
  let hash = 0
  for (const c of email) hash = (hash * 31 + c.charCodeAt(0)) % colors.length
  return colors[Math.abs(hash) % colors.length]
}

function Avatar({ name, email, size = 'md' }) {
  const initial = (name || email || '?')[0].toUpperCase()
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm'
  return (
    <div className={`${sz} bg-[var(--brand-100)] text-[var(--brand-700)] rounded-full flex items-center justify-center font-bold shrink-0`}>
      {initial}
    </div>
  )
}

// Group messages into threads by contact email
function buildThreads(messages) {
  const map = {}
  for (const msg of messages) {
    const contactEmail = msg.direction === 'inbound' ? msg.from.email : msg.to[0]
    const contactName = msg.direction === 'inbound' ? msg.from.name : ''
    if (!map[contactEmail]) {
      map[contactEmail] = { contactEmail, contactName, messages: [] }
    }
    if (!map[contactEmail].contactName && contactName) {
      map[contactEmail].contactName = contactName
    }
    map[contactEmail].messages.push(msg)
  }
  return Object.values(map)
    .map(t => ({
      ...t,
      messages: t.messages.sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt)),
      lastMessage: t.messages.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))[0],
    }))
    .sort((a, b) => new Date(b.lastMessage.receivedAt) - new Date(a.lastMessage.receivedAt))
}

// ── Compose Modal ──────────────────────────────────────────────────────────
function ComposeModal({ proposals, onSend, onClose }) {
  const [to, setTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [showProposals, setShowProposals] = useState(false)

  const handleSend = async () => {
    if (!to.trim() || !body.trim()) return
    setSending(true)
    setError('')
    try {
      await onSend({ to, subject, body, fromName, fromEmail })
      onClose()
    } catch (err) {
      setError(err.message)
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg mx-0 sm:mx-4 flex flex-col" style={{ maxHeight: '90vh' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><PenLine size={16} className="text-[var(--brand-500)]" /> New Message</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">To</label>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="client@example.com"
                value={to}
                onChange={e => setTo(e.target.value)}
                autoFocus
              />
              {proposals.length > 0 && (
                <button
                  onClick={() => setShowProposals(v => !v)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-500 hover:bg-gray-50 whitespace-nowrap"
                >
                  From proposal
                </button>
              )}
            </div>
            {showProposals && (
              <div className="mt-1 border border-gray-200 rounded-lg overflow-hidden shadow-sm max-h-32 overflow-y-auto">
                {proposals.filter(p => p.email).map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setTo(p.email); setSubject(`Re: Your Proposal — ${p.client || ''}`); setShowProposals(false) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between"
                  >
                    <span className="font-medium text-gray-800">{p.client || 'Unnamed'}</span>
                    <span className="text-gray-400 text-xs">{p.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Subject</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="Subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Your Name</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Mike's Construction"
                value={fromName}
                onChange={e => setFromName(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Reply-to Email</label>
              <input
                type="email"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="you@company.com"
                value={fromEmail}
                onChange={e => setFromEmail(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Message</label>
            <textarea
              rows={6}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              placeholder="Write your message..."
              value={body}
              onChange={e => setBody(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={handleSend}
            disabled={sending || !to.trim() || !body.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? <Loader size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Thread View ────────────────────────────────────────────────────────────
function ThreadView({ thread, proposals, readIds, onMarkRead, onDelete, onBack }) {
  const [replyText, setReplyText] = useState('')
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [showFromFields, setShowFromFields] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [manageTemplates, setManageTemplates] = useState(false)
  const [suggest, setSuggest] = useState(null)     // { score, reason } | { error }
  const [suggesting, setSuggesting] = useState(false)
  const emailTemplates = useStore(s => s.emailTemplates) || []
  const bottomRef = useRef(null)

  const applyTemplate = (t) => {
    const name = thread.contactName || (thread.contactEmail || '').split('@')[0] || 'there'
    setReplyText(t.body.replace(/\{client\}/g, name))
    setShowTemplates(false)
  }

  const runSuggest = async () => {
    const inbound = thread.messages
      .filter(m => m.direction === 'inbound')
      .map(m => m.textBody || m.snippet || '')
      .filter(Boolean)
    if (!inbound.length) { setSuggest({ error: 'No customer replies to analyze yet.' }); return }
    setSuggesting(true)
    setSuggest(null)
    try {
      const model = getModel(SUGGEST_SYSTEM)
      const prompt = `Customer: ${thread.contactName || thread.contactEmail}\n\nTheir replies (most recent last):\n${inbound.join('\n---\n')}\n\nRate how likely they are to close.`
      const res = await model.generateContent(prompt)
      const text = res.response.text()
      const match = text.match(/\{[\s\S]*\}/)
      const parsed = match ? JSON.parse(match[0]) : null
      if (parsed && typeof parsed.score === 'number') setSuggest({ score: Math.max(0, Math.min(100, Math.round(parsed.score))), reason: parsed.reason || '' })
      else setSuggest({ error: 'Could not read a rating from the reply.' })
    } catch (err) {
      setSuggest({ error: err.message.includes('ANTHROPIC') ? 'AI not configured yet — connect it in Settings.' : 'Could not analyze right now.' })
    }
    setSuggesting(false)
  }

  // Auto-scroll to bottom and mark messages read
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    thread.messages.forEach(m => {
      if (m.direction === 'inbound' && !readIds.has(m.id)) onMarkRead(m.id)
    })
  }, [thread.messages.length])

  // Find linked proposal
  const linkedProposal = proposals.find(p => p.email?.toLowerCase() === thread.contactEmail?.toLowerCase())

  const lastInbound = [...thread.messages].reverse().find(m => m.direction === 'inbound')

  const handleReply = async () => {
    if (!replyText.trim()) return
    setSending(true)
    setSendError('')
    try {
      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposal: { email: thread.contactEmail, client: thread.contactName },
          fromName,
          fromEmail,
          replyText: replyText.trim(),
          inReplyTo: lastInbound?.messageId || null,
          subject: `Re: ${lastInbound?.subject || 'Your Message'}`,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to send')
      setReplyText('')
    } catch (err) {
      setSendError(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="px-5 py-3 border-b border-gray-100 bg-white shrink-0">
        {/* Primary row — who this conversation is with */}
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="sm:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <ArrowLeft size={16} />
          </button>
          <Avatar name={thread.contactName} email={thread.contactEmail} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">
              {thread.contactName || thread.contactEmail}
            </p>
            <p className="text-xs text-gray-400 truncate">{thread.contactEmail}</p>
          </div>
          <button
            onClick={() => onDelete(thread.contactEmail)}
            className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50"
            title="Delete thread"
          >
            <Trash2 size={14} />
          </button>
        </div>
        {/* Secondary row — linked proposal + close-likelihood, demoted under the name */}
        <div className="flex items-center gap-2 mt-2 pl-12">
          {linkedProposal && (
            <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium border border-blue-100 whitespace-nowrap">
              #{linkedProposal.id} — ${Number(linkedProposal.total || 0).toLocaleString()}
            </span>
          )}
          {/* Sales Suggest — AI close-likelihood from the customer's replies */}
          {suggest?.score != null ? (
            <span title={suggest.reason}
              className={`text-xs px-2 py-1 rounded-full font-semibold border whitespace-nowrap ${
                suggest.score >= 70 ? 'bg-green-50 text-green-700 border-green-200'
                : suggest.score >= 40 ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-red-50 text-red-600 border-red-200'}`}>
              {suggest.score}% likely
            </span>
          ) : (
            <button onClick={runSuggest} disabled={suggesting}
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
              title="Gauge how likely this customer is to close">
              {suggesting ? <Loader size={12} className="animate-spin" /> : <Gauge size={12} />} Gauge interest
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 bg-gray-50">
        {thread.messages.map(msg => {
          const isOut = msg.direction === 'outbound'
          return (
            <div key={msg.id} className={`flex gap-2.5 ${isOut ? 'flex-row-reverse' : 'flex-row'}`}>
              {!isOut && <Avatar name={msg.from.name} email={msg.from.email} size="sm" />}
              <div className={`max-w-[75%] ${isOut ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  isOut
                    ? 'bg-blue-600 text-white rounded-tr-sm'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
                }`}>
                  {msg.textBody
                    ? msg.textBody.split('\n').map((line, i) => <p key={i} className={line === '' ? 'h-2' : ''}>{line || ' '}</p>)
                    : <span className="opacity-60 italic">(HTML email — view only)</span>}
                </div>
                <span className="text-xs text-gray-400 px-1">{timeAgo(msg.receivedAt)}</span>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <div className="border-t border-gray-100 bg-white px-4 py-3 shrink-0">
        {suggest?.reason && (
          <p className="text-xs text-gray-500 mb-2 flex items-start gap-1.5"><Sparkles size={12} className="text-[var(--brand-500)] mt-0.5 shrink-0" /> {suggest.reason}</p>
        )}
        {suggest?.error && (
          <p className="text-xs text-gray-400 mb-2">{suggest.error}</p>
        )}
        {/* Template picker */}
        <div className="relative mb-2">
          <button onClick={() => setShowTemplates(v => !v)}
            className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            <FileText size={12} /> Templates
          </button>
          {showTemplates && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowTemplates(false)} />
              <div className="absolute bottom-9 left-0 z-20 bg-white border border-gray-200 rounded-xl shadow-xl py-1 w-72 max-h-72 overflow-y-auto">
                {emailTemplates.length === 0 && <p className="px-3 py-2 text-xs text-gray-400 italic">No templates yet.</p>}
                {emailTemplates.map(t => (
                  <button key={t.id} onClick={() => applyTemplate(t)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-50 last:border-0">
                    <p className="text-xs font-semibold text-gray-800">{t.name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{t.body.split('\n')[0]}</p>
                  </button>
                ))}
                <button onClick={() => { setManageTemplates(true); setShowTemplates(false) }}
                  className="w-full text-left px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 flex items-center gap-1 mt-1 border-t border-gray-100">
                  <Pencil size={11} /> Manage templates
                </button>
              </div>
            </>
          )}
        </div>
        {showFromFields && (
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="Your name"
              value={fromName}
              onChange={e => setFromName(e.target.value)}
            />
            <input
              type="email"
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="reply-to email"
              value={fromEmail}
              onChange={e => setFromEmail(e.target.value)}
            />
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
            placeholder={`Reply to ${thread.contactName || thread.contactEmail}…`}
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleReply()
            }}
          />
          <div className="flex flex-col gap-1">
            <button
              onClick={() => setShowFromFields(v => !v)}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 text-xs"
              title="Set sender name/email"
            >
              <PenLine size={13} />
            </button>
            <button
              onClick={handleReply}
              disabled={sending || !replyText.trim()}
              className="p-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
              title="Send (⌘+Enter)"
            >
              {sending ? <Loader size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
        {sendError && <p className="text-xs text-red-500 mt-1.5">{sendError}</p>}
        <p className="text-xs text-gray-300 mt-1">⌘+Enter to send · use <span className="font-mono">{'{client}'}</span> in templates</p>
      </div>

      {manageTemplates && <TemplateManager onClose={() => setManageTemplates(false)} />}
    </div>
  )
}

// ── Follow-up template manager ───────────────────────────────────────────────
function TemplateManager({ onClose }) {
  const templates       = useStore(s => s.emailTemplates) || []
  const addEmailTemplate    = useStore(s => s.addEmailTemplate)
  const updateEmailTemplate = useStore(s => s.updateEmailTemplate)
  const deleteEmailTemplate = useStore(s => s.deleteEmailTemplate)
  const [editing, setEditing] = useState(null) // {id?, name, body}

  const startNew  = () => setEditing({ name: '', body: 'Hi {client},\n\n' })
  const save = () => {
    if (!editing.name.trim()) return
    if (editing.id) updateEmailTemplate(editing.id, { name: editing.name, body: editing.body })
    else addEmailTemplate({ name: editing.name, body: editing.body })
    setEditing(null)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <p className="font-semibold text-gray-900">Follow-up Templates</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={17} /></button>
        </div>

        {editing ? (
          <div className="p-5 space-y-3 overflow-y-auto">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Template name</label>
              <input value={editing.name} onChange={e => setEditing(v => ({ ...v, name: e.target.value }))}
                placeholder="e.g. Gentle nudge"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Message · <span className="font-mono normal-case">{'{client}'}</span> becomes the customer's name</label>
              <textarea rows={7} value={editing.body} onChange={e => setEditing(v => ({ ...v, body: e.target.value }))}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100">Cancel</button>
              <button onClick={save} disabled={!editing.name.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-40">
                <Check size={14} /> Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {templates.map(t => (
                <div key={t.id} className="group flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{t.name}</p>
                    <p className="text-xs text-gray-400 truncate">{t.body.split('\n')[0]}</p>
                  </div>
                  <button onClick={() => setEditing({ id: t.id, name: t.name, body: t.body })}
                    className="p-1 text-gray-300 hover:text-blue-600"><Pencil size={13} /></button>
                  <button onClick={() => deleteEmailTemplate(t.id)}
                    className="p-1 text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-gray-100 shrink-0">
              <button onClick={startNew}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
                <Plus size={14} /> New template
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main Inbox ─────────────────────────────────────────────────────────────
export default function Inbox() {
  const proposals = useStore(s => s.proposals)
  const readMessageIds = useStore(s => s.readMessageIds)
  const markMessageRead = useStore(s => s.markMessageRead)

  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedEmail, setSelectedEmail] = useState(null)
  const [search, setSearch] = useState('')
  const [showCompose, setShowCompose] = useState(false)
  const [error, setError] = useState('')

  const readSet = new Set(readMessageIds || [])

  const fetchMessages = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      // Pull fresh replies from the connected Gmail on manual/initial load;
      // background polls just read what's already stored.
      const res = await fetch(`/api/messages${silent ? '' : '?sync=1'}`)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      const data = await res.json()
      setMessages(data.messages || [])
      setError('')
    } catch (err) {
      setError(`Could not load messages: ${err.message}`)
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [])

  // Initial load + polling
  useEffect(() => {
    fetchMessages(false)
    const timer = setInterval(() => fetchMessages(true), POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [fetchMessages])

  const threads = buildThreads(messages)
  const filteredThreads = threads.filter(t =>
    !search ||
    t.contactEmail.toLowerCase().includes(search.toLowerCase()) ||
    t.contactName.toLowerCase().includes(search.toLowerCase()) ||
    t.messages.some(m => m.subject?.toLowerCase().includes(search.toLowerCase()) || m.textBody?.toLowerCase().includes(search.toLowerCase()))
  )

  const selectedThread = filteredThreads.find(t => t.contactEmail === selectedEmail)
  const unreadCount = messages.filter(m => m.direction === 'inbound' && !readSet.has(m.id)).length

  const handleDeleteThread = async (contactEmail) => {
    const toDelete = messages.filter(m =>
      m.direction === 'inbound' ? m.from.email === contactEmail : m.to[0] === contactEmail
    )
    await Promise.all(toDelete.map(m =>
      fetch(`/api/messages?id=${m.id}`, { method: 'DELETE' })
    ))
    setMessages(prev => prev.filter(m =>
      m.direction === 'inbound' ? m.from.email !== contactEmail : m.to[0] !== contactEmail
    ))
    if (selectedEmail === contactEmail) setSelectedEmail(null)
  }

  const handleComposeSend = async ({ to, subject, body, fromName, fromEmail }) => {
    const res = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proposal: { email: to },
        fromName,
        fromEmail,
        replyText: body,
        subject,
      }),
    })
    const result = await res.json()
    if (!res.ok) throw new Error(result.error || 'Failed to send')
    await fetchMessages(true)
    setSelectedEmail(to)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Left pane — thread list */}
      <div className={`w-full sm:w-72 shrink-0 border-r border-gray-100 flex flex-col ${selectedEmail ? 'hidden sm:flex' : 'flex'}`}>
        {/* Header */}
        <div className="px-4 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-900">Inbox</h2>
              {unreadCount > 0 && (
                <span className="bg-blue-600 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => fetchMessages(false)}
                disabled={refreshing}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                title="Refresh"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setShowCompose(true)}
                className="p-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                title="New message"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-7 pr-3 py-1.5 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="Search messages…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader size={20} className="animate-spin" />
            </div>
          ) : error ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-red-500 mb-2">{error}</p>
              <button onClick={() => fetchMessages(false)} className="text-xs text-blue-500 hover:underline">Retry</button>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="px-4 py-12 text-center text-gray-400">
              <InboxIcon size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No messages yet.</p>
              <p className="text-xs mt-1">Set up inbound routing to receive replies here.</p>
              <button
                onClick={() => setShowCompose(true)}
                className="mt-3 text-sm text-blue-500 hover:underline"
              >
                Compose a message →
              </button>
            </div>
          ) : (
            filteredThreads.map(thread => {
              const unread = thread.messages.some(m => m.direction === 'inbound' && !readSet.has(m.id))
              const isSelected = selectedEmail === thread.contactEmail
              return (
                <button
                  key={thread.contactEmail}
                  onClick={() => setSelectedEmail(thread.contactEmail)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 flex gap-3 items-start transition-colors ${
                    isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <Avatar name={thread.contactName} email={thread.contactEmail} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className={`text-sm truncate ${unread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                        {thread.contactName || thread.contactEmail}
                      </span>
                      <span className="text-xs text-gray-400 shrink-0">{timeAgo(thread.lastMessage.receivedAt)}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{thread.lastMessage.subject}</p>
                    <p className={`text-xs truncate mt-0.5 ${unread ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                      {thread.lastMessage.direction === 'outbound' ? 'You: ' : ''}
                      {thread.lastMessage.textBody?.slice(0, 60) || '(HTML email)'}
                    </p>
                  </div>
                  {unread && <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />}
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Right pane — thread view */}
      <div className={`flex-1 flex flex-col ${!selectedEmail ? 'hidden sm:flex' : 'flex'}`}>
        {selectedThread ? (
          <ThreadView
            thread={selectedThread}
            proposals={proposals}
            readIds={readSet}
            onMarkRead={markMessageRead}
            onDelete={handleDeleteThread}
            onBack={() => setSelectedEmail(null)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
            <Mail size={40} className="mb-3 opacity-20" />
            <p className="text-sm">Select a conversation</p>
            <button
              onClick={() => setShowCompose(true)}
              className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <PenLine size={14} /> Compose
            </button>
          </div>
        )}
      </div>

      {/* Compose modal */}
      {showCompose && (
        <ComposeModal
          proposals={proposals}
          onSend={handleComposeSend}
          onClose={() => setShowCompose(false)}
        />
      )}
    </div>
  )
}
