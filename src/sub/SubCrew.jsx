// ── Sub app: an outside company's PM and their crew ──────────────────────────
// Some subs are whole companies with their own PM and their own people (the
// out-of-network electricians). The office ticks "Outside company with its
// own PM and crew" on the sub; the login on that sub is the company's PM.
// Here that PM invites their electricians and puts one on each job. An
// electrician then sees only the jobs they're put on: status and the daily
// photos, never the agreed amount or invoices (supabase/sub_role.sql).
import { useState } from 'react'
import { tr } from '../lib/lang'
import { useNavigate } from 'react-router-dom'
import { Users, ChevronRight, UserPlus, CheckCircle2 } from 'lucide-react'
import { useStore } from '../store'
import { createCrewInvite } from '../supabase'
import { useCrew, useCanAssign } from './useCrew'
import { DEMO } from '../demo'
import { Card, BackButton } from '../field/shared'

// On the task list: the company PM's way into their crew.
export function CrewLink() {
  const navigate = useNavigate()
  const crew = useCrew()
  if (!crew.hasCrew) return null
  const joined = crew.crew.filter(c => c.userId).length
  return (
    <button onClick={() => navigate('/crew')} className="w-full text-left bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3.5 flex items-center gap-3 active:bg-gray-50">
      <Users size={20} className="text-gray-500 shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="block text-base font-semibold text-gray-900">{tr('Your crew')}</span>
        <span className="block text-sm text-gray-500">{joined} {tr('on the app')}{crew.crew.length > joined ? ` · ${crew.crew.length - joined} ${tr('Invited').toLowerCase()}` : ''}</span>
      </span>
      <ChevronRight size={20} className="text-gray-300 shrink-0" />
    </button>
  )
}

// On a task: who from the crew is on it.
export function CrewPicker({ task }) {
  const crew = useCanAssign(task)
  const updateSubTask = useStore(s => s.updateSubTask)
  if (!crew) return null
  const ready = crew.crew.filter(c => c.userId)
  const pick = (userId) => {
    const c = ready.find(x => x.userId === userId)
    updateSubTask(task.id, { crewUserId: c ? c.userId : null, crewName: c ? c.name : null })
  }
  return (
    <Card className="p-4 space-y-2">
      <p className="text-base font-semibold text-gray-900 flex items-center gap-2"><Users size={18} className="text-gray-500" /> {tr("Who's on it")}</p>
      <select value={task.crewUserId || ''} onChange={e => pick(e.target.value)} aria-label="Crew member"
        className="w-full h-12 px-3 rounded-xl border border-gray-300 bg-white text-base text-gray-900">
        <option value="">{tr('Nobody yet')}</option>
        {ready.map(c => <option key={c.userId} value={c.userId}>{c.name}</option>)}
      </select>
      {ready.length === 0 && <p className="text-sm text-gray-500">Invite your crew first (Your crew, on the first screen).</p>}
    </Card>
  )
}

export function CrewScreen() {
  const crew = useCrew()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const invite = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      if (DEMO) throw new Error('Invites are turned off in the demo.')
      const r = await createCrewInvite(email.trim(), name.trim())
      const link = `${window.location.origin}/signup?code=${r.code}`
      try { await navigator.clipboard?.writeText(link) } catch { /* shown below */ }
      setMsg({ ok: true, text: `Link for ${r.display_name} copied. Text it to them; it works for 14 days.`, link })
      setName(''); setEmail('')
      crew.reload()
    } catch (err) { setMsg({ ok: false, text: err.message }) } finally { setBusy(false) }
  }
  if (!crew.hasCrew) {
    return <div className="space-y-4"><BackButton /><p className="text-base text-gray-600">{tr("This login doesn't run a crew.")}</p></div>
  }
  return (
    <div className="space-y-4">
      <BackButton />
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{tr('Your crew')}</h1>
        {crew.company && <p className="text-sm text-gray-500">{crew.company}</p>}
      </div>
      <Card className="divide-y divide-gray-100 overflow-hidden">
        {crew.crew.length === 0 && <p className="px-4 py-3 text-sm text-gray-500">{tr('Nobody yet.')}</p>}
        {crew.crew.map(c => (
          <div key={c.email} className="px-4 py-3 flex items-center gap-3">
            <span className="flex-1 min-w-0">
              <span className="block text-base font-medium text-gray-900 truncate">{c.name}</span>
              <span className="block text-sm text-gray-500 truncate">{c.email}</span>
            </span>
            {c.userId
              ? <span className="text-sm font-semibold text-green-700 flex items-center gap-1"><CheckCircle2 size={16} /> {tr('On the app')}</span>
              : <span className="text-sm text-gray-500">{tr('Invited')}</span>}
          </div>
        ))}
      </Card>
      <Card className="p-4">
        <form onSubmit={invite} className="space-y-3">
          <p className="text-base font-semibold text-gray-900 flex items-center gap-2"><UserPlus size={18} className="text-gray-500" /> {tr('Add someone')}</p>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={tr('Their name')}
            className="w-full h-12 px-3 rounded-xl border border-gray-300 bg-white text-base text-gray-900 outline-none" />
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder={tr('Their email')}
            className="w-full h-12 px-3 rounded-xl border border-gray-300 bg-white text-base text-gray-900 outline-none" />
          <button type="submit" disabled={busy || !name.trim() || !email.trim()}
            className="w-full h-12 rounded-xl bg-[var(--brand-600)] text-white text-base font-bold disabled:opacity-40">{tr(busy ? 'Inviting…' : 'Invite')}</button>
          {msg && <p className={`text-sm break-all ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.text}{msg.link ? <><br />{msg.link}</> : null}</p>}
        </form>
      </Card>
    </div>
  )
}
