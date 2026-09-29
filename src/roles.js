// ── Team roles ────────────────────────────────────────────────────────────────
// Separate from subscription plan (plans.js). Plan = what the company paid for;
// role = what this person does inside the company. Effective access is the
// intersection of the two.
//
//   sales   — the selling side (proposals, pipeline, contracts, inbox); no subs
//   pm      — project management: jobs, subcontractors, scheduling, view quotes
//   manager — full access, plus the controls / finance side

export const ROLE_ORDER = ['sales', 'pm', 'manager']

export const ROLE_META = {
  sales:   { label: 'Sales',           blurb: 'Proposals, pipeline, contracts & inbox' },
  pm:      { label: 'Project Manager', blurb: 'Jobs, subcontractors & scheduling' },
  manager: { label: 'Manager / Owner', blurb: 'Everything, plus controls & finance' },
}

const ALL = [
  '/', '/clients', '/analyze', '/ai', '/catalog', '/quote', '/analytics',
  '/proposal', '/tracker', '/inbox', '/settings', '/contracts', '/contract',
  '/jobs', '/subs', '/scheduler', '/profitability', '/pipeline', '/finance',
  '/checklists',
]

// Sales: the current app minus the Subcontractors, Profitability & Finance.
const SALES = ALL.filter(r => r !== '/subs' && r !== '/profitability' && r !== '/finance')

// PM: job-management focus + read-only quote/contract viewing + scheduling.
const PM = ['/', '/jobs', '/subs', '/scheduler', '/proposal', '/contract', '/contracts', '/settings', '/checklists']

export function roleRoutes(role) {
  if (role === 'sales') return new Set(SALES)
  if (role === 'pm')    return new Set(PM)
  return new Set(ALL) // manager (and any unknown role → full, never lock out)
}

export function canRoleAccess(role, path) {
  return roleRoutes(role).has(path)
}

// Home page for a role — everyone can reach '/'.
export function roleLanding() {
  return '/'
}
