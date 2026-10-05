import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, Send, ChevronDown, ChevronUp, Sparkles, Loader2, X, Save, BookOpen, RotateCcw, FileText } from 'lucide-react'
import { useStore } from '../store'
import { DEMO } from '../demo'
import DeckPlusContract from '../contract/DeckPlusContract'
import { PACKET_FORMS } from '../contract/deckPlusAgreement'
import { PACKET_VERSION, autoContractValues, autoChecks, defaultPacket, STATES, COUNTIES } from '../contract/contractFields'

// ── Contract page ────────────────────────────────────────────────────────────
// Builds the Deck Plus contract packet for a Won proposal. The packet's wording
// is attorney-reviewed and lives in src/contract/deckPlusAgreement.js; this
// page only fills in the blanks (auto-populated from the proposal, editable by
// the sales rep), picks which trade spec sheets ride along, drafts the Scope of
// Work pages from the proposal items, and sends the packet for signature.

// Demo-only: the sandbox must never show the real company's name in a sample
// contract. These swaps run ONLY when DEMO is true, against the rendered node.
const DEMO_SWAPS = DEMO ? [[/Deck Plus/g, 'Evergreen Outdoor Living']] : []
function scrubDemoContract(root) {
  if (!DEMO || !root) return
  const apply = (s) => DEMO_SWAPS.reduce((acc, [re, rep]) => acc.replace(re, rep), s)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  for (const n of nodes) { const out = apply(n.nodeValue); if (out !== n.nodeValue) n.nodeValue = out }
}

// Render **bold** and __underline__ markdown in scope bullets as <strong>/<u>
function renderBold(text) {
  const parts = String(text ?? '').split(/(\*\*[^*\n]+\*\*|__[^_\n]+__)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (p.startsWith('__') && p.endsWith('__') && p.length > 4) return <u key={i}>{p.slice(2, -2)}</u>
    return <span key={i}>{p}</span>
  })
}

const fmt = (n) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// A line's price: qty × unitPrice, falling back to a stored price/amount/total
// field so no item is dropped when it stores its value differently.
const linePrice = (l) => {
  const byUnit = (Number(l.qty) || 1) * (Number(l.unitPrice) || 0)
  if (byUnit) return byUnit
  return Number(l.price) || Number(l.amount) || Number(l.total) || 0
}
const toScopeLine = (l, i) => ({ id: l.id ?? i, name: l.name, text: l.description ? `${l.name} — ${l.description}` : l.name, price: linePrice(l) })

const PROJECT_TYPES = ['Open Deck', 'Screen Porches', 'Eze-Breeze Porches', 'Open Porches', 'Porch Conversions', 'Sunrooms', 'Hardscapes']

// ── Payment schedules ───────────────────────────────────────────────────────
// The agreement prints four payment lines (at signature / day job starts / a
// labeled middle payment / after 1st punch list); paymentsToSlots maps these
// milestones onto them.
const PAYMENT_MILESTONES = [
  { label: 'Schedule deposit — @ sign contract',            pct: 0.20 },
  { label: 'Start payment — Material drop / Framing Start', pct: 0.30 },
  { label: 'Roof Completion',                               pct: 0.40 },
  { label: 'Paint Applied',                                 pct: 0.05 },
  { label: 'Substantial completion payment',                pct: 0.05 },
]
const PAYMENT_MILESTONES_UNDER20K = [
  { label: 'Schedule deposit — @ sign contract', pct: 0.20 },
  { label: 'Material drop / Framing Start',      pct: 0.40 },
  { label: 'Substantial completion payment',     pct: 0.40 },
]
const PAYMENT_MILESTONES_HARDSCAPE = [
  { label: 'Schedule deposit — @ sign contract', pct: 0.20 },
  { label: 'Material delivery / Work Start',     pct: 0.40 },
  { label: 'Substantial completion payment',     pct: 0.40 },
]
const PAYMENT_MILESTONES_30_50_20 = [
  { label: 'Schedule deposit — @ sign contract', pct: 0.30 },
  { label: 'Material drop / Framing Start',      pct: 0.50 },
  { label: 'Substantial completion payment',     pct: 0.20 },
]
const PAYMENT_MILESTONES_50_50 = [
  { label: 'Schedule deposit — @ sign contract', pct: 0.50 },
  { label: 'Substantial completion payment',     pct: 0.50 },
]
const PAYMENT_MILESTONES_20_30_40_10 = [
  { label: 'Schedule deposit — @ sign contract',            pct: 0.20 },
  { label: 'Start payment — Material drop / Framing Start', pct: 0.30 },
  { label: 'Roof Completion',                               pct: 0.40 },
  { label: 'Substantial completion payment',                pct: 0.10 },
]
// $30k–$100k jobs: 10% deposit, $3,000 final payment, and the rest split into
// two equal payments. Built from the contract total, so it's a formula rather
// than fixed percentages.
const FORMULA_MIN = 30000, FORMULA_MAX = 100000
const FORMULA_DEPOSIT_PCT = 0.10, FORMULA_FINAL = 3000
function formulaMilestones(total, projectTag) {
  const t = Number(total) || 0
  const finalPct = t > 0 ? Math.min(FORMULA_FINAL / t, 1 - FORMULA_DEPOSIT_PCT) : 0
  const midPct = (1 - FORMULA_DEPOSIT_PCT - finalPct) / 2
  const middle = projectTag === 'Deck' || projectTag === 'Hardscapes' ? 'Progress payment' : 'Roof Completion'
  return Object.assign([
    { label: 'Schedule deposit — @ sign contract',            pct: FORMULA_DEPOSIT_PCT },
    { label: 'Start payment — Material drop / Framing Start', pct: midPct },
    { label: middle,                                          pct: midPct },
    { label: 'Substantial completion payment',                pct: finalPct },
  ], { formula: true })
}
// Buttons the rep can pick. The older fixed splits (20/30/40/5/5, 20/30/40/10,
// 30/50/20, 50/50) were retired as buttons; contracts saved with one still
// open with it (getMilestoneSet below).
const SCHEDULE_OPTIONS = [
  { key: 'auto',          label: 'Auto' },
  { key: 'formula_10_3k', label: '10% / ½ / ½ / $3K' },
]
function getMilestoneSet(key, projectTag, total) {
  if (key === 'formula_10_3k') return formulaMilestones(total, projectTag)
  if (key === '20_30_40_5_5') return PAYMENT_MILESTONES
  if (key === '20_30_40_10')  return PAYMENT_MILESTONES_20_30_40_10
  if (key === '30_50_20')     return PAYMENT_MILESTONES_30_50_20
  if (key === '50_50')        return PAYMENT_MILESTONES_50_50
  if (total >= FORMULA_MIN && total <= FORMULA_MAX) return formulaMilestones(total, projectTag)
  if (projectTag === 'Hardscapes' || projectTag === 'Porch Conversion') return PAYMENT_MILESTONES_HARDSCAPE
  if (total < 20000) return PAYMENT_MILESTONES_UNDER20K
  return PAYMENT_MILESTONES
}

