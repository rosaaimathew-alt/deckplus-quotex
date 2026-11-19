import { useState } from 'react'
import { useStore } from '../store'
import { personalTodos, todosForMe, todosIAssigned, assignableMembers, canDeleteTodo, openTodoCount, firstName } from '../lib/todos'
import {
  Plus, X, ListChecks, Pin, ChevronRight, Trash2, CheckCircle2, Circle,
} from 'lucide-react'

// One line of a list: the tick, the task, who it is from or for, and the ×
// when it is mine to remove.
function Row({ t, note, onToggle, onDelete }) {
  return (
    <div className="group flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50">
      <button onClick={onToggle} aria-label={t.done ? 'Mark not done' : 'Mark done'}
        className={`mt-0.5 shrink-0 ${t.done ? 'text-[var(--brand-500)]' : 'text-gray-300 hover:text-[var(--brand-600)]'}`}>
        {t.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
      </button>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm leading-snug break-words ${t.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{t.text}</span>
        {note && <span className="block text-xs text-gray-500 mt-0.5">{note}</span>}
      </span>
      {onDelete && (
        <button onClick={onDelete} aria-label="Remove"
          className="shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-300 hover:text-red-500 transition-opacity mt-0.5">
          <X size={13} />
        </button>
      )}
    </div>
  )
}

const openFirst = (list) => [...list.filter(t => !t.done), ...list.filter(t => t.done)]

// The list itself: "Mine" is my own; "Shared" holds tasks given to me and
// tasks I gave someone (lib/todos). Used by the Dashboard card and the dock.
function TodoBody() {
  const todos          = useStore(s => s.todos) || []
  const me             = useStore(s => s.me)
  const members        = useStore(s => s.members)
  const tab            = useStore(s => s.todoTab)
  const setTab         = useStore(s => s.setTodoTab)
  const addTodo        = useStore(s => s.addTodo)
  const toggleTodo     = useStore(s => s.toggleTodo)
  const deleteTodo     = useStore(s => s.deleteTodo)
  const clearDoneTodos = useStore(s => s.clearDoneTodos)
  const [text, setText] = useState('')
  const [who, setWho] = useState('')

  const mine   = personalTodos(todos, me)
  const forMe  = todosForMe(todos, me)
  const given  = todosIAssigned(todos, me)
  const people = assignableMembers(members, me)
  // Nobody to share with and nothing shared: just the one list
  const canShare = people.length > 0 || forMe.length > 0 || given.length > 0
  const shared = canShare && tab === 'shared'
  const person = people.find(m => m.id === who) || null
  const ready = !!text.trim() && (!shared || !!person)

  const submit = () => {
    if (!ready) return
    addTodo(text.trim(), shared ? person : null)
    setText('')
  }

  const open = mine.filter(t => !t.done)
  const done = mine.filter(t => t.done)
  const waiting = forMe.filter(t => !t.done).length
  const inputCls = 'min-w-0 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]'
  const head = 'text-[10px] font-semibold uppercase tracking-wider text-gray-400'

  return (
    <>
      {canShare && (
        <div className="flex gap-5 border-b border-gray-200 mb-3 text-sm" role="tablist" aria-label="To-do lists">
          {[['mine', 'Mine', open.length], ['shared', 'Shared', waiting]].map(([key, label, n]) => {
            const on = (key === 'shared') === shared
            return (
              <button key={key} type="button" role="tab" aria-selected={on} onClick={() => setTab(key)}
                className={`-mb-px pb-2 border-b-2 font-medium ${on ? 'border-[var(--brand-600)] text-[var(--brand-800)]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                {label}{n > 0 && <span className="ml-1.5 text-xs font-normal text-gray-400">{n}</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Add row */}
      <div className="flex flex-wrap gap-2">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          placeholder={shared ? 'Task for someone…' : 'Add a task for today…'}
          aria-label={shared ? 'Task for someone' : 'New task'}
          className={`${inputCls} ${shared ? 'w-full' : 'flex-1'}`}
        />
        {shared && (
          <select value={who} onChange={e => setWho(e.target.value)} aria-label="Give to"
            className={`${inputCls} flex-1 ${who ? 'text-gray-800' : 'text-gray-500'}`}>
            <option value="">Give to…</option>
            {people.map(m => <option key={m.id} value={m.id}>{m.displayName || m.email}</option>)}
          </select>
        )}
        <button onClick={submit} disabled={!ready} aria-label={shared ? 'Give task' : 'Add task'}
          className="shrink-0 px-3 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40 transition-colors"
          style={{ background: 'var(--brand-600)' }}>
          <Plus size={16} />
        </button>
      </div>

      {/* Items */}
      {!shared ? (
        <div className="mt-3 space-y-1 flex-1 overflow-y-auto">
          {mine.length === 0 && (
            <p className="text-xs text-gray-400 italic py-4 text-center">Nothing yet — add your first task above.</p>
          )}
          {open.map(t => <Row key={t.id} t={t} onToggle={() => toggleTodo(t.id)} onDelete={() => deleteTodo(t.id)} />)}
          {done.length > 0 && (
            <div className="pt-2 mt-1 border-t border-gray-100">
              <div className="flex items-center justify-between px-2 mb-1">
                <span className={head}>Done ({done.length})</span>
                <button onClick={() => clearDoneTodos('mine')} className="text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-1">
                  <Trash2 size={10} /> Clear
                </button>
              </div>
              {done.map(t => <Row key={t.id} t={t} onToggle={() => toggleTodo(t.id)} onDelete={() => deleteTodo(t.id)} />)}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-1 flex-1 overflow-y-auto">
          {forMe.length === 0 && given.length === 0 && (
            <p className="text-xs text-gray-400 italic py-4 text-center">No shared tasks.</p>
          )}
          {forMe.length > 0 && (
            <div>
              <p className={`${head} px-2 mb-1`}>For me</p>
              {openFirst(forMe).map(t => (
                <Row key={t.id} t={t} note={t.ownerName ? `from ${firstName(t.ownerName)}` : null} onToggle={() => toggleTodo(t.id)}
                  onDelete={canDeleteTodo(t, me) ? () => deleteTodo(t.id) : null} />
              ))}
            </div>
          )}
          {given.length > 0 && (
            <div className={forMe.length > 0 ? 'pt-2 mt-1 border-t border-gray-100' : ''}>
              <div className="flex items-center justify-between px-2 mb-1">
                <span className={head}>I assigned</span>
                {given.some(t => t.done) && (
                  <button onClick={() => clearDoneTodos('shared')} className="text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-1">
                    <Trash2 size={10} /> Clear done
                  </button>
                )}
              </div>
              {openFirst(given).map(t => (
                <Row key={t.id} t={t} note={`to ${firstName(t.assignedToName) || 'a teammate'}${t.done ? ' · done' : ''}`}
                  onToggle={() => toggleTodo(t.id)} onDelete={() => deleteTodo(t.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// How many are waiting on me (my own open ones and open ones given to me)
const useOpenTodos = () => useStore(s => openTodoCount(s.todos, s.me))

// Inline card shown on the Dashboard (only when the list isn't pinned).
export function TodoCard() {
  const todoPin    = useStore(s => s.todoPin)
  const setTodoPin = useStore(s => s.setTodoPin)
  const openCount  = useOpenTodos()
  if (todoPin !== 'off') return null

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
  const openCount  = useOpenTodos()
  const [collapsed, setCollapsed] = useState(false)
  if (todoPin !== 'left' && todoPin !== 'right') return null

  // Right-only — coerce any legacy 'left' value so old saved state still renders.
  const side = 'right'

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
