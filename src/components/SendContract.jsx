// ── Send to Client (contract editor and Contracts list) ─────────────────────
// What to do with a contract's signing link once it exists: copy it, or email
// it to the customer from here in the Deck Plus look (api/email.js
// 'contract-send'), and optionally have the app nudge them every few days
// until they sign (supabase/contract_reminders.sql; the server sends them each
// morning, api/_contractReminders.js).
import { useEffect, useState } from 'react'
import { Bell, CheckCircle2, Copy, Loader2, Mail } from 'lucide-react'
import { supabase } from '../supabase'
import { useStore } from '../store'
import { QuickPicks } from './FilterBar'
import { loadContractReminders } from '../lib/contractReminders'

const DAILY = 1
const EVERY = [
  { value: 0, label: 'Off' },
  { value: DAILY, label: 'Daily' },
  { value: 2, label: 'Every 2 days' },
  { value: 3, label: 'Every 3 days' },
  { value: 7, label: 'Weekly' },
]
const validEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || '').trim())
const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` }

export default function SendContract({ proposal, links, autoSigned = false, onReminder }) {
  const me = useStore(s => s.me)
  const saveContractDraft = useStore(s => s.saveContractDraft)
  const draft = proposal?.contractDraft || {}
  const [copied, setCopied] = useState('')
  const [to, setTo] = useState(draft.sentToClientEmail || proposal?.email || '')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(draft.sentToClientAt ? { at: draft.sentToClientAt, to: draft.sentToClientEmail } : null)
  const [error, setError] = useState('')
  const [reminder, setReminder] = useState(null)   // null while loading, then the row or false
  const [savingReminder, setSavingReminder] = useState(false)

  const id = proposal?.id
  useEffect(() => {
    let live = true
    loadContractReminders().then(all => { if (live) setReminder(all[String(id)] || false) }).catch(() => { if (live) setReminder(false) })
    return () => { live = false }
  }, [id])

  // Sending a contract turns on a daily reminder by itself, so a customer who
  // hasn't signed hears about it every morning until they do. It never
  // overrides a choice already made: a reminder that is set stays as it is,
  // and one switched Off for this contract stays off.
  const startDaily = async (address) => {
    if (reminder !== false || draft.signReminderOff || !validEmail(address) || id == null) return
    const { data, error: err } = await supabase.rpc('contract_reminder_set', { p_proposal_id: String(id), p_every_days: DAILY, p_email: address.trim() })
    if (err || !data) return
    setReminder(data)
    onReminder?.(String(id), data)
  }

  const copy = (role) => {
    navigator.clipboard?.writeText(links[role])
    setCopied(role); setTimeout(() => setCopied(''), 2000)
    // copying the customer's link is sending it another way
    if (role === 'client') startDaily(to)
  }
  const send = async () => {
    if (!validEmail(to)) { setError("Enter the customer's email address."); return }
    setSending(true); setError('')
    try {
      const res = await fetch('/api/email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'contract-send', to: to.trim(), client: proposal?.client || '', signLink: links.client, fromName: me?.displayName || '' }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok || !out.success) throw new Error(out.error || 'The email could not be sent.')
      const at = new Date().toISOString()
      setSent({ at, to: to.trim() })
      if (id != null) saveContractDraft(id, { sentToClientAt: at, sentToClientEmail: to.trim() })
      startDaily(to)
    } catch (e) { setError(e.message) }
    setSending(false)
  }
  const setEvery = async (days) => {
    if (days && !validEmail(to)) { setError("Add the customer's email first, so the reminders have somewhere to go."); return }
    setSavingReminder(true); setError('')
    const { data, error: err } = await supabase.rpc('contract_reminder_set', { p_proposal_id: String(id), p_every_days: days, p_email: validEmail(to) ? to.trim() : null })
    setSavingReminder(false)
    if (err) { setError('Could not save the reminder. Try again.'); return }
    setReminder(data || false)
    onReminder?.(String(id), data || null)
    // remembered on the contract, so sending again doesn't switch it back on
    if (!!draft.signReminderOff !== !days) saveContractDraft(id, { signReminderOff: !days })
  }

  const box = 'border border-gray-200 rounded-xl p-3 space-y-2'
  const head = 'flex items-center gap-2 text-sm font-semibold text-gray-800'
  return (
    <div className="space-y-3" aria-label="Send to client">
      {/* 1. Copy the link */}
      <div className={box}>
        <div className="flex items-center justify-between gap-2">
          <p className={head}><Copy size={15} className="text-gray-400" /> Client signing link</p>
          <button type="button" onClick={() => copy('client')} className="px-3 py-1.5 bg-[var(--brand-600)] text-white rounded-lg text-xs font-semibold hover:bg-[var(--brand-700)]">{copied === 'client' ? 'Copied!' : 'Copy link'}</button>
        </div>
        <p className="text-[11px] text-gray-500 break-all bg-gray-50 rounded px-2 py-1 select-all">{links.client}</p>
      </div>

      {/* 2. Email it from here */}
      <div className={box}>
        <p className={head}><Mail size={15} className="text-gray-400" /> Email it to the client</p>
        <div className="flex gap-2">
          <input type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="Customer's email" aria-label="Customer's email"
            className="flex-1 min-w-0 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]" />
          <button type="button" onClick={send} disabled={sending}
            className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 bg-[var(--brand-600)] text-white rounded-lg text-sm font-semibold hover:bg-[var(--brand-700)] disabled:opacity-50">
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} {sent ? 'Send again' : 'Send email'}
          </button>
        </div>
        {sent && <p className="flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle2 size={13} /> Sent to {sent.to} · {when(sent.at)}</p>}
      </div>

      {/* 3. Nudge them until they sign */}
      <div className={box}>
        <p className={head}><Bell size={15} className="text-gray-400" /> Remind to sign {savingReminder && <Loader2 size={13} className="animate-spin text-gray-400" />}</p>
        {reminder === null
          ? <p className="text-xs text-gray-400">Loading…</p>
          : <QuickPicks value={reminder ? reminder.everyDays : 0} options={EVERY} onChange={setEvery} />}
        {reminder
          ? <p className="text-xs text-gray-500">{reminder.sentCount || 0} of {reminder.maxCount || 3} sent{reminder.lastSentAt ? ` · last ${when(reminder.lastSentAt)}` : ''}. Stops when they sign.</p>
          : reminder === false && !draft.signReminderOff ? <p className="text-xs text-gray-500">Turns on daily when you send.</p> : null}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!autoSigned && links.builder && (
        <p className="flex items-center justify-between gap-2 text-xs text-gray-500">
          <span>Deck Plus signs with its own link.</span>
          <button type="button" onClick={() => copy('builder')} className="text-[var(--brand-700)] font-semibold hover:underline">{copied === 'builder' ? 'Copied!' : 'Copy Deck Plus link'}</button>
        </p>
      )}
    </div>
  )
}
