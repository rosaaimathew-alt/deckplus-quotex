// ── Optional upgrades on a proposal ─────────────────────────────────────────
// Priced items shown under the proposal total that are NOT part of it (or of
// the contract, job, cost or margin). Kept apart from the quote lines.
export const upgradePrice = (u) => (Number(u?.qty) || 1) * (Number(u?.unitPrice) || 0)

// What the customer sees: name, what it includes, price.
export const customerUpgrades = (upgrades) => (upgrades || [])
  .filter(u => (u?.name || '').trim() || upgradePrice(u) > 0)
  .map(u => ({ name: u.name || '', description: u.description || '', price: upgradePrice(u) }))
