// ── Electrical items on a job ────────────────────────────────────────────────
// The contract's Electrical Specifications page as a plain list
// [{ label, qty }]: the printed items that have a quantity, then the write-in
// lines. Used to show a booked electrician what to install, and to start the
// office's list on a booking from the job's contract.
import { ELECTRICAL_FORM } from '../contract/deckPlusAgreement'
import { MAX_ELEC_WRITE_INS, elecWriteInKey, elecWriteInQtyKey } from '../contract/contractFields'

const txt = (v) => String(v ?? '').trim()

// The printed item names, for picking one when typing a list by hand.
export const ELECTRICAL_ITEM_NAMES = ELECTRICAL_FORM.items.filter(i => i.id !== 'other').map(i => i.label)

// values: the contract's fill-in answers (elecQty_<row>, elecOther, elecOther2…).
export function electricalItemsOf(values) {
  const v = values && typeof values === 'object' ? values : {}
  const out = []
  for (const it of ELECTRICAL_FORM.items) {
    if (it.id === 'other') continue
    const qty = txt(v[`elecQty_${it.id}`])
    if (qty && qty !== '0') out.push({ label: it.label, qty })
  }
  for (let i = 1; i <= MAX_ELEC_WRITE_INS; i++) {
    const label = txt(v[elecWriteInKey(i)])
    if (label) out.push({ label, qty: txt(v[elecWriteInQtyKey(i)]) })
  }
  return out
}

// A typed list, tidied: rows with wording only.
export const cleanElectricalItems = (rows) => (Array.isArray(rows) ? rows : [])
  .map(r => ({ label: txt(r?.label), qty: txt(r?.qty) })).filter(r => r.label)

// Is this booking electrical work? (The sub's trade, or how the service reads.)
export const isElectricalBooking = (task, sub) =>
  /electr/i.test(sub?.trade || '') || /electr/i.test(task?.title || '') || (task?.electrical || []).length > 0
