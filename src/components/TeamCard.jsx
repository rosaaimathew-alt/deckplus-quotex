import { useCallback, useEffect, useState } from 'react'
import { Users, Copy, X, KeyRound, CheckCircle2 } from 'lucide-react'
import { useStore } from '../store'
import { createInvite, listInvites, revokeInvite, changePassword } from '../supabase'
import { DEMO } from '../demo'

// ── Settings › Team ──────────────────────────────────────────────────────────
// Admin / office: invite people by email and role. Each invite is a one-time
// link (good for 14 days); the person sets their own name and password.

const ROLES = [
  { key: 'rep',    label: 'Sales',           blurb: 'Proposals, pipeline, contracts' },
  { key: 'pm',     label: 'Project Manager', blurb: 'Jobs, subs, scheduling' },
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
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">On the team ({members.length})</p>
        <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {members.map(m => (
            <div key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <p className="flex-1 min-w-0 truncate text-gray-800">{m.displayName || m.email}<span className="text-gray-400"> · {m.email}</span></p>
              <span className="text-xs text-gray-500">{roleLabel(m.role)}{m.id === me?.id ? ' (you)' : ''}</span>
            </div>
          ))}
        </div>
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
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-40 transition-colors">
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </form>
  )
}
