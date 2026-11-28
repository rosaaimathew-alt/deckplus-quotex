/**
 * County connection alert email.
 *   POST /api/permit-pulse  { alert: { county, state: 'down' | 'up', error, failed, total } }
 *
 * Served by the permit-pulse function (Vercel's Hobby plan allows 12
 * functions per deployment, so this doesn't get one of its own).
 *
 * Sent by an office / admin screen when the inspection check finds a county's
 * permit site can't be read (state 'down') or works again ('up') — see
 * src/lib/permitHealth.js — or by the server's own scheduled check
 * (api/_permit-tick.js, through deliverPermitAlert). Goes to every office and admin member of the
 * sender's company, from the company mailbox — except people whose "Alert
 * emails" switch is off (Settings › Team › Access), e.g. a shared login
 * whose address isn't a real mailbox.
 */
import { requireAuth, staffMembership, asUser } from './_auth.js'
import { sendMail } from './_mailer.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

export async function sendPermitAlert(req, res, body) {
  const staff = await requireAuth(req, res)
  if (!staff) return
  const token = (req.headers.authorization || '').replace(/^Bearer /, '') || req.headers['x-qx-token']
  const member = await staffMembership(token, staff)
  if (!member || !['office', 'admin'].includes(member.role)) return res.status(403).json({ error: 'Only the office can send connection alerts.' })

  const origin = req.headers.origin || `https://${req.headers.host || 'deckplus.app'}`
  const out = await deliverPermitAlert({ sb: asUser(token), orgId: member.org_id, alert: body, origin })
  res.status(out.status).json(out.body)
}

// The email itself, to the office and admin of org orgId. sb: a database
// client that may read that company's members (the sender's own login, or the
// server's). → { status, body } for the caller to answer with.
export async function deliverPermitAlert({ sb, orgId, alert: body, origin }) {
  const county = clean(body.county, 40) || 'A county'
  const down = body.state !== 'up'
  const error = clean(body.error, 400)
  const failed = Math.max(0, Number(body.failed) || 0)
  const total = Math.max(0, Number(body.total) || 0)

  // Office and admin of this company
  const { data: people } = await sb.from('org_members').select('email, role, permissions').eq('org_id', orgId).in('role', ['office', 'admin'])
  const to = [...new Set((people || []).filter(p => p.permissions?.['email.alerts'] !== false).map(p => p.email).filter(Boolean))]
  if (!to.length) return { status: 200, body: { sent: false, reason: 'No office or admin email on file' } }

  const link = `${origin}/projects?tab=inspections`
  const subject = down
    ? `ALERT: ${county} inspection results aren't coming through`
    : `Resolved: ${county} inspection results are coming through again`
  const html = down
    ? `<p>The inspection check couldn't read the <b>${esc(county)}</b> permit site for ${failed} of ${total} job${total === 1 ? '' : 's'}.</p>
       <p>Until it's fixed, inspection results for ${esc(county)} jobs on the board may be out of date — check the county site directly for anything urgent.</p>
       ${error ? `<p style="color:#666">What the check saw: ${esc(error)}</p>` : ''}
       <p><a href="${esc(link)}">Open the Inspections board</a></p>`
    : `<p>The <b>${esc(county)}</b> permit site is being read again (${total - failed} of ${total} jobs checked fine). Inspection results are up to date.</p>
       <p><a href="${esc(link)}">Open the Inspections board</a></p>`

  const out = await sendMail({ to: to.join(', '), subject, html, sender: { orgId } })
  if (out.error) return { status: 502, body: { sent: false, error: out.error } }
  return { status: 200, body: { sent: true, to: to.length } }
}
