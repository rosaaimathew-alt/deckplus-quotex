// Opens a saved proposal in the proposal view. One helper for every list in the
// app, so the proposal always renders the way it was built (à la carte, lump
// sum, project types and summary) no matter where it was opened from.
export function proposalHandoff(p) {
  return {
    client: p.client, email: p.email, phone: p.phone, address: p.address,
    expiration: p.expiration, lines: p.lines || [], margin: 0, proposalId: p.id,
    isAlaCarte: !!p.isAlaCarte,
    showBreakdown: p.showBreakdown !== false,
    projectTypes: p.projectTypes || [],
    projectSummary: p.projectSummary || '',
  }
}

export function openProposal(p, navigate) {
  sessionStorage.setItem('proposal', JSON.stringify(proposalHandoff(p)))
  navigate('/proposal')
}
