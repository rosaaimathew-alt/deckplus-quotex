// ── The one number card ──────────────────────────────────────────────────────
// Every headline number in the app (home, Insights, Win / loss, Profit,
// Expenses, the proposal list) uses this one look: small label, big number,
// a short line under it. No icons, no colored tiles.
export default function StatCard({ label, value, sub, tone = 'text-gray-900', onClick, title, className = '' }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} title={title}
      className={`text-left bg-white rounded-xl border border-gray-200 px-5 py-4 min-w-0 ${onClick ? 'hover:bg-gray-50 transition-colors' : ''} ${className}`}>
      <p className="text-xs font-medium text-gray-500 truncate">{label}</p>
      <p className={`text-2xl font-bold mt-1 leading-none tabular-nums truncate ${tone}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1.5 truncate" title={typeof sub === 'string' ? sub : undefined}>{sub}</p>}
    </Tag>
  )
}
