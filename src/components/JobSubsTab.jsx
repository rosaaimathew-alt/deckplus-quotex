// ── Subs tab (Jobs page) ─────────────────────────────────────────────────────
// Book a subcontractor for a service on this job, follow it through
// Booked → Started → Near completion → Completed, and line up the inspection
// once it's near completion or done. Same records as the phone (lib/subTasks).
import { useState } from 'react'
import { Plus, X, CalendarDays, Phone, Pencil } from 'lucide-react'
import { useStore } from '../store'
import { missingTodaysPhotos } from '../lib/taskPhotos'
import { drawnOn, money, agreedOf } from '../lib/subDraws'
import { PhotoDays } from './TaskPhotos'
import { SUB_STATUSES, STATUS_PILL, statusKey, statusLabel, tasksForJob, needsInspection, subNameOf } from '../lib/subTasks'
import { ELECTRICAL_ITEM_NAMES, electricalItemsOf, cleanElectricalItems, isElectricalBooking } from '../lib/electricalItems'

const fmt = (ymd) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '')
const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--brand-300,#93c5fd)]'

// The booking form: shared by the Jobs page and the phone.
export function BookSubForm({ proposal, onDone, big = false }) {
  const subs = useStore(s => s.subcontractors)
  const me = useStore(s => s.me)
  const addSubTask = useStore(s => s.addSubTask)
  const setAgreedAmount = useStore(s => s.setAgreedAmount)
  const active = (subs || []).filter(s => s && s.active !== false && !s.endDate).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  const isOffice = useStore(s => s.role === 'manager')   // the agreed amount is the office's call
  const [f, setF] = useState({ subId: '', title: '', startDate: '', endDate: '', notes: '', agreed: '' })
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))
  const sub = active.find(s => String(s.id) === f.subId)
  const ok = sub && f.title.trim()

  const save = () => {
    if (!ok) return
    const id = addSubTask({
      proposalId: proposal.id,
      subId: sub.id, subName: sub.name || '', subUserId: sub.userId || null,
      pmId: proposal.pmId || me?.id || null,
      title: f.title.trim(), notes: f.notes.trim(),
      startDate: f.startDate || null, endDate: f.endDate || null,
      // What the sub needs to find the job, without opening the proposal.
      client: proposal.client || '', address: proposal.address || '',
    })
    if (isOffice && Number(f.agreed) > 0) setAgreedAmount(id, Math.round(Number(f.agreed) * 100) / 100)
    onDone?.()
  }

  const fld = big ? 'w-full h-12 px-3 rounded-xl border border-gray-300 bg-white text-base text-gray-900' : inputCls
  const lbl = big ? 'block text-sm font-medium text-gray-600 mb-1' : 'block text-xs font-medium text-gray-600 mb-1'
  return (
    <div className={big ? 'space-y-3' : 'bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3'}>
      <div>
        <label className={lbl}>Sub</label>
        <select value={f.subId} onChange={set('subId')} className={fld} aria-label="Sub">
          <option value="">Choose a sub…</option>
          {active.map(s => <option key={s.id} value={String(s.id)}>{s.name}{s.trade ? ` · ${s.trade}` : ''}</option>)}
        </select>
        {active.length === 0 && <p className="text-xs text-gray-500 mt-1">No subs yet. Add them under Money › Vendors.</p>}
      </div>
      <div>
        <label className={lbl}>Service</label>
        <input value={f.title} onChange={set('title')} placeholder="e.g. Frame the deck" className={fld} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Start</label>
          <input type="date" value={f.startDate} onChange={set('startDate')} className={fld} />
        </div>
        <div>
          <label className={lbl}>Finish by</label>
          <input type="date" value={f.endDate} min={f.startDate || undefined} onChange={set('endDate')} className={fld} />
        </div>
      </div>
      <div>
        {isOffice && (
          <div className="mb-3">
            <label className={lbl}>Agreed amount</label>
            <input inputMode="decimal" value={f.agreed} onChange={e => setF(x => ({ ...x, agreed: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="$ the sub can draw against" className={fld} />
          </div>
        )}
        <label className={lbl}>Notes for the sub</label>
        <textarea rows={2} value={f.notes} onChange={set('notes')} className={`${fld} ${big ? 'h-auto py-2' : ''} resize-none`} />
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={!ok}
          className={`flex-1 ${big ? 'h-12 rounded-xl text-base' : 'py-1.5 text-xs rounded-lg'} font-semibold text-white bg-[var(--brand-600)] hover:bg-[var(--brand-700)] disabled:opacity-40`}>Book sub</button>
        <button onClick={onDone}
          className={`flex-1 ${big ? 'h-12 rounded-xl text-base' : 'py-1.5 text-xs rounded-lg'} border border-gray-200 text-gray-600 hover:bg-gray-50`}>Cancel</button>
      </div>
    </div>
  )
}

export default function JobSubsTab({ proposal }) {
  const tasks = tasksForJob(useStore(s => s.subTasks), proposal.id)
  const subs = useStore(s => s.subcontractors)
  const setSubTaskStatus = useStore(s => s.setSubTaskStatus)
  const isOffice = useStore(s => s.role === 'manager')
  const draws = useStore(s => s.subDraws)
  const terms = useStore(s => s.subTerms)
  const setAgreedAmount = useStore(s => s.setAgreedAmount)
  const updateSubTask = useStore(s => s.updateSubTask)
  const deleteSubTask = useStore(s => s.deleteSubTask)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-500">{tasks.length} booked</p>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
            <Plus size={13} /> Book a sub
          </button>
        )}
      </div>

      {adding && <BookSubForm proposal={proposal} onDone={() => setAdding(false)} />}

      {tasks.length === 0 && !adding && <p className="text-xs text-gray-400 italic">No subs booked on this job.</p>}

      {tasks.map(t => {
        const sub = (subs || []).find(s => String(s.id) === String(t.subId))
        const st = statusKey(t)
        return (
          <div key={t.id} className={`border rounded-xl p-3 space-y-2 ${needsInspection(t) ? 'border-amber-300 bg-amber-50/40' : 'border-gray-100'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{t.title}</p>
                <p className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                  <span>{subNameOf(t, subs)}{t.crewName ? ` · ${t.crewName}` : ''}</span>
                  {sub?.phone && <a href={`tel:${sub.phone}`} className="flex items-center gap-0.5 hover:underline"><Phone size={11} /> {sub.phone}</a>}
                  {(t.startDate || t.endDate) && (
                    <span className="flex items-center gap-0.5"><CalendarDays size={11} /> {fmt(t.startDate) || '?'}{t.endDate ? ` – ${fmt(t.endDate)}` : ''}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_PILL[st]}`}>{statusLabel(t)}</span>
                <button onClick={() => setEditingId(id => (id === t.id ? null : t.id))}
                  className="text-gray-300 hover:text-gray-700" aria-label={`Edit booking: ${t.title}`}><Pencil size={13} /></button>
                <button onClick={() => window.confirm(`Remove "${t.title}" for ${subNameOf(t, subs)}?`) && deleteSubTask(t.id)}
                  className="text-gray-300 hover:text-red-500" aria-label="Remove booking"><X size={13} /></button>
              </div>
            </div>
            {editingId === t.id
              ? <EditBooking task={t} electrical={isElectricalBooking(t, sub)} contractItems={electricalItemsOf(proposal.contractDraft?.dp?.values)}
                  onSave={(changes) => { updateSubTask(t.id, changes); setEditingId(null) }} onCancel={() => setEditingId(null)} />
              : <>
                  {t.notes && <p className="text-xs text-gray-600 whitespace-pre-wrap">{t.notes}</p>}
                  {(t.electrical || []).length > 0 && (
                    <ul className="text-xs text-gray-600" aria-label="Electrical items">
                      {t.electrical.map((it, i) => <li key={i}>{it.qty ? `${it.qty} × ` : ''}{it.label}</li>)}
                    </ul>
                  )}
                </>}
            {isOffice && <AgreedLine key={`${t.id}-${agreedOf(t.id, terms)}`} task={t} agreed={agreedOf(t.id, terms) || null} draws={draws} onSave={(v) => setAgreedAmount(t.id, v)} />}
            {missingTodaysPhotos(t) && <p className="text-xs font-semibold text-red-600">No photos from the sub today</p>}
            <PhotoDays task={t} />
            <div className="flex items-center gap-1.5 flex-wrap">
              {SUB_STATUSES.map(s => (
                <button key={s.key} onClick={() => s.key !== st && setSubTaskStatus(t.id, s.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${s.key === st
                    ? 'border-[var(--brand-600)] bg-[var(--brand-600)] text-white'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{s.label}</button>
              ))}
            </div>
            {(st === 'near' || st === 'done') && (
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <span className={`font-semibold ${t.inspectionDate ? 'text-gray-700' : 'text-amber-700'}`}>
                  {t.inspectionDate ? 'Inspection' : 'Schedule the inspection'}
                </span>
                <input type="date" value={t.inspectionDate || ''} onChange={e => updateSubTask(t.id, { inspectionDate: e.target.value || null })}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1" />
              </label>
            )}
          </div>
        )
      })}
    </div>
  )
}

// Correct a booking after it's made: the service, its dates and the notes the
// sub reads. The sub's phone shows the change right away.
// An electrical booking also carries the list of electrical items the
// electricians see on their phone. It starts from the job's contract when the
// contract was made here; otherwise it's typed in. There is always one empty
// line to add the next item; an item with its wording cleared is dropped on Save.
function EditBooking({ task, electrical = false, contractItems = [], onSave, onCancel }) {
  const [f, setF] = useState({ title: task.title || '', startDate: task.startDate || '', endDate: task.endDate || '', notes: task.notes || '' })
  const [items, setItems] = useState(() => ((task.electrical || []).length ? task.electrical : contractItems).map(it => ({ label: it.label || '', qty: it.qty || '' })))
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }))
  const blank = (r) => !r.label.trim() && !r.qty.trim()
  const rows = items.length && blank(items[items.length - 1]) ? items : [...items, { label: '', qty: '' }]
  const setItem = (i, k, v) => setItems(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
      <div>
        <label className={lbl}>Service</label>
        <input value={f.title} onChange={set('title')} className={inputCls} aria-label="Service" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Start</label>
          <input type="date" value={f.startDate} onChange={set('startDate')} className={inputCls} aria-label="Start" />
        </div>
        <div>
          <label className={lbl}>Finish by</label>
          <input type="date" value={f.endDate} min={f.startDate || undefined} onChange={set('endDate')} className={inputCls} aria-label="Finish by" />
        </div>
      </div>
      <div>
        <label className={lbl}>Notes for the sub</label>
        <textarea rows={2} value={f.notes} onChange={set('notes')} className={`${inputCls} resize-none`} aria-label="Notes for the sub" />
      </div>
      {electrical && (
        <div>
          <label className={lbl}>Electrical items</label>
          <datalist id="electrical-item-names">{ELECTRICAL_ITEM_NAMES.map(n => <option key={n} value={n} />)}</datalist>
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_64px] gap-2">
                <input value={r.label} list="electrical-item-names" onChange={e => setItem(i, 'label', e.target.value)} placeholder={i === rows.length - 1 ? 'Add an item…' : ''} className={inputCls} aria-label={`Electrical item ${i + 1}`} />
                <input value={r.qty} inputMode="numeric" onChange={e => setItem(i, 'qty', e.target.value)} placeholder="Qty" className={`${inputCls} text-center`} aria-label={`Electrical item ${i + 1} quantity`} />
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => onSave({ title: f.title.trim(), startDate: f.startDate || null, endDate: f.endDate || null, notes: f.notes.trim(), ...(electrical ? { electrical: cleanElectricalItems(items) } : {}) })} disabled={!f.title.trim()}
          className="flex-1 py-1.5 text-xs rounded-lg font-semibold text-white bg-[var(--brand-600)] hover:bg-[var(--brand-700)] disabled:opacity-40">Save</button>
        <button onClick={onCancel} className="flex-1 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  )
}

// Office only: what the sub may draw on this booking, and what they've drawn.
function AgreedLine({ task, agreed, draws, onSave }) {
  const [v, setV] = useState(agreed != null ? String(agreed) : '')
  const drawn = drawnOn(task.id, draws)
  const save = () => {
    const n = v.trim() === '' ? null : Math.round(Number(v) * 100) / 100
    if (n === agreed || (n != null && !(n >= 0))) return
    if (n != null && n < drawn) { window.alert(`The sub has already drawn ${money(drawn)} on this.`); setV(String(agreed ?? '')); return }
    onSave(n)
  }
  return (
    <div className="flex items-center gap-2 text-xs text-gray-700 flex-wrap">
      <span className="font-semibold">Agreed</span>
      <input inputMode="decimal" value={v} onChange={e => setV(e.target.value.replace(/[^\d.]/g, ''))} onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} placeholder="$0.00"
        className="w-28 text-xs border border-gray-200 rounded-lg px-2 py-1" aria-label="Agreed amount" />
      {agreed > 0 && <span className="text-gray-500">Drawn {money(drawn)} · Left {money(agreed - drawn)}</span>}
    </div>
  )
}
