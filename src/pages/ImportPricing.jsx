import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { Upload, Table, CheckCircle, AlertCircle, Save, Trash2, RefreshCw, ChevronDown } from 'lucide-react'
import { useStore } from '../store'

const CATEGORIES = [
  'Fencing','Gates','Demo','Materials','Labor','Framing','Concrete','Electrical',
  'Plumbing','Roofing','Flooring','Drywall','Painting','HVAC','Windows','Doors',
  'Tile','Insulation','Siding','General',
]

const UNITS = ['EA', 'LF', 'SF', 'LS']

// Column field definitions — what we want to map from the spreadsheet
const FIELDS = [
  { key: 'name',        label: 'Item Name',   required: true  },
  { key: 'description', label: 'Description', required: false },
  { key: 'qty',         label: 'Quantity',    required: false },
  { key: 'unit',        label: 'Unit',        required: false },
  { key: 'unitPrice',   label: 'Unit Price',  required: true  },
  { key: 'category',    label: 'Category',    required: false },
]

// Patterns to auto-detect column mappings from header names
const AUTO_DETECT = {
  name:        /name|item|material|service|description/i,
  description: /description|desc|notes|detail|scope|spec/i,
  qty:         /^qty$|^q$|quantity|count|amount|^num$/i,
  unit:        /^unit$|uom|u\/m|measure/i,
  unitPrice:   /price|rate|cost|unit\s*price|unit\s*cost|per\s*unit|each/i,
  category:    /category|cat|type|trade|division|class/i,
}

function detectMappings(headers) {
  const mapping = {}
  const used = new Set()

  for (const field of FIELDS) {
    for (const header of headers) {
      if (!used.has(header) && AUTO_DETECT[field.key]?.test(header)) {
        // Don't map description to the same column as name
        if (field.key === 'description' && mapping.name === header) continue
        mapping[field.key] = header
        used.add(header)
        break
      }
    }
  }
  return mapping
}

function coerceRow(row, mapping, headers) {
  const get = (key) => {
    const col = mapping[key]
    if (!col) return undefined
    return row[col] ?? row[headers.indexOf(col)]
  }

  const rawPrice = get('unitPrice')
  const rawQty   = get('qty')
  const rawUnit  = get('unit')
  const rawCat   = get('category')

  const name = String(get('name') ?? '').trim()
  const description = String(get('description') ?? '').trim()

  // Parse price — strip $, commas
  const unitPrice = parseFloat(String(rawPrice ?? '').replace(/[$,\s]/g, '')) || 0
  const qty       = parseFloat(String(rawQty   ?? '').replace(/[,\s]/g, ''))  || 1

  // Normalize unit
  const rawUnitStr = String(rawUnit ?? '').trim().toUpperCase()
  const unit = UNITS.find(u => rawUnitStr === u || rawUnitStr.startsWith(u)) || 'EA'

  // Match category
  const rawCatStr = String(rawCat ?? '').trim()
  const category = CATEGORIES.find(c =>
    c.toLowerCase() === rawCatStr.toLowerCase() ||
    rawCatStr.toLowerCase().includes(c.toLowerCase())
  ) || 'General'

  return { name, description, qty, unit, unitPrice, category }
}

function readSpreadsheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        // header: 1 gives array-of-arrays; we want header row + data
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        // Find first non-empty row as header
        const headerIdx = raw.findIndex(row => row.some(c => String(c).trim() !== ''))
        if (headerIdx === -1) return reject(new Error('Spreadsheet appears to be empty.'))

        const headers = raw[headerIdx].map(h => String(h).trim()).filter(Boolean)
        const dataRows = raw.slice(headerIdx + 1).filter(row =>
          row.some(c => String(c).trim() !== '')
        )

        // Convert to objects keyed by header
        const rows = dataRows.map(row => {
          const obj = {}
          headers.forEach((h, i) => { obj[h] = row[i] ?? '' })
          return obj
        })

        resolve({ headers, rows })
      } catch (err) {
        reject(new Error('Could not parse spreadsheet: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('File read failed.'))
    reader.readAsArrayBuffer(file)
  })
}

