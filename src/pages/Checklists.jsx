import { useState } from 'react'
import { useStore, currentUserEmail } from '../store'
import { CheckSquare, Square, Plus, Trash2, Users, X, Check } from 'lucide-react'

// Shared checklists — every checklist lives in the shared workspace, so all
// members of the org see the same lists and each other's checks update live.
export default function Checklists() {
  const checklists          = useStore(s => s.checklists) || []
  const addChecklist        = useStore(s => s.addChecklist)
  const renameChecklist     = useStore(s => s.renameChecklist)
  const deleteChecklist     = useStore(s => s.deleteChecklist)
  const addChecklistItem    = useStore(s => s.addChecklistItem)
  const toggleChecklistItem = useStore(s => s.toggleChecklistItem)
  const deleteChecklistItem = useStore(s => s.deleteChecklistItem)

  const [newTitle, setNewTitle] = useState('')
  const me = currentUserEmail()

  const createList = () => {
    const t = newTitle.trim()
    if (!t) return
    addChecklist(t)
    setNewTitle('')
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Checklists</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5 flex items-center gap-1.5">
          <Users size={13} className="text-gray-400" /> Shared with everyone in your organization — checks update live for your whole team.
        </p>
      </div>

      {/* New checklist */}
      <div className="flex items-center gap-2 mb-6">
        <input
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') createList() }}
          placeholder="New checklist name (e.g. Job Site Punch List)"
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button onClick={createList} disabled={!newTitle.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--brand-600)] text-white text-sm font-medium rounded-lg hover:bg-[var(--brand-700)] disabled:opacity-40 transition-colors shrink-0">
          <Plus size={15} /> New list
        </button>
      </div>

      {checklists.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400 border border-dashed border-gray-200 rounded-2xl">
          No checklists yet. Create one above — your manager and team will see it instantly.
        </div>
      ) : (
        <div className="space-y-4">
          {checklists.map(list => (
            <ChecklistCard
              key={list.id}
              list={list}
              me={me}
              onRename={t => renameChecklist(list.id, t)}
              onDelete={() => deleteChecklist(list.id)}
              onAddItem={t => addChecklistItem(list.id, t)}
              onToggle={itemId => toggleChecklistItem(list.id, itemId, me)}
              onDeleteItem={itemId => deleteChecklistItem(list.id, itemId)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ChecklistCard({ list, me, onRename, onDelete, onAddItem, onToggle, onDeleteItem }) {
  const items = list.items || []
  const done  = items.filter(i => i.done).length
  const pct   = items.length ? Math.round(done / items.length * 100) : 0
  const [itemText, setItemText] = useState('')
  const [editingTitle, setEditingTitle] = useState(false)
  const [title, setTitle] = useState(list.title)

  const add = () => {
    const t = itemText.trim()
    if (!t) return
    onAddItem(t)
    setItemText('')
  }

  const shortEmail = e => (e || '').split('@')[0]

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-5 py-3.5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          {editingTitle ? (
            <input
              autoFocus
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={() => { onRename(title); setEditingTitle(false) }}
              onKeyDown={e => { if (e.key === 'Enter') { onRename(title); setEditingTitle(false) } }}
              className="flex-1 text-base font-semibold text-gray-900 border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          ) : (
            <button onClick={() => setEditingTitle(true)} className="flex-1 text-left text-base font-semibold text-gray-900 hover:text-blue-600 truncate">
              {list.title}
            </button>
          )}
          <span className="text-xs text-gray-400 shrink-0">{done}/{items.length}</span>
          <button
            onClick={() => { if (window.confirm(`Delete "${list.title}" for the whole team?`)) onDelete() }}
            className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={15} /></button>
        </div>
        {/* Progress */}
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden w-full mt-2.5">
          <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Items */}
      <div className="divide-y divide-gray-50">
        {items.map(it => (
          <div key={it.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5 group">
            <button onClick={() => onToggle(it.id)} className="shrink-0">
              {it.done
                ? <CheckSquare size={18} className="text-green-600" />
                : <Square size={18} className="text-gray-300 hover:text-gray-400" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${it.done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{it.text}</p>
              {it.done && it.doneBy && (
                <p className="text-[11px] text-gray-400">
                  ✓ by {shortEmail(it.doneBy)}{it.doneBy === me ? ' (you)' : ''}{it.doneAt ? ` · ${new Date(it.doneAt).toLocaleDateString()}` : ''}
                </p>
              )}
            </div>
            <button onClick={() => onDeleteItem(it.id)}
              className="text-gray-300 hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"><X size={15} /></button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="px-5 py-3 text-xs text-gray-400">No items yet — add the first one below.</p>
        )}
      </div>

      {/* Add item */}
      <div className="flex items-center gap-2 px-4 sm:px-5 py-3 bg-gray-50 border-t border-gray-100">
        <input
          value={itemText}
          onChange={e => setItemText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder="Add an item…"
          className="flex-1 text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
        />
        <button onClick={add} disabled={!itemText.trim()}
          className="flex items-center gap-1 px-3 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors shrink-0">
          <Check size={14} /> Add
        </button>
      </div>
    </div>
  )
}
