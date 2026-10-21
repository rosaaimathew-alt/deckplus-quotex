import { useState, useRef, useEffect, useCallback } from 'react'
import { Upload, Trash2, CheckCircle, RefreshCw, Palette, Building2, Eye, Download, FolderOpen, AlertTriangle, CloudUpload, HardDrive, Wifi, WifiOff, Lock, Sparkles, Mail } from 'lucide-react'
import { useStore } from '../store'
import { extractDominantColor, generatePalette, applyBrandStyles, DEFAULT_BRAND_COLOR, FREE_PRIMARY_COLOR, FREE_SIDEBAR_COLOR, BRAND_PRESETS } from '../brand'
import { canCustomizeBranding, PLAN_ORDER, PLAN_META } from '../plans'
import { ROLE_ORDER, ROLE_META } from '../roles'
import { DEMO } from '../demo'
import { TeamCard, PasswordCard } from '../components/TeamCard'
import { CompanySignatureCard, WelcomeEmailCard } from '../components/ContractAutomationCards'

const PRESET_COLORS = [
  { label: 'Sky Blue',    hex: '#0369a1' },
  { label: 'Ocean',       hex: '#0e7490' },
  { label: 'Forest',      hex: '#15803d' },
  { label: 'Slate',       hex: '#334155' },
  { label: 'Indigo',      hex: '#4338ca' },
  { label: 'Violet',      hex: '#7c3aed' },
  { label: 'Rose',        hex: '#be123c' },
  { label: 'Amber',       hex: '#b45309' },
  { label: 'Crimson',     hex: '#9f1239' },
  { label: 'Teal',        hex: '#0f766e' },
  { label: 'Charcoal',    hex: '#1f2937' },
  { label: 'Navy',        hex: '#1e3a5f' },
]

function SidebarPreview({ companyName, tagline, logo, color, sidebar }) {
  const palette = generatePalette(color || DEFAULT_BRAND_COLOR)
  const bg = sidebar || palette[700]
  // Pick readable text on the sidebar background
  const lum = (() => {
    const h = bg.replace('#', '')
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16)
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255
  })()
  const navText = lum > 0.62 ? '#1f2937' : palette[100]
  return (
    <div
      className="rounded-xl overflow-hidden shadow-lg w-48 shrink-0"
      style={{ backgroundColor: bg }}
    >
      {/* Logo area */}
      <div className="px-4 py-4 border-b flex flex-col items-center" style={{ borderColor: 'rgba(255,255,255,0.14)' }}>
        {logo
          ? <img src={logo} alt="logo" className="h-12 object-contain" />
          : <p className="text-lg font-black tracking-widest leading-tight" style={{ color: lum > 0.62 ? '#1f2937' : '#fff' }}>{companyName || 'QUOTEX'}</p>}
      </div>
      {/* Nav items preview */}
      <div className="py-3 px-2 space-y-0.5">
        {['Dashboard', 'Build Quote', 'Proposal Tracker', 'Contracts'].map((item, i) => (
          <div
            key={item}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={i === 0 ? { backgroundColor: '#fff', color: palette[700] } : { color: navText }}
          >
            {item}
          </div>
        ))}
      </div>
      <div className="px-4 py-2.5 border-t" style={{ borderColor: 'rgba(255,255,255,0.14)' }}>
        <p className="text-xs" style={{ color: navText }}>© 2025 {companyName || 'QUOTEX'}</p>
      </div>
    </div>
  )
}

// ── Connect email: each person's own sending mailbox ─────────────────────────
// Pick a provider, enter the address + an app password; the server logs in to
// test it before saving (password encrypted, never sent back to the browser).
const MAIL_HELP = {
  gmail:   { text: 'Gmail needs an App Password, not your normal password. Turn on 2-Step Verification, then create one and paste the 16 letters here.', link: 'https://myaccount.google.com/apppasswords', linkLabel: 'Create a Google App Password' },
  outlook: { text: 'Use your Outlook password, or an app password if you have two-step sign-in. Some Microsoft 365 companies turn this off — your IT admin can enable "Authenticated SMTP" for your mailbox.', link: 'https://account.live.com/proofs/AppPassword', linkLabel: 'Create a Microsoft app password' },
  yahoo:   { text: 'Yahoo needs an app password from Account Security.', link: 'https://login.yahoo.com/myaccount/security/app-password', linkLabel: 'Create a Yahoo app password' },
  icloud:  { text: 'iCloud needs an app-specific password.', link: 'https://account.apple.com/account/manage', linkLabel: 'Create an Apple app-specific password' },
  godaddy: { text: 'Use your GoDaddy (Microsoft 365 by GoDaddy uses the Outlook option) email password.' },
  zoho:    { text: 'Use an application-specific password if you have two-factor sign-in on.' },
  other:   { text: "Ask your email provider for its \"SMTP\" (outgoing mail) server name and port." },
}

