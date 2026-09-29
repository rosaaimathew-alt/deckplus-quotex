import { useState, useRef, lazy, Suspense } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { getAnalyzeModel } from '../gemini'
import { Upload, FileText, Image, File, Trash2, CheckCircle, AlertCircle, Save, RefreshCw } from 'lucide-react'
import { useStore } from '../store'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

const ANALYZE_SYSTEM_PROMPT = `You are a construction estimating assistant. Extract ONLY priced line items from the estimate.

A priced line item MUST have an explicit dollar amount like $500, $1,200, or 2500.00.

NEVER include any of the following — these are NOT line items:
- Phone numbers (e.g. 555-123-4567)
- Email addresses or websites
- Company names or contractor names
- Addresses or locations
- Dates or permit numbers
- Section headings with no price
- Sub-items that are described under a priced parent item

EXAMPLE — given this section of an estimate:
  Gable Roof Open Porch .............. $12,500
    - Deck framing & ledger board
    - (4) 6x6 columns
    - Ceiling with 2x6 tongue & groove
    - Rafters, LVL ridge beam, headers
    - Sheathing, felt, architectural shingles, drip edge
    - All materials and labor

Correct output (ONE item, all sub-items folded into description):
[{
  "name": "Gable Roof Open Porch",
  "section": "Gable Roof",
  "description": "Deck framing and ledger board, (4) 6x6 columns, tongue and groove ceiling, rafters, LVL ridge beam and headers, sheathing, felt, architectural shingles, and drip edge — all materials and labor included.",
  "qty": 1, "unit": "LS", "unitPrice": 12500, "category": "Roofing", "confidence": 95
}]

Return ONLY a valid JSON array with no markdown or explanation.

RULES:
1. ONLY include an item if it has an explicit dollar price. If no dollar amount → skip it entirely.
2. GROUP sub-items — fold all unlisted materials, labor, and scope details listed beneath a priced parent into that parent's description. List every included component explicitly by name.
3. ONE ITEM PER PRICED SCOPE — if a section has one total price, create one line item and pack ALL the work and materials into the description.
4. DESCRIPTION — REQUIRED, never leave empty. Write one or two sentences:
   - If sub-items are listed below the priced line: name every one of them explicitly.
   - If no sub-items are shown: write a professional scope description based on what that type of work typically includes (materials, labor, fasteners, prep, cleanup, etc.).
   Example for "8x16 Trex Enhance Open Deck Material and labor": "Supply and install 8x16 Trex Enhance composite deck boards on pressure-treated framing with hidden fasteners, stair stringers, post footings, rim joist, and all associated hardware and labor."
   No bullets. Max 500 chars.
5. SECTION — copy the exact heading from the estimate that this item falls under.
6. PRICING — use the price as written. If a total is given with qty > 1, compute unitPrice = total / qty. Never set unitPrice to 0.
7. CATEGORY — pick the best match: Fencing, Gates, Demo, Materials, Labor, Framing, Concrete, Electrical, Plumbing, Roofing, Flooring, Drywall, Painting, HVAC, Windows, Doors, Tile, Insulation, Siding, General`

const ANALYZE_CATEGORIES = ['Fencing','Gates','Demo','Materials','Labor','Framing','Concrete','Electrical','Plumbing','Roofing','Flooring','Drywall','Painting','HVAC','Windows','Doors','Tile','Insulation','Siding','General']
const ANALYZE_UNITS = ['LF','SF','EA','LS']

async function runGeminiAnalysis(prompt) {
  const model = getAnalyzeModel(ANALYZE_SYSTEM_PROMPT)
  const result = await model.generateContent(prompt)
  const raw = result.response.text()
  const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  let jsonStr = clean
  if (!jsonStr.endsWith(']')) {
    const lastClose = jsonStr.lastIndexOf('}')
    jsonStr = lastClose > 0 ? jsonStr.slice(0, lastClose + 1) + ']' : '[]'
  }
  let items = JSON.parse(jsonStr)
  return items
    .filter(i => i.name && i.unitPrice > 0)
    .map(i => ({
      name: String(i.name).slice(0, 80),
      section: String(i.section || i.category || 'General').slice(0, 80),
      description: String(i.description || `Supply and install ${i.name} — all materials and labor included.`).slice(0, 600),
      qty: Math.max(0, parseFloat(i.qty) || 1),
      unit: ANALYZE_UNITS.includes(i.unit) ? i.unit : 'EA',
      unitPrice: Math.round(parseFloat(i.unitPrice) * 100) / 100,
      category: ANALYZE_CATEGORIES.includes(i.category) ? i.category : 'General',
      confidence: Math.min(100, Math.max(0, parseInt(i.confidence) || 70)),
      source: 'ai',
    }))
}

