// ── Subscription tiers & feature gating ───────────────────────────────────────
// Three plans control which sections of the app a customer can reach and whether
// they can customize their branding.
//
//   starter    — proposals workflow only (catalog, builder, tracker, proposals)
//   pro        — everything EXCEPT contracts + job management
//   enterprise — full access, no restrictions
//
// The owner's own account is Enterprise. In a future multi-tenant setup the plan
// would be set by billing; today it's stored on branding.plan.

export const PLAN_ORDER = ['starter', 'pro', 'enterprise']

export const PLAN_META = {
  starter:    { label: 'Starter',      blurb: 'Proposals, catalog & pipeline' },
  pro:        { label: 'Professional', blurb: 'Everything except contracts & jobs' },
  enterprise: { label: 'Enterprise',   blurb: 'Full access — all features' },
}

// Every routed section in the app.
const ALL_ROUTES = [
  '/', '/analyze', '/ai', '/catalog', '/quote', '/analytics', '/proposal',
  '/clients', '/tracker', '/inbox', '/settings', '/contracts', '/contract',
  '/jobs', '/subs', '/scheduler', '/profitability', '/pipeline', '/finance',
]

// Entry tier: proposals, item catalog, proposal builder, proposal tracker.
// Settings stays reachable (for account/data) but branding is locked.
const STARTER_ROUTES = ['/catalog', '/quote', '/tracker', '/proposal', '/settings']

// Pro tier is everything minus the contracts, job-management, and finance.
const PRO_BLOCKED = ['/contracts', '/contract', '/jobs', '/finance']

export function allowedRoutes(plan) {
  if (plan === 'starter') return new Set(STARTER_ROUTES)
  if (plan === 'pro') return new Set(ALL_ROUTES.filter(r => !PRO_BLOCKED.includes(r)))
  return new Set(ALL_ROUTES) // enterprise (and any unknown → full, never lock out)
}

export function canAccessRoute(plan, path) {
  return allowedRoutes(plan).has(path)
}

export function canCustomizeBranding(plan) {
  return plan === 'pro' || plan === 'enterprise'
}

// Where to send a user who lands on a section their plan can't access.
export function landingRoute(plan) {
  if (plan === 'starter') return '/tracker'
  return '/'
}
