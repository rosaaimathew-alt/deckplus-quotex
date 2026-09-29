import { useParams, Link } from 'react-router-dom'
import { useStore } from '../store'
import { LEGAL_DOCS, LEGAL_ORDER, PLACEHOLDER_NOTE } from '../legalContent'

// Public, read-only legal pages. /legal is the hub; /legal/:doc renders one doc.
// Content is placeholder (clearly marked) until final language is provided.
export default function Legal() {
  const { doc } = useParams()
  const branding = useStore(s => s.branding)
  const companyName = branding?.companyName || 'the Company'

  const wrap = { minHeight: '100vh', background: '#f1f5f9', padding: '32px 16px', fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif" }
  const card = { maxWidth: 760, margin: '0 auto', background: '#fff', borderRadius: 12, padding: '32px 36px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }

  if (!doc) {
    return (
      <div style={wrap}>
        <div style={card}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, color: '#0f172a' }}>Legal & Policies</h1>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: '#64748b' }}>{companyName}</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {LEGAL_ORDER.map(slug => (
              <Link key={slug} to={`/legal/${slug}`}
                style={{ display: 'block', padding: '14px 16px', border: '1px solid #e2e8f0', borderRadius: 10, textDecoration: 'none', color: '#0f172a' }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{LEGAL_DOCS[slug].title}</span>
                <span style={{ display: 'block', fontSize: 12, color: '#64748b', marginTop: 2 }}>{LEGAL_DOCS[slug].subtitle}</span>
              </Link>
            ))}
          </div>
          <p style={{ marginTop: 22, fontSize: 11, color: '#94a3b8' }}>Documents marked as drafts are pending final attorney review. The Data Processing Agreement is final and applies automatically to every account.</p>
        </div>
      </div>
    )
  }

  const d = LEGAL_DOCS[doc]
  if (!d) {
    return (
      <div style={wrap}>
        <div style={card}>
          <p style={{ fontWeight: 600, color: '#0f172a' }}>Document not found</p>
          <Link to="/legal" style={{ fontSize: 13, color: '#3b82f6' }}>← All policies</Link>
        </div>
      </div>
    )
  }

  const sections = d.build(companyName)
  return (
    <div style={wrap}>
      <div style={card}>
        <Link to="/legal" style={{ fontSize: 12, color: '#3b82f6', textDecoration: 'none' }}>← All policies</Link>
        <h1 style={{ margin: '10px 0 2px', fontSize: 24, color: '#0f172a' }}>{d.title}</h1>
        <p style={{ margin: '0 0 4px', fontSize: 13, color: '#64748b' }}>{d.subtitle} · {companyName}</p>
        {d.draft && (
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', margin: '14px 0 22px' }}>
            <p style={{ margin: 0, fontSize: 12, color: '#92400e' }}>{PLACEHOLDER_NOTE}</p>
          </div>
        )}
        {!d.draft && <div style={{ margin: '14px 0 22px' }} />}
        {sections.map((s, i) => (
          <div key={i} style={{ marginBottom: 18 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 15, color: '#0f172a' }}>{s.h}</h2>
            {s.p.map((para, j) => (
              <p key={j} style={{ margin: '0 0 8px', fontSize: 13.5, color: '#334155', lineHeight: 1.7 }}>{para}</p>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
