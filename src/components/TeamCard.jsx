import { useCallback, useEffect, useState } from 'react'
import { Users, Copy, X, KeyRound, CheckCircle2, UserMinus, SlidersHorizontal } from 'lucide-react'
import { useStore } from '../store'
import { createInvite, listInvites, revokeInvite, changePassword, removeMember, resetMemberPassword, setMemberRole, setMemberPermissions } from '../supabase'
import { permissionGroups, departmentAllows } from '../permissions'
import { DEMO } from '../demo'

// ── Settings › Team ──────────────────────────────────────────────────────────
// Admin / office: invite people by email and role. Each invite is a one-time
// link (good for 14 days); the person sets their own name and password.

const ROLES = [
  { key: 'rep',    label: 'Sales',           blurb: 'Proposals, pipeline, contracts' },
  { key: 'pm',     label: 'Project Manager', blurb: 'Jobs, subs, scheduling' },
  { key: 'paint',  label: 'Paint PM',        blurb: 'Paint queue, schedule and touch-ups' },
  { key: 'office', label: 'Office',          blurb: 'Everything, plus settings' },
  { key: 'admin',  label: 'Admin',           blurb: 'Everything, plus the team' },
]
const roleLabel = (k) => ROLES.find(r => r.key === k)?.label || k
const inputCls = 'w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--brand-200)]'
const linkFor = (code) => `${window.location.origin}/signup?code=${code}`

