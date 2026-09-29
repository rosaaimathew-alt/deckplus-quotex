import { useState, useRef, useEffect } from 'react'
import { runOverCatalog } from '../aiCatalog'
import { useStore } from '../store'
import {
  Send, Loader, Bot, User, CheckCircle, X, Sparkles,
  TrendingUp, Tag, FileText, RefreshCw,
} from 'lucide-react'

const SYSTEM_PROMPT = `You are a pricing catalog assistant for a contractor estimating tool called QUOTEX.
Your job is to help contractors bulk-edit their pricing catalog using plain English commands.

The contractor's full catalog will be provided in each request as JSON.

RESPONSE FORMAT — always follow this exactly:
1. One or two sentences explaining what you changed (or why you can't).
2. If making changes, output a JSON array wrapped in <changes></changes> tags.

Change object format — only include fields being changed:
{ "id": <number>, "name"?: "...", "description"?: "...", "unit"?: "EA|LF|SF|LS", "unitPrice"?: <number>, "category"?: "..." }

Valid categories: Fencing, Gates, Demo, Materials, Labor, Framing, Concrete, Electrical, Plumbing, Roofing, Flooring, Drywall, Painting, HVAC, Windows, Doors, Tile, Insulation, Siding, General

RULES:
- Only modify fields explicitly asked about. Leave everything else untouched.
- When asked to raise/lower prices by a %, compute the exact rounded value (round to 2 decimal places).
- When no items match the request, say so clearly — do NOT make up changes.
- Never create new items. Never delete items. Only modify existing ones.
- Descriptions must be professional, under 500 chars, no bullet points.
- If the user asks a general question (not a change request), answer it helpfully without a <changes> block.

EXAMPLES:
User: "Raise all fencing prices by 10%"
Response: I'll increase the unit price on all 9 Fencing category items by 10%.
<changes>[{"id":1,"unitPrice":24.20},{"id":2,"unitPrice":41.80}]</changes>

User: "What's my most expensive item?"
Response: Your most expensive item is Double Drive Gate at $680/EA.`

const SUGGESTIONS = [
  'Raise all Fencing prices by 10%',
  'Add "supply and install" to every description that doesn\'t have it',
  'Change all items without a description to a professional one',
  'Lower all Labor prices by 5%',
  'Set all Roofing items to use LS unit',
  'What\'s my most expensive item in each category?',
  'Increase all prices under $50 by $5',
  'Standardize all category names to match the allowed list',
]

