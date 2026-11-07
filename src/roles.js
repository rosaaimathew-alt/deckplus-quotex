// ── Team roles ────────────────────────────────────────────────────────────────
// Separate from subscription plan (plans.js). Plan = what the company paid for;
// role = what this person does inside the company. Effective access is the
// intersection of the two.
//
//   sales   — the selling side (proposals, pipeline, contracts); no subs
//   pm      — project management: jobs, subcontractors, scheduling, view quotes
//   manager — full access, plus the controls / finance side
//   paint   — the paint PM: phone Field mode's paint screens only (src/field)
//   sub     — a subcontractor (not staff): their own tasks in the sub app only (src/sub)

export const ROLE_ORDER = ['sales', 'pm', 'paint', 'manager']

export const ROLE_META = {
  sales:   { label: 'Sales',           blurb: 'Proposals, pipeline & contracts' },
  pm:      { label: 'Project Manager', blurb: 'Jobs, subcontractors & scheduling' },
  paint:   { label: 'Paint PM',        blurb: 'Paint queue, schedule and touch-ups' },
  manager: { label: 'Manager / Owner', blurb: 'Everything, plus controls & finance' },
  sub:     { label: 'Sub',             blurb: 'Their own tasks in the sub app' },
}

const ALL = [
  '/', '/clients', '/analyze', '/ai', '/catalog', '/quote', '/analytics',
  '/proposal', '/tracker', '/settings', '/contracts', '/contract',
  '/jobs', '/subs', '/scheduler', '/profitability', '/pipeline', '/finance',
  '/checklists',
]

// Sales: the current app minus the Subcontractors, Profitability & Finance.
const SALES = ALL.filter(r => r !== '/subs' && r !== '/profitability' && r !== '/finance')

// PM: job-management focus + read-only quote/contract viewing + scheduling.
const PM = ['/', '/jobs', '/subs', '/scheduler', '/proposal', '/contract', '/contracts', '/settings', '/checklists']

// Paint PM: Field mode only. '/' is the paint Queue (App.jsx ShellSwitch
// renders Field mode for this role at every address); no full-app page.
const PAINT = ['/']

// Sub: the sub app only (App.jsx ShellSwitch renders it at every address).
const SUB = ['/']

export function roleRoutes(role) {
  if (role === 'sales') return new Set(SALES)
  if (role === 'pm')    return new Set(PM)
  if (role === 'paint') return new Set(PAINT)
  if (role === 'sub')   return new Set(SUB)
  return new Set(ALL) // manager (and any unknown role → full, never lock out)
}

export function canRoleAccess(role, path) {
  return roleRoutes(role).has(path)
}

// Home page for a role — everyone can reach '/'.
export function roleLanding() {
  return '/'
}

// Team membership role (org_members.role) → the app role above.
const MEMBER_ROLE = { rep: 'sales', pm: 'pm', paint: 'paint', office: 'manager', admin: 'manager', sub: 'sub' }
export const appRoleOf = (memberRole) => MEMBER_ROLE[memberRole] || 'manager'