// xlsx is heavy — only load it when the Import tab is actually visited
const ImportTab = lazy(() => import('./ImportPricing'))

const CATEGORIES = [
  'Fencing','Gates','Demo','Materials','Labor','Framing','Concrete','Electrical',
  'Plumbing','Roofing','Flooring','Drywall','Painting','HVAC','Windows','Doors',
  'Tile','Insulation','Siding','General',
]

function parseEstimateText(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean)
  const items = []
  const unitMap = {
    'lf': 'LF', 'linear ft': 'LF', 'linear foot': 'LF', 'linear feet': 'LF',
    'sf': 'SF', 'sq ft': 'SF', 'square ft': 'SF', 'square feet': 'SF',
    'ea': 'EA', 'each': 'EA', 'unit': 'EA', 'pc': 'EA', 'piece': 'EA',
    'ls': 'LS', 'lump sum': 'LS', 'lot': 'LS',
  }
  const pricePattern = /\$([\d,]+(?:\.\d{1,2})?)/g
  const qtyPattern = /(\d+(?:\.\d+)?)\s*(?:x\s*)?(lf|linear\s*f(?:t|oot|eet)|sf|sq\.?\s*ft|square\s*f(?:t|eet)|ea(?:ch)?|unit|pc|piece|hr|hour|ls|lump\s*sum|load|ton|day)/i

  for (const line of lines) {
    const prices = [...line.matchAll(pricePattern)].map(m => parseFloat(m[1].replace(/,/g, '')))
    if (!prices.length) continue
    const qtyMatch = line.match(qtyPattern)
    const qty = qtyMatch ? parseFloat(qtyMatch[1]) : 1
    const rawUnit = qtyMatch ? qtyMatch[2].toLowerCase().replace(/\s+/g, ' ') : 'ea'
    const unit = Object.entries(unitMap).find(([k]) => rawUnit.startsWith(k))?.[1] || 'EA'
    const totalPrice = prices[prices.length - 1]
    const unitPrice = qty > 1 ? Math.round(totalPrice / qty) : totalPrice
    if (unitPrice < 1) continue
    let name = line
      .replace(/\$[\d,]+(?:\.\d+)?/g, '')
      .replace(qtyMatch?.[0] || '', '')
      .replace(/[\d,]+(?:\.\d+)?\s*(?:lf|sf|ea|each|unit|hr|ls|load|ton|day)/gi, '')
      .replace(/\s{2,}/g, ' ').trim()
      .replace(/^[-:,.\s]+|[-:,.\s]+$/g, '')
    if (!name || name.length < 3) continue
    const cat = CATEGORIES.find(c => name.toLowerCase().includes(c.toLowerCase())) || 'General'
    items.push({ id: Date.now() + Math.random(), name, qty, unit, unitPrice, category: cat, confidence: qtyMatch ? 80 : 60, source: 'text-parse' })
  }
  return items
}