function EmailConnectCard() {
  const [status, setStatus]   = useState(null)   // mailbox-status response
  const [loadErr, setLoadErr] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy]       = useState('')
  // Back from Google's sign-in window: show how it went.
  const back = new URLSearchParams(window.location.search)
  const [error, setError]     = useState(() => back.get('mailbox') === 'error' ? (back.get('msg') || 'Google sign-in didn\'t finish.') : '')
  const [note, setNote]       = useState(() => back.get('mailbox') === 'connected' ? `Connected ${back.get('email') || 'your Google account'}. Send yourself a test to be sure.` : '')
  const [manual, setManual]   = useState(false)   // show the app-password form instead of Sign in with Google
  const [f, setF] = useState({ provider: 'gmail', email: '', password: '', host: '', port: 587, companyDefault: false })
  const set = (p) => setF(x => ({ ...x, ...p }))

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/google-auth/mailbox-status')
      const body = await r.json().catch(() => ({}))
      if (!r.ok) { setLoadErr(body.error || `Couldn't load your email settings (error ${r.status}).`); return }
      setStatus(body); setLoadErr('')
    } catch { setLoadErr("Couldn't reach the server.") }
  }, [])
  useEffect(() => { load() }, [load])

  const post = async (action, payload, label) => {
    setBusy(label); setError(''); setNote('')
    try {
      const r = await fetch(`/api/google-auth/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload || {}) })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) { setError(body.error || `Something went wrong (error ${r.status}).`); return null }
      return body
    } catch { setError("Couldn't reach the server."); return null }
    finally { setBusy('') }
  }
  const signInWithGoogle = async () => {
    const ok = await post('mailbox-google', {}, 'google')
    if (ok?.url) window.location.href = ok.url
  }
  const connect = async () => {
    const ok = await post('mailbox-connect', f, 'connect')
    if (ok) { setEditing(false); set({ password: '' }); setNote('Connected — the login worked. Send yourself a test to be sure.'); load() }
  }
  const test = async () => {
    const ok = await post('mailbox-test', {}, 'test')
    if (ok) setNote(`Test email sent to ${ok.sentTo}. Check your inbox (and spam folder).`)
  }
  const disconnect = async () => {
    if (!window.confirm('Disconnect your mailbox? Emails you send will go out from the company mailbox instead.')) return
    const ok = await post('mailbox-disconnect', {}, 'disconnect')
    if (ok) { setNote('Disconnected.'); load() }
  }

  const providers = status?.providers || {}
  const mine = status?.mine
  const help = MAIL_HELP[f.provider] || MAIL_HELP.other
  const googleOn = !!status?.googleSignIn
  const showChooser = (!mine || editing) && googleOn && !manual
  const showForm = (!mine || editing) && (!googleOn || manual)
  const providerLabel = (m) => m.provider === 'google' ? 'Google · signed in with Google' : (providers[m.provider]?.label || m.host)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Mail size={16} className="text-gray-400" />
        <h3 className="font-semibold text-gray-800 text-sm">Email Account</h3>
      </div>
      <p className="text-xs text-gray-400 mb-4">Connect your own mailbox so the quotes, follow-ups and reminders you send come from your address.</p>

      {loadErr && <p className="text-xs text-red-600 mb-3">{loadErr}</p>}

      {mine && !editing && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle size={16} className="text-green-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-green-800 truncate">Sending as {mine.email}</p>
              <p className="text-xs text-green-700">{providerLabel(mine)}{mine.companyDefault ? ' · also used for company emails' : ''}</p>
            </div>
          </div>
          {status?.canSetCompany && (
            <label className="flex items-start gap-2 text-xs text-green-800 mt-3">
              <input type="checkbox" checked={!!mine.companyDefault} disabled={!!busy} className="mt-0.5"
                onChange={async e => { const ok = await post('mailbox-company', { on: e.target.checked }, 'company'); if (ok) load() }} />
              <span>Use this mailbox for company emails — customer welcome emails, signing codes, and emails from people who haven't connected their own.</span>
            </label>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            <button onClick={test} disabled={!!busy} className="text-xs px-3 py-1.5 rounded-lg bg-green-700 text-white hover:bg-green-800 disabled:opacity-50">{busy === 'test' ? 'Sending…' : 'Send test email'}</button>
            <button onClick={() => { setEditing(true); setManual(false); set({ provider: mine.provider === 'google' ? 'gmail' : (mine.provider || 'other'), email: mine.email, host: mine.host, port: mine.port, companyDefault: mine.companyDefault, password: '' }) }} disabled={!!busy}
              className="text-xs px-3 py-1.5 rounded-lg border border-green-300 text-green-800 hover:bg-green-100 disabled:opacity-50">Change</button>
            <button onClick={disconnect} disabled={!!busy} className="text-xs px-3 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50">{busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}</button>
          </div>
        </div>
      )}

      {status && showChooser && (
        <div className="space-y-2">
          <button onClick={signInWithGoogle} disabled={!!busy}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            {busy === 'google' ? 'Opening Google…' : 'Sign in with Google'}
          </button>
          <p className="text-[11px] text-gray-400 text-center">Pick your Google account and click Allow — that's it.</p>
          <div className="flex justify-center gap-3 text-xs">
            <button onClick={() => setManual(true)} className="text-gray-500 hover:text-gray-700 underline">Not on Google? Use another provider</button>
            {editing && <button onClick={() => { setEditing(false); setError('') }} className="text-gray-500 hover:text-gray-700">Cancel</button>}
          </div>
        </div>
      )}

      {status && showForm && (
        <div className="space-y-3">
          {googleOn && <button onClick={() => setManual(false)} className="text-xs text-[var(--brand-700)] hover:underline">← Back to Sign in with Google</button>}
          <label className="block">
            <span className="text-xs font-medium text-gray-500 block mb-1">Email provider</span>
            <select aria-label="Email provider" value={f.provider} onChange={e => set({ provider: e.target.value })} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white">
              {Object.entries(providers).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              <option value="other">Other (enter server)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500 block mb-1">Your email address</span>
            <input aria-label="Your email address" type="email" value={f.email} onChange={e => set({ email: e.target.value })} placeholder="you@company.com" autoComplete="email"
              className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-500 block mb-1">{f.provider === 'other' || f.provider === 'godaddy' ? 'Password' : 'App password'}</span>
            <input aria-label="App password" type="password" value={f.password} onChange={e => set({ password: e.target.value })} autoComplete="new-password"
              placeholder={f.provider === 'gmail' ? 'xxxx xxxx xxxx xxxx' : ''} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 font-mono" />
          </label>
          {f.provider === 'other' && (
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <input aria-label="Mail server" value={f.host} onChange={e => set({ host: e.target.value })} placeholder="smtp.yourprovider.com" className="text-sm border border-gray-300 rounded-lg px-3 py-2" />
              <select aria-label="Port" value={f.port} onChange={e => set({ port: Number(e.target.value) })} className="text-sm border border-gray-300 rounded-lg px-2 py-2 bg-white">
                {[587, 465, 2525, 25].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
          <p className="text-xs text-gray-500 leading-relaxed">
            {help.text}{help.link && <> <a href={help.link} target="_blank" rel="noreferrer" className="text-[var(--brand-700)] underline">{help.linkLabel} →</a></>}
          </p>
          {status.canSetCompany && (
            <label className="flex items-start gap-2 text-xs text-gray-600">
              <input type="checkbox" checked={!!f.companyDefault} onChange={e => set({ companyDefault: e.target.checked })} className="mt-0.5" />
              <span>Also use this mailbox for company emails (signing codes and emails from people who haven't connected their own).</span>
            </label>
          )}
          <div className="flex gap-2">
            <button onClick={connect} disabled={!!busy || !f.email || !f.password}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-40">
              <Mail size={15} /> {busy === 'connect' ? 'Testing the login…' : mine ? 'Save & test' : 'Connect & test'}
            </button>
            {editing && <button onClick={() => { setEditing(false); setError('') }} className="px-4 py-2.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancel</button>}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-3 leading-relaxed">{error}</p>}
      {note && <p className="text-xs text-green-700 mt-3">{note}</p>}
      {status && (
        <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
          {status.company ? <>Company emails go out from <strong className="text-gray-500">{status.company.email}</strong>.</> : status.serverMailbox ? <>Company emails go out from <strong className="text-gray-500">{status.serverMailbox}</strong>.</> : 'No company mailbox yet — the first mailbox connected is used for company emails.'}
          {' '}Your password is encrypted and only used to send your emails.
        </p>
      )}
    </div>
  )
}

// ── Data management ───────────────────────────────────────────────────────────
function DriveBackupCard() {
  const store = useStore()
  const [status, setStatus]   = useState(null)  // null | { authenticated, meta }
  const [backing, setBacking] = useState(false)
  const [result, setResult]   = useState(null)  // null | 'ok' | 'error'
  const [msg, setMsg]         = useState('')

  const loadStatus = useCallback(async () => {
    try {
      const res  = await fetch('/api/drive/backup')
      const data = await res.json()
      setStatus(data)
      return data
    } catch { setStatus({ authenticated: false, meta: null }) }
  }, [])

  useEffect(() => {
    loadStatus().then(data => {
      if (!data?.authenticated) return
      const lastBackup = data.meta?.backedUpAt || 0
      const sixHours   = 6 * 60 * 60 * 1000
      if (Date.now() - lastBackup > sixHours) triggerBackup(true)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const triggerBackup = useCallback(async (silent = false) => {
    if (backing) return
    if (!silent) setBacking(true)
    try {
      const s = store
      const storeData = {
        catalog:        s.catalog,
        proposals:      s.proposals,
        templates:      s.templates,
        branding:       s.branding,
        theme:          s.theme,
        readMessageIds: s.readMessageIds,
        nextCatalogId:  s.nextCatalogId,
        nextProposalId: s.nextProposalId,
        nextTemplateId: s.nextTemplateId,
        exportedAt:     new Date().toISOString(),
      }
      const res  = await fetch('/api/drive/backup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ storeData }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Backup failed')
      setStatus(prev => ({ ...prev, meta: { fileId: data.fileId, backedUpAt: data.backedUpAt } }))
      if (!silent) { setResult('ok'); setMsg('Backup saved to Google Drive.') }
    } catch (err) {
      if (!silent) { setResult('error'); setMsg(err.message) }
    } finally {
      if (!silent) {
        setBacking(false)
        setTimeout(() => setResult(null), 5000)
      }
    }
  }, [store, backing])

  const connectDrive = async () => {
    const origin   = window.location.origin
    const returnTo = '/settings'
    const res = await fetch(`/api/google-auth/start?origin=${encodeURIComponent(origin)}&returnTo=${encodeURIComponent(returnTo)}`)
    const { url } = await res.json()
    window.location.href = url
  }

  const fmtTime = ts => {
    if (!ts) return 'Never'
    const d = new Date(ts)
    const now = new Date()
    const diffMin = Math.round((now - d) / 60000)
    if (diffMin < 2)  return 'Just now'
    if (diffMin < 60) return `${diffMin} min ago`
    const diffH = Math.round(diffMin / 60)
    if (diffH < 24)   return `${diffH}h ago`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="mt-5 pt-5 border-t border-gray-100">
      <div className="flex items-center gap-2 mb-1">
        <HardDrive size={15} className="text-[var(--brand-500)]" />
        <h4 className="font-semibold text-gray-800 text-sm">Google Drive Backup</h4>
        {status === null && <RefreshCw size={12} className="animate-spin text-gray-400" />}
        {status !== null && (
          status.authenticated
            ? <span className="flex items-center gap-1 text-xs text-green-600 font-medium"><Wifi size={11} /> Connected</span>
            : <span className="flex items-center gap-1 text-xs text-gray-400"><WifiOff size={11} /> Not connected</span>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-3">
        Saves a full backup of all your proposals, catalog, and settings to your Google Drive automatically every 6 hours while the app is open.
      </p>

      {status !== null && !status.authenticated && (
        <button onClick={connectDrive}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
          <CloudUpload size={14} /> Connect Google Drive
        </button>
      )}

      {status?.authenticated && (
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => triggerBackup(false)} disabled={backing}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
            {backing ? <RefreshCw size={13} className="animate-spin" /> : <CloudUpload size={13} />}
            {backing ? 'Backing up…' : 'Back Up Now'}
          </button>
          <p className="text-xs text-gray-400">
            Last backup: <strong className="text-gray-600">{fmtTime(status.meta?.backedUpAt)}</strong>
          </p>
        </div>
      )}

      {result && (
        <div className={`mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${result === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {result === 'ok' ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
          {msg}
        </div>
      )}
    </div>
  )
}

function DataManagement() {
  const store = useStore()
  const importRef = useRef()
  const [importStatus, setImportStatus] = useState(null) // null | 'ok' | 'error'
  const [importMsg, setImportMsg]       = useState('')

  const handleExport = () => {
    const data = {
      exportedAt:     new Date().toISOString(),
      catalog:        store.catalog,
      proposals:      store.proposals,
      templates:      store.templates,
      branding:       store.branding,
      theme:          store.theme,
      readMessageIds: store.readMessageIds,
      nextCatalogId:  store.nextCatalogId,
      nextProposalId: store.nextProposalId,
      nextTemplateId: store.nextTemplateId,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `quotex-backup-${new Date().toISOString().slice(0,10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result)

        // Support both QuoteX backup format and raw quotex-data.json (zustand) format
        const data = parsed.state ? parsed.state : parsed

        if (!data.catalog && !data.proposals) throw new Error('Unrecognized backup file.')

        if (Array.isArray(data.catalog))   store.importCatalog(data.catalog)
        if (Array.isArray(data.proposals)) store.importProposals(data.proposals)
        if (Array.isArray(data.templates)) store.importTemplates(data.templates)
        if (data.branding)                 store.updateBranding(data.branding)

        setImportStatus('ok')
        setImportMsg(`Imported ${data.catalog?.length || 0} catalog items and ${data.proposals?.length || 0} proposals.`)
      } catch (err) {
        setImportStatus('error')
        setImportMsg(err.message || 'Failed to read backup file.')
      }
      if (importRef.current) importRef.current.value = ''
      setTimeout(() => setImportStatus(null), 5000)
    }
    reader.readAsText(file)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Download size={16} className="text-gray-400" />
        <h3 className="font-semibold text-gray-800 text-sm">Data Backup &amp; Restore</h3>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Export a file backup of this organization's data. Everything syncs to the shared database automatically.
      </p>


      <div className="flex gap-3 flex-wrap">
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--brand-600)] text-white text-sm font-medium rounded-lg hover:bg-[var(--brand-700)] transition-colors"
        >
          <Download size={14} /> Export Backup
        </button>

        <label className="flex items-center gap-2 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
          <FolderOpen size={14} /> Import Backup
          <input
            ref={importRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={e => handleImport(e.target.files[0])}
          />
        </label>
      </div>

      {importStatus && (
        <div className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
          importStatus === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {importStatus === 'error' && <AlertTriangle size={15} className="shrink-0 mt-0.5" />}
          {importStatus === 'ok'    && <CheckCircle  size={15} className="shrink-0 mt-0.5" />}
          {importMsg}
        </div>
      )}

      <DriveBackupCard />
    </div>
  )
}

export default function Settings() {
  const { branding, updateBranding } = useStore()

  // Banner when returning from Google OAuth
  const [oauthBanner, setOauthBanner] = useState(() => {
    const p = new URLSearchParams(window.location.search)
    return p.get('google') === 'connected' ? 'connected' : p.get('google') === 'error' ? 'error' : null
  })
  useEffect(() => {
    if (oauthBanner) {
      window.history.replaceState({}, '', window.location.pathname)
      const t = setTimeout(() => setOauthBanner(null), 6000)
      return () => clearTimeout(t)
    }
  }, [oauthBanner])

  const [companyName, setCompanyName]   = useState(branding.companyName || '')
  const [tagline, setTagline]           = useState(branding.tagline || '')
  const [gcName, setGcName]             = useState(branding.gcName || '')
  const [licenseNo, setLicenseNo]       = useState(branding.licenseNo || '')
  const [logo, setLogo]                 = useState(branding.logo || null)
  const [primaryColor, setPrimaryColor] = useState(branding.primaryColor || DEFAULT_BRAND_COLOR)
  const [sidebarColor, setSidebarColor] = useState(branding.sidebarColor || FREE_SIDEBAR_COLOR)
  const [accentColor, setAccentColor]   = useState(branding.accentColor || '')
  const [extracting, setExtracting]     = useState(false)
  const [saved, setSaved]               = useState(false)
  const fileRef = useRef()

  const plan     = branding.plan || 'enterprise'
  // Branding and the plan are org settings; the database only lets office and
  // admin write them (RLS). Hide the editors from other roles so a rep never
  // makes changes that look saved but only exist in their own browser tab.
  const me         = useStore(s => s.me)
  const canManage  = DEMO || !me || me.role === 'office' || me.role === 'admin'
  const canBrand   = canCustomizeBranding(plan) && canManage

  // Keep preview in sync
  useEffect(() => {
    applyBrandStyles(primaryColor, { sidebar: sidebarColor, accent: accentColor || null })
  }, [primaryColor, sidebarColor, accentColor])

  const handleLogoUpload = async (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target.result
      setLogo(dataUrl)
      setSaved(false)

      // Auto-extract dominant color from the logo
      setExtracting(true)
      const extracted = await extractDominantColor(dataUrl)
      setExtracting(false)
      if (extracted) setPrimaryColor(extracted)
    }
    reader.readAsDataURL(file)
  }

  const handleSave = () => {
    updateBranding({ companyName, tagline, gcName: gcName.trim(), licenseNo: licenseNo.trim(), logo, primaryColor, sidebarColor, accentColor: accentColor || null })
    applyBrandStyles(primaryColor, { sidebar: sidebarColor, accent: accentColor || null })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const handleReset = () => {
    // Reset to the standard-tier charcoal & brass identity
    updateBranding({ companyName: 'QUOTEX', tagline: 'Smart Contractor Pricing', logo: null, primaryColor: FREE_PRIMARY_COLOR, sidebarColor: FREE_SIDEBAR_COLOR, accentColor: null })
    setCompanyName('QUOTEX')
    setTagline('Smart Contractor Pricing')
    setLogo(null)
    setPrimaryColor(FREE_PRIMARY_COLOR)
    setSidebarColor(FREE_SIDEBAR_COLOR)
    setAccentColor('')
    applyBrandStyles(FREE_PRIMARY_COLOR, { sidebar: FREE_SIDEBAR_COLOR })
    if (fileRef.current) fileRef.current.value = ''
  }

  const applyPreset = (preset) => {
    setPrimaryColor(preset.primary)
    setSidebarColor(preset.sidebar)
    setSaved(false)
  }

  const setPlan = (p) => updateBranding({ plan: p })
  const role    = useStore(s => s.role || 'manager')
  const setRole = useStore(s => s.setRole)

  return (
    <div className="p-6 max-w-5xl">
      {oauthBanner === 'connected' && (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
          <CheckCircle size={15} /> Google Drive connected — your first backup will run automatically.
        </div>
      )}
      {oauthBanner === 'error' && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          <AlertTriangle size={15} /> Google Drive connection failed. Try again or check your credentials.
        </div>
      )}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Customize your branding — changes apply across the whole platform.</p>
      </div>

      <div className="flex gap-6 flex-wrap">

        {/* Left: form */}
        <div className="flex-1 min-w-80 space-y-5">

          {/* ── Branding ───────────────────────────────────────────── */}
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Branding</h3>

          {!canManage && (
            <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-5 text-center">
              <Lock size={18} className="text-gray-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-700">Branding is managed by the office</p>
              <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">Logo, colors and company details are shared by everyone in {branding.companyName || 'the company'} and can only be changed by an office or admin login.</p>
            </div>
          )}

          {/* Company identity */}
          {canBrand && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 size={16} className="text-gray-400" />
              <h3 className="font-semibold text-gray-800 text-sm">Company Identity</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Company Name</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-400)]"
                  value={companyName}
                  onChange={e => { setCompanyName(e.target.value); setSaved(false) }}
                  placeholder="QUOTEX"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Tagline</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-400)]"
                  value={tagline}
                  onChange={e => { setTagline(e.target.value); setSaved(false) }}
                  placeholder="Smart Contractor Pricing"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Licensed General Contractor (named in contracts)</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-400)]"
                  value={gcName}
                  onChange={e => { setGcName(e.target.value); setSaved(false) }}
                  placeholder="Leave blank if you are the licensed GC"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">GC License No.</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-400)]"
                  value={licenseNo}
                  onChange={e => { setLicenseNo(e.target.value); setSaved(false) }}
                  placeholder="Printed in the client acknowledgment"
                />
              </div>
            </div>
          </div>

          )}

          {/* Logo upload */}
          {canBrand && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Upload size={16} className="text-gray-400" />
              <h3 className="font-semibold text-gray-800 text-sm">Company Logo</h3>
            </div>

            <label
              className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-8 cursor-pointer hover:border-[var(--brand-400)] hover:bg-[var(--brand-50)] transition-colors"
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleLogoUpload(e.dataTransfer.files[0]) }}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/svg+xml,image/webp"
                className="hidden"
                onChange={e => handleLogoUpload(e.target.files[0])}
              />
              {logo ? (
                <div className="text-center">
                  <img src={logo} alt="logo preview" className="h-16 object-contain mx-auto mb-2" />
                  <p className="text-xs text-gray-400">Click to replace</p>
                  {extracting && (
                    <p className="text-xs text-[var(--brand-600)] mt-1 flex items-center justify-center gap-1">
                      <RefreshCw size={11} className="animate-spin" /> Extracting color…
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <Upload size={24} className="text-gray-400 mb-2" />
                  <p className="text-sm font-medium text-gray-600">Drop logo or click to upload</p>
                  <p className="text-xs text-gray-400 mt-1">PNG · JPG · SVG · WebP</p>
                  <p className="text-xs text-gray-400 mt-0.5">Brand color will be auto-extracted</p>
                </>
              )}
            </label>

            {logo && (
              <button
                onClick={() => { setLogo(null); setSaved(false); if (fileRef.current) fileRef.current.value = '' }}
                className="mt-2 text-xs text-red-400 hover:text-red-600 flex items-center gap-1"
              >
                <Trash2 size={11} /> Remove logo
              </button>
            )}
          </div>
          )}

          {/* Theme customizer — Pro & Enterprise only */}
          {canBrand ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Palette size={16} className="text-gray-400" />
                <h3 className="font-semibold text-gray-800 text-sm">Theme Colors</h3>
              </div>

              {/* Preset theme combos (primary + sidebar) */}
              <p className="text-xs font-medium text-gray-500 mb-2">Preset themes</p>
              <div className="grid grid-cols-4 gap-2 mb-5">
                {BRAND_PRESETS.map(preset => {
                  const active = primaryColor === preset.primary && sidebarColor === preset.sidebar
                  return (
                    <button
                      key={preset.label}
                      onClick={() => applyPreset(preset)}
                      title={preset.label}
                      className={`rounded-lg overflow-hidden border transition-all ${active ? 'ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-105'}`}
                    >
                      <div className="flex h-9">
                        <span className="flex-1" style={{ backgroundColor: preset.sidebar }} />
                        <span className="flex-1" style={{ backgroundColor: preset.primary }} />
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Individual color pickers */}
              <div className="space-y-3">
                {[
                  { label: 'Primary / buttons', value: primaryColor, set: setPrimaryColor },
                  { label: 'Sidebar', value: sidebarColor, set: setSidebarColor },
                  { label: 'Accent (optional)', value: accentColor || primaryColor, set: setAccentColor },
                ].map(({ label, value, set }) => (
                  <div key={label} className="flex items-center gap-3">
                    <input
                      type="color"
                      value={value}
                      onChange={e => { set(e.target.value); setSaved(false) }}
                      className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer p-0.5 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-700">{label}</p>
                      <p className="text-xs text-gray-400 font-mono">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : canManage ? (
            <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-5 text-center">
              <Lock size={18} className="text-gray-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-700">Custom theming is a Professional feature</p>
              <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">Your workspace uses the standard Charcoal &amp; Brass identity. Upgrade to Professional to pick your own colors, logo accent, and sidebar.</p>
            </div>
          ) : null}

          {/* Action buttons */}
          {canBrand && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2.5 text-white text-sm font-medium rounded-lg transition-colors"
              style={{ backgroundColor: 'var(--brand-600)' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--brand-700)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--brand-600)'}
            >
              {saved ? <><CheckCircle size={15} /> Saved!</> : 'Save Changes'}
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 transition-colors"
            >
              Reset to Defaults
            </button>
          </div>
          )}

          {/* ── Workspace ──────────────────────────────────────────── */}
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 pt-4 border-t border-gray-100">Workspace</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Role switcher: demo only — real roles come from the org membership */}
            {/* Role / view */}
            {DEMO && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-1">
                <Building2 size={16} className="text-gray-400" />
                <h3 className="font-semibold text-gray-800 text-sm">Role &amp; View</h3>
              </div>
              <p className="text-xs text-gray-400 mb-4">Switches the whole app between the Sales, Project Manager, and Manager experiences.</p>
              <div className="grid grid-cols-3 gap-2">
                {ROLE_ORDER.map(key => {
                  const active = role === key
                  return (
                    <button
                      key={key}
                      onClick={() => setRole(key)}
                      className={`text-left rounded-lg border p-3 transition-colors ${active ? 'border-[var(--brand-500)] bg-[var(--brand-50)]' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <p className={`text-sm font-semibold ${active ? 'text-[var(--brand-700)]' : 'text-gray-700'}`}>{ROLE_META[key].label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{ROLE_META[key].blurb}</p>
                    </button>
                  )
                })}
              </div>
            </div>
            )}

            {/* Plan / subscription tier (org setting: office/admin only) */}
            {canManage && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={16} className="text-gray-400" />
                <h3 className="font-semibold text-gray-800 text-sm">Subscription Plan</h3>
              </div>
              <p className="text-xs text-gray-400 mb-4">Controls which sections and customization this account can access.</p>
              <div className="grid grid-cols-3 gap-2">
                {PLAN_ORDER.map(key => {
                  const active = plan === key
                  return (
                    <button
                      key={key}
                      onClick={() => setPlan(key)}
                      className={`text-left rounded-lg border p-3 transition-colors ${active ? 'border-[var(--brand-500)] bg-[var(--brand-50)]' : 'border-gray-200 hover:border-gray-300'}`}
                    >
                      <p className={`text-sm font-semibold ${active ? 'text-[var(--brand-700)]' : 'text-gray-700'}`}>{PLAN_META[key].label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{PLAN_META[key].blurb}</p>
                    </button>
                  )
                })}
              </div>
            </div>
            )}
          </div>

          {/* ── Team & account ───────────────────────────────────── */}
          {!DEMO && (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 pt-4 border-t border-gray-100">Team &amp; Account</h3>
              {(me?.role === 'admin' || me?.role === 'office') && <TeamCard />}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><PasswordCard /></div>
            </>
          )}

          {/* ── Contracts: company signature + welcome email (office / admin) ── */}
          {!DEMO && (me?.role === 'admin' || me?.role === 'office') && (
            <>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 pt-4 border-t border-gray-100">Contracts</h3>
              <CompanySignatureCard />
              <WelcomeEmailCard />
            </>
          )}

          {/* ── Connections & Data ─────────────────────────────────── */}
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 pt-4 border-t border-gray-100">Connections &amp; Data</h3>

          {/* Email connection — available to all tiers (needed to send proposals) */}
          <EmailConnectCard />

          {/* Data backup / restore */}
          <DataManagement />
        </div>

        {/* Right: live preview */}
        <div className="w-56 shrink-0">
          <div className="sticky top-6">
            <div className="flex items-center gap-2 mb-3">
              <Eye size={14} className="text-gray-400" />
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Live Preview</p>
            </div>
            <SidebarPreview
              companyName={companyName}
              tagline={tagline}
              logo={logo}
              color={primaryColor}
              sidebar={sidebarColor}
            />
            <p className="text-xs text-gray-400 mt-3 text-center">Reflects across the whole platform</p>
          </div>
        </div>

      </div>
    </div>
  )
}