export function TeamCard() {
  const me      = useStore(s => s.me)
  const members = useStore(s => s.members) || []
  const isAdmin = me?.role === 'admin'
  const [invites, setInvites] = useState([])
  const [email, setEmail]     = useState('')
  const [name, setName]       = useState('')
  const [role, setRole]       = useState('rep')
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState('')
  const [fresh, setFresh]     = useState(null)   // the invite just created
  const [copied, setCopied]   = useState('')
  const [removing, setRemoving] = useState('')   // user id being removed
  const adminCount = members.filter(m => m.role === 'admin').length
  // Admins only; never yourself, never the last admin.
  const canRemove = (m) => isAdmin && !DEMO && m.id !== me?.id && !(m.role === 'admin' && adminCount <= 1)
  const remove = async (m) => {
    if (!window.confirm(`Remove ${m.displayName || m.email} from the team?\n\nThey won't be able to sign in to Deck Plus anymore. Their proposals and jobs stay with the company.`)) return
    setRemoving(m.id); setError('')
    try {
      await removeMember(m.id, useStore.getState().orgId)
      useStore.setState(s => ({ members: (s.members || []).filter(x => x.id !== m.id) }))
    } catch (e) { setError(e.message) }
    setRemoving('')
  }

  // Change someone's role. Admin: anyone but yourself (never the last admin).
  // Office: non-admins, to a non-admin role. The database checks the same.
  const [changing, setChanging] = useState('')   // user id whose role is saving
  const canChangeRole = (m) => !DEMO && m.id !== me?.id && (isAdmin || m.role !== 'admin')
    && !(m.role === 'admin' && adminCount <= 1)
  const changeRole = async (m, next) => {
    if (next === m.role) return
    const label = roleLabel(next)
    const extra = next === 'paint' ? '\n\nPaint PM only gets the phone paint screens (Queue, Schedule, Touch-ups) and won jobs.' : ''
    if (!window.confirm(`Change ${m.displayName || m.email} to ${label}?${extra}\n\nThey'll see the change the next time they open the app.`)) return
    setChanging(m.id); setError('')
    try {
      await setMemberRole(m.id, next)
      useStore.setState(s => ({ members: (s.members || []).map(x => x.id === m.id ? { ...x, role: next } : x) }))
    } catch (e) { setError(e.message) }
    setChanging('')
  }

  // Admin: switch sections off for one person (Access). Not yourself, and not
  // the paint PM (Field mode only — nothing to switch).
  const [accessFor, setAccessFor] = useState('')
  const canAccess = (m) => isAdmin && !DEMO && m.id !== me?.id && m.role !== 'paint'

  // Admin: a new temporary password for someone who's locked out (no email needed).
  const [resetting, setResetting] = useState('')
  const [tempPw, setTempPw] = useState(null)   // { name, password }
  const canReset = (m) => isAdmin && !DEMO && m.id !== me?.id
  const resetPw = async (m) => {
    if (!window.confirm(`Give ${m.displayName || m.email} a new temporary password?\n\nTheir old password stops working. You'll see the new one here to pass along.`)) return
    setResetting(m.id); setError(''); setTempPw(null)
    try { setTempPw({ name: m.displayName || m.email, email: m.email, password: await resetMemberPassword(m.id) }) }
    catch (e) { setError(e.message) }
    setResetting('')
  }

  const refresh = useCallback(async () => {
    try { setInvites(await listInvites() || []) } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => {
    if (DEMO) return
    let live = true
    listInvites().then(r => { if (live) setInvites(r || []) }).catch(e => { if (live) setError(e.message) })
    return () => { live = false }
  }, [])

  const copy = async (code) => {
    try { await navigator.clipboard.writeText(linkFor(code)); setCopied(code); setTimeout(() => setCopied(''), 2000) } catch { /* shown for manual copy */ }
  }

  const invite = async (e) => {
    e.preventDefault()
    setBusy(true); setError(''); setFresh(null)
    try {
      const r = await createInvite({ email: email.trim(), role, displayName: name.trim() })
      setFresh(r); setEmail(''); setName('')
      await refresh()
      copy(r.code)
    } catch (err) { setError(err.message) }
    setBusy(false)
  }

  const cancel = async (code) => {
    setError('')
    try { await revokeInvite(code); await refresh() } catch (err) { setError(err.message) }
  }

  if (DEMO) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Users size={16} className="text-gray-400" />
          <h3 className="font-semibold text-gray-800 text-sm">Team</h3>
        </div>
        <p className="text-xs text-gray-400">Invite someone by email. They open the link and set their own name and password. Links work once and expire after 14 days.</p>
      </div>

      <form onSubmit={invite} className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-2 items-end">
        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Email</span>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="name@company.com" aria-label="Invite email" />
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Name (optional)</span>
          <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="They can change it" aria-label="Invite name" />
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Role</span>
          <select value={role} onChange={e => setRole(e.target.value)} className={inputCls} aria-label="Invite role">
            {ROLES.filter(r => isAdmin || r.key !== 'admin').map(r => <option key={r.key} value={r.key}>{r.label} — {r.blurb}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy || !email.trim()}
          className="h-[38px] px-4 bg-[var(--brand-600)] text-white text-sm font-medium rounded-lg hover:bg-[var(--brand-700)] disabled:opacity-40 transition-colors whitespace-nowrap">
          {busy ? 'Creating…' : 'Create invite'}
        </button>
      </form>

      {fresh && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          <p className="font-medium text-emerald-800 flex items-center gap-1.5"><CheckCircle2 size={15} /> Invite for {fresh.email} ({roleLabel(fresh.role)}) — link copied</p>
          <p className="text-xs text-emerald-700 mt-1 break-all font-mono">{linkFor(fresh.code)}</p>
          <p className="text-xs text-emerald-700 mt-1">Send it to them by text or email.</p>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {invites.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Waiting to sign up</p>
          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {invites.map(i => (
              <div key={i.code} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="text-gray-800 truncate">{i.display_name ? `${i.display_name} · ` : ''}{i.email}</p>
                  <p className="text-xs text-gray-400">{roleLabel(i.role)} · expires {new Date(i.expires_at).toLocaleDateString()}</p>
                </div>
                <button type="button" onClick={() => copy(i.code)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                  <Copy size={12} /> {copied === i.code ? 'Copied' : 'Copy link'}
                </button>
                <button type="button" onClick={() => cancel(i.code)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-600" aria-label={`Cancel invite for ${i.email}`}>
                  <X size={13} /> Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        {tempPw && (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
            <p>New temporary password for <b>{tempPw.name}</b>:</p>
            <div className="flex items-center gap-2 mt-1.5">
              <code className="font-mono text-base bg-white border border-emerald-200 rounded px-2 py-0.5 select-all">{tempPw.password}</code>
              <button onClick={() => { navigator.clipboard?.writeText(tempPw.password); setCopied('pw'); setTimeout(() => setCopied(''), 2000) }} className="text-xs underline">{copied === 'pw' ? 'Copied!' : 'Copy'}</button>
              <button onClick={() => setTempPw(null)} className="text-xs text-emerald-700 ml-auto">Done</button>
            </div>
            <p className="text-xs text-emerald-800 mt-1.5">Send it to them. They sign in at deckplus.app with {tempPw.email} and this password, then can pick their own under Settings → Change password.</p>
          </div>
        )}
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">On the team ({members.length})</p>
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {members.map(m => (
            <div key={m.id}>
            <div className="flex items-center gap-3 px-3 py-2 text-sm">
              <p className="flex-1 min-w-0 truncate text-gray-800">{m.displayName || m.email}<span className="text-gray-400"> · {m.email}</span></p>
              {canChangeRole(m) ? (
                <select value={m.role} disabled={!!changing} onChange={e => changeRole(m, e.target.value)}
                  aria-label={`Role for ${m.displayName || m.email}`}
                  className="text-xs text-gray-600 border border-gray-200 rounded px-1.5 py-1 bg-white disabled:opacity-50">
                  {ROLES.filter(r => isAdmin || r.key !== 'admin').map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              ) : (
                <span className="text-xs text-gray-500">{roleLabel(m.role)}{m.id === me?.id ? ' (you)' : ''}</span>
              )}
              {canAccess(m) && (
                <button onClick={() => setAccessFor(a => a === m.id ? '' : m.id)} aria-expanded={accessFor === m.id}
                  title={`Choose what ${m.displayName || m.email} can see`}
                  className={`flex items-center gap-1 text-xs rounded px-2 py-1 ${accessFor === m.id ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-100'}`}>
                  <SlidersHorizontal size={13} /> Access{Object.keys(m.permissions || {}).length ? ` (${Object.keys(m.permissions).length} off)` : ''}
                </button>
              )}
              {canReset(m) && (
                <button onClick={() => resetPw(m)} disabled={!!resetting} title={`Give ${m.displayName || m.email} a new temporary password`}
                  className="flex items-center gap-1 text-xs text-gray-600 hover:bg-gray-100 rounded px-2 py-1 disabled:opacity-50">
                  <KeyRound size={13} /> {resetting === m.id ? 'Resetting…' : 'Reset password'}
                </button>
              )}
              {canRemove(m) && (
                <button onClick={() => remove(m)} disabled={!!removing} title={`Remove ${m.displayName || m.email} from the team`}
                  className="flex items-center gap-1 text-xs text-red-600 hover:bg-red-50 rounded px-2 py-1 disabled:opacity-50">
                  <UserMinus size={13} /> {removing === m.id ? 'Removing…' : 'Remove'}
                </button>
              )}
            </div>
            {accessFor === m.id && <AccessPanel member={m} onClose={() => setAccessFor('')} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Settings › Team › Access ─────────────────────────────────────────────────
// One person's switches. Ticked = they have it. Sections their department
// doesn't include are greyed out (change their role for those). Saved as the
// switched-off keys; the database enforces the money ones (permissions.sql).
function AccessPanel({ member, onClose }) {
  const plan = useStore(s => s.branding?.plan || 'enterprise')
  const allows = departmentAllows(plan, member.role)
  const groups = permissionGroups()
  const [off, setOff] = useState(() => ({ ...(member.permissions || {}) }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const name = member.displayName || member.email
  const toggle = (key) => setOff(o => { const n = { ...o }; if (n[key] === false) delete n[key]; else n[key] = false; return n })

  const save = async () => {
    setSaving(true); setError('')
    try {
      const r = await setMemberPermissions(member.id, off)
      const saved = r?.permissions || off
      useStore.setState(s => ({ members: (s.members || []).map(x => x.id === member.id ? { ...x, permissions: saved } : x) }))
      onClose()
    } catch (e) { setError(e.message) }
    setSaving(false)
  }

  return (
    <div className="mx-3 mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm" role="region" aria-label={`Access for ${name}`}>
      <p className="text-xs text-gray-500 mb-3">
        Untick what <b className="text-gray-700">{name}</b> shouldn't see. It disappears from their menu; money is also locked in the database.
        They'll see the change the next time they open the app.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {groups.map(g => (
          <div key={g.label}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{g.label}</p>
            {g.items.map(it => {
              const possible = allows(it)
              return (
                <label key={it.key} title={possible ? it.hint : `Not part of their department (${roleLabel(member.role)})`}
                  className={`flex items-start gap-2 py-0.5 ${possible ? 'cursor-pointer text-gray-700' : 'text-gray-300 cursor-not-allowed'}`}>
                  <input type="checkbox" className="mt-0.5" disabled={!possible}
                    checked={possible && off[it.key] !== false} onChange={() => toggle(it.key)}
                    aria-label={`${g.label}: ${it.label}`} />
                  <span>{it.label}{it.key === 'job.money' && <span className="block text-[11px] text-gray-400 leading-snug">{it.hint}</span>}</span>
                </label>
              )
            })}
          </div>
        ))}
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      <div className="flex items-center gap-2 mt-3">
        <button onClick={save} disabled={saving}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[var(--brand-600)] hover:bg-[var(--brand-700)] disabled:opacity-50">
          {saving ? 'Saving…' : 'Save access'}
        </button>
        <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-100">Cancel</button>
      </div>
    </div>
  )
}

// ── Settings › Your password ─────────────────────────────────────────────────
export function PasswordCard() {
  const [pw, setPw]       = useState('')
  const [pw2, setPw2]     = useState('')
  const [busy, setBusy]   = useState(false)
  const [msg, setMsg]     = useState('')
  const [error, setError] = useState('')
  if (DEMO) return null
  const ok = pw.length >= 8 && pw === pw2
  const save = async (e) => {
    e.preventDefault()
    if (!ok) return
    setBusy(true); setError(''); setMsg('')
    try { await changePassword(pw); setPw(''); setPw2(''); setMsg('Password changed.') } catch (err) { setError(err.message) }
    setBusy(false)
  }
  return (
    <form onSubmit={save} className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound size={16} className="text-gray-400" />
        <h3 className="font-semibold text-gray-800 text-sm">Your password</h3>
      </div>
      <p className="text-xs text-gray-400 mb-4">Change the password you sign in with.</p>
      <div className="space-y-2">
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" className={inputCls} placeholder="New password (8+ characters)" aria-label="New password" />
        <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" className={inputCls} placeholder="Confirm new password" aria-label="Confirm new password" />
        {pw2 && pw !== pw2 && <p className="text-xs text-red-600">Passwords don't match.</p>}
        {msg && <p className="text-xs text-emerald-700">{msg}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button type="submit" disabled={!ok || busy}
          className="px-4 py-2 bg-[var(--brand-600)] text-white text-sm font-medium rounded-lg hover:bg-[var(--brand-700)] disabled:opacity-40 transition-colors">
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </form>
  )
}
