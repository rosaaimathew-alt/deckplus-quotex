import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Printer, Copy, ArrowLeft, CheckCircle, Send, X, Loader, Link2 } from 'lucide-react'
import { useStore } from '../store'
import { buildProposalSnapshot } from '../proposalSnapshot'
import { generatePalette, DEFAULT_BRAND_COLOR } from '../brand'
import { toCanvas } from 'html-to-image'
import jsPDF from 'jspdf'

const fmt = (n) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function ProposalView() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [gettingLink, setGettingLink] = useState(false)

  // Send modal state
  const [showSend, setShowSend] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendSuccess, setSendSuccess] = useState(false)
  const [sendError, setSendError] = useState('')
  const [fromName, setFromName] = useState('')
  const [fromEmail, setFromEmail] = useState('')

  const proposalDocRef = useRef(null)
  const proposalIdRef = useRef(null)
  const { saveProposal, markProposalSent, setProposalViewToken } = useStore()
  const branding = useStore(s => s.branding)
  const palette  = generatePalette(branding?.primaryColor || DEFAULT_BRAND_COLOR)
  const companyName = branding?.companyName || 'QUOTEX'

  useEffect(() => {
    const raw = sessionStorage.getItem('proposal')
    if (raw) {
      const parsed = JSON.parse(raw)
      setData(parsed)
      // Auto-save as Draft to the proposals log (idempotent — uses existing id if set)
      if (!parsed.proposalId) {
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
          margin: parsed.margin,
          projectTypes: parsed.projectTypes || [],
          projectSummary: parsed.projectSummary || '',
          status: 'Draft',
          parentId: parsed.parentId || null,
        })
        proposalIdRef.current = id
        // Persist id back into sessionStorage so repeated views don't duplicate
        sessionStorage.setItem('proposal', JSON.stringify({ ...parsed, proposalId: id }))
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
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const expirationFormatted = expiration
    ? new Date(expiration + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  // Group lines by section
  const sectionOrder = []
  const sections = {}
  lines.forEach(line => {
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

    const pricingText = lines.map((l, i) =>
      `${i + 1}. ${l.name}  |  ${l.qty} ${l.unit} × $${l.unitPrice}  =  $${fmt(l.qty * l.unitPrice)}`
    ).join('\n')

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
      isAlaCarte ? '' : `TOTAL: $${fmt(subtotal)}`,
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
      // Render the proposal in an invisible overlay at viewport origin (0,0)
      // so there is no sidebar offset in the captured image.
      // opacity:0 hides it from the user; html-to-image makes its own fresh
      // clone for the SVG foreignObject so the output is at full opacity.
      const LETTER_PX = 816 // 8.5in @ 96dpi
      const original = proposalDocRef.current
      const overlay = document.createElement('div')
      overlay.style.cssText = `position:fixed;top:0;left:0;z-index:99999;width:${LETTER_PX}px;opacity:0;pointer-events:none;`
      const clone = original.cloneNode(true)
      clone.style.cssText = `width:${LETTER_PX}px;max-width:${LETTER_PX}px;margin:0;border-radius:0;box-shadow:none;overflow:visible;`
      overlay.appendChild(clone)
      document.body.appendChild(overlay)
      // Let browser finish layout before capturing
      await new Promise(r => setTimeout(r, 150))

      const canvas = await toCanvas(clone, { pixelRatio: 2, backgroundColor: '#ffffff' })
      document.body.removeChild(overlay)

      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW
      const imgH = (canvas.height * pageW) / canvas.width
      let y = 0
      while (y < imgH) {
        if (y > 0) pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, -y, imgW, imgH)
        y += pageH
      }
      const pdfBase64 = pdf.output('datauristring').split(',')[1]

      // Create/refresh a permanent tracked view link so the email carries a
      // "View Your Proposal" button and every open is logged to this proposal's
      // activity. Best-effort — if it fails, the email still sends with the PDF.
      let viewUrl = null
      try {
        const pid = proposalIdRef.current ?? data.id ?? null
        const snapshot = buildProposalSnapshot(data, branding)
        const vr = await fetch('/api/sign/pcreate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proposalId: pid, snapshot }),
        })
        if (vr.ok) {
          const vd = await vr.json()
          viewUrl = vd.url || null
          if (pid != null && vd.token) setProposalViewToken(pid, vd.token)
        }
      } catch { /* non-fatal — send without the tracked link */ }

      const res = await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposal: { ...data },
          fromName,
          fromEmail,
          pdfBase64,
          pdfFilename: `Proposal-${(data.client || 'Client').replace(/\s+/g, '-')}.pdf`,
          viewUrl,
        }),
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Failed to send.')
      if (proposalIdRef.current) markProposalSent(proposalIdRef.current)
      setSendSuccess(true)
    } catch (err) {
      setSendError(err.message)
    } finally {
      setSending(false)
    }
  }

  // Create/refresh the permanent tracked link and copy it, so it can be pasted
  // into your own email. Same link + open-logging as the "Send to Client" button.
  const handleGetLink = async () => {
    setGettingLink(true)
    try {
      const pid = proposalIdRef.current ?? data.id ?? null
      const snapshot = buildProposalSnapshot(data, branding)
      const r = await fetch('/api/sign/pcreate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId: pid, snapshot }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.url) throw new Error(d.error || 'Could not create link')
      if (pid != null && d.token) setProposalViewToken(pid, d.token)
      try { await navigator.clipboard.writeText(d.url); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }
      catch { window.prompt('Copy your proposal link:', d.url) }
    } catch { /* no-op — user can retry */ }
    finally { setGettingLink(false) }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Toolbar */}
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/quote')} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft size={15} /> Back to Quote
        </button>
        <div className="flex-1" />
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
        >
          {copied ? <CheckCircle size={14} className="text-[var(--brand-500)]" /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy text'}
        </button>
        <button
          onClick={() => {
            if (proposalIdRef.current) markProposalSent(proposalIdRef.current)
            window.print()
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
        >
          <Printer size={14} /> Print / Save PDF
        </button>
        <button
          onClick={handleGetLink}
          disabled={gettingLink}
          title="Create a tracked link you can paste into your own email"
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {linkCopied ? <CheckCircle size={14} className="text-[var(--brand-500)]" /> : <Link2 size={14} />}
          {gettingLink ? 'Creating…' : linkCopied ? 'Link copied!' : 'Get link'}
        </button>
        <button
          onClick={() => { setShowSend(true); setSendSuccess(false); setSendError('') }}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-[var(--brand-600)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-700)]"
        >
          <Send size={14} /> Send to Client
        </button>
      </div>

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
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Your Name (optional — shows as sender)</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]"
                      placeholder="e.g. Mike's Construction"
                      value={fromName}
                      onChange={e => setFromName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Reply-to Email (optional)</label>
                    <input
                      type="email"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-300)]"
                      placeholder="you@yourcompany.com"
                      value={fromEmail}
                      onChange={e => setFromEmail(e.target.value)}
                    />
                  </div>
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
                    disabled={sending || !email}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[var(--brand-600)] text-white rounded-lg text-sm font-medium hover:bg-[var(--brand-700)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sending ? <><Loader size={14} className="animate-spin" /> Generating PDF...</> : <><Send size={14} /> Send Proposal</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Proposal document */}
      <div ref={proposalDocRef} className="max-w-3xl mx-auto my-8 bg-white shadow-lg rounded-xl overflow-hidden print:shadow-none print:rounded-none print:my-0">

        {/* Header */}
        <div className="text-white px-10 py-8" style={{ backgroundColor: palette[700] }}>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">PROPOSAL</h1>
              <p className="text-sm mt-1" style={{ color: palette[200] }}>{today}</p>
              {expirationFormatted && (
                <p className="text-sm mt-0.5 font-medium" style={{ color: palette[100] }}>Valid Until: {expirationFormatted}</p>
              )}
            </div>
            <div className="text-right">
              {branding?.logo
                ? <img src={branding.logo} alt="logo" className="h-14 object-contain ml-auto" />
                : <p className="font-semibold text-lg">{companyName}</p>}
            </div>
          </div>
        </div>

        {/* Customer info */}
        {(client || email || phone || address) && (
          <div className="px-10 py-5 border-b border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: palette[700] }}>Prepared For</p>
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                {client && <p className="font-semibold text-gray-900 text-lg">{client}</p>}
                {address && <p className="text-gray-500 text-sm mt-0.5">{address}</p>}
              </div>
              {(email || phone) && (
                <div className="text-right text-sm text-gray-500">
                  {phone && <p>{phone}</p>}
                  {email && <p>{email}</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scope of Work — always shown (broken down by item); the toggle only
            controls whether the PRICE table is itemized or a single lump sum. */}
        <div className="px-10 py-7 border-b border-gray-100">
          <p className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: palette[700] }}>Scope of Work</p>
          <div className="space-y-2">
            {lines.map(line => (
              <div key={line.id} className="border-l-2 border-gray-100 pl-3">
                <p className="text-sm font-semibold text-gray-800">{line.name}</p>
                {line.description && (
                  <p className="text-sm text-gray-500 leading-relaxed mt-0.5 whitespace-pre-wrap">{line.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Pricing Table */}
        <div className="px-10 py-7">
          {isAlaCarte && (
            <p className="text-xs text-gray-500 italic mb-4">
              The following options are priced individually — please indicate which you would like to proceed with.
            </p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="text-left pb-2 font-semibold text-gray-600 text-xs uppercase tracking-wider">
                  {isAlaCarte ? 'Option' : 'Item'}
                </th>
                <th className="text-right pb-2 font-semibold text-gray-600 text-xs uppercase tracking-wider w-28">Price</th>
                {isAlaCarte && (
                  <th className="text-right pb-2 font-semibold text-gray-600 text-xs uppercase tracking-wider w-20">Select</th>
                )}
              </tr>
            </thead>
            <tbody>
              {(showBreakdown || isAlaCarte) ? lines.map((line, i) => (
                <tr key={line.id} className={`border-b border-gray-50 ${i % 2 === 0 ? '' : 'bg-gray-50'}`}>
                  <td className="py-2.5 text-gray-800 font-medium">{line.name || '—'}</td>
                  <td className="py-2.5 text-right font-semibold text-gray-900">${fmt((Number(line.qty) || 0) * (Number(line.unitPrice) || 0))}</td>
                  {isAlaCarte && (
                    <td className="py-2.5 text-right">
                      <span className="inline-block w-4 h-4 border border-gray-400 rounded-sm" />
                    </td>
                  )}
                </tr>
              )) : (
                <tr>
                  <td className="py-2.5 text-gray-800 font-medium">Project Total</td>
                  <td className="py-2.5 text-right font-semibold text-gray-900">${fmt(subtotal)}</td>
                </tr>
              )}
            </tbody>
          </table>
          {/* Total — only shown in summed mode */}
          {!isAlaCarte && (
            <div style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }} className="border-t-2 border-gray-300 mt-2 pt-4 flex justify-end">
              <div className="text-right">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 mr-4">Total</span>
                <span className="text-xl font-bold" style={{ color: palette[700] }}>${fmt(subtotal)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Terms & Signature */}
        <div className="px-10 pb-10">
          <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-500 leading-relaxed space-y-2">
            <p className="font-semibold text-gray-600">Terms & Conditions</p>
            <p>
              {expirationFormatted
                ? `This proposal is valid until ${expirationFormatted}.`
                : 'This proposal is valid for 30 days from the date above.'
              }
            </p>
            <p><span className="font-semibold text-gray-600">Payment:</span> A 20% deposit is required to schedule work. Progress payments will follow different stages of completion as labeled in a scope of work document drafted once the proposal has been accepted.</p>
            <p><span className="font-semibold text-gray-600">Site Conditions:</span> Pricing is based on normal site conditions. Any unforeseen conditions may result in additional costs with prior written approval.</p>
            <p><span className="font-semibold text-gray-600">Warranty:</span> All projects include a standard 1-year warranty on materials and a 5-year structural warranty.</p>
            <p className="font-semibold text-gray-600 pt-1">Addendums</p>
            <p>Any changes resulting in additional charges must be paid at the time of the change. If the inspector requires engineering, it will result in an additional charge.</p>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-10">
            <div>
              <div className="border-b border-gray-300 mb-1.5 pb-6" />
              <p className="text-xs text-gray-500">Client Signature & Date</p>
            </div>
            <div>
              <div className="border-b border-gray-300 mb-1.5 pb-6" />
              <p className="text-xs text-gray-500">Contractor Signature & Date</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
