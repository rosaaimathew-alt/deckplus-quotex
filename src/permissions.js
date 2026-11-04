// ── Per-person access switches ───────────────────────────────────────────────
// A person's department (team role, roles.js) decides what they CAN have. An
// admin can then switch any of those sections off for one person in
// Settings › Team › Access. Stored on org_members.permissions as
// { [key]: false }; anything not listed stays as the department allows.
//
// Keys:
//   '<destination>.<tab>'  every tab in the navigation (nav.js DESTINATIONS),
//                          e.g. 'projects.inspections', 'insights.profit'
//   'job.money'            the money inside a job: Budget, Price list, Costs,
//                          Receipts, payments, close-out profit, and the quote
//                          builder's cost / margin. The job's value stays.
//
// The database enforces the money ones too (supabase/permissions.sql): with
// 'job.money' and 'insights.profit' off, job costs are refused; with
// 'insights.expenses' off, card spend and expenses are refused.
// (nav.js imports this file too; everything here that reads nav.js runs in a
// function, never at load time, so the two can import each other.)
import { DESTINATIONS, makeAccess } from './nav'
import { appRoleOf } from './roles'

export const JOB_MONEY = 'job.money'

// The switch list shown to the admin, grouped like the menu.
export const permissionGroups = () => [
  ...DESTINATIONS.filter(d => d.tabs).map(d => ({
    label: d.label,
    items: d.tabs.map(t => ({ key: `${d.key}.${t.key}`, label: t.label, access: t.access, hint: t.hint })),
  })),
  {
    label: 'Money',
    items: [{ key: JOB_MONEY, label: 'Job money & profit', access: '/jobs',
      hint: 'Budget, price list, costs, receipts, payments and profit on a job; cost and margin in the quote builder' }],
  },
]

export const isOff = (permissions, key) => permissions?.[key] === false

// Old page paths → the switch that covers them, so `can('/finance')` etc.
// (the dashboard's to-do items, buttons) respect a switched-off section.
// Paths shared by several tabs (/tracker, /jobs, /catalog) aren't listed:
// switching one of those tabs off doesn't take the others with it.
export const PATH_KEYS = {
  '/clients':       'sales.clients',
  '/contracts':     'contracts.all',
  '/scheduler':     'projects.calendar',
  '/subs':          'projects.crews',
  '/checklists':    'projects.checklists',
  '/analytics':     'insights.overview',
  '/profitability': 'insights.profit',
  '/finance':       'insights.expenses',
  '/analyze':       'catalog.import',
  '/ai':            'catalog.assistant',
}

// For the Team screen: which switches this person's department allows at all.
export function departmentAllows(plan, memberRole) {
  const can = makeAccess(plan, appRoleOf(memberRole))
  return (item) => can(item.access)
}
