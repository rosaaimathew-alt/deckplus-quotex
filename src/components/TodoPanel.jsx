import { useState } from 'react'
import { useStore } from '../store'
import {
  Plus, X, ListChecks, Pin, ChevronRight, Trash2, CheckCircle2, Circle,
} from 'lucide-react'

// Shared checklist body — the input + open/done items. Used by both the inline
// Dashboard card and the pinned side dock.
function TodoBody() {
  const todos          = useStore(s => s.todos) || []
  const addTodo        = useStore(s => s.addTodo)
  const toggleTodo     = useStore(s => s.toggleTodo)
  const deleteTodo     = useStore(s => s.deleteTodo)
  const clearDoneTodos = useStore(s => s.clearDoneTodos)
  const [text, setText] = useState('')

  const submit = () => {
    const t = text.trim()
    if (!t) return
    addTodo(t)
    setText('')
  }

  const open = todos.filter(t => !t.done)
  const done = todos.filter(t => t.done)

  return (
    <>
      {/* Add row */}
      <div className="flex gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder="Add a task for today…"
          className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]"
        />
        <button onClick={submit} disabled={!text.trim()}
          className="shrink-0 px-3 rounded-lg text-white text-sm font-medium disabled:opacity-40 transition-colors"
          style={{ background: 'var(--brand-600)' }}>
          <Plus size={16} />
        </button>
      </div>

      {/* Items */}
      <div className="mt-3 space-y-1 flex-1 overflow-y-auto">
        {todos.length === 0 && (
          <p className="text-xs text-gray-400 italic py-4 text-center">Nothing yet — add your first task above.</p>
        )}
        {open.map(t => (
          <div key={t.id} className="group flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
            <button onClick={() => toggleTodo(t.id)} className="mt-0.5 shrink-0 text-gray-300 hover:text-[var(--brand-600)]">
              <Circle size={15} />
            </button>
            <span className="flex-1 text-sm text-gray-700 leading-snug break-words">{t.text}</span>
            <button onClick={() => deleteTodo(t.id)}
              className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity mt-0.5">
              <X size={13} />
            </button>
          </div>
        ))}

        {done.length > 0 && (
          <div className="pt-2 mt-1 border-t border-gray-100">
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Done ({done.length})</span>
              <button onClick={clearDoneTodos} className="text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-1">
                <Trash2 size={10} /> Clear
              </button>
            </div>
            {done.map(t => (
              <div key={t.id} className="group flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
                <button onClick={() => toggleTodo(t.id)} className="mt-0.5 shrink-0 text-[var(--brand-500)]">
                  <CheckCircle2 size={15} />
                </button>
                <span className="flex-1 text-sm text-gray-400 line-through leading-snug break-words">{t.text}</span>
                <button onClick={() => deleteTodo(t.id)}
                  className="shrink-0 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity mt-0.5">
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// Inline card shown on the Dashboard (only when the list isn't pinned).
export function TodoCard() {
  const todoPin    = useStore(s => s.todoPin)
  const setTodoPin = useStore(s => s.setTodoPin)
  const todos      = useStore(s => s.todos) || []
  if (todoPin !== 'off') return null
  const openCount = todos.filter(t => !t.done).length

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col" style={{ maxHeight: 380 }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <ListChecks size={15} className="text-[var(--brand-500)]" /> To-Do{openCount > 0 && <span className="text-xs font-normal text-gray-400">· {openCount} open</span>}
        </p>
        <button onClick={() => setTodoPin('right')} title="Pin to the side"
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-[var(--brand-600)] transition-colors">
          <Pin size={13} /> Pin
        </button>
      </div>
      <TodoBody />
    </div>
  )
}

// Floating dock shown on every page when the list is pinned left or right.
export function TodoDock() {
  const todoPin    = useStore(s => s.todoPin)
  const setTodoPin = useStore(s => s.setTodoPin)
  const todos      = useStore(s => s.todos) || []
  const [collapsed, setCollapsed] = useState(false)
  if (todoPin !== 'left' && todoPin !== 'right') return null

  // Right-only — coerce any legacy 'left' value so old saved state still renders.
  const side = 'right'
  const openCount = todos.filter(t => !t.done).length

  // Collapsed → a small tab on the pinned edge
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed z-40 top-1/2 -translate-y-1/2 flex flex-col items-center gap-1 px-2 py-3 rounded-lg text-white shadow-lg no-print"
        style={{ background: 'var(--brand-600)', [side]: 0 }}
        title="Open to-do list"
      >
        <ListChecks size={16} />
        {openCount > 0 && <span className="text-[10px] font-bold">{openCount}</span>}
      </button>
    )
  }

  return (
    <div
      className="fixed z-40 bg-white border border-gray-200 rounded-xl shadow-2xl flex flex-col no-print"
      style={{ top: 64, bottom: 16, width: 288, [side]: 12 }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <ListChecks size={15} className="text-[var(--brand-500)]" /> To-Do{openCount > 0 && <span className="text-xs font-normal text-gray-400">· {openCount}</span>}
        </p>
        <div className="flex items-center gap-0.5">
          <button onClick={() => setCollapsed(true)} title="Collapse"
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-50">
            <ChevronRight size={15} />
          </button>
          <button onClick={() => setTodoPin('off')} title="Unpin"
            className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-gray-50">
            <X size={15} />
          </button>
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden p-4">
        <TodoBody />
      </div>
    </div>
  )
}
