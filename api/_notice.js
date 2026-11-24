/**
 * Notices to every sub (supabase/sub_notices.sql): at each time in send_at the
 * database's scheduler calls POST /api/email { action: 'notice-run' } with the
 * run key it keeps in app_kv. Every sub and painter login gets a pop-up on
 * their phone (alerts on), or else an email from the company mailbox, in
 * English and Spanish. The same notice shows in their app (src/sub/SubNotice.jsx).
 *
 * Served by the email function (Vercel's Hobby plan allows 12 functions).
 */
import { db } from './_round-robin.js'
import { sendMail } from './_mailer.js'
import { pushToEmails } from './_push.js'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export async function runNotices(req, res) {
  const sb = db()
  const key = String(req.headers?.['x-notice-key'] || '')
  const { data: k } = await sb.from('app_kv').select('value').eq('key', 'notice:runkey').maybeSingle()
  if (!key || typeof k?.value !== 'string' || key !== k.value) return res.status(401).json({ error: 'Unauthorized' })

  // The sends that are due, already marked sent (two runs can't send twice)
  const { data: due, error } = await sb.rpc('notice_claim_due')
  if (error) return res.status(500).json({ error: error.message })
  const host = req.headers?.host || 'www.deckplus.app'
  const link = `https://${host.includes('localhost') ? 'www.deckplus.app' : host}/`
  const out = []
  for (const n of due || []) {
    const { data: people } = await sb.from('org_members').select('email, display_name').eq('org_id', n.org_id).in('role', ['sub', 'paint'])
    const emails = [...new Set((people || []).map(p => String(p.email || '').toLowerCase()).filter(Boolean))]
    const both = (en, es) => (es ? `${en}\n\n${es}` : en)
    let pushed = 0, emailed = 0
    const errors = []
    const reached = new Set()
    try {
      const r = await pushToEmails(emails, { title: n.title, body: both(n.body, n.body_es), url: link })
      pushed = r.pushed
      r.reached.forEach(e => reached.add(e))
      errors.push(...r.errors)
    } catch (err) { errors.push(String(err?.message || err).slice(0, 120)) }
    // Everyone the pop-up didn't reach gets the email
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#111827;line-height:1.5">
<p style="margin:0 0 8px;font-weight:700">${esc(n.title)}</p><p style="margin:0 0 16px">${esc(n.body)}</p>
${n.body_es ? `<p style="margin:0 0 8px;font-weight:700">${esc(n.title_es || n.title)}</p><p style="margin:0 0 16px">${esc(n.body_es)}</p>` : ''}
<p style="margin:0"><a href="${esc(link)}" style="color:#1d758b;font-weight:600">Open the Deck Plus app</a></p></div>`
    const text = [n.title, n.body, '', n.title_es || '', n.body_es || '', '', link].join('\n')
    for (const email of emails) {
      if (reached.has(email)) continue
      const r = await sendMail({ to: email, subject: n.title, html, text, fromName: 'Deck Plus', sender: { orgId: n.org_id } })
      if (r?.error) errors.push(`${email}: ${String(r.error).slice(0, 80)}`); else emailed++
    }
    const result = { at: new Date().toISOString(), people: emails.length, pushed, emailed, errors: errors.slice(0, 10) }
    await sb.from('sub_notices').update({ results: [...(n.results || []), result] }).eq('id', n.id)
    out.push({ id: n.id, ...result })
  }
  return res.status(200).json({ sent: out })
}
