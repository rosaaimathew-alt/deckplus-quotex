import { useRef, useState } from 'react'
import { PenLine, Mail, CheckCircle } from 'lucide-react'
import { useStore } from '../store'
import SignaturePad from './SignaturePad'
import { WELCOME_EMAIL_DEFAULT, WELCOME_PLACEHOLDERS } from '../lib/welcomeEmail'

// ── Settings › Contracts (office / admin) ────────────────────────────────────
// Company signature on file: adopted once by someone authorized to sign for
// the company, then placed in every Deck Plus signature field when a contract
// is sent (the server applies it and logs it in the audit trail).
// Welcome email: sent to the customer from the company mailbox once every
// party has signed.

export function CompanySignatureCard() {
  const me = useStore(s => s.me)
  const sig = useStore(s => s.companySignature)
  const setSig = useStore(s => s.setCompanySignature)
  const padRef = useRef(null)
  const [editing, setEditing] = useState(!sig?.signatureDataUrl)
  const [name, setName] = useState(sig?.printedName || '')
  const [title, setTitle] = useState(sig?.title || 'Owner')
  const [agree, setAgree] = useState(false)
  const [err, setErr] = useState('')

  const adopt = () => {
    setErr('')
    if (!name.trim()) { setErr('Enter the full name of the person signing for the company.'); return }
    if (padRef.current?.isEmpty()) { setErr('Draw or type the signature first.'); return }
    if (!agree) { setErr('Tick the box to confirm you are authorized to sign for the company.'); return }
    setSig({
      enabled: true, signatureDataUrl: padRef.current.toDataURL(), printedName: name.trim(), title: title.trim(),
      adoptedBy: me?.email || '', adoptedAt: new Date().toISOString(),
    })
    setEditing(false); setAgree(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <PenLine size={16} className="text-gray-400" />
        <h3 className="font-semibold text-gray-800 text-sm">Company Signature</h3>
      </div>
      <p className="text-xs text-gray-400 mb-4">Sign once for the company. Every contract you send then goes out already signed by Deck Plus — the customer signs their part and it's done. Each use is recorded in the contract's audit trail.</p>

      {sig?.signatureDataUrl && !editing ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-gray-200 px-4 py-3 flex items-center gap-4">
            <img src={sig.signatureDataUrl} alt="Company signature" className="h-12 object-contain" />
            <div className="min-w-0 text-xs text-gray-600">
              <p className="font-semibold text-gray-800">{sig.printedName}{sig.title ? `, ${sig.title}` : ''}</p>
              <p>Adopted {sig.adoptedAt ? new Date(sig.adoptedAt).toLocaleDateString() : ''}{sig.adoptedBy ? ` by ${sig.adoptedBy}` : ''}</p>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input type="checkbox" className="mt-1" checked={!!sig.enabled} onChange={e => setSig({ ...sig, enabled: e.target.checked })} />
            <span><b>Sign contracts automatically when they're sent.</b> <span className="text-gray-500">Turn off to have someone sign each contract by hand from its Deck Plus signing link.</span></span>
          </label>
          <div className="flex gap-2">
            <button onClick={() => { setEditing(true); setName(sig.printedName || ''); setTitle(sig.title || '') }} className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50">Change signature</button>
            <button onClick={() => { if (window.confirm('Remove the company signature? Contracts will need to be signed by hand again.')) { setSig(null); setEditing(true) } }} className="text-xs px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50">Remove</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block"><span className="text-xs font-medium text-gray-500 block mb-1">Full name</span>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Matt Smith" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" /></label>
            <label className="block"><span className="text-xs font-medium text-gray-500 block mb-1">Title</span>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Owner" className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" /></label>
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500 block mb-1">Signature</span>
            <SignaturePad ref={padRef} className="border border-gray-300 rounded-lg" />
          </div>
          <label className="flex items-start gap-2 text-xs text-gray-600">
            <input type="checkbox" className="mt-0.5" checked={agree} onChange={e => setAgree(e.target.checked)} />
            <span>I am authorized to sign contracts for the company, and I adopt this as the company's signature on every contract sent from Deck Plus while automatic signing is on.</span>
          </label>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex gap-2">
            <button onClick={adopt} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700"><CheckCircle size={14} /> Adopt signature</button>
            {sig?.signatureDataUrl && <button onClick={() => setEditing(false)} className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100">Cancel</button>}
          </div>
        </div>
      )}
    </div>
  )
}

export function WelcomeEmailCard() {
  const saved = useStore(s => s.welcomeEmail)
  const setSaved = useStore(s => s.setWelcomeEmail)
  const cur = { ...WELCOME_EMAIL_DEFAULT, ...(saved || {}) }
  const [subject, setSubject] = useState(cur.subject)
  const [body, setBody] = useState(cur.body)
  const [note, setNote] = useState('')
  const dirty = subject !== cur.subject || body !== cur.body

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-1">
        <Mail size={16} className="text-gray-400" />
        <h3 className="font-semibold text-gray-800 text-sm">Welcome Email</h3>
      </div>
      <p className="text-xs text-gray-400 mb-4">Sent to the customer automatically the moment their contract is fully signed, from the mailbox marked “use for company emails” under Email Account.</p>
      <label className="flex items-start gap-2 text-sm text-gray-700 mb-3">
        <input type="checkbox" className="mt-1" checked={!!cur.enabled} onChange={e => setSaved({ ...cur, subject, body, enabled: e.target.checked })} />
        <span><b>Send the welcome email when a contract is signed</b></span>
      </label>
      <label className="block mb-2"><span className="text-xs font-medium text-gray-500 block mb-1">Subject</span>
        <input value={subject} onChange={e => setSubject(e.target.value)} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2" /></label>
      <label className="block"><span className="text-xs font-medium text-gray-500 block mb-1">Message</span>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={12} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 leading-relaxed" /></label>
      <p className="text-[11px] text-gray-400 mt-1">Fill-ins: {WELCOME_PLACEHOLDERS.join(' ')}</p>
      <div className="flex items-center gap-2 mt-3">
        <button disabled={!dirty} onClick={() => { setSaved({ ...cur, subject, body }); setNote('Saved.') }} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-40">Save</button>
        <button onClick={() => { setSubject(WELCOME_EMAIL_DEFAULT.subject); setBody(WELCOME_EMAIL_DEFAULT.body); setNote('') }} className="px-3 py-2 rounded-lg text-xs text-gray-500 hover:bg-gray-100">Reset to the default wording</button>
        {note && !dirty && <span className="text-xs text-green-700">{note}</span>}
      </div>
    </div>
  )
}
