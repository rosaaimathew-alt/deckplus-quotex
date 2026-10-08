// Card statement text → expense rows, built in (no outside AI). Reads
// "date … description … amount" from each printed line and skips payments,
// credits and refunds.
const SKIP = /\b(payment|thank you|credit|refund|balance|interest charge|previous|minimum due|autopay|statement|total)\b/i
export function parseStatementText(text) {
  const year = new Date().getFullYear()
  const rows = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim()
    const m = line.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s+(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\s+)?(.+?)\s+(-?\(?\$?\s?[\d,]+\.\d{2}\)?)\s*(?:cr)?\s*$/i)
    if (!m) continue
    const [, d, desc, amt] = m
    if (SKIP.test(desc) || /-|\(|cr\s*$/i.test(amt + (/\bcr\s*$/i.test(line) ? 'cr' : ''))) continue
    let date = d
    if (!/^\d{4}-/.test(d)) {
      const [mm, dd, yy] = d.split(/[/-]/)
      const y = yy ? (yy.length === 2 ? 2000 + Number(yy) : Number(yy)) : year
      date = `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    }
    const amount = Number(amt.replace(/[^\d.]/g, ''))
    if (amount > 0) rows.push({ date, description: desc.replace(/\s+/g, ' ').slice(0, 120), amount })
  }
  return rows
}
