/* global process */
/**
 * Reminders to sign a contract.
 *
 * A contract sent for signature can nudge the customer by email every few days
 * until they sign (Contracts › Send to Client › Remind to sign). The daily
 * cron (vercel.json → /api/booking?report=1) runs this: it asks the database
 * which reminders are due (supabase/contract_reminders.sql decides, and only
 * hands back contracts the customer has not signed), sends each one from the
 * mailbox of the person who made the contract, and stamps it as sent.
 *
 * Served by the booking function: Vercel's Hobby plan allows 12 functions and
 * one daily cron is already there.
 */
import { createClient } from '@supabase/supabase-js'
import { sendMail } from './_mailer.js'
import { getKV } from './_kv.js'
import { buildContractEmail, signatureOf, loadSignature } from './_proposalEmail.js'

const SITE = 'https://www.deckplus.app'
const MAX_PER_RUN = 12
const BUDGET_MS = 7000   // the booking function gets 15 seconds in all, and the lead report follows

const secret = () => process.env.ESIGN_DB_SECRET || null
const dbUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL

let _db = null
async function rpc(fn, args = {}) {
  if (!_db) {
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
    _db = createClient(dbUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  const { data, error } = await _db.rpc(fn, { ...args, s: secret() })
  if (error) throw new Error(error.message)
  return data
}

// One reminder as an email. → { to, subject, html, text, fromName, sender }
export function reminderEmail(item, { signature = null, site = SITE } = {}) {
  const sig = signatureOf(null, signature, item.makerName || '')
  const mail = buildContractEmail({
    client: item.client, signUrl: `${site}/sign/${item.token}`, signature: sig, logoUrl: `${site}/deckplus-logo.png`,
    reminder: Number(item.number) || 1, opened: !!item.opened,
  })
  return {
    to: item.to, ...mail,
    fromName: (sig.name || 'Deck Plus').replace(/["<>]/g, ''),
    // from the mailbox of the person who made the contract; the company's if they have none
    sender: item.makerId || item.makerEmail ? { userId: item.makerId || undefined, email: item.makerEmail || undefined } : {},
  }
}

// Sends what is due. Never throws: the lead report that shares this cron run
// must still go out. → { due, sent, failed }
export async function sendDueContractReminders({ due = () => rpc('contract_reminders_due_s'), stamp = (id) => rpc('contract_reminder_stamp_s', { p_proposal_id: id }),
  send = sendMail, signatureFor = async (userId) => loadSignature(await getKV(), userId), now = () => Date.now() } = {}) {
  const out = { due: 0, sent: 0, failed: 0 }
  const started = now()
  let list = []
  try { list = (await due()) || [] } catch (err) { console.error('contract reminders:', err.message); return out }
  out.due = list.length
  for (const item of list.slice(0, MAX_PER_RUN)) {
    if (now() - started > BUDGET_MS) break
    try {
      const signature = item.makerId ? await signatureFor(item.makerId).catch(() => null) : null
      const mail = reminderEmail(item, { signature })
      const r = await send(mail)
      if (r?.error) { out.failed++; console.error('contract reminder:', item.proposalId, r.error); continue }
      await stamp(item.proposalId)
      out.sent++
    } catch (err) { out.failed++; console.error('contract reminder:', item.proposalId, err.message) }
  }
  return out
}