export default function ImportPricing() {
  const addCatalogItems = useStore(s => s.addCatalogItems)
  const fileRef = useRef()

  const [file, setFile]       = useState(null)
  const [headers, setHeaders] = useState([])
  const [rows, setRows]       = useState([])
  const [mapping, setMapping] = useState({})
  const [preview, setPreview] = useState([]) // coerced rows
  const [selected, setSelected] = useState(new Set())
  const [profitable, setProfitable] = useState(true)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState('')
  const [loading, setLoading] = useState(false)

  const handleFile = async (f) => {
    if (!f) return
    setFile(f)
    setError('')
    setSaved(false)
    setPreview([])
    setLoading(true)

    try {
      const { headers: h, rows: r } = await readSpreadsheet(f)
      setHeaders(h)
      setRows(r)
      const detected = detectMappings(h)
      setMapping(detected)
      buildPreview(r, detected, h)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const buildPreview = (r, m, h) => {
    const coerced = r
      .map(row => coerceRow(row, m, h))
      .filter(row => row.name && row.unitPrice > 0)
      .map((row, i) => ({ ...row, id: `imp_${i}_${Date.now()}` }))
    setPreview(coerced)
    setSelected(new Set(coerced.map(r => r.id)))
  }

  const applyMapping = (m) => {
    setMapping(m)
    buildPreview(rows, m, headers)
    setSaved(false)
  }

  const updatePreviewRow = (id, field, val) => {
    setPreview(prev => prev.map(r =>
      r.id !== id ? r : {
        ...r,
        [field]: field === 'unitPrice' || field === 'qty' ? parseFloat(val) || 0 : val,
      }
    ))
  }

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSave = () => {
    const toSave = preview
      .filter(r => selected.has(r.id))
      .map(r => ({ ...r, profitable, confidence: 90, source: 'spreadsheet' }))
    addCatalogItems(toSave)
    setSaved(true)
  }

  const clear = () => {
    setFile(null); setHeaders([]); setRows([]); setMapping({})
    setPreview([]); setSelected(new Set()); setSaved(false); setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  const unmappedRequired = FIELDS.filter(f => f.required && !mapping[f.key])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Import Pricing Spreadsheet</h2>
      <p className="text-gray-500 text-sm mb-6">
        Upload an Excel or CSV pricing sheet. We'll detect the columns and import everything straight to your catalog — no AI needed.
      </p>

      {/* Upload */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
        <label
          className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-10 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
        >
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".xlsx,.xls,.csv"
            onChange={e => handleFile(e.target.files[0])}
          />
          {loading ? (
            <RefreshCw size={28} className="text-[var(--brand-500)] animate-spin mb-2" />
          ) : file ? (
            <Table size={28} className="text-[var(--brand-500)] mb-2" />
          ) : (
            <Upload size={28} className="text-gray-400 mb-2" />
          )}
          {file ? (
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{(file.size / 1024).toFixed(0)} KB · {rows.length} rows detected</p>
              <button
                onClick={e => { e.preventDefault(); clear() }}
                className="mt-2 text-xs text-red-400 hover:text-red-600 flex items-center gap-1 mx-auto"
              >
                <Trash2 size={11} /> Remove file
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-600">Drop spreadsheet or click to upload</p>
              <p className="text-xs text-gray-400 mt-1">Excel (.xlsx .xls) · CSV</p>
            </>
          )}
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Column Mapping */}
      {headers.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-800">Column Mapping</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {headers.length} columns found — columns marked <span className="text-red-500">*</span> are required.
              </p>
            </div>
            {unmappedRequired.length > 0 && (
              <span className="text-xs text-red-500 bg-red-50 border border-red-200 px-2 py-1 rounded">
                Map <strong>{unmappedRequired.map(f => f.label).join(', ')}</strong> to continue
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {FIELDS.map(field => (
              <div key={field.key}>
                <label className="text-xs font-medium text-gray-500 block mb-1">
                  {field.label}{field.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <div className="relative">
                  <select
                    className={`w-full border rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-2 focus:ring-blue-300 appearance-none ${
                      field.required && !mapping[field.key]
                        ? 'border-red-300 bg-red-50'
                        : mapping[field.key]
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-200'
                    }`}
                    value={mapping[field.key] || ''}
                    onChange={e => applyMapping({ ...mapping, [field.key]: e.target.value || undefined })}
                  >
                    <option value="">— not mapped —</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            ))}
          </div>

          {/* Raw headers preview */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-400 mb-2">Detected columns in your file:</p>
            <div className="flex flex-wrap gap-1.5">
              {headers.map(h => (
                <span key={h} className={`text-xs px-2 py-0.5 rounded-full border ${
                  Object.values(mapping).includes(h)
                    ? 'bg-blue-50 border-blue-200 text-blue-700'
                    : 'bg-gray-50 border-gray-200 text-gray-500'
                }`}>
                  {h}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Preview table */}
      {preview.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div>
              <h3 className="font-semibold text-gray-800">
                {preview.length} Item{preview.length !== 1 ? 's' : ''} Ready to Import
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {rows.length - preview.length > 0 && `${rows.length - preview.length} rows skipped (missing name or price). `}
                Edit any field before importing.
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <button onClick={() => setSelected(new Set(preview.map(r => r.id)))} className="text-xs text-blue-600 hover:underline">All</button>
              <span className="text-gray-300">|</span>
              <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500 hover:underline">None</button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2 w-8"></th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Item Name</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase w-16">Qty</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase w-16">Unit</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase w-28">Unit Price</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase w-28">Category</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {preview.map(row => (
                  <tr key={row.id} className={`align-top hover:bg-gray-50 ${selected.has(row.id) ? 'bg-blue-50 hover:bg-blue-50' : ''}`}>
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        className="w-4 h-4 accent-blue-600"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-sm font-medium text-gray-800 border border-transparent rounded px-1 py-0.5 hover:border-gray-200 focus:border-blue-300 focus:outline-none bg-transparent"
                        value={row.name}
                        onChange={e => updatePreviewRow(row.id, 'name', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        className="w-full text-xs text-gray-500 italic border border-transparent rounded px-1 py-0.5 hover:border-gray-200 focus:border-blue-300 focus:outline-none bg-transparent"
                        value={row.description}
                        onChange={e => updatePreviewRow(row.id, 'description', e.target.value)}
                        placeholder="—"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="number" min="0"
                        className="w-full text-sm text-center border border-transparent rounded px-1 py-0.5 hover:border-gray-200 focus:border-blue-300 focus:outline-none bg-transparent"
                        value={row.qty}
                        onChange={e => updatePreviewRow(row.id, 'qty', e.target.value)}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select
                        className="text-xs border border-transparent rounded px-1 py-0.5 hover:border-gray-200 focus:border-blue-300 focus:outline-none bg-transparent"
                        value={row.unit}
                        onChange={e => updatePreviewRow(row.id, 'unit', e.target.value)}
                      >
                        {UNITS.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <span className="text-gray-400 text-sm">$</span>
                        <input
                          type="number" min="0"
                          className="w-24 text-sm font-medium text-gray-800 border border-transparent rounded px-1 py-0.5 hover:border-gray-200 focus:border-blue-300 focus:outline-none bg-transparent text-right"
                          value={row.unitPrice}
                          onChange={e => updatePreviewRow(row.id, 'unitPrice', e.target.value)}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        className="text-xs border border-transparent rounded px-1 py-0.5 hover:border-gray-200 focus:border-blue-300 focus:outline-none bg-transparent"
                        value={row.category}
                        onChange={e => updatePreviewRow(row.id, 'category', e.target.value)}
                      >
                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">{selected.size} of {preview.length} selected</span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Profitable job?</span>
                <button
                  onClick={() => setProfitable(p => !p)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${profitable ? 'bg-green-500' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${profitable ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
                </button>
                <span className={`text-xs font-medium ${profitable ? 'text-green-600' : 'text-gray-400'}`}>
                  {profitable ? 'Yes — weighted 1.3×' : 'No'}
                </span>
              </div>
            </div>
            {saved ? (
              <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                <CheckCircle size={16} /> {selected.size} item{selected.size !== 1 ? 's' : ''} saved to catalog
              </span>
            ) : (
              <button
                onClick={handleSave}
                disabled={!selected.size || unmappedRequired.length > 0}
                className="flex items-center gap-1.5 px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              >
                <Save size={14} /> Import {selected.size} item{selected.size !== 1 ? 's' : ''} to catalog
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!file && !error && (
        <div className="text-center py-10 text-gray-400">
          <Table size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">Upload your pricing spreadsheet above.</p>
          <p className="text-xs mt-2 text-gray-300">Columns like "Item", "Price", "Unit" are auto-detected. Everything else can be mapped manually.</p>
        </div>
      )}
    </div>
  )
}
