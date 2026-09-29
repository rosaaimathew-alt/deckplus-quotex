import { useState, useRef, Fragment } from 'react'
import {
  Search, Edit2, Eye, Trash2, Plus, Check, X, GripVertical,
  ChevronDown, ChevronRight, LayoutList, Rows3,
  Sparkles, Loader, MoveRight, Settings2, Pencil, Lock, Unlock,
} from 'lucide-react'
import { useStore, DECK_COMPONENT_DEFAULTS, PORCH_COMPONENT_DEFAULTS } from '../store'
import { runOverCatalog } from '../aiCatalog'

const AI_CHAT_SYSTEM = `You are a pricing catalog assistant for a contractor estimating tool called QUOTEX.
Your job is to help contractors bulk-edit their pricing catalog using plain English commands.
The contractor's full catalog will be provided in each request as JSON.
RESPONSE FORMAT — always follow this exactly:
1. One or two sentences explaining what you changed (or why you can't).
2. If making changes, output a JSON array wrapped in <changes></changes> tags.
Change object format — only include fields being changed:
{ "id": <number>, "name"?: "...", "description"?: "...", "unit"?: "EA|LF|SF|LS", "unitPrice"?: <number>, "category"?: "..." }
RULES:
- Only modify fields explicitly asked about.
- Never create new items. Never delete items. Only modify existing ones.`

const UNITS = ['LF', 'SF', 'EA', 'LS']