const fmt = (n) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function DiffTable({ changes, catalog, onApply, onDismiss, applied }) {
  // Build diff rows: merge change with current catalog item
  const rows = changes.map(change => {
    const current = catalog.find(c => c.id === change.id)
    if (!current) return null
    const fields = Object.keys(change).filter(k => k !== 'id')
    return { current, change, fields }
  }).filter(Boolean)

  if (!rows.length) return null

  const fieldLabel = { name: 'Name', description: 'Description', unitPrice: 'Unit Price', unit: 'Unit', category: 'Category' }

  return (
    <div className={`mt-3 rounded-xl border overflow-hidden ${applied ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'}`}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-current border-opacity-20">
        <span className={`text-xs font-bold uppercase tracking-wider ${applied ? 'text-green-700' : 'text-blue-700'}`}>
          {applied ? <><CheckCircle size={12} className="inline -mt-0.5 mr-1" /> Applied</> : `${rows.length} item${rows.length !== 1 ? 's' : ''} will change`}
        </span>
        {!applied && (
          <div className="flex gap-2">
            <button
              onClick={onDismiss}
              className="text-xs px-2 py-1 rounded-lg border border-blue-300 text-blue-600 hover:bg-blue-100"
            >
              Dismiss
            </button>
            <button
              onClick={() => onApply(changes)}
              className="text-xs px-3 py-1 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700"
            >
              Apply Changes
            </button>
          </div>
        )}
      </div>
      <div className="overflow-x-auto max-h-64 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-white bg-opacity-60 sticky top-0">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Item</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide">Field</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide text-red-500">Before</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide text-green-600">After</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white divide-opacity-40">
            {rows.flatMap(({ current, change, fields }) =>
              fields.map((field, fi) => (
                <tr key={`${current.id}-${field}`} className="hover:bg-white hover:bg-opacity-30">
                  <td className="px-3 py-1.5 font-medium text-gray-800">
                    {fi === 0 ? current.name : ''}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500">{fieldLabel[field] || field}</td>
                  <td className="px-3 py-1.5 text-red-600 line-through opacity-70">
                    {field === 'unitPrice'
                      ? `$${fmt(current[field] ?? '')}`
                      : String(current[field] ?? '—').slice(0, 60)}
                  </td>
                  <td className="px-3 py-1.5 text-green-700 font-medium">
                    {field === 'unitPrice'
                      ? `$${fmt(change[field])}`
                      : String(change[field] ?? '').slice(0, 60)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Message({ msg, catalog, onApply }) {
  const [dismissed, setDismissed] = useState(false)
  const [applied, setApplied] = useState(false)

  const handleApply = (changes) => {
    onApply(changes)
    setApplied(true)
  }

  return (
    <div className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
        msg.role === 'user' ? 'bg-blue-600' : 'bg-[var(--brand-500)]'
      }`}>
        {msg.role === 'user'
          ? <User size={14} className="text-white" />
          : <Sparkles size={14} className="text-white" />}
      </div>

      <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Bubble */}
        <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
          msg.role === 'user'
            ? 'bg-blue-600 text-white rounded-tr-sm'
            : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
        }`}>
          {msg.loading
            ? <span className="flex items-center gap-2 text-gray-400"><Loader size={13} className="animate-spin" /> Thinking…</span>
            : msg.error
              ? <span className="text-red-500">{msg.error}</span>
              : <span className="whitespace-pre-wrap">{msg.text}</span>}
        </div>

        {/* Diff card */}
        {msg.changes && !dismissed && !msg.loading && (
          <div className="w-full mt-1">
            <DiffTable
              changes={msg.changes}
              catalog={catalog}
              onApply={handleApply}
              onDismiss={() => setDismissed(true)}
              applied={applied}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// Quick stats shown in the sidebar
function CatalogStats({ catalog }) {
  const byCategory = {}
  catalog.forEach(item => {
    byCategory[item.category] = (byCategory[item.category] || [])
    byCategory[item.category].push(item)
  })
  const topCats = Object.entries(byCategory)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 6)
  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-0.5">
            <FileText size={12} className="text-[var(--brand-400)]" />
            <span className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Items</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{catalog.length}</p>
        </div>
      <div className="bg-white border border-gray-200 rounded-xl p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">By Category</p>
        <div className="space-y-1.5">
          {topCats.map(([cat, items]) => (
            <div key={cat} className="flex items-center justify-between">
              <span className="text-xs text-gray-600 truncate">{cat}</span>
              <span className="text-xs font-semibold text-gray-800 ml-2">{items.length}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function AiChat() {
  const catalog = useStore(s => s.catalog)
  const updateCatalogItem = useStore(s => s.updateCatalogItem)

  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: `Hi! I can help you make bulk changes to your pricing catalog — things like raising prices by a percentage, updating descriptions, changing units, or anything else across multiple items at once.\n\nJust tell me what you'd like to change, and I'll show you a preview before anything is applied.`,
      changes: null,
    }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text) => {
    const userText = (text || input).trim()
    if (!userText || loading) return
    setInput('')

    const userMsg = { id: Date.now(), role: 'user', text: userText }
    const loadingMsg = { id: Date.now() + 1, role: 'assistant', text: '', loading: true, changes: null }

    setMessages(prev => [...prev, userMsg, loadingMsg])
    setLoading(true)

    // Build history (exclude welcome + exclude loading placeholder)
    const history = [...messages.filter(m => m.id !== 'welcome'), userMsg]
      .map(m => ({ role: m.role, content: m.text }))

    try {
      // Build chat history (all but the last user message)
      const chatHistory = history.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
      const command = history[history.length - 1].content

      // Run the command over the catalog in token-safe chunks so large catalogs
      // never exceed the free-tier per-minute token cap; merge the changes.
      const { changes: merged, text } = await runOverCatalog(catalog, {
        system: SYSTEM_PROMPT,
        history: chatHistory,
        chunkSize: 40,
        buildPrompt: (chunk) => {
          const summary = chunk.map(({ id, name, description, unit, unitPrice, category }) =>
            ({ id, name, category, unit, unitPrice, description: (description || '').slice(0, 120) }))
          return `CURRENT CATALOG (${summary.length} items):\n${JSON.stringify(summary)}\n\nUSER REQUEST: ${command}`
        },
      })
      const changes = merged.length ? merged : null
      const displayText = text || (merged.length
        ? `Done — ${merged.length} change${merged.length !== 1 ? 's' : ''} ready to review below.`
        : 'No changes needed for that.')

      setMessages(prev => prev.map(m =>
        m.id === loadingMsg.id
          ? { ...m, loading: false, text: displayText, changes }
          : m
      ))
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === loadingMsg.id
          ? { ...m, loading: false, error: err.message }
          : m
      ))
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleApply = (changes) => {
    changes.forEach(change => {
      const { id, ...fields } = change
      updateCatalogItem(id, fields)
    })
  }

  const clearChat = () => {
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      text: `Chat cleared. What would you like to change in your catalog?`,
      changes: null,
    }])
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left sidebar — stats + suggestions */}
      <div className="hidden lg:flex w-64 shrink-0 flex-col gap-4 p-4 border-r border-gray-200 bg-white overflow-y-auto">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Your Catalog</h3>
          <CatalogStats catalog={catalog} />
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Try asking…</h3>
          <div className="space-y-1.5">
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={loading}
                className="w-full text-left px-3 py-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[var(--brand-500)] flex items-center justify-center">
              <Sparkles size={15} className="text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-sm">AI Catalog Assistant</h2>
              <p className="text-xs text-gray-400">Bulk-edit your pricing with plain English</p>
            </div>
          </div>
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-100"
          >
            <RefreshCw size={12} /> Clear chat
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {messages.map(msg => (
            <Message key={msg.id} msg={msg} catalog={catalog} onApply={handleApply} />
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Mobile suggestions */}
        <div className="lg:hidden px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar shrink-0">
          {SUGGESTIONS.slice(0, 4).map(s => (
            <button
              key={s}
              onClick={() => send(s)}
              disabled={loading}
              className="shrink-0 text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-full text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 whitespace-nowrap"
            >
              {s}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="px-5 py-4 bg-white border-t border-gray-200 shrink-0">
          <div className="flex items-end gap-3">
            <textarea
              ref={inputRef}
              rows={2}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
              placeholder='e.g. "Raise all Roofing prices by 15%" or "Add supply and install to every description"'
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send()
              }}
              disabled={loading}
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="p-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 shrink-0"
              title="Send (⌘+Enter)"
            >
              {loading ? <Loader size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
          <p className="text-xs text-gray-300 mt-1.5 text-right">⌘+Enter to send · Changes show a preview before applying</p>
        </div>
      </div>
    </div>
  )
}
