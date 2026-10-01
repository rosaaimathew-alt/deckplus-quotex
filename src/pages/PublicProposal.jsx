import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

// Public, read-only proposal a customer opens from the email link. Fetching it
// records the open server-side (that's the tracking) and returns a display-only
// snapshot — no pricing internals, costs, or app data. Mirrors the app's own
// proposal layout: Scope of Work with descriptions, and à-la-carte vs. summed
// pricing (à la carte shows each option priced individually with NO grand total).
const fmt = n => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function PublicProposal() {
  const { token } = useParams()
  const [state, setState] = useState({ loading: true, error: '', snapshot: null })

  useEffect(() => {
    let alive = true
    fetch(`/api/sign/popen-${token}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(d.error || 'This proposal link is no longer available.')
        return d
      })
      .then(d => { if (alive) setState({ loading: false, error: '', snapshot: d.snapshot || null }) })
      .catch(err => { if (alive) setState({ loading: false, error: err.message, snapshot: null }) })
    return () => { alive = false }
  }, [token])

  const { loading, error, snapshot } = state

  if (loading) {
    return <div style={wrap}><p style={{ color: '#64748b', fontSize: 14 }}>Loading your proposal…</p></div>
  }
  if (error || !snapshot) {
    return (
      <div style={wrap}>
        <div style={card}>
          <p style={{ fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>Proposal unavailable</p>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>{error || 'This link is no longer available. Please contact us for an updated copy.'}</p>
        </div>
      </div>
    )
  }

  const s = snapshot
  const accent = s.primaryColor || '#1191ad'
  const lines = s.lines || []
  const subtotal = typeof s.subtotal === 'number'
    ? s.subtotal
    : lines.reduce((a, l) => a + (Number(l.qty) || 1) * (Number(l.unitPrice) || 0), 0)
  const showItemized = s.showBreakdown || s.isAlaCarte
  const fmtDate = (v, dateOnly) => {
    if (!v) return null
    const d = dateOnly ? new Date(v + 'T00:00:00') : new Date(v)
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  }
  const estimateDate = fmtDate(s.estimateDate, false)
  const expiry = fmtDate(s.expiration, true)
  // Never show the app's placeholder name — brand with the logo only.
  const companyLabel = s.companyName && s.companyName.trim().toUpperCase() !== 'QUOTEX' ? s.companyName.trim() : ''

  return (
    <div style={wrap}>
      {/* Deck Plus look: white bar up top with the logo, then the rest of the
          page in Deck Plus blue with white lettering. */}
      <div style={{ ...card, background: accent, color: '#fff' }}>
        <div style={{ background: '#fff', padding: '28px 32px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: accent, letterSpacing: '-0.02em' }}>PROPOSAL</h1>
            {estimateDate && <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748b' }}>{estimateDate}</p>}
            {expiry && <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600, color: '#334155' }}>Valid Until: {expiry}</p>}
            {s.contractNum ? <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>{s.contractNum}</p> : null}
          </div>
          {s.logo
            ? <img src={s.logo} alt="logo" style={{ height: 56, objectFit: 'contain', marginLeft: 'auto' }} />
            : (companyLabel ? <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: accent }}>{companyLabel}</p> : null)}
        </div>

        <div style={{ padding: '24px 32px 28px' }}>
          <p style={sectionLabel}>Prepared For</p>
          {s.client && <p style={{ margin: '0 0 2px', fontSize: 16, color: '#fff', fontWeight: 600 }}>{s.client}</p>}
          {s.address ? <p style={{ margin: 0, fontSize: 13, color: SOFT }}>{s.address}</p> : null}
          <div style={{ height: 20 }} />

          {s.projectSummary ? (
            <div style={{ background: TINT, borderRadius: 10, padding: '14px 18px', marginBottom: 24 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#fff', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{s.projectSummary}</p>
            </div>
          ) : null}

          {/* Scope of Work — names + descriptions (no prices in the list) */}
          {lines.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <p style={sectionLabel}>Scope of Work</p>
              {lines.map((l, i) => (
                <div key={i} style={{ borderLeft: `2px solid ${LINE}`, paddingLeft: 12, marginBottom: 10 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#fff' }}>{l.name || '—'}</p>
                  {l.description ? <p style={{ margin: '2px 0 0', fontSize: 13, color: SOFT, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{l.description}</p> : null}
                </div>
              ))}
            </div>
          )}

          {/* Pricing table */}
          <p style={sectionLabel}>{s.isAlaCarte ? 'Options & Pricing' : 'Pricing'}</p>
          {s.isAlaCarte && (
            <p style={{ margin: '0 0 12px', fontSize: 12, fontStyle: 'italic', color: SOFT }}>
              These options are priced individually — check the ones you’d like and reply to let us know.
            </p>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${LINE}` }}>
                <th style={{ ...th, textAlign: 'left' }}>{s.isAlaCarte ? 'Option' : 'Item'}</th>
                <th style={{ ...th, textAlign: 'right', width: 120 }}>Price</th>
                {s.isAlaCarte && <th style={{ ...th, textAlign: 'center', width: 60 }}>Select</th>}
              </tr>
            </thead>
            <tbody>
              {showItemized ? lines.map((l, i) => (
                <tr key={i} style={{ background: i % 2 ? TINT : 'transparent', borderBottom: `1px solid ${FAINT}` }}>
                  <td style={td}>{l.name || '—'}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>${fmt((Number(l.qty) || 1) * (Number(l.unitPrice) || 0))}</td>
                  {s.isAlaCarte && (
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', width: 16, height: 16, border: '1.5px solid rgba(255,255,255,0.85)', borderRadius: 3 }} />
                    </td>
                  )}
                </tr>
              )) : (
                <tr style={{ borderBottom: `1px solid ${FAINT}` }}>
                  <td style={td}>Project Total</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>${fmt(subtotal)}</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Grand total — summed mode only; à la carte has none by design */}
          {!s.isAlaCarte && (
            <div style={{ borderTop: `2px solid ${LINE}`, marginTop: 8, paddingTop: 14, textAlign: 'right' }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: SOFT, marginRight: 16 }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>${fmt(subtotal)}</span>
            </div>
          )}

          {/* Terms & Conditions — mirrors the PDF */}
          <div style={{ background: TINT, borderRadius: 8, padding: '16px 18px', marginTop: 26, fontSize: 12, color: SOFT, lineHeight: 1.7 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#fff' }}>Terms &amp; Conditions</p>
            <p style={{ margin: '0 0 8px' }}>{expiry ? `This proposal is valid until ${expiry}.` : 'This proposal is valid for 30 days from the date above.'}</p>
            <p style={{ margin: '0 0 8px' }}><strong style={{ color: '#fff' }}>Payment:</strong> A 20% deposit is required to schedule work. Progress payments will follow different stages of completion as labeled in a scope of work document drafted once the proposal has been accepted.</p>
            <p style={{ margin: '0 0 8px' }}><strong style={{ color: '#fff' }}>Site Conditions:</strong> Pricing is based on normal site conditions. Any unforeseen conditions may result in additional costs with prior written approval.</p>
            <p style={{ margin: '0 0 8px' }}><strong style={{ color: '#fff' }}>Warranty:</strong> All projects include a standard 1-year warranty on materials and a 5-year structural warranty.</p>
            <p style={{ margin: '0 0 4px', fontWeight: 600, color: '#fff' }}>Addendums</p>
            <p style={{ margin: 0 }}>Any changes resulting in additional charges must be paid at the time of the change. If the inspector requires engineering, it will result in an additional charge.</p>
          </div>

          {/* Signature lines */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 32 }}>
            <div>
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.6)', paddingBottom: 28, marginBottom: 6 }} />
              <p style={{ margin: 0, fontSize: 11, color: SOFT }}>Client Signature &amp; Date</p>
            </div>
            <div>
              <div style={{ borderBottom: '1px solid rgba(255,255,255,0.6)', paddingBottom: 28, marginBottom: 6 }} />
              <p style={{ margin: 0, fontSize: 11, color: SOFT }}>Contractor Signature &amp; Date</p>
            </div>
          </div>
        </div>

        <div style={{ background: TINT, padding: '14px 32px', borderTop: `1px solid ${FAINT}` }}>
          {companyLabel && <p style={{ margin: '0 0 4px', fontSize: 12, color: SOFT }}>{companyLabel}</p>}
          <p style={{ margin: 0, fontSize: 11, color: SOFT }}>
            This page contains your information and may record when it is viewed. See our{' '}
            <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#fff', textDecoration: 'underline' }}>Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  )
}

// White lettering on the Deck Plus blue body
const SOFT  = 'rgba(255,255,255,0.85)'
const TINT  = 'rgba(255,255,255,0.12)'
const LINE  = 'rgba(255,255,255,0.45)'
const FAINT = 'rgba(255,255,255,0.15)'
const wrap = { minHeight: '100vh', background: '#f1f5f9', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif" }
const card = { width: 640, maxWidth: '100%', background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
const sectionLabel = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 12px', color: 'rgba(255,255,255,0.75)' }
const th = { padding: '8px 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.8)' }
const td = { padding: '10px 4px', fontSize: 13, color: '#fff' }