// ── Category Manager Modal ─────────────────────────────────────────────────
function CategoryManagerModal({ onClose }) {
  const { catalogCategories, catalog, addCatalogCategory, renameCatalogCategory, deleteCatalogCategory } = useStore()
  const [newName, setNewName]     = useState('')
  const [editing, setEditing]     = useState(null)  // category name being edited
  const [editVal, setEditVal]     = useState('')

  const usageCount = name => catalog.filter(i => i.category === name).length

  const startEdit = (name) => { setEditing(name); setEditVal(name) }
  const saveEdit  = () => {
    if (editVal.trim() && editVal.trim() !== editing) renameCatalogCategory(editing, editVal.trim())
    setEditing(null)
  }

  const handleAdd = () => {
    if (!newName.trim()) return
    addCatalogCategory(newName.trim())
    setNewName('')
  }

  const handleDelete = (name) => {
    const count = usageCount(name)
    const msg = count > 0
      ? `"${name}" is used by ${count} catalog item${count !== 1 ? 's' : ''}. Deleting it removes the category label but keeps the items. Continue?`
      : `Delete the "${name}" category?`
    if (window.confirm(msg)) deleteCatalogCategory(name)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div>
            <p className="font-semibold text-gray-900 text-sm">Manage Categories</p>
            <p className="text-xs text-gray-400 mt-0.5">{catalogCategories.length} categories · rename, delete, or add new</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={17} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1.5">
          {catalogCategories.map(cat => (
            <div key={cat} className="flex items-center gap-2 group px-3 py-2 rounded-xl hover:bg-gray-50">
              {editing === cat ? (
                <>
                  <input
                    autoFocus
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }}
                    className="flex-1 text-sm border border-[var(--brand-300)] rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]"
                  />
                  <button onClick={saveEdit} className="p-1 text-green-600 hover:text-green-800"><Check size={15} /></button>
                  <button onClick={() => setEditing(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={15} /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-gray-800 font-medium">{cat}</span>
                  <span className="text-xs text-gray-400 mr-1">{usageCount(cat)} item{usageCount(cat) !== 1 ? 's' : ''}</span>
                  <button onClick={() => startEdit(cat)} className="p-1 text-gray-300 hover:text-[var(--brand-600)] opacity-0 group-hover:opacity-100 transition-opacity">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => handleDelete(cat)} className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 size={13} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 shrink-0">
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              placeholder="New category name…"
              className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]"
            />
            <button onClick={handleAdd} disabled={!newName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-[var(--brand-600)] text-white rounded-xl text-sm font-medium hover:bg-[var(--brand-700)] disabled:opacity-40 transition-colors">
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function fmt(n) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

function ConfidenceBadge({ value }) {
  const color = value >= 90 ? 'bg-green-100 text-green-700' : value >= 75 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{value}%</span>
}

// ── Move-to dropdown ───────────────────────────────────────────────────────
function MoveTo({ item, onMove }) {
  const [open, setOpen] = useState(false)
  const CATEGORIES = useStore(s => s.catalogCategories)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100"
        title="Move to category"
      >
        <MoveRight size={14} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-7 z-20 bg-white border border-gray-200 rounded-xl shadow-xl py-1 w-40 max-h-60 overflow-y-auto">
            <p className="px-3 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider">Move to</p>
            {CATEGORIES.filter(c => c !== item.category).map(cat => (
              <button
                key={cat}
                onClick={() => { onMove(item.id, cat); setOpen(false) }}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-800"
              >
                {cat}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Inline edit row ────────────────────────────────────────────────────────
function EditRow({ item, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState({ ...item })
  const CATEGORIES = useStore(s => s.catalogCategories)
  const isManager  = useStore(s => (s.role || 'manager') === 'manager')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const priceLocked = form.locked && !isManager
  return (
    <>
      <tr className="bg-[var(--brand-50)]">
        <td className="px-4 py-2 w-6"></td>
        <td className="px-4 py-2"><input className="w-full text-sm border border-[var(--brand-300)] rounded px-2 py-1 focus:outline-none" value={form.name} onChange={e => set('name', e.target.value)} /></td>
        <td className="px-4 py-2">
          <select className="text-sm border border-[var(--brand-300)] rounded px-2 py-1 focus:outline-none" value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </td>
        <td className="px-4 py-2">
          <select className="text-sm border border-[var(--brand-300)] rounded px-2 py-1 focus:outline-none" value={form.unit} onChange={e => set('unit', e.target.value)}>
            {UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
        </td>
        <td className="px-4 py-2">
          <div className="flex items-center gap-0.5"><span className="text-gray-400">$</span>
            <input type="number" min="0" disabled={priceLocked}
              className={`w-20 text-sm border rounded px-2 py-1 focus:outline-none ${priceLocked ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed' : 'border-[var(--brand-300)]'}`}
              value={form.unitPrice} onChange={e => set('unitPrice', parseFloat(e.target.value) || 0)} />
            {isManager ? (
              <button onClick={() => set('locked', !form.locked)} title={form.locked ? 'Price locked — click to unlock' : 'Lock price so sales can’t edit it'}
                className={`p-1 rounded ${form.locked ? 'text-amber-600' : 'text-gray-300 hover:text-amber-600'}`}>
                {form.locked ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
            ) : form.locked ? <Lock size={12} className="text-amber-500 ml-0.5" title="Price locked by manager" /> : null}
          </div>
        </td>
        <td className="px-4 py-2">
          <div className="flex gap-1">
            <button onClick={() => onSave(form)} className="p-1 rounded text-green-600 hover:bg-green-100" title="Save"><Check size={14} /></button>
            <button onClick={onCancel} className="p-1 rounded text-gray-400 hover:bg-gray-100" title="Cancel"><X size={14} /></button>
            {onDelete && <button onClick={() => onDelete(item.id)} className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50" title="Delete item"><Trash2 size={14} /></button>}
          </div>
        </td>
      </tr>
      <tr className="bg-[var(--brand-50)] border-b border-[var(--brand-100)]">
        <td colSpan={6} className="px-4 pb-3">
          {/* Relocated detail metrics — kept viewable while editing */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mb-2">
            <span>Range: <strong className="text-gray-700 font-medium">${form.minPrice} – ${form.maxPrice}</strong></span>
            <span>Samples: <strong className="text-gray-700 font-medium">{form.count}</strong></span>
            <span className="flex items-center gap-1.5">Confidence: <ConfidenceBadge value={form.confidence} /></span>
          </div>
          <textarea rows={2} className="w-full text-xs border border-[var(--brand-300)] rounded px-2 py-1 focus:outline-none resize-none text-gray-600 italic mb-2" placeholder="Scope description..." value={form.description || ''} onChange={e => set('description', e.target.value)} />
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">Internal Cost Breakdown (not client-facing)</p>
            <div className="flex gap-4 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                Materials cost:
                <span className="text-gray-400">$</span>
                <input type="number" min="0" step="0.01" className="w-24 border border-amber-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                  value={form.costMaterials || 0} onChange={e => set('costMaterials', parseFloat(e.target.value) || 0)} />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                Subcontractor cost:
                <span className="text-gray-400">$</span>
                <input type="number" min="0" step="0.01" className="w-24 border border-amber-300 rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                  value={form.costSub || 0} onChange={e => set('costSub', parseFloat(e.target.value) || 0)} />
              </label>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                Total cost: <strong className="text-gray-700">${fmt((form.costMaterials || 0) + (form.costSub || 0))}</strong>
              </span>
              <span className="flex items-center gap-1.5 text-xs text-gray-500">
                Margin: <strong className={`${form.unitPrice - (form.costMaterials || 0) - (form.costSub || 0) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  ${fmt(form.unitPrice - (form.costMaterials || 0) - (form.costSub || 0))}
                  {form.unitPrice > 0 ? ` (${Math.round((form.unitPrice - (form.costMaterials || 0) - (form.costSub || 0)) / form.unitPrice * 100)}%)` : ''}
                </strong>
              </span>
            </div>
          </div>
        </td>
      </tr>
    </>
  )
}

// ── Table view ─────────────────────────────────────────────────────────────
function TableView({ filtered, editId, setEditId, onSave, onDelete, onMove, addingNew, newForm, setNewForm, saveNew, setAddingNew }) {
  const dragItem = useRef(null)
  const isManager        = useStore(s => (s.role || 'manager') === 'manager')
  const updateCatalogItem = useStore(s => s.updateCatalogItem)
  const CATEGORIES        = useStore(s => s.catalogCategories)
  const [expanded, setExpanded] = useState(new Set())
  const toggleExpand = (id) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-2.5 w-6"></th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Item Name</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Unit</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">Unit Price</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {addingNew && (
              <>
                <tr className="bg-gray-50">
                  <td className="px-4 py-2 w-6"></td>
                  <td className="px-4 py-2"><input className="w-full text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none" placeholder="Item name" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} /></td>
                  <td className="px-4 py-2"><select className="text-sm border border-gray-300 rounded px-2 py-1" value={newForm.category} onChange={e => setNewForm(f => ({ ...f, category: e.target.value }))}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></td>
                  <td className="px-4 py-2"><select className="text-sm border border-gray-300 rounded px-2 py-1" value={newForm.unit} onChange={e => setNewForm(f => ({ ...f, unit: e.target.value }))}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></td>
                  <td className="px-4 py-2"><input type="number" min="0" className="w-20 text-sm border border-gray-300 rounded px-2 py-1" value={newForm.unitPrice} onChange={e => setNewForm(f => ({ ...f, unitPrice: parseFloat(e.target.value) || 0 }))} /></td>
                  <td className="px-4 py-2"><div className="flex gap-1 justify-end"><button onClick={saveNew} className="p-1 rounded text-green-600 hover:bg-green-100"><Check size={14} /></button><button onClick={() => setAddingNew(false)} className="p-1 rounded text-gray-400 hover:bg-gray-100"><X size={14} /></button></div></td>
                </tr>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <td colSpan={6} className="px-4 pb-3">
                    <textarea rows={2} className="w-full text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none resize-none text-gray-600 italic mb-2" placeholder="Scope description..." value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))} />
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">Internal Cost Breakdown (not client-facing)</p>
                      <div className="flex gap-4 flex-wrap">
                        <label className="flex items-center gap-1.5 text-xs text-gray-600">Materials cost: <span className="text-gray-400">$</span>
                          <input type="number" min="0" step="0.01" className="w-24 border border-amber-300 rounded px-2 py-0.5 text-sm focus:outline-none"
                            value={newForm.costMaterials || 0} onChange={e => setNewForm(f => ({ ...f, costMaterials: parseFloat(e.target.value) || 0 }))} />
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-gray-600">Subcontractor cost: <span className="text-gray-400">$</span>
                          <input type="number" min="0" step="0.01" className="w-24 border border-amber-300 rounded px-2 py-0.5 text-sm focus:outline-none"
                            value={newForm.costSub || 0} onChange={e => setNewForm(f => ({ ...f, costSub: parseFloat(e.target.value) || 0 }))} />
                        </label>
                      </div>
                    </div>
                  </td>
                </tr>
              </>
            )}
            {filtered.map(item =>
              editId === item.id ? (
                <EditRow key={item.id} item={item} onSave={(changes) => { onSave(item.id, changes); setEditId(null) }} onCancel={() => setEditId(null)} onDelete={(id) => { onDelete(id); setEditId(null) }} />
              ) : (
                <Fragment key={item.id}>
                  <tr
                    draggable
                    onDragStart={() => { dragItem.current = item.id }}
                    className="hover:bg-gray-50 transition-colors cursor-grab active:cursor-grabbing"
                  >
                    <td className="px-4 py-2.5 text-gray-300"><GripVertical size={14} /></td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-800">{item.name}</p>
                    </td>
                    <td className="px-4 py-2.5"><span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.category}</span></td>
                    <td className="px-4 py-2.5 text-gray-500">{item.unit}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-semibold text-gray-900 flex items-center gap-1">
                        ${fmt(item.unitPrice)}
                        {item.locked && <Lock size={11} className="text-amber-500" title="Price locked by manager" />}
                      </p>
                      {((item.costMaterials || 0) + (item.costSub || 0)) > 0 && (
                        <p className="text-[10px] text-amber-600 mt-0.5">cost ${fmt((item.costMaterials||0)+(item.costSub||0))}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => toggleExpand(item.id)}
                          className={`p-1 rounded hover:bg-gray-100 ${expanded.has(item.id) ? 'text-[var(--brand-600)]' : 'text-gray-400'}`}
                          title="View details">
                          <Eye size={15} />
                        </button>
                        <button onClick={() => setEditId(item.id)} className="p-1 rounded text-gray-400 hover:text-[var(--brand-600)] hover:bg-[var(--brand-50)]" title="Edit"><Edit2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                  {expanded.has(item.id) && (
                    <tr className="bg-gray-50/70">
                      <td></td>
                      <td colSpan={5} className="px-4 pb-3 pt-0">
                        {item.description && <p className="text-xs text-gray-500 mb-2 leading-relaxed">{item.description}</p>}
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-gray-500">
                          <span>Range: <strong className="text-gray-700 font-medium">${item.minPrice} – ${item.maxPrice}</strong></span>
                          <span>Samples: <strong className="text-gray-700 font-medium">{item.count}</strong></span>
                          <span className="flex items-center gap-1.5">Confidence: <ConfidenceBadge value={item.confidence} /></span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            )}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <div className="text-center py-12 text-gray-400 text-sm">No items match your search.</div>}
    </div>
  )
}

// ── Sections view ──────────────────────────────────────────────────────────
function SectionsView({ catalog, onMove, onDelete, onSave }) {
  const [collapsed, setCollapsed] = useState({})
  const CATEGORIES = useStore(s => s.catalogCategories)
  const [editId, setEditId] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const dragItem = useRef(null)

  // Group by category, only show categories that have items
  const groups = CATEGORIES
    .map(cat => ({ cat, items: catalog.filter(i => i.category === cat) }))
    .filter(g => g.items.length > 0)

  const toggleCollapse = (cat) => setCollapsed(v => ({ ...v, [cat]: !v[cat] }))

  const handleDragStart = (itemId) => { dragItem.current = itemId }

  const handleDrop = (targetCat) => {
    if (dragItem.current != null) {
      const item = catalog.find(i => i.id === dragItem.current)
      if (item && item.category !== targetCat) {
        onMove(dragItem.current, targetCat)
      }
    }
    dragItem.current = null
    setDragOver(null)
  }

  return (
    <div className="space-y-3">
      {groups.map(({ cat, items }) => (
        <div
          key={cat}
          onDragOver={e => { e.preventDefault(); setDragOver(cat) }}
          onDragLeave={() => setDragOver(null)}
          onDrop={() => handleDrop(cat)}
          className={`bg-white rounded-xl border-2 transition-colors overflow-hidden ${
            dragOver === cat ? 'border-[var(--brand-400)] bg-[var(--brand-50)]' : 'border-gray-200'
          }`}
        >
          {/* Section header — also a drop target */}
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            onClick={() => toggleCollapse(cat)}
          >
            <div className="flex items-center gap-3">
              {collapsed[cat] ? <ChevronRight size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
              <span className="font-semibold text-gray-800">{cat}</span>
              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{items.length}</span>
              {dragOver === cat && (
                <span className="text-xs text-[var(--brand-600)] font-medium animate-pulse">Drop here →</span>
              )}
            </div>
            <span className="text-xs text-gray-400">
              Avg ${Math.round(items.reduce((s, i) => s + i.unitPrice, 0) / items.length).toLocaleString()}
            </span>
          </button>

          {/* Items */}
          {!collapsed[cat] && (
            <div className="border-t border-gray-100">
              {editId && items.find(i => i.id === editId) ? (
                <table className="w-full text-sm">
                  <tbody>
                    <EditRow
                      item={items.find(i => i.id === editId)}
                      onSave={(changes) => { onSave(editId, changes); setEditId(null) }}
                      onCancel={() => setEditId(null)}
                      onDelete={(id) => { onDelete(id); setEditId(null) }}
                    />
                  </tbody>
                </table>
              ) : null}

              <div className="divide-y divide-gray-50">
                {items.filter(i => i.id !== editId).map(item => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={() => handleDragStart(item.id)}
                    onDragEnd={() => { dragItem.current = null; setDragOver(null) }}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-grab active:cursor-grabbing group transition-colors"
                  >
                    <GripVertical size={14} className="text-gray-300 shrink-0 group-hover:text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-gray-400 italic truncate mt-0.5">{item.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs text-gray-500">
                      <span>{item.unit}</span>
                      <span className="font-semibold text-gray-800">${fmt(item.unitPrice)}</span>
                      <ConfidenceBadge value={item.confidence} />
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <MoveTo item={item} onMove={onMove} />
                      <button onClick={() => setEditId(item.id)} className="p-1 rounded text-gray-400 hover:text-[var(--brand-600)] hover:bg-[var(--brand-50)]"><Edit2 size={13} /></button>
                      <button onClick={() => onDelete(item.id)} className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 size={13} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── AI suggest diff overlay ────────────────────────────────────────────────
function AiSuggestBanner({ suggestions, catalog, onApply, onDismiss }) {
  if (!suggestions?.length) return null
  const rows = suggestions.map(s => {
    const item = catalog.find(c => c.id === s.id)
    return item ? { item, newCategory: s.category } : null
  }).filter(Boolean)
  if (!rows.length) return null

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={15} className="text-[var(--brand-500)]" />
          <span className="text-sm font-semibold text-gray-800">AI Category Suggestions</span>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{rows.length} item{rows.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onDismiss} className="text-xs px-2 py-1 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">Dismiss</button>
          <button onClick={() => onApply(suggestions)} className="text-xs px-3 py-1 bg-[var(--brand-600)] text-white rounded-lg font-medium hover:bg-[var(--brand-700)]">Apply All</button>
        </div>
      </div>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {rows.map(({ item, newCategory }) => (
          <div key={item.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100 text-sm">
            <span className="flex-1 text-gray-800 font-medium truncate">{item.name}</span>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{item.category}</span>
            <MoveRight size={12} className="text-[var(--brand-400)] shrink-0" />
            <span className="text-xs text-[var(--brand-700)] bg-[var(--brand-100)] px-2 py-0.5 rounded-full font-medium">{newCategory}</span>
            <button
              onClick={() => onApply([{ id: item.id, category: newCategory }])}
              className="text-xs text-[var(--brand-600)] hover:underline shrink-0"
            >
              Apply
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Formulas view — manager sets & locks the pricing the builders consume ─────
function FormulasView() {
  const isManager = useStore(s => (s.role || 'manager') === 'manager')
  // Deck slices
  const deck = {
    title: 'Deck Builder', defaults: DECK_COMPONENT_DEFAULTS, isManager,
    rates: useStore(s => s.deckComponentRates), setRate: useStore(s => s.setDeckComponentRate),
    customComponents: useStore(s => s.deckCustomComponents), addCustom: useStore(s => s.addDeckCustomComponent),
    updateCustom: useStore(s => s.updateDeckCustomComponent), removeCustom: useStore(s => s.removeDeckCustomComponent),
    locked: useStore(s => s.deckFormulaLocked), setLocked: useStore(s => s.setDeckFormulaLocked),
    scopeTemplate: useStore(s => s.deckScopeTemplate), setScopeTemplate: useStore(s => s.setDeckScopeTemplate),
    footerNote: 'These rates feed the Deck Builder — decking & fascia are still priced per collection on their catalog items.',
    scopeTitle: 'Open Deck — standard scope of work',
    scopeSubtitle: 'Materials & methods on every open-deck quote. One bullet per line — the builder adds size, decking, railing, stairs & fascia automatically.',
    scopeHint: 'Put your always-included framing here (footers, posts & beams, joist size & spacing, framing tape). Per-quote selections are appended automatically.',
  }
  // Porch slices
  const porch = {
    title: 'Porch Conversion — Eze-Breeze', defaults: PORCH_COMPONENT_DEFAULTS, isManager,
    rates: useStore(s => s.porchComponentRates), setRate: useStore(s => s.setPorchComponentRate),
    customComponents: useStore(s => s.porchCustomComponents), addCustom: useStore(s => s.addPorchCustomComponent),
    updateCustom: useStore(s => s.updatePorchCustomComponent), removeCustom: useStore(s => s.removePorchCustomComponent),
    locked: useStore(s => s.porchFormulaLocked), setLocked: useStore(s => s.setPorchFormulaLocked),
    scopeTemplate: useStore(s => s.porchScopeTemplate), setScopeTemplate: useStore(s => s.setPorchScopeTemplate),
    footerNote: 'These rates feed the Porch Conversion builder — it counts windows, columns, transoms & doors from the width, depth & wall height you enter.',
    scopeTitle: 'Porch Conversion — standard scope of work',
    scopeSubtitle: 'Materials & methods on every Eze-Breeze porch quote. One bullet per line — the builder adds the window/column counts, transoms & doors automatically.',
    scopeHint: 'Put your always-included work here (columns & plates, window install, paint/seal/refinish). The window, transom and door counts are appended automatically.',
  }
  return (
    <div className="space-y-6">
      <FormulaCard {...deck} />
      <FormulaCard {...porch} />
    </div>
  )
}

function FormulaCard({ title, defaults, rates, setRate, customComponents, addCustom, updateCustom, removeCustom,
                      locked, setLocked, scopeTemplate, setScopeTemplate, isManager,
                      footerNote, scopeTitle, scopeSubtitle, scopeHint }) {
  const canEdit = isManager || !locked   // sales can only touch pricing while it's unlocked
  const [open, setOpen] = useState(true)
  const [newComp, setNewComp] = useState({ label: '', unit: 'EA', rate: '', cost: '' })

  const keys = Object.keys(defaults)
  const numCell = (dis) => `w-20 text-sm border rounded px-2 py-1 focus:outline-none ${dis ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed' : 'border-gray-300 focus:ring-2 focus:ring-[var(--brand-200)]'}`
  const marginOf = (c) => c.rate > 0 ? Math.round((c.rate - (c.cost || 0)) / c.rate * 100) : 0

  const addNew = () => {
    if (!newComp.label.trim()) return
    addCustom(newComp)
    setNewComp({ label: '', unit: 'EA', rate: '', cost: '' })
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
        {/* Formula header + lock control */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button className="flex items-center gap-3" onClick={() => setOpen(o => !o)}>
            {open ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
            <span className="font-semibold text-gray-800">{title}</span>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{keys.length + customComponents.length} components</span>
          </button>
          {isManager ? (
            <button onClick={() => setLocked(!locked)}
              title={locked ? 'Unlock so sales can adjust pricing' : 'Lock pricing so sales must use these rates'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${locked ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {locked ? <Lock size={13} /> : <Unlock size={13} />} {locked ? 'Locked for sales' : 'Unlocked'}
            </button>
          ) : locked ? (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 font-medium"><Lock size={12} /> Locked by manager</span>
          ) : null}
        </div>

        {open && (
          <div className="p-4">
            {!isManager && locked && (
              <div className="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Pricing is locked by your manager. You can build quotes with these rates, but you can't change them.
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                    <th className="text-left font-semibold py-1.5">Component</th>
                    <th className="font-semibold py-1.5 w-14">Unit</th>
                    <th className="font-semibold py-1.5 w-24">Price $</th>
                    <th className="font-semibold py-1.5 w-24">Cost $</th>
                    <th className="text-right font-semibold py-1.5 w-16">Margin</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map(k => {
                    const c = rates?.[k] || defaults[k]
                    return (
                      <tr key={k} className="border-b border-gray-50">
                        <td className="py-1.5 pr-2 text-gray-700">{c.label}</td>
                        <td className="py-1.5 px-1 text-center text-gray-400 text-xs">{c.unit}</td>
                        <td className="py-1.5 px-1">
                          <input type="number" min="0" disabled={!canEdit} value={c.rate}
                            onChange={e => setRate(k, { rate: parseFloat(e.target.value) || 0 })} className={numCell(!canEdit)} />
                        </td>
                        <td className="py-1.5 px-1">
                          <input type="number" min="0" disabled={!canEdit} value={c.cost}
                            onChange={e => setRate(k, { cost: parseFloat(e.target.value) || 0 })} className={numCell(!canEdit)} />
                        </td>
                        <td className="py-1.5 pl-2 text-right text-gray-500">{marginOf(c)}%</td>
                        <td></td>
                      </tr>
                    )
                  })}
                  {customComponents.map(c => (
                    <tr key={c.id} className="border-b border-gray-50 bg-[var(--brand-50)]/50">
                      <td className="py-1.5 pr-2">
                        <input disabled={!canEdit} value={c.label} onChange={e => updateCustom(c.id, { label: e.target.value })}
                          className="w-full min-w-[8rem] bg-transparent border-b border-transparent hover:border-gray-200 focus:border-[var(--brand-300)] focus:outline-none text-gray-700 disabled:text-gray-500 disabled:hover:border-transparent" />
                      </td>
                      <td className="py-1.5 px-1">
                        <select disabled={!canEdit} value={c.unit} onChange={e => updateCustom(c.id, { unit: e.target.value })}
                          className="text-xs border border-gray-200 rounded px-1 py-1 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400">
                          {UNITS.map(u => <option key={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 px-1">
                        <input type="number" min="0" disabled={!canEdit} value={c.rate}
                          onChange={e => updateCustom(c.id, { rate: parseFloat(e.target.value) || 0 })} className={numCell(!canEdit)} />
                      </td>
                      <td className="py-1.5 px-1">
                        <input type="number" min="0" disabled={!canEdit} value={c.cost}
                          onChange={e => updateCustom(c.id, { cost: parseFloat(e.target.value) || 0 })} className={numCell(!canEdit)} />
                      </td>
                      <td className="py-1.5 pl-2 text-right text-gray-500">{marginOf(c)}%</td>
                      <td className="py-1.5 text-right">
                        {canEdit && <button onClick={() => removeCustom(c.id)} title="Remove component" className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Add a shared component — appears on every deck quote */}
            {canEdit && (
              <div className="flex items-center gap-1.5 flex-wrap mt-3 pt-3 border-t border-gray-100">
                <input value={newComp.label} onChange={e => setNewComp(n => ({ ...n, label: e.target.value }))}
                  placeholder="Add component (e.g. Height premium)"
                  className="flex-1 min-w-[10rem] text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]" />
                <select value={newComp.unit} onChange={e => setNewComp(n => ({ ...n, unit: e.target.value }))}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none">
                  {UNITS.map(u => <option key={u}>{u}</option>)}
                </select>
                <input type="number" value={newComp.rate} onChange={e => setNewComp(n => ({ ...n, rate: e.target.value }))}
                  placeholder="Price $" className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]" />
                <input type="number" value={newComp.cost} onChange={e => setNewComp(n => ({ ...n, cost: e.target.value }))}
                  placeholder="Cost $" className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]" />
                <button onClick={addNew} disabled={!newComp.label.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 bg-[var(--brand-600)] text-white text-sm font-medium rounded-lg hover:bg-[var(--brand-700)] disabled:opacity-40 transition-colors">
                  <Plus size={14} /> Add
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {open && (
        <>
          <p className="text-xs text-gray-400 px-1 leading-relaxed">
            {footerNote} Lock the formula so salespeople quote with your pricing and can't change it.
          </p>

          {/* Standard scope of work — the customer-facing build description */}
          <div className="bg-white rounded-xl border-2 border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="font-semibold text-gray-800">{scopeTitle}</p>
              <p className="text-xs text-gray-400 mt-0.5">{scopeSubtitle}</p>
            </div>
            <div className="p-4">
              <textarea
                value={scopeTemplate}
                disabled={!canEdit}
                onChange={e => setScopeTemplate(e.target.value)}
                rows={5}
                placeholder="One scope bullet per line…"
                className={`w-full text-sm rounded-lg px-3 py-2 leading-relaxed focus:outline-none resize-y ${canEdit ? 'border border-gray-300 focus:ring-2 focus:ring-[var(--brand-200)]' : 'border border-gray-200 bg-gray-100 text-gray-500 cursor-not-allowed'}`}
              />
              <p className="text-xs text-gray-400 mt-2">Tip: {scopeHint}</p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function ItemCatalog() {
  const catalog             = useStore(s => s.catalog)
  const CATEGORIES          = useStore(s => s.catalogCategories)
  const updateCatalogItem   = useStore(s => s.updateCatalogItem)
  const deleteCatalogItem   = useStore(s => s.deleteCatalogItem)
  const addCatalogItems     = useStore(s => s.addCatalogItems)

  const [mode, setMode]           = useState('catalog') // 'catalog' | 'formulas'
  const [view, setView]           = useState('table')   // 'table' | 'sections'
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [sortKey, setSortKey]     = useState('name')
  const [sortAsc, setSortAsc]     = useState(true)
  const [editId, setEditId]       = useState(null)
  const [addingNew, setAddingNew] = useState(false)
  const [managingCats, setManagingCats] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', description: '', category: CATEGORIES[0] || 'General', unit: 'EA', unitPrice: 0, minPrice: 0, maxPrice: 0, count: 1, confidence: 70 })

  // AI suggest state
  const [suggesting, setSuggesting] = useState(false)
  const [suggestions, setSuggestions] = useState(null)
  const [suggestError, setSuggestError] = useState('')

  const cats = ['All', ...CATEGORIES.filter(c => catalog.some(i => i.category === c))]

  const filtered = catalog
    .filter(c => catFilter === 'All' || c.category === catFilter)
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.description?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey]
      return sortAsc
        ? typeof av === 'string' ? av.localeCompare(bv) : av - bv
        : typeof bv === 'string' ? bv.localeCompare(av) : bv - av
    })

  const toggleSort = (key) => { if (sortKey === key) setSortAsc(a => !a); else { setSortKey(key); setSortAsc(true) } }

  const handleMove = (id, newCategory) => updateCatalogItem(id, { category: newCategory })

  const handleSave = (id, changes) => updateCatalogItem(id, changes)

  const saveNew = () => {
    if (!newForm.name.trim()) return
    addCatalogItems([{ ...newForm, profitable: true }])
    setAddingNew(false)
    setNewForm({ name: '', description: '', category: 'General', unit: 'EA', unitPrice: 0, minPrice: 0, maxPrice: 0, count: 1, confidence: 70 })
  }

  // AI suggest categories
  const handleAiSuggest = async () => {
    setSuggesting(true)
    setSuggestError('')
    setSuggestions(null)
    try {
      // Reviewed in token-safe chunks so a large catalog never trips the
      // provider's per-minute token cap. Each item sends only name/category +
      // a short description snippet.
      const { changes } = await runOverCatalog(catalog, {
        system: AI_CHAT_SYSTEM,
        chunkSize: 60,
        buildPrompt: (chunk) => {
          const summary = chunk.map(({ id, name, category, description }) =>
            ({ id, name, category, description: (description || '').slice(0, 60) }))
          return `CURRENT CATALOG (${summary.length} items):\n${JSON.stringify(summary)}\n\nUSER REQUEST: Review every item in the catalog and identify any that appear to be miscategorized — where the item clearly belongs in a different category based on its name and description. Only flag items where the category is clearly wrong. Return only items that should move; don't change items that are already correct.`
        },
      })
      const catChanges = changes.filter(c => c.category)
      if (catChanges.length) setSuggestions(catChanges)
      else setSuggestError('AI found no miscategorized items — your catalog looks well organized!')
    } catch (err) {
      setSuggestError(err.message)
    } finally {
      setSuggesting(false)
    }
  }

  const handleApplySuggestions = (changes) => {
    changes.forEach(({ id, category }) => updateCatalogItem(id, { category }))
    setSuggestions(prev => prev ? prev.filter(s => !changes.find(c => c.id === s.id)) : null)
  }

  return (
    <div className="p-6">
      {/* Top-level sections */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-4 w-fit">
        <button onClick={() => setMode('catalog')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'catalog' ? 'bg-white text-[var(--brand-700)] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <LayoutList size={14} /> Items
        </button>
        <button onClick={() => setMode('formulas')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${mode === 'formulas' ? 'bg-white text-[var(--brand-700)] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          <Settings2 size={14} /> Tools
        </button>
      </div>

      {mode === 'formulas' ? (
        <>
          <div className="mb-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-0.5">Tools</h2>
            <p className="text-sm text-gray-500">Manager-set pricing the builders use — set the rates, then lock them so sales must follow.</p>
          </div>
          <FormulasView />
        </>
      ) : (
      <>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-0.5">Item Catalog</h2>
          <p className="text-sm text-gray-500">{catalog.length} items · AI-learned pricing from your estimates</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'table' ? 'bg-white text-[var(--brand-700)] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Rows3 size={14} /> Table
            </button>
            <button
              onClick={() => setView('sections')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${view === 'sections' ? 'bg-white text-[var(--brand-700)] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <LayoutList size={14} /> Sections
            </button>
          </div>

          {/* AI suggest */}
          <button
            onClick={handleAiSuggest}
            disabled={suggesting}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 bg-white text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {suggesting ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {suggesting ? 'Analyzing…' : 'AI Suggest'}
          </button>

          <button
            onClick={() => setManagingCats(true)}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 bg-white text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            title="Manage categories"
          >
            <Settings2 size={14} /> Categories
          </button>

          <button
            onClick={() => setAddingNew(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[var(--brand-600)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-700)]"
          >
            <Plus size={15} /> Add Item
          </button>
        </div>
      </div>

      {managingCats && <CategoryManagerModal onClose={() => setManagingCats(false)} />}

      {/* AI suggestions banner */}
      {suggestError && (
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4 text-sm text-gray-500">
          <Sparkles size={14} className="text-[var(--brand-400)] shrink-0" />
          {suggestError}
          <button onClick={() => setSuggestError('')} className="ml-auto text-gray-300 hover:text-gray-500"><X size={14} /></button>
        </div>
      )}
      {suggestions && (
        <AiSuggestBanner
          suggestions={suggestions}
          catalog={catalog}
          onApply={handleApplySuggestions}
          onDismiss={() => setSuggestions(null)}
        />
      )}

      {/* Filters (table view) */}
      {view === 'table' && (
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-40">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]"
              placeholder="Search items..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 flex-wrap">
            {cats.map(c => (
              <button key={c} onClick={() => setCatFilter(c)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${catFilter === c ? 'bg-[var(--brand-600)] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search for sections view */}
      {view === 'sections' && (
        <div className="relative mb-4">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)] bg-white"
            placeholder="Search items..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Content */}
      {view === 'table' ? (
        <TableView
          filtered={filtered}
          editId={editId}
          setEditId={setEditId}
          onSave={handleSave}
          onDelete={deleteCatalogItem}
          onMove={handleMove}
          addingNew={addingNew}
          newForm={newForm}
          setNewForm={setNewForm}
          saveNew={saveNew}
          setAddingNew={setAddingNew}
          sortKey={sortKey}
          sortAsc={sortAsc}
          toggleSort={toggleSort}
        />
      ) : (
        <SectionsView
          catalog={search ? filtered : catalog}
          onMove={handleMove}
          onDelete={deleteCatalogItem}
          onSave={handleSave}
        />
      )}
      </>
      )}
    </div>
  )
}
