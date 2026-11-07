// ── One answer to "what did this job cost?" ─────────────────────────────────
// Every page that shows a job's cost or profit (Projects › Jobs, the job's
// Money tab, Insights › Profit and Expenses) asks this one function, so the
// numbers always agree. A job's cost is:
//   • its purchase orders and bills from Money (what the office books), plus
//   • receipts / card spend tagged to the job (Insights › Expenses), plus
//   • any older hand-entered totals from before Money existed.
import { useCallback, useMemo } from 'react'
import { useStore } from '../store'
import { booksIndex } from './books'
import { jobFinancials } from './finance'

const EMPTY = []
export function useJobCostOf() {
  const expenses  = useStore(s => s.expenses) || EMPTY
  const jobCosts  = useStore(s => s.jobCosts)
  const invoices  = useStore(s => s.invoices) || EMPTY
  const purchases = useStore(s => s.purchases) || EMPTY
  const bills     = useStore(s => s.bills) || EMPTY
  const idx = useMemo(() => booksIndex({ invoices, purchases, bills }), [invoices, purchases, bills])
  return useCallback(
    (p) => jobFinancials(p, expenses, jobCosts?.[p.id], idx.get(String(p.id))),
    [expenses, jobCosts, idx],
  )
}
