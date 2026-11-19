// ── Per-person access switches ───────────────────────────────────────────────
// A person's department (team role, roles.js) decides what they CAN have. An
// admin can then switch any of those sections off for one person in
// Settings › Team › Access. Stored on org_members.permissions as
// { [key]: false }; anything not listed stays as the department allows.
//
// Keys:
//   '<destination>.<tab>'  every tab in the navigation (nav.js DESTINATIONS),
//                          e.g. 'projects.inspections', 'insights.profit'
//   'email.alerts'         alerts by email: job alerts (a booking, a job done,
//                          a chat message, an invoice) and the office's permit
//                          alerts. Off: this person gets pop-ups only, is never
//                          emailed an alert, and no alert is sent through their
//                          mailbox, which stays for customers. Also off for a
//                          shared login whose address isn't a real mailbox.
//   'job.pricelist'        the itemized price list on a job (Projects › Jobs ›
//                          Money) and on a quote (Sales › List › Open price list).
//                          Its own switch: on or off whatever 'job.money' is.
//   'job.money'            the money inside a job: Budget, Costs,
//                          Receipts, payments, close-out profit, Money › Bills
//                          and Purchases, and the quote builder's cost / margin.
//                          The job's value stays.
//
// The database enforces the money ones too (supabase/permissions.sql): with
// 'job.money' and 'insights.profit' off, job costs are refused; with
// 'insights.expenses' off, card spend and expenses are refused.
// (nav.js imports this file too; everything here that reads nav.js runs in a
// function, never at load time, so the two can import each other.)
import { DESTINATIONS, makeAccess } from './nav'
import { appRoleOf } from './roles'

export const JOB_MONEY = 'job.money'
export const ALERT_EMAILS = 'email.alerts'
export const PRICE_LIST = 'job.pricelist'

// The switch list shown to the admin, grouped like the menu.
export const permissionGroups = () => [
  ...DESTINATIONS.filter(d => d.tabs).map(d => ({
    label: d.label,
    items: d.tabs.map(t => ({ key: `${d.key}.${t.key}`, label: t.label, access: t.access, hint: t.hint })),
  })),
  {
    label: 'Money',
    items: [{ key: JOB_MONEY, label: 'Job money & profit', access: '/jobs',
      hint: 'Budget, costs, receipts, payments and profit on a job; Money › Bills and Purchases; cost and margin in the quote builder' },
      { key: PRICE_LIST, label: 'Price list', access: '/',
      hint: 'The itemized price list on a job and on a quote, with its PDF and Excel downloads' }],
  },
  {
    label: 'Emails',
    items: [{ key: ALERT_EMAILS, label: 'Alert emails', access: '/',
      hint: 'Job and permit alerts by email. Untick for pop-ups only: this person is never emailed an alert and none is sent through their mailbox.' }],
  },
]

export const isOff = (permissions, key) => permissions?.[key] === false

// Old page paths → the switch that covers them, so `can('/finance')` etc.
// (the dashboard's to-do items, buttons) respect a switched-off section.
// Paths shared by several tabs (/tracker, /jobs, /catalog) aren't listed:
// switching one of those tabs off doesn't take the others with it.
export const PATH_KEYS = {
  '/clients':       'sales.proposals',
  '/contracts':     'sales.contracts',
  '/scheduler':     'projects.calendar',
  '/subs':          'money.vendors',
  '/checklists':    'projects.checklists',
  '/analytics':     'insights.overview',
  '/profitability': 'insights.profit',
  '/finance':       'insights.expenses',
  '/leads':         'sales.leads',
  '/analyze':       'catalog.import',
  '/ai':            'catalog.import',
}

// For the Team screen: which switches this person's department allows at all.
export function departmentAllows(plan, memberRole) {
  const can = makeAccess(plan, appRoleOf(memberRole))
  const office = memberRole === 'office' || memberRole === 'admin'
  return (item) => can(item.access) && (!item.officeOnly || office)
}
