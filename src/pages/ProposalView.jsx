import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Printer, Copy, ArrowLeft, CheckCircle, Send, X, Loader, Link2, MessageSquare } from 'lucide-react'
import { useStore } from '../store'
import { buildProposalSnapshot } from '../proposalSnapshot'
import { withSavedDesign } from '../lib/designSnapshot'
import DesignShareToggle from '../components/DesignShareToggle'
import { DEFAULT_BRAND_COLOR } from '../brand'
import { customerLines, discountOf } from '../lib/hiddenLines'
import { priceRangeOf, rangeText, depositPctOf } from '../lib/priceRange'
import { customerUpgrades } from '../lib/upgrades'
import { customerPackages } from '../lib/packages'
import PackageChoices from '../components/PackageChoices'
import { nextReminderDate } from '../lib/attention'

const fmt = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Where this deal stands (our side only, never printed) ────────────────────
// The stages from Draft to Won with this quote's stage marked, and its next
// step: the earliest follow-up set on it, or sending it while it's a draft.
const DEAL_STEPS = ['Draft', 'Sent', 'Followed Up', 'Negotiating', 'Won']
function DealStrip({ p }) {
  const at = DEAL_STEPS.indexOf(p.status)
  const due = (p.reminders || []).filter(r => !r.dismissed).map(r => ({ r, d: nextReminderDate(r) })).filter(x => x.d)
    .sort((a, b) => a.d.localeCompare(b.d))[0]
  const today = new Date().toISOString().slice(0, 10)
  const next = due
    ? { what: due.r.note || 'Follow up', when: new Date(`${due.d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), late: due.d < today }
    : p.status === 'Draft' ? { what: 'Send it to the customer', when: '' } : null
  return (
    <div className="no-print bg-white border-b border-gray-200 px-3 sm:px-6 py-3">
      <div className="max-w-3xl mx-auto space-y-2.5">
        {at >= 0 ? (
          <ol className="flex gap-1 text-xs" aria-label="Stage">
            {DEAL_STEPS.map((st, i) => (
              <li key={st} aria-current={i === at ? 'step' : undefined}
                className={`flex-1 pt-1.5 border-t-4 ${i < at ? 'border-[var(--brand-600)] text-gray-700' : i === at ? 'border-orange-500 text-gray-900 font-bold' : 'border-gray-200 text-gray-400'}`}>{st}</li>
            ))}
          </ol>
        ) : <p className="text-sm text-gray-700">Stage: <span className="font-semibold">{p.status}</span></p>}
        {next && (
          <p className={`text-sm rounded-lg px-3 py-2 border ${next.late ? 'bg-orange-50 border-orange-200 text-orange-900' : 'bg-[var(--brand-50)] border-[var(--brand-200)] text-gray-800'}`}>
            <span className="text-xs font-bold uppercase tracking-wide mr-2">Next step</span>
            <span className="font-semibold">{next.what}</span>{next.when ? ` · ${next.late ? `was due ${next.when}` : next.when}` : ''}
          </p>
        )}
      </div>
    </div>
  )
}

export default function ProposalView() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [choosing, setChoosing] = useState(false)   // the "Send to customer" choice: email, text or copy link
  const [textTo, setTextTo] = useState(null)   // "Text it": { href, phone } once the link is ready
  const [gettingLink, setGettingLink] = useState(false)

  // Send modal state
  const [showSend, setShowSend] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendSuccess, setSendSuccess] = useState(false)
  const [sendError, setSendError] = useState('')
  // The sender's email signature (name, title, cell): saved per person, filled in once.
  const me = useStore(s => s.me)
  const [signature, setSignature] = useState(null)
  const setSig = (k, v) => setSignature(s => ({ ...(s || {}), [k]: v }))

  const proposalDocRef = useRef(null)
  const proposalIdRef = useRef(null)
  const { saveProposal, markProposalSent, setProposalViewToken } = useStore()
  const branding = useStore(s => s.branding)
  // The saved quote behind this page, for its stage and next step (DealStrip)
  const storedId = data?.proposalId ?? data?.id ?? null
  const stored = useStore(s => (storedId != null ? s.proposals.find(p => String(p.id) === String(storedId)) : null))
  const blue     = branding?.primaryColor || DEFAULT_BRAND_COLOR   // Deck Plus blue — PROPOSAL title and company name
  const companyName = branding?.companyName || 'QUOTEX'

  // Opening the send box fills in the signature this person saved. Anything
  // typed (or auto-filled by the browser) before it arrives is kept on top.
  const [sigLoaded, setSigLoaded] = useState(false)
  useEffect(() => {
    if (!showSend || sigLoaded) return
    let off = false
    const typed = (s) => Object.fromEntries(Object.entries(s || {}).filter(([, v]) => String(v || '').trim()))
    const fill = (saved) => {
      if (off) return
      setSignature(s => ({ ...(saved || {}), name: saved?.name || me?.displayName || '', ...typed(s) }))
      setSigLoaded(true)
    }
    fetch('/api/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'signature' }) })
      .then(r => (r.ok ? r.json() : null)).then(d => fill(d?.signature)).catch(() => fill(null))
    return () => { off = true }
  }, [showSend, sigLoaded, me])

  useEffect(() => {
    const raw = sessionStorage.getItem('proposal')
    if (raw) {
      const parsed = JSON.parse(raw)
      setData(parsed)
      // Auto-save as Draft to the proposals log (idempotent — uses existing id if set).
      // Coming back from Build Quote with the same draft updates it in place
      // (as long as it is still a Draft) instead of saving a duplicate.
      const sameClient = (a, b) => String(a || '').toLowerCase().replace(/[^a-z0-9]/g, '') === String(b || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      const found = parsed.proposalId ? useStore.getState().proposals.find(p => p.id === parsed.proposalId) : null
      // Only ever update a proposal for the SAME customer — a different client
      // name means a new estimate, never an overwrite of someone else's.
      const existing = found && (!parsed.fromBuilder || sameClient(found.client, parsed.client)) ? found : null
      if (found && !existing) parsed.proposalId = null
      // A revision belongs under its parent only if it's the same customer.
      const parent = parsed.parentId ? useStore.getState().proposals.find(p => p.id === parsed.parentId) : null
      if (parsed.fromBuilder && parent && !sameClient(parent.client, parsed.client)) parsed.parentId = null
      if (parsed.fromBuilder && existing && (existing.status || 'Draft') === 'Draft') {
        saveProposal({
          id: existing.id,
          client: parsed.client, email: parsed.email, phone: parsed.phone, address: parsed.address,
          expiration: parsed.expiration,
          total: parsed.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0),
          lines: parsed.lines, isAlaCarte: parsed.isAlaCarte || false, showBreakdown: parsed.showBreakdown, priceRange: parsed.priceRange || null, upgrades: parsed.upgrades || [],
          packages: parsed.packages || [], pkgSetup: parsed.pkgSetup || null,
          margin: parsed.margin, projectTypes: parsed.projectTypes || [], projectSummary: parsed.projectSummary || '',
        })
        proposalIdRef.current = existing.id
      } else if (!parsed.proposalId || (parsed.fromBuilder && !existing) || (parsed.fromBuilder && existing && existing.status !== 'Draft')) {
        const id = saveProposal({
          client: parsed.client,
          email: parsed.email,
          phone: parsed.phone,
          address: parsed.address,
          expiration: parsed.expiration,
          total: parsed.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0),
          lines: parsed.lines,
          isAlaCarte: parsed.isAlaCarte || false,
          showBreakdown: parsed.showBreakdown,
          priceRange: parsed.priceRange || null,
          upgrades: parsed.upgrades || [],
          packages: parsed.packages || [], pkgSetup: parsed.pkgSetup || null,
          margin: parsed.margin,
          projectTypes: parsed.projectTypes || [],
          projectSummary: parsed.projectSummary || '',
          status: 'Draft',
          parentId: parsed.parentId || null,
        })
        proposalIdRef.current = id
        // Persist id back into sessionStorage so repeated views don't duplicate
        sessionStorage.setItem('proposal', JSON.stringify({ ...parsed, proposalId: id }))
        // …and into the Build Quote draft, so editing and previewing again updates this one
        if (parsed.fromBuilder) {
          try {
            const draft = JSON.parse(localStorage.getItem('quotex:draft-proposal') || 'null')
            if (draft) localStorage.setItem('quotex:draft-proposal', JSON.stringify({ ...draft, draftProposalId: id, draftClient: parsed.client || '', ...(parsed.parentId ? {} : { revisingParentId: null }) }))
          } catch { /* ignore */ }
        }
      } else {
        proposalIdRef.current = parsed.proposalId
      }
    }
  }, [])

  if (!data) {
    return (
      <div className="p-6 text-center text-gray-400">
        <p className="mb-4">No proposal data. Build a quote first.</p>
        <button onClick={() => navigate('/quote')} className="px-4 py-2 bg-[var(--brand-600)] text-white rounded-lg text-sm">Go to Build Quote</button>
      </div>
    )
  }

  const { client, email, phone, address, expiration, lines, isAlaCarte, showBreakdown = true } = data
  const subtotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitPrice) || 0), 0)
  // Price range: the customer sees a range instead of any price; the app keeps the exact one.
  const range = isAlaCarte ? null : priceRangeOf(subtotal, data.priceRange)
  // Optional upgrades: listed under the total, never in it.
  const upgrades = isAlaCarte ? [] : customerUpgrades(data.upgrades)
  // Good / Better / Best: whole-project options (not with a price range)
  const packages = isAlaCarte || range ? [] : customerPackages(data.packages)
  // Lines hidden on a summed proposal count in the total but are never shown.
  const shownLines = customerLines(lines, { showBreakdown, isAlaCarte })
  // Discount: shown under the items as Project Total → Discount → Total.
  const disc = isAlaCarte ? null : discountOf(lines)
  const beforeDiscount = subtotal + (disc?.amount || 0)
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const expirationFormatted = expiration
    ? new Date(expiration + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  // Group lines by section
  const sectionOrder = []
  const sections = {}
  shownLines.forEach(line => {
    const key = (line.section || line.category || 'General').trim()
    if (!sections[key]) { sections[key] = []; sectionOrder.push(key) }
    sections[key].push(line)
  })

  const handleCopy = () => {
    const scopeText = sectionOrder.map(key => {
      const items = sections[key]
      const prose = items.map(l => l.description || l.name).filter(Boolean).join(' ')
      return `${key.toUpperCase()}\n${prose}`
    }).join('\n\n')

    // Lump sum: the total only (no per-line prices), like the proposal itself.
    const pricingText = range ? '' : (showBreakdown || isAlaCarte) ? shownLines.map((l, i) =>
      `${i + 1}. ${l.name}  |  ${l.qty} ${l.unit} × $${l.unitPrice}  =  $${fmt(l.qty * l.unitPrice)}`
    ).join('\n') : ''

    const text = [
      'PROPOSAL',
      '',
      `Date: ${today}`,
      expirationFormatted ? `Valid Until: ${expirationFormatted}` : '',
      client ? `Customer: ${client}` : '',
      phone ? `Phone: ${phone}` : '',
      email ? `Email: ${email}` : '',
      address ? `Project Address: ${address}` : '',
      '',
      '─'.repeat(60),
      'SCOPE OF WORK',
      '─'.repeat(60),
      '',
      scopeText,
      '',
      '─'.repeat(60),
      isAlaCarte ? 'OPTIONS & PRICING' : 'PRICING',
      '─'.repeat(60),
      isAlaCarte ? 'Please indicate which options you would like to proceed with.' : '',
      '',
      pricingText,
      '',
      disc && !range ? `PROJECT TOTAL: $${fmt(beforeDiscount)}` : '',
      disc && !range ? `${disc.label.toUpperCase()}: -$${fmt(disc.amount)}` : '',
      range ? `ESTIMATED INVESTMENT: ${rangeText(range)}` : isAlaCarte ? '' : `TOTAL: $${fmt(subtotal)}`,
      packages.length ? '\nCHOOSE YOUR PACKAGE' : '',
      ...packages.map(p => `• ${p.label} (${p.tag}) — $${fmt(p.total)}\n  ${p.decks.map(d => `${d.name}: ${d.decking}, ${d.railing}`).join('\n  ')}`),
      upgrades.length ? '\nOPTIONAL UPGRADES (not included in the total above)' : '',
      ...upgrades.map(u => `• ${u.name}  —  $${fmt(u.price)}${u.description ? `\n  ${u.description}` : ''}`),
    ].filter(Boolean).join('\n')

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleSend = async () => {
    setSending(true)
    setSendError('')
    try {
      // Create/refresh a permanent tracked view link so the email carries a
      // "View Your Proposal" button and every open is logged to this proposal's
      // activity. The customer gets the link only (no PDF), so no link, no email.
      let viewUrl = null
      try {
        const pid = proposalIdRef.current ?? data.id ?? null
        const snapshot = await withSavedDesign(buildProposalSnapshot(data, branding), pid)
        const vr = await fetch('/api/sign/pcreate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proposalId: pid, snapshot }),
        })
        if (vr.ok) {
          const vd = await vr.json()
          viewUrl = vd.url || null
          if (pid != null && vd.token) setProposalViewToken(pid, vd.token)
        }
      } catch { /* reported just below */ }
      if (!viewUrl) throw new Error('The proposal link could not be created, so nothing was sent. Please try again.')

      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposal: { client: data.client, email: data.email },
          signature: signature || undefined,
          fromName: signature?.name || me?.displayName || '',
          viewUrl,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to send.')
      if (proposalIdRef.current) markProposalSent(proposalIdRef.current)
      if (data?.fromBuilder) localStorage.removeItem('quotex:draft-proposal')
      setSendSuccess(true)
    } catch (err) {
      setSendError(err.message)
    } finally {
      setSending(false)
    }
  }

  // Create/refresh the permanent tracked link (same link + open-logging as the
  // "Send to Client" button) → its URL.
  const makeLink = async () => {
      const pid = proposalIdRef.current ?? data.id ?? null
      const snapshot = await withSavedDesign(buildProposalSnapshot(data, branding), pid)
      const r = await fetch('/api/sign/pcreate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: pid, snapshot }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.url) throw new Error(d.error || 'Could not create link')
      if (pid != null && d.token) setProposalViewToken(pid, d.token)
      // Getting the link is sending it: mark it sent and close the Build Quote
      // draft, so the next quote starts as a NEW estimate instead of editing this one.
      if (proposalIdRef.current) markProposalSent(proposalIdRef.current)
      if (data?.fromBuilder) localStorage.removeItem('quotex:draft-proposal')
      return d.url
  }
  // …and copy it, so it can be pasted into your own email.
  const handleGetLink = async () => {
    setGettingLink(true)
    try {
      const url = await makeLink()
      try { await navigator.clipboard.writeText(url); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }
      catch { window.prompt('Copy your proposal link:', url) }
    } catch { /* no-op — user can retry */ }
    finally { setGettingLink(false) }
  }
  // Text it from your own phone: Messages opens (iPhone, iPad, Mac) with the customer's
  // number and a short note with the link filled in; you tap Send. It goes from your own
  // number (iMessage or text), not from the app.
  const smsHref = (url) => {
    const digits = String(data?.phone || '').replace(/[^\d+]/g, '')
    // "Smith, Ann" (last, first) → Ann; "Ann Smith" → Ann
    const who = String(data?.client || ''), hi = (who.includes(',') ? who.split(',')[1] : who).split(/[\s&/]+/).filter(Boolean)[0] || ''
    const mine = String(me?.displayName || '').split(' ')[0]
    const body = `Hi${hi ? ` ${hi}` : ''}, here's your proposal from ${companyName && companyName !== 'QUOTEX' ? companyName : 'us'}: ${url}${mine ? `\n${mine}` : ''}`
    return `sms:${digits}${/iphone|ipad|macintosh/i.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(body)}`
  }
  const handleText = async () => {
    setGettingLink(true)
    try { const url = await makeLink(); setTextTo({ href: smsHref(url), phone: data?.phone || '' }) }
    catch { /* no-op — user can retry */ }
    finally { setGettingLink(false) }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Toolbar. On a phone it is two rows: Back and Send on top, the other
          actions as full-width thumb-sized buttons underneath — nothing runs
          off the side of the screen. */}
      <div className="no-print bg-white border-b border-gray-200 px-3 sm:px-6 py-2 sm:py-3 flex flex-wrap items-center gap-2 sm:gap-3">
        <button onClick={() => (data.fromBuilder ? navigate('/quote') : navigate(-1))} className="flex items-center gap-1.5 min-h-[44px] sm:min-h-0 pr-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft size={15} /> {data.fromBuilder ? 'Back to quote' : 'Back'}
        </button>
        <div className="flex-1" />
        <div className="order-last basis-full flex items-stretch gap-2 sm:order-none sm:basis-auto sm:contents">
          <button
            onClick={handleCopy}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            {copied ? <CheckCircle size={14} className="text-[var(--brand-500)]" /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy text'}
          </button>
          <button
            onClick={() => {
              if (proposalIdRef.current) markProposalSent(proposalIdRef.current)
              if (data?.fromBuilder) localStorage.removeItem('quotex:draft-proposal')
              window.print()
            }}
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 min-h-[44px] sm:min-h-0 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
          >
            <Printer size={14} /> <span className="sm:hidden">PDF</span><span className="hidden sm:inline">Print / Save PDF</span>
          </button>
          <DesignShareToggle proposalId={proposalIdRef.current ?? data?.id ?? null} className="px-1" />
        </div>
        {/* Send to customer: pick how — email, text from your own phone, or copy the link */}
        {choosing && (
          <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setChoosing(false)}>
            <div className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-2" onClick={e => e.stopPropagation()}>
              <p className="font-semibold text-gray-900 mb-1">Send to {data?.client || 'customer'}</p>
              {[
                { icon: Send, label: 'Email', sub: data?.email || 'Sent from your email account', go: () => { setChoosing(false); setShowSend(true); setSendSuccess(false); setSendError('') } },
                { icon: MessageSquare, label: 'Text', sub: data?.phone ? `From your own phone to ${data.phone}` : 'From your own phone', go: () => { setChoosing(false); handleText() } },
                { icon: linkCopied ? CheckCircle : Link2, label: linkCopied ? 'Link copied' : 'Copy link', sub: 'Paste it anywhere', go: () => handleGetLink() },
              ].map(o => (
                <button key={o.label} onClick={o.go} disabled={gettingLink}
                  className="w-full flex items-center gap-3 min-h-[56px] px-3 rounded-xl border border-gray-200 text-left hover:bg-gray-50 disabled:opacity-50">
                  <o.icon size={18} className="text-[var(--brand-600)] shrink-0" />
                  <span className="flex-1 min-w-0"><span className="block font-medium text-gray-900">{o.label}</span><span className="block text-xs text-gray-500 truncate">{o.sub}</span></span>
                </button>
              ))}
              {gettingLink && <p className="text-xs text-gray-500 flex items-center gap-1.5"><Loader size={12} className="animate-spin" /> Making the link…</p>}
              <button onClick={() => setChoosing(false)} className="w-full min-h-[44px] rounded-xl text-sm text-gray-600">Cancel</button>
            </div>
          </div>
        )}
        {/* The link is ready: one tap opens Messages with it filled in (a tap of its own, so phones allow it) */}
        {textTo && (
          <div className="no-print fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4" onClick={() => setTextTo(null)}>
            <div className="w-full max-w-sm bg-white rounded-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
              <p className="font-semibold text-gray-900">Text the proposal</p>
              <p className="text-sm text-gray-600">{textTo.phone ? `To ${textTo.phone}, from your own number.` : 'No phone number on this proposal: pick the customer in Messages.'}</p>
              <a href={textTo.href} onClick={() => { if (proposalIdRef.current) markProposalSent(proposalIdRef.current); setTimeout(() => setTextTo(null), 300) }}
                className="flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-[var(--brand-600)] text-white font-semibold hover:bg-[var(--brand-700)]">
                <MessageSquare size={16} /> Open Messages
              </a>
              <button onClick={() => setTextTo(null)} className="w-full min-h-[44px] rounded-xl border border-gray-200 text-sm text-gray-600">Cancel</button>
            </div>
          </div>
        )}
        <button
          onClick={() => setChoosing(true)}
          className="flex items-center gap-1.5 min-h-[44px] sm:min-h-0 px-4 py-1.5 bg-[var(--brand-600)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-700)]"
        >
          <Send size={14} /> Send to customer
        </button>
      </div>
      {stored && <DealStrip p={stored} />}
      {range && (
        <div className="no-print bg-[var(--brand-50)] border-b border-[var(--brand-200)] px-3 sm:px-6 py-2 text-sm text-gray-700">
          The customer sees <strong>{rangeText(range)}</strong>. Exact price on our side: <strong>${fmt(subtotal)}</strong> (not shown to the customer).
        </div>
      )}

      {/* Send Email Modal */}
      {showSend && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center no-print">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Send Proposal to Client</h3>
              <button onClick={() => setShowSend(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            {sendSuccess ? (
              <div className="text-center py-6">
                <CheckCircle size={40} className="text-[var(--brand-500)] mx-auto mb-3" />
                <p className="font-semibold text-gray-900 mb-1">Proposal Sent!</p>
                <p className="text-sm text-gray-500 mb-1">Email delivered to <strong>{email}</strong></p>
                <p className="text-xs text-gray-400 mb-4">This proposal has been logged as <span className="font-medium text-[var(--brand-600)]">Sent</span> in your tracker.</p>
                <button
                  onClick={() => { setShowSend(false); navigate('/tracker') }}
                  className="px-4 py-2 bg-[var(--brand-600)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-700)]"
                >
                  View in Tracker →
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Sending to</label>
                    <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700 font-medium">
                      {email || <span className="text-red-500 italic">No email on this proposal — go back and add one.</span>}
                    </div>
                  </div>
                  <p className="text-xs font-semibold text-gray-700 pt-1">Your email signature</p>
                  {[['name', 'Name'], ['title', 'Title'], ['cell', 'Cell']].map(([k, label]) => (
                    <div key={k}>
                      <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
                      <input
                        aria-label={label}
                        autoComplete="off"
                        disabled={!sigLoaded}
                        placeholder={sigLoaded ? '' : 'Loading…'}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)] disabled:bg-gray-50"
                        value={signature?.[k] ?? ''}
                        onChange={e => setSig(k, e.target.value)}
                      />
                    </div>
                  ))}
                </div>

                {sendError && (
                  <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    {sendError}
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowSend(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                    Cancel
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={sending || !email || !sigLoaded}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[var(--brand-600)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-700)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? <><Loader size={14} className="animate-spin" /> Sending...</> : <><Send size={14} /> Send Proposal</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Proposal document */}
      {/* White page, black text; the brand blue only for the PROPOSAL title and
          the rules, so it reads the same on screen, printed and downloaded. */}
      <div ref={proposalDocRef} className="qx-ink max-w-3xl mx-auto my-3 sm:my-8 shadow-lg sm:rounded-xl overflow-hidden print:shadow-none print:rounded-none print:my-0" style={{ backgroundColor: '#fff', color: '#000' }}>

        {/* Header — white bar */}
        <div className="bg-white px-5 sm:px-10 py-6 sm:py-7">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h1 className="qx-title text-2xl font-bold tracking-tight" style={{ color: blue }}>PROPOSAL</h1>
              <p className="text-sm mt-1 text-black">{today}</p>
              {expirationFormatted && (
                <p className="text-sm mt-0.5 font-medium text-black">Valid Until: {expirationFormatted}</p>
              )}
            </div>
            <div className="text-right">
              {branding?.logo
                ? <img src={branding.logo} alt="logo" className="h-14 object-contain ml-auto" />
                : <p className="font-semibold text-lg" style={{ color: blue }}>{companyName}</p>}
            </div>
          </div>
        </div>

        {/* Customer info */}
        {(client || email || phone || address) && (
          <div className="px-5 sm:px-10 py-5 border-b border-gray-300">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3 text-black">Prepared For</p>
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div className="min-w-0">
                {client && <p className="font-semibold text-black text-lg break-words">{client}</p>}
                {address && <p className="text-black text-sm mt-0.5">{address}</p>}
              </div>
              {(email || phone) && (
                <div className="min-w-0 sm:text-right text-sm text-black">
                  {phone && <p>{phone}</p>}
                  {email && <p className="[overflow-wrap:anywhere]">{email}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scope of Work — always shown (broken down by item); the toggle only
            controls whether the PRICE table is itemized or a single lump sum. */}
        <div className="px-5 sm:px-10 py-6 sm:py-7 border-b border-gray-300">
          <p className="text-xs font-semibold uppercase tracking-widest mb-5 text-black">Scope of Work</p>
          <div className="space-y-2">
            {shownLines.map(line => (
              <div key={line.id} className="border-l-2 border-gray-400 pl-3">
                <p className="text-sm font-semibold text-black">{line.name}</p>
                {line.description && (
                  <p className="text-sm text-black leading-relaxed mt-0.5 whitespace-pre-wrap">{line.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Pricing Table */}
        <div className="px-5 sm:px-10 py-6 sm:py-7">
          {isAlaCarte && (
            <p className="text-xs text-black italic mb-4">
              The following options are priced individually — please indicate which you would like to proceed with.
            </p>
          )}
          {range ? (
            <div style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }} className="border-t-2 border-b border-black py-4 flex items-baseline justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-widest text-black">Estimated investment</span>
              <span className="text-xl font-bold text-black">{rangeText(range)}</span>
            </div>
          ) : (<>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="text-left pb-2 font-semibold text-black text-xs uppercase tracking-wider">
                  {isAlaCarte ? 'Option' : 'Item'}
                </th>
                <th className="text-right pb-2 font-semibold text-black text-xs uppercase tracking-wider w-28">Price</th>
                {isAlaCarte && (
                  <th className="text-right pb-2 font-semibold text-black text-xs uppercase tracking-wider w-20">Select</th>
                )}
              </tr>
            </thead>
            <tbody>
              {(showBreakdown || isAlaCarte) ? shownLines.map(line => (
                <tr key={line.id} className={`border-b border-gray-200 `}>
                  <td className="py-2.5 px-1 text-black font-medium">{line.name || '—'}</td>
                  <td className="py-2.5 px-1 text-right font-semibold text-black">${fmt((Number(line.qty) || 0) * (Number(line.unitPrice) || 0))}</td>
                  {isAlaCarte && (
                    <td className="py-2.5 px-1 text-right">
                      <span className="inline-block w-4 h-4 border border-black rounded-sm" />
                    </td>
                  )}
                </tr>
              )) : (
                <tr>
                  <td className="py-2.5 text-black font-medium">Project Total</td>
                  <td className="py-2.5 text-right font-semibold text-black">${fmt(disc ? beforeDiscount : subtotal)}</td>
                </tr>
              )}
              {disc && (showBreakdown || isAlaCarte) && (
                <tr className="border-b border-gray-200">
                  <td className="py-2.5 px-1 text-black font-medium">Project Total</td>
                  <td className="py-2.5 px-1 text-right font-semibold text-black">${fmt(beforeDiscount)}</td>
                </tr>
              )}
              {disc && (
                <tr className="border-b border-gray-200">
                  <td className={`py-2.5 ${showBreakdown ? 'px-1' : ''} text-black font-medium`}>{disc.label}</td>
                  <td className={`py-2.5 ${showBreakdown ? 'px-1' : ''} text-right font-semibold text-black`}>−${fmt(disc.amount)}</td>
                </tr>
              )}
            </tbody>
          </table>
          {/* Total — only shown in summed mode */}
          {!isAlaCarte && (
            <div style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }} className="border-t-2 border-black mt-2 pt-4 flex justify-end">
              <div className="text-right">
                <span className="text-xs font-semibold uppercase tracking-widest text-black mr-4">Total</span>
                <span className="text-xl font-bold text-black">${fmt(subtotal)}</span>
              </div>
            </div>
          )}
          </>)}
          <PackageChoices packages={packages} accent={blue} />
          {upgrades.length > 0 && (
            <div className="mt-6" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
              <p className="text-xs font-semibold uppercase tracking-widest text-black">Optional upgrades</p>
              <p className="text-xs text-black italic mb-2">Not included in the total above. Ask us to add any of these to your project.</p>
              <table className="w-full text-sm">
                <tbody>
                  {upgrades.map((u, i) => (
                    <tr key={i} className="border-b border-gray-200 align-top">
                      <td className="py-2.5 px-1 text-black">
                        <p className="font-medium">{u.name || '—'}</p>
                        {u.description && <p className="text-xs leading-relaxed whitespace-pre-wrap mt-0.5">{u.description}</p>}
                      </td>
                      <td className="py-2.5 px-1 text-right font-semibold text-black w-28 whitespace-nowrap">+${fmt(u.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Terms & Signature */}
        <div className="px-5 sm:px-10 pb-10">
          <div className="border border-gray-300 rounded-lg p-4 text-xs text-black leading-relaxed space-y-2">
            <p className="font-semibold text-black">Terms & Conditions</p>
            <p>
              {expirationFormatted
                ? `This proposal is valid until ${expirationFormatted}.`
                : 'This proposal is valid for 30 days from the date above.'
              }
            </p>
            <p><span className="font-semibold text-black">Payment:</span> A {depositPctOf(subtotal)}% deposit is required to schedule work. Progress payments will follow different stages of completion as labeled in a scope of work document drafted once the proposal has been accepted.</p>
            <p><span className="font-semibold text-black">Site Conditions:</span> Pricing is based on normal site conditions. Any unforeseen conditions may result in additional costs with prior written approval.</p>
            <p><span className="font-semibold text-black">Warranty:</span> All projects include a standard 1-year warranty on materials and a 5-year structural warranty.</p>
            <p className="font-semibold text-black pt-1">Addendums</p>
            <p>Any changes resulting in additional charges must be paid at the time of the change. If the inspector requires engineering, it will result in an additional charge.</p>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-5 sm:gap-10">
            <div>
              <div className="border-b border-black mb-1.5 pb-6" />
              <p className="text-xs text-black">Client Signature & Date</p>
            </div>
            <div>
              <div className="border-b border-black mb-1.5 pb-6" />
              <p className="text-xs text-black">Contractor Signature & Date</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