// Fill-ins shown in the side panel (every blank is also editable right on the
// document). Grouped the way the rep thinks about them.
const FILLIN_GROUPS = [
  { title: 'Dates', fields: [['effectiveDate', 'Agreement date'], ['dateSold', 'Date sold'], ['startDate', 'Start date (PM)']] },
  { title: 'Customer', fields: [['clientName', 'Client name'], ['clientPhone', 'Phone'], ['clientEmail', 'Email'], ['propertyAddress', 'Property address'], ['county', 'County'], ['subdivision', 'Subdivision']] },
  { title: 'Project', fields: [['contractNum', 'Contract #'], ['jobName', 'Job name (spec sheets)'], ['projectName', 'Project name (site conditions)'], ['projectType', 'Project type'], ['designConsultant', 'Design consultant'], ['releaseSubject', 'Release of liability — relating to'], ['capitalImprovement', 'E-589CI — capital improvement']] },
  { title: 'Payment (clause 3)', fields: [['contractTotal', 'Contract total'], ['contractTotalWords', 'Total in words'], ['pay1', 'Upon contract signature'], ['pay2', 'The day job starts'], ['pay3', 'Middle payment'], ['pay3Label', 'Middle payment label'], ['pay4', 'After 1st punch list']] },
]

// Demo-only generic contract. Rendered ONLY when DEMO is true, in place of the
// real contract, so the sandbox never exposes the real legal template.
function DemoContractDoc({ innerRef, companyName, client, address, contractNum, scopeLines = [], total = 0 }) {
  const money = (n) => '$' + Number(n || 0).toLocaleString('en-US')
  const dep = Math.round(total * 0.2), prog = Math.round(total * 0.4), fin = Math.max(0, total - dep - prog)
  const lines = scopeLines.filter(Boolean)
  return (
    <div ref={innerRef} className="qx-ink bg-white shadow-lg print:shadow-none" style={{ fontFamily: 'Georgia, serif', fontSize: '10.5pt', lineHeight: 1.55, color: '#000' }}>
      <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-center text-xs font-semibold py-2 px-4">
        SAMPLE CONTRACT · FOR DEMONSTRATION ONLY — fictional company &amp; terms, not a binding agreement.
      </div>
      <div className="px-12 py-6">
        <div className="flex justify-between items-start mb-1">
          <div className="text-xl font-black tracking-widest leading-tight" style={{ fontFamily: 'Arial, sans-serif' }}>{companyName}</div>
          <div className="text-2xl font-bold" style={{ fontFamily: 'Arial, sans-serif' }}>CONTRACT</div>
        </div>
        <div className="border-b-2 border-gray-900 mb-5" />
        <p className="text-sm mb-3">Contract #: <strong>{contractNum}</strong></p>
        <p className="text-sm mb-6 text-justify">This sample agreement is made between <strong>{companyName}</strong> (Builder) and <strong>{client || 'the Purchaser'}</strong> (Purchaser) for work at <strong>{address || 'the project premises'}</strong>. Placeholder text — <strong>not a real or binding contract</strong>.</p>
        <h3 className="font-bold text-sm mb-2">Scope of Work</h3>
        <table className="w-full text-sm border-collapse mb-6"><tbody>
          {lines.length ? lines.map((l, i) => <tr key={l.id || i}><td className="border border-gray-300 px-3 py-2">{l.name || l.text || 'Work item'}</td><td className="border border-gray-300 px-3 py-2 text-right whitespace-nowrap">{money(l.price)}</td></tr>)
            : <tr><td className="border border-gray-300 px-3 py-2 text-gray-400 italic" colSpan={2}>Scope items from the proposal appear here.</td></tr>}
          <tr className="font-bold bg-gray-50"><td className="border border-gray-300 px-3 py-2">Total</td><td className="border border-gray-300 px-3 py-2 text-right">{money(total)}</td></tr>
        </tbody></table>
        <h3 className="font-bold text-sm mb-2">Sample Payment Schedule</h3>
        <table className="w-full text-sm border-collapse mb-6"><tbody>
          <tr><td className="border border-gray-300 px-3 py-2">Deposit at signing (20%)</td><td className="border border-gray-300 px-3 py-2 text-right">{money(dep)}</td></tr>
          <tr><td className="border border-gray-300 px-3 py-2">Progress payment (40%)</td><td className="border border-gray-300 px-3 py-2 text-right">{money(prog)}</td></tr>
          <tr><td className="border border-gray-300 px-3 py-2">Final payment on completion (40%)</td><td className="border border-gray-300 px-3 py-2 text-right">{money(fin)}</td></tr>
        </tbody></table>
        <div className="grid grid-cols-2 gap-10 mt-10">
          <div><div className="border-b border-gray-500 pb-6" /><p className="text-xs text-gray-600 mt-1">PURCHASER SIGNATURE / DATE</p></div>
          <div><div className="border-b border-gray-500 pb-6" /><p className="text-xs text-gray-600 mt-1">BUILDER SIGNATURE / DATE</p></div>
        </div>
      </div>
    </div>
  )
}

