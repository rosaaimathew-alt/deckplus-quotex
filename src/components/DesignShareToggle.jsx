import { useEffect, useState } from 'react'
import { designShareState, setDesignShare } from '../lib/designSnapshot'

// "Include design" switch shown next to the proposal's link buttons, only when the proposal
// has a saved design. It is the same setting as "Show on proposal" in the design editor.
export default function DesignShareToggle({ proposalId, onChange, className = '' }) {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    let live = true
    designShareState(proposalId).then(s => { if (live) setState(s) })
    return () => { live = false }
  }, [proposalId])
  if (!state?.exists) return null
  const toggle = async (e) => {
    const on = e.target.checked
    setBusy(true); setErr('')
    try { await setDesignShare(proposalId, on); setState({ ...state, share: on }); onChange?.(on) }
    catch (x) { setErr(x.message || 'Could not save') }
    setBusy(false)
  }
  return (
    <label className={`inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer select-none ${state.share ? 'text-gray-700' : 'text-gray-500'} ${className}`}
      title="Show the 3D design and floor plan on the customer's proposal link. Click Get link again after changing it.">
      <input type="checkbox" checked={state.share} disabled={busy} onChange={toggle} className="w-3.5 h-3.5" />
      Include design{busy ? '…' : ''}{err ? <span className="text-red-600 ml-1">{err}</span> : null}
    </label>
  )
}
