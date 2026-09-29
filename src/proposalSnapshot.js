// The single source of truth for the display-only snapshot sent to the public
// proposal page (/p/:token). Used by every "get link" / send path so the shared
// link always renders the proposal exactly the way the app does — including
// descriptions and à-la-carte vs. summed pricing. No costs/margins are included.
export function buildProposalSnapshot(data = {}, branding = {}) {
  const lines = (data.lines || [])
    .filter(l => (l.name || '').trim() || Number(l.unitPrice) > 0)
    .map(l => ({
      name:        l.name || '',
      description: l.description || '',
      qty:         Number(l.qty) || 1,
      unitPrice:   Number(l.unitPrice) || 0,
    }))
  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0)
  return {
    client:         data.client || '',
    email:          data.email || '',
    phone:          data.phone || '',
    address:        data.address || '',
    // Estimate date = when the proposal was sent, else created, else today.
    estimateDate:   data.sentAt || data.createdAt || new Date().toISOString(),
    expiration:     data.expiration || '',
    // À la carte: options priced individually, customer selects, NO grand total.
    isAlaCarte:     !!data.isAlaCarte,
    // Matches ProposalView's default (true when unset): itemized price breakdown.
    showBreakdown:  data.showBreakdown !== false,
    lines,
    subtotal,
    total:          Number(data.total) || subtotal,
    projectSummary: data.projectSummary || data.contractDraft?.projectSummary || '',
    contractNum:    data.contractDraft?.contractNum || '',
    companyName:    branding?.companyName || '',
    logo:           branding?.logo || null,
    primaryColor:   branding?.primaryColor || null,
  }
}
