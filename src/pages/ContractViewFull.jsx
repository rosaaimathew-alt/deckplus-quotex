import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Printer, Loader2, Download, FileText } from 'lucide-react'
import SignedContractDoc from '../components/SignedContractDoc'
import SignedAuditTrail from '../components/SignedAuditTrail'
import { downloadContractPdf, downloadScopePdf, scopeFileName, signedContractFileName } from '../lib/contractPdf'

// ── Signed contract view (/view/:recordId) ───────────────────────────────────
// Renders the packet exactly as it was sent, with every party's signatures and
// initials placed in their fields, then the audit trail on its own page.

export default function ContractViewFull() {
  const { recordId } = useParams()
  const [record, setRecord] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const docRef = useRef(null)

  useEffect(() => {
    fetch(`/api/sign/record-${recordId}`)
      .then(async r => {
        const text = await r.text()
        let parsed
        try { parsed = JSON.parse(text) } catch { throw new Error(text.slice(0, 200)) }
        if (!r.ok || parsed.error) throw new Error(parsed.error || `HTTP ${r.status}`)
        return parsed
      })
      .then(d => { setRecord(d); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [recordId])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex items-center gap-2 text-gray-500"><Loader2 size={18} className="animate-spin" /> Loading signed contract…</div>
    </div>
  )
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md text-center bg-white rounded-2xl border border-red-200 p-6">
        <p className="text-red-600 font-bold mb-2">Error</p>
        <p className="text-sm font-mono text-gray-700">{error}</p>
      </div>
    </div>
  )

  const { contractData: d, contractNum, signatures = {} } = record
  const savePdf = async () => {
    setPdfBusy(true)
    try { await downloadContractPdf(docRef.current, signedContractFileName(record)) }
    catch (err) { alert(`Could not make the PDF: ${err.message}`) }
    finally { setPdfBusy(false) }
  }
  const saveScope = async () => {
    setPdfBusy('scope')
    try { await downloadScopePdf(docRef.current, scopeFileName(contractNum, d?.dp?.values?.clientName || d?.client)) }
    catch (err) { alert(`Could not make the PDF: ${err.message}`) }
    finally { setPdfBusy(false) }
  }
  const branding  = d?.branding || {}
  const logo      = branding?.logo || '/contract/deckplus-logo.png'

  return (
    <div className="qx-ink min-h-screen bg-gray-100 pb-12">
      <div className="bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-20 shadow-sm no-print">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src={logo} alt="logo" className="h-8 object-contain" />
            <span className="text-xs text-gray-500">Contract #{contractNum} — Signed Document</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${record.status === 'signed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {record.status === 'signed' ? 'Fully Signed' : 'Partially Signed'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"><Printer size={14} /> Print</button>
            <button onClick={saveScope} disabled={!!pdfBusy} title="Just the scope of work, without prices — for the HOA" className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-60">
              {pdfBusy === 'scope' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Scope for HOA
            </button>
            <button onClick={savePdf} disabled={!!pdfBusy} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-60">
              {pdfBusy === true ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} {pdfBusy === true ? 'Making PDF…' : 'Download PDF'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto my-4 px-2 sm:px-4">
        <div ref={docRef}>
          <SignedContractDoc record={record} />
          {Object.keys(signatures).length > 0 && <SignedAuditTrail url={`/api/sign/verify-${encodeURIComponent(recordId)}`} />}
        </div>
      </div>
    </div>
  )
}