// ── Analyze Estimate Tab ──────────────────────────────────────────────────────
function AnalyzeTab() {
  const [text, setText]         = useState('')
  const [file, setFile]         = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [results, setResults]   = useState([])
  const [profitable, setProfitable] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [saved, setSaved]       = useState(false)
  const [error, setError]       = useState('')
  const fileRef = useRef()
  const addCatalogItems = useStore(s => s.addCatalogItems)

  const handleFile = async (e) => {
    const f = e.target.files[0]
    if (!f) return
    setFile(f); setError(''); setSaved(false); setResults([])
    const ext = f.name.split('.').pop().toLowerCase()
    if (ext === 'txt' || ext === 'csv') { const t = await f.text(); setText(t) }
    else setText('')
  }

  const fileToBase64 = (f) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(f)
  })

  const extractPdfText = async (f) => {
    try {
      const buf = await f.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise
      let text = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        text += content.items.map(it => it.str).join(' ') + '\n'
      }
      return text
    } catch {
      throw new Error('Could not read this PDF (it may be a scan). Try a JPG or PNG screenshot instead.')
    }
  }

  const handleAnalyze = async () => {
    setAnalyzing(true); setError(''); setResults([]); setSaved(false)
    try {
      let items = []
      if (file) {
        const ext = file.name.split('.').pop().toLowerCase()
        if (ext === 'pdf') {
          // Extract text from PDF in browser, then send to AI as text
          const pdfText = await extractPdfText(file)
          if (!pdfText) throw new Error('Could not extract text from PDF. Try a PNG or JPG screenshot of the estimate instead.')
          items = await runGeminiAnalysis(`Extract line items from this estimate:\n\n${pdfText}`).catch(() => parseEstimateText(pdfText))
        } else if (['jpg','jpeg','png','gif','webp'].includes(ext)) {
          const base64 = await fileToBase64(file)
          const mimeType = file.type || 'image/jpeg'
          items = await runGeminiAnalysis([
            { inlineData: { data: base64, mimeType } },
            'Extract all line items from this estimate.',
          ])
        } else if (['txt','csv'].includes(ext)) {
          items = text.trim()
            ? await runGeminiAnalysis(`Extract line items from this estimate:\n\n${text}`).catch(() => parseEstimateText(text))
            : parseEstimateText(text)
        }
      } else if (text.trim()) {
        items = await runGeminiAnalysis(`Extract line items from this estimate:\n\n${text}`).catch(() => parseEstimateText(text))
      }
      if (!items.length) { setError('No line items found. Try pasting text with quantities and prices.') }
      else { const withIds = items.map((item, i) => ({ ...item, id: Date.now() + i })); setResults(withIds); setSelected(new Set(withIds.map(i => i.id))) }
    } catch (err) { setError(err.message) }
    finally { setAnalyzing(false) }
  }

  const toggleSelect = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const updateResult = (id, field, val) => setResults(prev => prev.map(r => r.id === id ? { ...r, [field]: field === 'unitPrice' || field === 'qty' ? parseFloat(val) || 0 : val } : r))
  const saveSelected = () => { addCatalogItems(results.filter(r => selected.has(r.id)).map(r => ({ ...r, profitable }))); setSaved(true) }
  const clear = () => { setText(''); setFile(null); setResults([]); setSelected(new Set()); setSaved(false); setError(''); if (fileRef.current) fileRef.current.value = '' }

  const fileExt = file ? file.name.split('.').pop().toLowerCase() : ''
  const isImageOrPdf = ['jpg','jpeg','png','gif','webp','pdf'].includes(fileExt)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex gap-4 flex-wrap mb-4">
          {/* File upload */}
          <label
            className="flex-1 min-w-48 border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile({ target: { files: [f] } }) }}
          >
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv" className="hidden" onChange={handleFile} />
            {file ? (
              <div className="text-center">
                {isImageOrPdf && ['jpg','jpeg','png','gif','webp'].includes(fileExt)
                  ? <Image size={28} className="mx-auto text-[var(--brand-500)] mb-2" />
                  : fileExt === 'pdf' ? <File size={28} className="mx-auto text-[var(--brand-400)] mb-2" />
                  : <FileText size={28} className="mx-auto text-[var(--brand-600)] mb-2" />}
                <p className="text-sm font-medium text-gray-700">{file.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
            ) : (
              <><Upload size={28} className="text-gray-400 mb-2" /><p className="text-sm text-gray-600 font-medium">Drop file or click to upload</p><p className="text-xs text-gray-400 mt-1">PDF · JPG · PNG · TXT · CSV</p></>
            )}
          </label>
          {/* Paste text */}
          <div className="flex-1 min-w-48 flex flex-col">
            <label className="text-xs font-medium text-gray-500 mb-1.5">Or paste estimate text</label>
            <textarea
              className="flex-1 border border-gray-200 rounded-lg p-3 text-sm text-gray-800 resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 min-h-32"
              placeholder={'Example:\nRemove 140 LF chain link fence\nInstall 6ft cedar privacy fence 140 LF  $38/lf\n(2) single walk gates  $320 ea'}
              value={text}
              onChange={e => { setText(e.target.value); setFile(null); setSaved(false); setResults([]) }}
            />
          </div>
        </div>
        {/* Profitable toggle */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm text-gray-600">Was this a profitable job?</span>
          <button onClick={() => setProfitable(p => !p)} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${profitable ? 'bg-green-500' : 'bg-gray-300'}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${profitable ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className={`text-xs font-medium ${profitable ? 'text-green-600' : 'text-gray-400'}`}>{profitable ? 'Yes — weighted 1.3×' : 'No'}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={handleAnalyze} disabled={analyzing || (!text.trim() && !file)} className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            {analyzing ? 'Analyzing…' : 'Analyze Estimate'}
          </button>
          {(text || file || results.length > 0) && (
            <button onClick={clear} className="px-4 py-2 text-gray-500 rounded-lg text-sm hover:bg-gray-100 flex items-center gap-1.5"><Trash2 size={14} /> Clear</button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /><div className="whitespace-pre-line">{error}</div>
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800">{results.length} Line Item{results.length !== 1 ? 's' : ''} Found</h3>
            <div className="flex gap-2">
              <button onClick={() => setSelected(new Set(results.map(r => r.id)))} className="text-xs text-blue-600 hover:underline">Select all</button>
              <span className="text-gray-300">|</span>
              <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:underline">None</button>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {results.map(item => (
              <div key={item.id} className={`px-5 py-3 flex items-start gap-3 ${selected.has(item.id) ? 'bg-blue-50' : ''}`}>
                <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} className="w-4 h-4 accent-blue-600 mt-1" />
                <div className="flex-1 flex flex-col gap-1.5">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <input className="col-span-5 text-sm font-medium text-gray-800 border border-transparent border-b-gray-200 rounded px-1 py-0.5 hover:border-b-gray-400 focus:border-b-[var(--brand-500)] focus:outline-none bg-transparent" value={item.name} onChange={e => updateResult(item.id, 'name', e.target.value)} />
                    <input className="col-span-1 text-sm text-center border border-transparent border-b-gray-200 rounded px-1 py-0.5 hover:border-b-gray-400 focus:border-b-[var(--brand-500)] focus:outline-none bg-transparent" value={item.qty} onChange={e => updateResult(item.id, 'qty', e.target.value)} type="number" min="0" />
                    <select className="col-span-1 text-xs border border-transparent border-b-gray-200 rounded px-1 py-0.5 hover:border-b-gray-400 focus:border-b-[var(--brand-500)] focus:outline-none bg-transparent" value={item.unit} onChange={e => updateResult(item.id, 'unit', e.target.value)}>
                      {['LF','SF','EA','LS'].map(u => <option key={u}>{u}</option>)}
                    </select>
                    <div className="col-span-2 flex items-center gap-0.5">
                      <span className="text-gray-400 text-sm">$</span>
                      <input className="w-full text-sm font-medium border border-transparent border-b-gray-200 rounded px-1 py-0.5 hover:border-b-gray-400 focus:border-b-[var(--brand-500)] focus:outline-none bg-transparent" value={item.unitPrice} onChange={e => updateResult(item.id, 'unitPrice', e.target.value)} type="number" min="0" />
                    </div>
                    <select className="col-span-2 text-xs border border-transparent border-b-gray-200 rounded px-1 py-0.5 hover:border-b-gray-400 focus:border-b-[var(--brand-500)] focus:outline-none bg-transparent" value={item.category} onChange={e => updateResult(item.id, 'category', e.target.value)}>
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <div className="col-span-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${item.confidence >= 85 ? 'bg-green-100 text-green-700' : item.confidence >= 70 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-500'}`}>{item.confidence}%</span>
                    </div>
                  </div>
                  <input className="w-full text-xs text-gray-500 border border-transparent border-b-gray-200 rounded px-1 py-0.5 hover:border-b-gray-400 focus:border-b-[var(--brand-500)] focus:outline-none bg-transparent italic" placeholder="Scope description (printed on proposal)..." value={item.description || ''} onChange={e => updateResult(item.id, 'description', e.target.value)} />
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
            <span className="text-sm text-gray-500">{selected.size} of {results.length} selected</span>
            {saved
              ? <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium"><CheckCircle size={16} /> {selected.size} item{selected.size !== 1 ? 's' : ''} saved to catalog</span>
              : <button onClick={saveSelected} disabled={!selected.size} className="flex items-center gap-1.5 px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 shadow-sm"><Save size={14} /> Save {selected.size} item{selected.size !== 1 ? 's' : ''} to catalog</button>
            }
          </div>
        </div>
      )}

      {!results.length && !analyzing && !error && (
        <div className="text-center py-10 text-gray-400">
          <FileText size={36} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Upload a PDF, photo, or paste your estimate text above, then click <strong>Analyze Estimate</strong>.</p>
          <p className="text-xs mt-2 text-gray-300">Supported: PDF · JPEG · PNG · TXT · CSV</p>
        </div>
      )}
    </div>
  )
}

// ── Combined Page ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'analyze', label: 'Analyze Estimate', description: 'AI extracts line items from a PDF, photo, or pasted text' },
  { id: 'import',  label: 'Import Spreadsheet', description: 'Map columns from an Excel or CSV pricing sheet' },
]

export default function Analyze() {
  const [tab, setTab] = useState('analyze')

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-900">Analyze</h2>
        <p className="text-sm text-gray-500 mt-0.5">Extract pricing from estimates and spreadsheets, then save directly to your catalog.</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Description */}
      <p className="text-xs text-gray-400 mb-4 -mt-3">
        {TABS.find(t => t.id === tab)?.description}
      </p>

      {/* Tab content */}
      {tab === 'analyze' && <AnalyzeTab />}
      {tab === 'import' && (
        <Suspense fallback={
          <div className="flex items-center justify-center py-16 text-gray-400">
            <RefreshCw size={20} className="animate-spin mr-2" /> Loading…
          </div>
        }>
          <ImportTab />
        </Suspense>
      )}
    </div>
  )
}