export default function ContractView() {
  const navigate                  = useNavigate()
  const branding                  = useStore(s => s.branding)
  const me                        = useStore(s => s.me)
  const proposals                 = useStore(s => s.proposals)
  const saveContractDraft         = useStore(s => s.saveContractDraft)
  const scopeExamples             = useStore(s => s.scopeExamples)
  const saveScopeExamples         = useStore(s => s.saveScopeExamples)
  const scopeTemplates            = useStore(s => s.scopeTemplates)
  const saveScopeTemplate         = useStore(s => s.saveScopeTemplate)
  const deleteScopeTemplate       = useStore(s => s.deleteScopeTemplate)
  const paymentSchedules          = useStore(s => s.paymentSchedules)
  const savePaymentSchedule       = useStore(s => s.savePaymentSchedule)
  const deletePaymentSchedule     = useStore(s => s.deletePaymentSchedule)
  const paymentScheduleLearning   = useStore(s => s.paymentScheduleLearning)
  const recordPaymentScheduleUsage= useStore(s => s.recordPaymentScheduleUsage)

  const [data, setData]           = useState(null)
  const [savedAt, setSavedAt]     = useState(null)
  const [contractNum, setContractNum] = useState('')
  const [projectTypes, setProjectTypes] = useState([])
  const [projectSummary, setProjectSummary] = useState('')
  const [scopeLines, setScopeLines] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiError, setAiError]     = useState('')

  // Payment schedule
  const [milestoneLabels, setMilestoneLabels] = useState([])
  const [milestonePcts, setMilestonePcts]     = useState([])
  const [showMilestoneEditor, setShowMilestoneEditor] = useState(false)
  const [schedSaveName, setSchedSaveName]     = useState('')
  const [schedSaved, setSchedSaved]           = useState(false)
  const [projectTag, setProjectTag]           = useState(null)
  const [paymentScheduleOverride, setPaymentScheduleOverride] = useState('auto')

  // Deck Plus packet: which spec sheets ride along (null = decide from the job),
  // the rep's edits to auto-filled blanks, and the boxes ticked on the forms.
  const [packet, setPacket]           = useState(null)
  const [fieldOverrides, setFieldOverrides] = useState({})
  const [checks, setChecks]           = useState({})
  const [showFillins, setShowFillins] = useState(true)

  // À la carte picker, scope templates
  const [showItemPicker, setShowItemPicker]   = useState(false)
  const [pickerSelection, setPickerSelection] = useState(new Set())
  const [showScopeTemplates, setShowScopeTemplates] = useState(false)
  const [showSaveScopeTemplate, setShowSaveScopeTemplate] = useState(false)
  const [scopeTemplateName, setScopeTemplateName] = useState('')
  const [mergeModal, setMergeModal] = useState(null)

  // Signing
  const contractDocRef = useRef(null)
  useLayoutEffect(() => { if (DEMO) scrubDemoContract(contractDocRef.current) })
  const [showSignModal, setShowSignModal] = useState(false)
  const [googleAuthed, setGoogleAuthed]   = useState(false)
  const [signing, setSigning]             = useState(false)
  const [signResult, setSignResult]       = useState(null)
  const [signError, setSignError]         = useState('')
  const [signTab, setSignTab]             = useState('link')
  const [signingLinks, setSigningLinks]   = useState(null)
  const [linkLoading, setLinkLoading]     = useState(false)
  const [copiedRole, setCopiedRole]       = useState('')

  useEffect(() => {
    const raw = sessionStorage.getItem('contract')
    if (!raw) return
    const d = JSON.parse(raw)
    setData(d)
    const proposal = proposals.find(p => p.id === d.proposalId)
    const draft    = proposal?.contractDraft
    if (draft) {
      setContractNum(draft.contractNum ?? d.contractNumber ?? '')
      setProjectSummary(draft.projectSummary ?? d.projectSummary ?? '')
      if (d.freshSelection && (d.lines || []).length) {
        const prevById = new Map((draft.scopeLines || []).map(l => [String(l.id), l]))
        setScopeLines((d.lines || []).map((l, i) => { const line = toScopeLine(l, i); const prev = prevById.get(String(line.id)); return prev?.text ? { ...line, text: prev.text } : line }))
      } else {
        setScopeLines(draft.scopeLines ?? (d.lines || []).map(toScopeLine))
      }
      setSavedAt(draft.savedAt ?? null)
      const tag = draft.projectTag ?? null, pso = draft.paymentScheduleOverride ?? 'auto'
      setProjectTag(tag)
      setProjectTypes(draft.projectTypes?.length ? draft.projectTypes : (d.projectTypes || []))
      setPaymentScheduleOverride(pso)
      setMilestoneLabels(draft.milestoneLabels ?? getMilestoneSet(pso, tag, d.total).map(m => m.label))
      setMilestonePcts(draft.milestonePcts ?? [])
      setPacket(draft.packet ?? (draft.includesElectrical ? ['electrical'] : null))
      setFieldOverrides(draft.fieldOverrides ?? { specialInstructions: draft.specialInstructions, directions: draft.directions })
      setChecks(draft.checks ?? autoChecks({ hoa: draft.hoa, power: draft.power }))
    } else {
      setContractNum(d.contractNumber || '')
      setMilestoneLabels(getMilestoneSet('auto', null, d.total).map(m => m.label))
      setProjectSummary(d.projectSummary || '')
      setProjectTypes(d.projectTypes || [])
      if (d.isAlaCarte && (d.lines || []).length > 0) {
        setPickerSelection(new Set((d.lines).map((l, i) => l.id ?? i)))
        setShowItemPicker(true)
      } else {
        setScopeLines((d.lines || []).map(toScopeLine))
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on open; the draft is read from the proposal at that moment
  }, [])

  useEffect(() => {
    fetch(`/api/google-auth/status`).then(r => r.json()).then(d => setGoogleAuthed(d.authenticated)).catch(() => {})
    const params = new URLSearchParams(window.location.search)
    if (params.get('google') === 'connected') {
      window.history.replaceState({}, '', window.location.pathname)
      setGoogleAuthed(true)
      setShowSignModal(true)
    }
  }, [])

  if (!data) {
    return (
      <div className="p-8 text-center text-gray-400">
        <p className="mb-4">No contract data. Open the Proposal Tracker, mark a proposal as Won, then click the contract icon.</p>
        <button onClick={() => navigate('/tracker')} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Go to Tracker →</button>
      </div>
    )
  }

  // ── Derived ────────────────────────────────────────────────────────────
  const proposal    = proposals.find(p => p.id === data.proposalId)
  const client      = data.client || ''
  const companyName = branding?.companyName || 'Deck Plus'
  const scopeTotal  = (scopeLines || []).reduce((s, l) => s + (Number(l.price) || 0), 0)
  const total       = scopeTotal > 0 ? scopeTotal : Number(data.total || 0)
  const milestones  = getMilestoneSet(paymentScheduleOverride, projectTag, total)
  const payments    = milestones.map((m, i) => {
    const pct = milestonePcts[i] != null ? milestonePcts[i] / 100 : m.pct
    return { ...m, pct, label: milestoneLabels[i] ?? m.label, amount: total * pct }
  })
  const pctSum      = Math.round(payments.reduce((s, p) => s + p.pct * 100, 0) * 100) / 100
  const hasElectrical = (scopeLines || []).some(l => /electric|outlet|light|fan|switch|wiring/i.test(`${l.name} ${l.text}`))
  const saleDate    = proposal?.closedAt || proposal?.statusChangedAt || null
  const autoValues  = autoContractValues({ data, total, payments, projectTypes, contractNum, me, saleDate, projectSummary })
  const values      = autoContractValues({ data, total, payments, projectTypes, contractNum, me, saleDate, projectSummary, overrides: fieldOverrides })
  const packetKeys  = packet ?? defaultPacket({ projectTypes, scopeLines, hasElectrical, state: values.jobState, county: values.county })
  const effectiveChecks = { ...autoChecks({ projectTypes }), ...checks }

  const setValue = (name, v) => {
    if (name === 'contractNum') { setContractNum(v); return }
    setFieldOverrides(prev => ({ ...prev, [name]: v }))
  }
  const resetValue = (name) => setFieldOverrides(prev => { const n = { ...prev }; delete n[name]; return n })
  const setCheck = (id, on) => setChecks(prev => ({ ...prev, [id]: on }))
  const togglePacket = (key) => setPacket(prev => { const cur = prev ?? packetKeys; return cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key] })
  const toggleProjectType = (t) => setProjectTypes(cur => cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t])

  const draftPayload = () => ({
    contractNum, projectTypes, projectSummary, scopeLines,
    milestoneLabels, milestonePcts, projectTag, paymentScheduleOverride,
    packet: packetKeys, fieldOverrides, checks,
    includesElectrical: packetKeys.includes('electrical'),
  })
  const saveDraft = (extra = {}) => {
    if (!data?.proposalId) return
    saveContractDraft(data.proposalId, { ...draftPayload(), ...extra })
    const examples = scopeLines.filter(l => l.text?.trim()).map(l => ({ itemName: l.name || l.text.split('\n')[0].slice(0, 60), bulletText: l.text }))
    if (examples.length > 0) saveScopeExamples(data.proposalId, examples)
    setSavedAt(new Date().toISOString())
  }

  const effectiveScheduleKey = (() => {
    if (paymentScheduleOverride !== 'auto') return paymentScheduleOverride
    const ms = getMilestoneSet('auto', projectTag, total)
    if (ms.formula)                         return 'formula_10_3k'
    if (ms === PAYMENT_MILESTONES)          return '20_30_40_5_5'
    if (ms === PAYMENT_MILESTONES_UNDER20K) return 'simple'
    return 'hardscape'
  })()

  // ── Signing ────────────────────────────────────────────────────────────
  const handleGetSigningLink = async () => {
    setLinkLoading(true)
    setSignError('')
    if (projectTag) recordPaymentScheduleUsage(projectTag, effectiveScheduleKey)
    try {
      const fullBranding = { companyName: branding?.companyName, tagline: branding?.tagline, primaryColor: branding?.primaryColor, logo: branding?.logo || null }
      const scopeStrings = scopeLines.map(l => (typeof l === 'string' ? l : (l?.text || l?.name || ''))).filter(Boolean)
      const contractData = {
        ...data,
        total,
        scopeBullets: scopeStrings,
        scopeLines,
        payments,
        projectTypes,
        projectSummary,
        milestoneLabels, milestonePcts, projectTag, paymentScheduleOverride,
        includesElectrical: packetKeys.includes('electrical'),
        // Deck Plus packet — everything the signing page needs to print it
        dp: { version: PACKET_VERSION, values, checks: effectiveChecks, packet: packetKeys },
        branding: fullBranding,
        isSmallContract: true,   // two parties (client + Deck Plus); no GC link
      }
      const post = async (body) => {
        const res  = await fetch(`/api/sign/create`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
        const text = await res.text()
        let result
        try { result = JSON.parse(text) } catch { throw new Error(`Server returned non-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`) }
        if (!res.ok || result.error) throw new Error(result.error || `HTTP ${res.status}`)
        if (!result.links) throw new Error('No links in response')
        return result
      }
      let bodyJson = JSON.stringify({ contractData, contractNum })
      if (bodyJson.length > 4_000_000) {
        bodyJson = JSON.stringify({ contractData: { ...contractData, branding: { ...fullBranding, logo: null } }, contractNum })
        if (bodyJson.length > 4_000_000) throw new Error(`Contract data too large (${(bodyJson.length / 1024 / 1024).toFixed(2)}MB). Vercel limits requests to 4.5MB.`)
      }
      const result = await post(bodyJson)
      setSigningLinks(result.links)
      if (data?.proposalId && result.recordId) saveDraft({ signRecordId: result.recordId, signLinks: result.links, linksSentAt: new Date().toISOString() })
    } catch (err) {
      setSignError(err.message)
    } finally {
      setLinkLoading(false)
    }
  }

  const handleConnectGoogle = async () => {
    try {
      const origin = window.location.origin
      const res  = await fetch(`/api/google-auth/start?origin=${encodeURIComponent(origin)}`)
      const text = await res.text()
      let d
      try { d = JSON.parse(text) } catch { throw new Error(`Server error: ${text.slice(0, 200)}`) }
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`)
      window.location.href = d.url
    } catch (err) { setSignError(err.message) }
  }

  const handleUploadToDrive = async () => {
    setSigning(true); setSignError(''); setSignResult(null)
    try {
      const { toCanvas } = await import('html-to-image')
      const { default: jsPDF } = await import('jspdf')
      const LETTER_PX = 816
      const original  = contractDocRef.current
      const overlay   = document.createElement('div')
      overlay.style.cssText = `position:fixed;top:0;left:0;z-index:99999;width:${LETTER_PX}px;opacity:0;pointer-events:none;background:#ffffff;`
      const clone = original.cloneNode(true)
      clone.style.cssText = `width:${LETTER_PX}px;max-width:${LETTER_PX}px;margin:0;border-radius:0;box-shadow:none;overflow:visible;background:#ffffff;`
      clone.querySelectorAll('.no-print').forEach(el => el.remove())
      clone.querySelectorAll('.print-only').forEach(el => { el.style.display = el.tagName === 'SPAN' ? 'inline' : 'block' })
      overlay.appendChild(clone)
      document.body.appendChild(overlay)
      await Promise.all(Array.from(clone.querySelectorAll('img')).map(img => img.complete && img.naturalWidth > 0 ? Promise.resolve() : new Promise(resolve => { img.onload = img.onerror = resolve })))
      await new Promise(r => setTimeout(r, 300))
      const cloneTop  = clone.getBoundingClientRect().top
      const contentH  = Math.max(clone.scrollHeight, clone.getBoundingClientRect().height)
      const breakYsPx = Array.from(clone.querySelectorAll('.pdf-page-break')).map(el => el.getBoundingClientRect().top - cloneTop).filter(y => y > 1).sort((a, b) => a - b)
      const canvas  = await toCanvas(clone, { pixelRatio: 1.5, backgroundColor: '#ffffff', cacheBust: true })
      document.body.removeChild(overlay)
      const imgData = canvas.toDataURL('image/jpeg', 0.75)
      const pdf     = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true })
      const pageW   = pdf.internal.pageSize.getWidth(), pageH = pdf.internal.pageSize.getHeight()
      const imgH    = (canvas.height * pageW) / canvas.width
      const pxToPt  = imgH / contentH
      const boundaries = [0, ...breakYsPx.map(y => y * pxToPt), imgH]
      let isFirst = true
      for (let i = 0; i < boundaries.length - 1; i++) {
        let y = boundaries[i]
        while (y < boundaries[i + 1]) {
          if (!isFirst) pdf.addPage()
          isFirst = false
          pdf.addImage(imgData, 'JPEG', 0, -y, pageW, imgH)
          const sliceBottom = y + pageH
          if (sliceBottom > boundaries[i + 1]) { const coverTop = boundaries[i + 1] - y; pdf.setFillColor(255, 255, 255); pdf.rect(0, coverTop, pageW, pageH - coverTop + 2, 'F') }
          y += pageH
        }
      }
      const pdfBase64 = pdf.output('datauristring').split(',')[1]
      const fileName  = `Contract-${(client || 'Client').replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`
      const res = await fetch(`/api/drive/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pdfBase64, fileName }) })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Upload failed')
      setSignResult(result)
    } catch (err) { setSignError(err.message) } finally { setSigning(false) }
  }

  // ── Scope of Work drafting (from the proposal's line items) ────────────
  const addLine = () => setScopeLines(prev => [...prev, { id: Date.now(), name: '', text: '' }])

  const fillFromPastContracts = () => {
    if (!scopeExamples.length) return
    const score = (itemName, ex) => {
      const a = (itemName || '').toLowerCase(), b = (ex.itemName || '').toLowerCase()
      if (a === b) return 100
      const words = a.split(/\s+/).filter(w => w.length > 2)
      return words.filter(w => b.includes(w)).length / Math.max(words.length, 1)
    }
    setScopeLines(prev => prev.map(line => {
      const best = scopeExamples.map(ex => ({ ex, s: score(line.name || line.text, ex) })).filter(({ s }) => s > 0)
        .sort((a, b) => (b.s !== a.s ? b.s - a.s : new Date(b.ex.savedAt) - new Date(a.ex.savedAt)))[0]
      return best ? { ...line, text: best.ex.bulletText } : line
    }))
  }

  const generateSuggestions = async () => {
    if (!data?.lines?.length) return
    setIsGenerating(true); setAiError('')
    try {
      const itemList = (data.lines || []).map(l => `- ${l.name}${l.description ? ': ' + l.description : ''}${l.qty && l.unit ? ` (${l.qty} ${l.unit})` : ''}`).join('\n')
      const findRelevant = (itemName) => {
        const words = (itemName || '').toLowerCase().split(/\s+/).filter(w => w.length > 3)
        return scopeExamples.filter(ex => words.some(w => ex.itemName?.toLowerCase().includes(w) || ex.bulletText?.toLowerCase().includes(w)))
          .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt)).slice(0, 2)
      }
      const seen = new Set()
      const relevant = (data.lines || []).flatMap(l => findRelevant(l.name)).filter(ex => { if (seen.has(ex.id)) return false; seen.add(ex.id); return true }).slice(0, 10)
      const styleContext = relevant.length > 0
        ? `\n\nIMPORTANT — You have written scope bullets for this contractor before. Study these EXACT past examples and match the writing style, line breaks, indentation, and level of detail PRECISELY:\n\n${relevant.map(ex => `[${ex.itemName}]\n${ex.bulletText}`).join('\n\n')}\n\nWrite the new bullets in this SAME style.`
        : ''
      const res = await fetch('/api/ai-chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You are a professional scope of work writer for an outdoor construction company specializing in decks, porches, pergolas, sunrooms, and outdoor structures. Write clear, professional, complete scope of work bullet points.${projectTag ? ` This is a ${projectTag} project.` : ''}${styleContext}`,
          messages: [{ role: 'user', content: `Below are line items from an accepted proposal. For each item, write ONE professional scope of work bullet point describing the work to be performed. Use complete sentences and professional construction language. Be specific about materials and installation methods where relevant.\n\nReturn ONLY the bullet points, one per line, starting with "- ". Output exactly ${(data.lines || []).length} bullets in the same order.\n\nProposal line items:\n${itemList}` }],
          maxTokens: 4096,
        }),
      })
      if (!res.ok) { const err = await res.text().catch(() => res.statusText); throw new Error(`AI error (${res.status}): ${err}`) }
      const aiData  = await res.json()
      const bullets = (aiData.text || '').split('\n').map(l => l.replace(/^[-•*\d.]+\s*/, '').trim()).filter(Boolean)
      setScopeLines(prev => prev.map((line, i) => ({ ...line, text: bullets[i] || line.text })))
    } catch (err) { setAiError(err.message) } finally { setIsGenerating(false) }
  }

  // The scope editor rendered in place of the printed bullets on the Scope of
  // Work page (screen only; the printed list is rendered by the packet).
  const scopeEditor = (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs text-blue-600" style={{ fontFamily: 'system-ui, sans-serif' }}>
          <span>✏️</span><span>Start a line with <strong>--</strong> to make it a bullet point. Plain lines print as text. Enter = new line. **bold** and __underline__ work.</span>
          {scopeExamples.length > 0 && <span className="text-purple-500 font-medium ml-1">· {scopeExamples.length} example{scopeExamples.length !== 1 ? 's' : ''} learned</span>}
        </div>
        <div className="flex items-center gap-2" style={{ fontFamily: 'system-ui, sans-serif' }}>
          <button onClick={fillFromPastContracts} disabled={scopeExamples.length === 0}
            title={scopeExamples.length === 0 ? 'Save a contract draft first to build your example library' : 'Fill from your past contracts — no AI needed'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
            <BookOpen size={12} /> Fill from Past Contracts
          </button>
          <button onClick={generateSuggestions} disabled={isGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 disabled:opacity-50">
            {isGenerating ? <><Loader2 size={12} className="animate-spin" /> Generating…</> : <><Sparkles size={12} /> AI Suggest</>}
          </button>
        </div>
      </div>
      {aiError && <div className="mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{aiError}</div>}
      <textarea
        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 leading-relaxed"
        style={{ minHeight: '14rem', resize: 'vertical', fontFamily: 'system-ui, sans-serif' }}
        placeholder={'Use -- to create a bullet point:\n\n-- Build 16×16 gable-roof screen porch on new pressure-treated deck\n-- Install ScreenEze system with charcoal fiberglass screen…'}
        value={scopeLines.map(l => l.text).join('\n')}
        onChange={e => {
          const lines = e.target.value.split('\n')
          setScopeLines(lines.map((text, i) => ({ id: scopeLines[i]?.id ?? Date.now() + i, name: scopeLines[i]?.name ?? '', price: scopeLines[i]?.price ?? 0, text })))
        }}
      />
      <div className="mt-3 flex items-center gap-2 flex-wrap" style={{ fontFamily: 'system-ui, sans-serif' }}>
        <button onClick={addLine} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded px-2 py-1.5"><span className="text-base leading-none">+</span> Add bullet</button>
        <button onClick={() => setShowScopeTemplates(true)} className="flex items-center gap-1.5 text-xs text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded px-2 py-1.5"><BookOpen size={12} /> Load template</button>
        {scopeLines.length > 0 && <button onClick={() => setShowSaveScopeTemplate(true)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded px-2 py-1.5"><Save size={12} /> Save as template</button>}
      </div>
      <div className="mt-3 text-xs text-gray-500" style={{ fontFamily: 'system-ui, sans-serif' }}>
        Item names and prices in the table below come from the proposal. Edit a name inline:
        <div className="mt-1 space-y-1">
          {scopeLines.filter(l => (l.name || '').trim() || Number(l.price) > 0).map(line => (
            <div key={line.id} className="flex items-center gap-2">
              <input className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs" value={line.name || ''} onChange={e => setScopeLines(prev => prev.map(l => l.id === line.id ? { ...l, name: e.target.value } : l))} />
              <span className="w-24 text-right">${fmt(line.price)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const roleRows = [
    { role: 'client',  label: 'Client',    color: 'bg-blue-50 border-blue-200' },
    { role: 'builder', label: 'Deck Plus', color: 'bg-emerald-50 border-emerald-200' },
  ]
  const btn = (on, onCls = 'bg-blue-600 text-white border-blue-600') => `px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${on ? onCls : 'bg-white text-gray-600 border-gray-300 hover:border-blue-300'}`

  return (
    <div className="qx-ink min-h-screen bg-gray-100">

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate('/tracker')} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"><ArrowLeft size={15} /> Back to Tracker</button>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 font-medium shrink-0">Contract #</label>
          <input className="border border-gray-300 rounded px-2 py-1 text-sm font-mono w-36 focus:outline-none focus:ring-2 focus:ring-blue-300" value={contractNum} onChange={e => setContractNum(e.target.value)} placeholder="e.g. DP-2026-041" />
        </div>
        <button onClick={() => saveDraft()} className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"><Save size={14} /> Save Draft</button>
        {savedAt && <span className="text-xs text-gray-400">Saved {new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
        <button onClick={() => window.print()} className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"><Printer size={14} /> Print / Save PDF</button>
        <button onClick={() => { setSignResult(null); setSignError(''); setShowSignModal(true) }}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold text-white" style={{ background: '#16a34a' }}>
          <Send size={14} /> Send for Signature
        </button>
      </div>

      {/* ── À la carte item picker ───────────────────────────────────── */}
      {showItemPicker && data && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 no-print">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
            <div className="px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">A La Carte</span>
                <h2 className="text-base font-bold text-gray-900">Select Items to Include in Contract</h2>
              </div>
              <p className="text-sm text-gray-500">This proposal has multiple options — uncheck any items that will <strong>not</strong> be part of this contract.</p>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1.5">
              {(data.lines || []).map((line, i) => {
                const id = line.id ?? i, checked = pickerSelection.has(id)
                return (
                  <label key={id} className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer ${checked ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50 border border-transparent hover:bg-gray-100'}`}>
                    <input type="checkbox" checked={checked} onChange={() => setPickerSelection(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })} className="mt-0.5 accent-blue-600" />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${checked ? 'text-gray-900' : 'text-gray-400'}`}>{line.name}</p>
                      {line.description && <p className="text-xs text-gray-400 truncate">{line.description}</p>}
                    </div>
                    <p className={`text-sm font-semibold shrink-0 ${checked ? 'text-gray-800' : 'text-gray-300'}`}>${fmt(linePrice(line))}</p>
                  </label>
                )
              })}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">{pickerSelection.size} of {(data.lines || []).length} items selected</span>
                <button onClick={() => setPickerSelection(new Set((data.lines || []).map((l, i) => l.id ?? i)))} className="text-xs text-blue-600 hover:underline">Select all</button>
                <button onClick={() => setPickerSelection(new Set())} className="text-xs text-gray-400 hover:underline">Clear all</button>
              </div>
              <button disabled={pickerSelection.size === 0}
                onClick={() => { setScopeLines((data.lines || []).filter((l, i) => pickerSelection.has(l.id ?? i)).map(toScopeLine)); setShowItemPicker(false) }}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">Confirm Selection →</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Project type, spec sheets & payment schedule ─────────────── */}
      <div className="no-print max-w-4xl mx-auto mt-6 px-4">
        <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Project Type <span className="font-normal text-gray-400 normal-case">(drives the payment schedule)</span></label>
            <div className="flex gap-2 flex-wrap">
              {['Hardscapes', 'Porch Conversion', 'Porch', 'Porch with Deck', 'Deck'].map(tag => (
                <button key={tag} onClick={() => { const next = projectTag === tag ? null : tag; setProjectTag(next); if (paymentScheduleOverride === 'auto') setMilestoneLabels(getMilestoneSet('auto', next, total).map(m => m.label)) }}
                  className={btn(projectTag === tag, 'bg-gray-900 text-white border-gray-900')}>{tag}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
              Project Types on Contract
              {projectTypes.length === 0 && <span className="ml-2 font-normal text-amber-600 normal-case">— none set; pick below so the Project Type blank isn't empty</span>}
            </label>
            <div className="flex gap-2 flex-wrap">
              {PROJECT_TYPES.map(t => <button key={t} type="button" onClick={() => toggleProjectType(t)} className={btn(projectTypes.includes(t), 'bg-[var(--brand-600)] text-white border-[var(--brand-600)]')}>{t}</button>)}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">Job Location <span className="font-normal text-gray-400 normal-case">(state from the address; county picks the permit forms)</span></label>
            <div className="flex gap-2 flex-wrap items-center mb-4">
              {STATES.map(st => <button key={st} onClick={() => setValue('jobState', st)} className={btn(values.jobState === st, 'bg-gray-900 text-white border-gray-900')}>{st}</button>)}
              <select className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs" value={values.county || ''}
                onChange={e => {
                  const c = e.target.value
                  setValue('county', c)
                  const st = STATES.find(st => COUNTIES[st].includes(c))   // picking a county also sets its state
                  if (st) setValue('jobState', st)
                }}>
                <option value="">County…</option>
                {STATES.map(st => <optgroup key={st} label={st}>{COUNTIES[st].map(c => <option key={c} value={c}>{c}</option>)}</optgroup>)}
                <option value="__other">Other…</option>
              </select>
              {(values.county === '__other' || (values.county && !Object.values(COUNTIES).flat().includes(values.county))) && (
                <input className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs w-36" placeholder="County name" value={values.county === '__other' ? '' : values.county} onChange={e => setValue('county', e.target.value)} />
              )}
            </div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
              Spec Sheets &amp; Forms in this Packet
              {packet === null && <span className="ml-2 font-normal text-gray-400 normal-case">(auto from the job — click to change)</span>}
            </label>
            <div className="flex gap-2 flex-wrap">
              {PACKET_FORMS.map(f => <button key={f.key} onClick={() => togglePacket(f.key)} className={btn(packetKeys.includes(f.key), 'bg-amber-500 text-white border-amber-500')}><FileText size={12} className="inline mr-1 -mt-0.5" />{f.label}</button>)}
              {packet !== null && <button onClick={() => setPacket(null)} className="text-xs text-gray-400 hover:text-gray-600 underline">reset to auto</button>}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Pages 1–7, the Scope of Work, the Processing Form and the General Release of Liability print on every contract. Spec sheets follow the Scope of Work; the NC E-589CI affidavit (all NC jobs) and the York County permit application (York County jobs) print last.</p>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-2">
              Payment Schedule
              {paymentScheduleOverride === 'auto' && projectTag && <span className="ml-2 font-normal text-gray-400 normal-case">(auto-selected from project type)</span>}
            </label>
            {(() => {
              const tagHistory = projectTag ? (paymentScheduleLearning[projectTag] || {}) : {}
              const suggestedKey = Object.keys(tagHistory).filter(k => SCHEDULE_OPTIONS.some(o => o.key === k)).sort((a, b) => tagHistory[b] - tagHistory[a])[0]
              return (
                <>
                  {suggestedKey && paymentScheduleOverride === 'auto' && <p className="text-xs text-blue-600 mb-2">💡 Used <strong>{SCHEDULE_OPTIONS.find(o => o.key === suggestedKey)?.label ?? suggestedKey}</strong> on {tagHistory[suggestedKey]} past {projectTag} job{tagHistory[suggestedKey] !== 1 ? 's' : ''}</p>}
                  <div className="flex gap-2 flex-wrap">
                    {SCHEDULE_OPTIONS.map(({ key, label }) => (
                      <button key={key} onClick={() => { setPaymentScheduleOverride(key); setMilestonePcts([]); setMilestoneLabels(getMilestoneSet(key, projectTag, total).map(m => m.label)) }}
                        className={btn(paymentScheduleOverride === key)}>{label}{suggestedKey === key ? ' ★' : ''}</button>
                    ))}
                  </div>
                </>
              )
            })()}
            <div className="mt-3">
              <button onClick={() => setShowMilestoneEditor(v => !v)} className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800">
                <ChevronDown size={13} className={`transition-transform ${showMilestoneEditor ? 'rotate-180' : ''}`} />{showMilestoneEditor ? 'Hide' : 'Edit'} milestone details
              </button>
              {showMilestoneEditor && (
                <div className="mt-3 space-y-2">
                  {pctSum !== 100 && <p className="text-xs text-red-500 font-medium mb-2">⚠ Percentages total {pctSum}% — must equal 100%</p>}
                  {milestones.map((m, i) => {
                    const currentPct = milestonePcts[i] != null ? milestonePcts[i] : Math.round(m.pct * 1000) / 10
                    return (
                      <div key={i} className="flex gap-2 items-center">
                        <div className="flex items-center gap-1 shrink-0">
                          <input type="number" min={1} max={99} step="0.1" className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center" value={currentPct}
                            onChange={e => { const v = Number(e.target.value); setMilestonePcts(prev => { const n = [...prev]; n[i] = isNaN(v) ? Math.round(m.pct * 100) : v; return n }) }} />
                          <span className="text-xs text-gray-400">%</span>
                        </div>
                        <input className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" value={milestoneLabels[i] ?? m.label}
                          onChange={e => setMilestoneLabels(prev => { const n = [...prev]; n[i] = e.target.value; return n })} />
                        <span className="text-xs text-gray-400 shrink-0 w-24 text-right">${fmt(total * (milestonePcts[i] != null ? milestonePcts[i] / 100 : m.pct))}</span>
                      </div>
                    )
                  })}
                  <div className="flex gap-2 items-center pt-2 border-t border-gray-100 mt-1">
                    <input className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-xs" placeholder="Name this schedule (e.g. Deck Standard, HOA Porch…)" value={schedSaveName} onChange={e => { setSchedSaveName(e.target.value); setSchedSaved(false) }} />
                    <button disabled={!schedSaveName.trim() || pctSum !== 100}
                      onClick={() => { savePaymentSchedule({ name: schedSaveName.trim(), milestones: milestones.map((m, i) => ({ label: milestoneLabels[i] ?? m.label, pct: milestonePcts[i] != null ? milestonePcts[i] / 100 : m.pct })) }); setSchedSaved(true); setSchedSaveName('') }}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40">{schedSaved ? '✓ Saved' : 'Save schedule'}</button>
                  </div>
                </div>
              )}
              {paymentSchedules.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Saved Schedules</p>
                  <div className="flex gap-2 flex-wrap">
                    {paymentSchedules.map(sched => (
                      <div key={sched.id} className="flex items-center gap-1">
                        <button onClick={() => { setPaymentScheduleOverride('auto'); setMilestoneLabels(sched.milestones.map(m => m.label)); setMilestonePcts(sched.milestones.map(m => Math.round(m.pct * 100))) }}
                          className="px-3 py-1.5 rounded-l-lg border border-r-0 text-xs font-medium bg-white text-gray-700 border-gray-300 hover:bg-gray-50">
                          {sched.name}<span className="ml-1.5 text-gray-400">{sched.milestones.map(m => Math.round(m.pct * 100)).join('/')}</span>
                        </button>
                        <button onClick={() => deletePaymentSchedule(sched.id)} className="px-2 py-1.5 rounded-r-lg border text-xs text-gray-400 border-gray-300 hover:text-red-500">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">Clause 3 prints four payment lines: first milestone → upon contract signature, second → the day job starts, any middle milestones → the labeled line, last → after 1st punch list. Adjust below if needed.</p>
          </div>
        </div>
      </div>

      {savedAt && (
        <div className="no-print max-w-4xl mx-auto mt-4 px-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2 text-sm text-emerald-700 flex items-center gap-2"><Save size={13} /> Draft last saved {new Date(savedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} — all your edits have been restored.</div>
        </div>
      )}

      {/* ── Fill-ins (auto-populated, editable) ─────────────────────── */}
      <div className="no-print max-w-4xl mx-auto mt-6 mb-2 px-4">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button onClick={() => setShowFillins(v => !v)} className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <span>Contract fill-ins <span className="font-normal text-gray-400">— auto-filled from the proposal; change anything here or directly on the document</span></span>
            {showFillins ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          {showFillins && (
            <div className="px-5 pb-5 border-t border-gray-100 pt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {FILLIN_GROUPS.map(g => (
                <div key={g.title}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{g.title}</p>
                  <div className="space-y-1.5">
                    {g.fields.map(([name, label]) => {
                      const overridden = fieldOverrides[name] !== undefined && fieldOverrides[name] !== '' && name !== 'contractNum'
                      return (
                        <div key={name} className="flex items-center gap-2">
                          <label className="text-xs text-gray-500 w-40 shrink-0">{label}</label>
                          <input className={`flex-1 border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${overridden ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
                            value={values[name] ?? ''} onChange={e => setValue(name, e.target.value)} />
                          {overridden && <button onClick={() => resetValue(name)} title={`Back to auto: ${autoValues[name] || '(blank)'}`} className="text-gray-400 hover:text-gray-600"><RotateCcw size={13} /></button>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div className="md:col-span-2 bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700">
                Every other blank (notes, providers, beds/baths, spec-sheet details…) and every checkbox can be filled right on the document below — yellow fields are editable. The contract wording itself is locked.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── The packet ──────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto my-6 px-4 pb-16">
        {DEMO ? (
          <DemoContractDoc innerRef={contractDocRef} companyName={companyName} client={client} address={data.address} contractNum={contractNum} scopeLines={scopeLines} total={total} />
        ) : (
          <DeckPlusContract
            innerRef={contractDocRef}
            className="bg-white shadow-lg print:shadow-none"
            values={values} checks={effectiveChecks} packet={packetKeys}
            scopeLines={scopeLines} projectSummary={projectSummary} total={total} payments={payments}
            editable onValue={setValue} onCheck={setCheck}
            scopeSlot={
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1" style={{ fontFamily: 'system-ui, sans-serif' }}>Project summary (prints above the bullets)</label>
                <textarea className="w-full border border-blue-200 bg-blue-50 rounded px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 mb-3" rows={3}
                  style={{ fontFamily: 'system-ui, sans-serif' }} value={projectSummary} onChange={e => setProjectSummary(e.target.value)}
                  placeholder="e.g. 16×16 Gable Roof Eze-Breeze Porch with vaulted ceiling on a new TimberTech deck…" />
                {scopeEditor}
              </div>
            }
            renderBold={renderBold}
          />
        )}
      </div>

      {/* ── Scope template modals ───────────────────────────────────── */}
      {showScopeTemplates && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 no-print" onClick={() => setShowScopeTemplates(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <p className="font-semibold text-gray-900">Scope Templates</p>
              <button onClick={() => setShowScopeTemplates(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-3">
              {scopeTemplates.length === 0 ? (
                <div className="text-center py-8"><p className="text-sm text-gray-400 italic">No saved templates yet.</p><p className="text-xs text-gray-400 mt-1">Build your scope bullets and click "Save as template" to create one.</p></div>
              ) : scopeTemplates.map(t => (
                <div key={t.id} className="border border-gray-200 rounded-xl p-4 hover:border-purple-300">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div><p className="font-semibold text-sm text-gray-900">{t.name}</p>{t.projectType && <p className="text-xs text-gray-400">{t.projectType}</p>}</div>
                    <button onClick={() => { if (window.confirm(`Delete "${t.name}"?`)) deleteScopeTemplate(t.id) }} className="text-gray-300 hover:text-red-500 shrink-0"><X size={13} /></button>
                  </div>
                  <ul className="text-xs text-gray-500 space-y-0.5 mb-3 max-h-28 overflow-y-auto">
                    {t.bullets.slice(0, 6).map((b, i) => <li key={i} className="flex gap-1.5"><span>●</span><span className="truncate">{b}</span></li>)}
                    {t.bullets.length > 6 && <li className="text-gray-400 italic">+{t.bullets.length - 6} more…</li>}
                  </ul>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => { setScopeLines(prev => t.bullets.map((txt, i) => ({ id: prev[i]?.id ?? Date.now() + i, name: prev[i]?.name ?? '', price: prev[i]?.price ?? 0, text: txt }))); setShowScopeTemplates(false) }}
                      className="flex-1 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700">Replace scope</button>
                    <button onClick={() => { setScopeLines(prev => [...prev, ...t.bullets.map((txt, i) => ({ id: Date.now() + i + 1000, name: '', price: 0, text: txt }))]); setShowScopeTemplates(false) }}
                      className="flex-1 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50">Append to scope</button>
                    <button onClick={() => {
                        const normalize = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
                        const currentNorm = scopeLines.map(l => normalize(l.text))
                        const missing = t.bullets.filter(b => b.trim()).filter(b => { const bn = normalize(b); return !currentNorm.some(cn => cn.includes(bn) || bn.includes(cn)) }).map(txt => ({ txt, checked: true }))
                        setMergeModal({ template: t, missing }); setShowScopeTemplates(false)
                      }}
                      className="w-full py-1.5 border border-green-300 text-green-700 text-xs font-medium rounded-lg hover:bg-green-50">Merge missing bullets</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {mergeModal && (
        <div className="fixed inset-0 bg-black/40 z-[9999] flex items-center justify-center p-4 no-print" onClick={() => setMergeModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div><p className="font-semibold text-gray-900">Merge from "{mergeModal.template.name}"</p><p className="text-xs text-gray-400 mt-0.5">Uncheck any bullets you don't want to add</p></div>
              <button onClick={() => setMergeModal(null)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {mergeModal.missing.length === 0 ? (
                <div className="text-center py-8"><p className="text-sm text-gray-500 font-medium">All bullets already in scope</p></div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs text-gray-500">{mergeModal.missing.filter(m => m.checked).length} of {mergeModal.missing.length} selected</p>
                    <div className="flex gap-3">
                      <button onClick={() => setMergeModal(prev => ({ ...prev, missing: prev.missing.map(m => ({ ...m, checked: true })) }))} className="text-xs text-purple-600 hover:underline">All</button>
                      <button onClick={() => setMergeModal(prev => ({ ...prev, missing: prev.missing.map(m => ({ ...m, checked: false })) }))} className="text-xs text-gray-400 hover:underline">None</button>
                    </div>
                  </div>
                  {mergeModal.missing.map((item, idx) => (
                    <label key={idx} className="flex gap-3 items-start cursor-pointer">
                      <input type="checkbox" checked={item.checked} onChange={() => setMergeModal(prev => ({ ...prev, missing: prev.missing.map((m, i) => i === idx ? { ...m, checked: !m.checked } : m) }))} className="mt-0.5 shrink-0 accent-purple-600" />
                      <span className="text-sm text-gray-700 leading-snug">{item.txt}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {mergeModal.missing.length > 0 && (
              <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
                <button onClick={() => setMergeModal(null)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                <button disabled={!mergeModal.missing.some(m => m.checked)}
                  onClick={() => {
                    const norm = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
                    const selected = new Set(mergeModal.missing.filter(m => m.checked).map(m => norm(m.txt)))
                    const tb = mergeModal.template.bullets
                    const result = [...scopeLines]
                    for (let ti = 0; ti < tb.length; ti++) {
                      if (!selected.has(norm(tb[ti]))) continue
                      const norms = () => result.map(l => norm(l.text))
                      let insertAfter = -1
                      for (let prev = ti - 1; prev >= 0; prev--) { const pn = norm(tb[prev]); const idx = norms().findIndex(cn => cn.includes(pn) || pn.includes(cn)); if (idx !== -1) { insertAfter = idx; break } }
                      const newLine = { id: Date.now() + ti + 2000, name: '', price: 0, text: tb[ti] }
                      if (insertAfter !== -1) result.splice(insertAfter + 1, 0, newLine)
                      else {
                        let insertBefore = -1
                        for (let next = ti + 1; next < tb.length; next++) { const nn = norm(tb[next]); const idx = norms().findIndex(cn => cn.includes(nn) || nn.includes(cn)); if (idx !== -1) { insertBefore = idx; break } }
                        if (insertBefore !== -1) result.splice(insertBefore, 0, newLine); else result.push(newLine)
                      }
                    }
                    setScopeLines(result); setMergeModal(null)
                  }}
                  className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-40">
                  Add {mergeModal.missing.filter(m => m.checked).length} bullet{mergeModal.missing.filter(m => m.checked).length !== 1 ? 's' : ''}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showSaveScopeTemplate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 no-print" onClick={() => setShowSaveScopeTemplate(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-gray-900 mb-4">Save Scope Template</p>
            <label className="block text-xs font-medium text-gray-600 mb-1">Template name</label>
            <input autoFocus value={scopeTemplateName} onChange={e => setScopeTemplateName(e.target.value)} placeholder="e.g. Standard Screen Porch" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2" />
            <p className="text-xs text-gray-400 mb-5">{scopeLines.length} bullet{scopeLines.length !== 1 ? 's' : ''} will be saved.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowSaveScopeTemplate(false)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button disabled={!scopeTemplateName.trim()} onClick={() => { saveScopeTemplate({ name: scopeTemplateName.trim(), projectType: '', bullets: scopeLines.map(l => l.text) }); setScopeTemplateName(''); setShowSaveScopeTemplate(false) }}
                className="flex-1 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-40">Save template</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send for signature ──────────────────────────────────────── */}
      {showSignModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 no-print">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Send for Signature</h2>
              <button onClick={() => { setShowSignModal(false); setSigningLinks(null); setSignResult(null); setSignError('') }} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="flex border-b border-gray-100">
              {[['link', '🔗 Signing Link'], ['drive', '☁️ Google Drive']].map(([tab, label]) => (
                <button key={tab} onClick={() => { setSignTab(tab); setSignError('') }} className={`flex-1 py-3 text-sm font-medium ${signTab === tab ? 'border-b-2 border-gray-900 text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>{label}</button>
              ))}
            </div>
            <div className="px-6 py-5 space-y-4">
              {signTab === 'link' ? (
                signingLinks ? (
                  <>
                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-4 py-3 rounded-xl text-sm font-medium">✓ 2 unique signing links generated</div>
                    <p className="text-sm text-gray-500">Send each link to the right party — they can only sign their own fields.</p>
                    {roleRows.map(({ role, label, color }) => (
                      <div key={role} className={`border rounded-xl p-3 ${color}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-gray-600">{label}</span>
                          <button onClick={() => { navigator.clipboard.writeText(signingLinks[role]); setCopiedRole(role); setTimeout(() => setCopiedRole(''), 2000) }} className="px-2.5 py-1 bg-gray-900 text-white rounded-md text-[11px] font-semibold hover:bg-gray-700">{copiedRole === role ? 'Copied!' : 'Copy Link'}</button>
                        </div>
                        <div className="text-[11px] text-gray-600 break-all bg-white/50 rounded px-2 py-1 select-all">{signingLinks[role]}</div>
                      </div>
                    ))}
                    <button onClick={() => setSigningLinks(null)} className="text-xs text-gray-400 underline">Generate new set of links</button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">Generate two separate signing links — one for the Client and one for Deck Plus. Each link only lets that party sign and initial their own fields.</p>
                    <p className="text-xs text-gray-400">IP address + timestamp recorded for the audit trail.</p>
                    {signError && <p className="text-sm text-red-600">{signError}</p>}
                    <button onClick={handleGetSigningLink} disabled={linkLoading} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 disabled:opacity-50">
                      {linkLoading ? <><Loader2 size={15} className="animate-spin" /> Creating links…</> : 'Generate Signing Links'}
                    </button>
                  </>
                )
              ) : !googleAuthed ? (
                <>
                  <p className="text-sm text-gray-600">Connect your Google account to upload contracts directly to Drive.</p>
                  {signError && <p className="text-sm text-red-600">{signError}</p>}
                  <button onClick={handleConnectGoogle} className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">Connect Google Drive</button>
                </>
              ) : signResult ? (
                <>
                  <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-4 py-3 rounded-xl text-sm font-medium">✓ Contract uploaded to Google Drive</div>
                  <a href={signResult.driveLink} target="_blank" rel="noopener noreferrer" className="w-full flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">Open in Google Drive →</a>
                  <p className="text-xs text-gray-400 text-center">{signResult.fileName}</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600">Generate a PDF of the packet and upload it to your Drive.</p>
                  {signError && <p className="text-sm text-red-600">{signError}</p>}
                  <button onClick={handleUploadToDrive} disabled={signing} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                    {signing ? <><Loader2 size={15} className="animate-spin" /> Generating PDF…</> : 'Upload to Google Drive'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
