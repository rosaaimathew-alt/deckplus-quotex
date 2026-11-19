// ── Good / Better / Best on the proposal ─────────────────────────────────────
// The customer's copy (the share link) and the app's own proposal page both
// draw the packages with this, so they look the same. Our quote is Better.
// With `onChoose`, a card is a button: the customer taps the one they want.
const money = (n) => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })

export default function PackageChoices({ packages = [], chosen = 'better', onChoose, saving = '', accent = '#1191ad' }) {
  if (packages.length < 2) return null
  const ours = packages.find(p => p.key === 'better')
  return (
    <div style={{ marginTop: 26, breakInside: 'avoid', pageBreakInside: 'avoid' }}>
      <p style={label}>Choose your package</p>
      <div style={{ display: 'grid', gap: 10 }}>
        {packages.map(p => {
          const on = p.key === chosen
          const diff = ours && p.key !== 'better' ? p.total - ours.total : 0
          const Tag = onChoose ? 'button' : 'div'
          return (
            <Tag key={p.key} type={onChoose ? 'button' : undefined} onClick={onChoose ? () => onChoose(p.key) : undefined}
              aria-pressed={onChoose ? on : undefined}
              style={{ position: 'relative', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start', textAlign: 'left', width: '100%', boxSizing: 'border-box',
                border: on ? `2px solid ${accent}` : '1px solid #d4d4d4', borderRadius: 10, padding: on ? '13px 15px' : '14px 16px',
                background: on ? '#f8fbfc' : '#fff', cursor: onChoose ? 'pointer' : 'default', font: 'inherit', color: '#000' }}>
              {on && <span style={{ position: 'absolute', top: -1, right: -1, background: accent, color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: '0 9px 0 9px' }}>
                {saving === p.key ? 'Saving…' : 'Selected'}</span>}
              <div style={{ flex: '0 0 9.5rem' }}>
                <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', background: '#f1f1f1', borderRadius: 4, padding: '2px 6px' }}>{p.tag}</span>
                <p style={{ margin: '6px 0 0', fontSize: 16, fontWeight: 700, color: accent }}>{p.label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 700 }}>${money(p.total)}</p>
                <p style={{ margin: '2px 0 0', fontSize: 12 }}>{p.key === 'better' ? 'Your quoted price' : `${diff < 0 ? '−' : '+'}$${money(Math.abs(diff))} vs your quote`}</p>
              </div>
              <table style={{ flex: '1 1 16rem', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
                <colgroup><col style={{ width: '3.6rem' }} /><col /><col /></colgroup>
                <thead>
                  <tr>{['', 'Decking', 'Railing'].map(h => <th key={h} style={{ textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 6px 6px 0', borderBottom: '1px solid #e5e5e5' }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {(p.decks || []).map((d, i) => (
                    <tr key={i}>
                      <td style={{ padding: '8px 6px 4px 0', fontWeight: 600, whiteSpace: 'nowrap' }}>{d.name}</td>
                      <td style={{ padding: '8px 6px 4px 0' }}>{d.decking}</td>
                      <td style={{ padding: '8px 0 4px 0' }}>{d.railing}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Tag>
          )
        })}
      </div>
    </div>
  )
}
const label = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 12px', color: '#000' }
