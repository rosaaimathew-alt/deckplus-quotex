/**
 * Alerts about a sub's job: email, and a text when texting is set up.
 *   POST /api/email  { action: 'notify', kind, id }
 *
 * Served by the email function (Vercel's Hobby plan allows 12 functions per
 * deployment). Unlike the rest of that function this is open to every login
 * on the team, subs and painters included, because a technician tapping
 * "Completed" is what tells the PM. That is safe because the caller sends
 * only a kind and a booking id: who is told and what they are told comes from
 * the database (supabase/notify.sql → notify_targets), which answers only for
 * someone who is part of that booking.
 *
 *   booked / changed / inspection  → the sub and their technician, in the PM's name
 *   inspection_result              → the sub and technician of that trade only (an electrical
 *                                    result never goes to the carpenters), in the PM's name
 *   assigned                       → the technician put on the job
 *   done                           → the Deck Plus PM on the job
 *   invoice_submitted              → the office      invoice_decision → the sub
 *   message (job chat)             → the other side of that conversation: the sub's manager,
 *                                    or the Deck Plus PM on the job
 */
import { verifyToken, asUser, staffMembership } from './_auth.js'
import { sendMail } from './_mailer.js'
import { sendSms, smsConfigured } from './_sms.js'
import { getKV } from './_kv.js'

const TEAL = '#1d758b'
const ORANGE = '#ea7a24'
export const KINDS = ['booked', 'changed', 'inspection', 'inspection_result', 'assigned', 'done', 'invoice_submitted', 'invoice_decision', 'message']
const CHAT_QUIET_SECONDS = 300   // a back-and-forth emails each side at most once every five minutes per job
const QUIET_SECONDS = 60   // the same alert about the same booking is not repeated inside a minute

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const tidy = (s, max = 120) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const first = (name) => tidy(name, 60).split(' ')[0] || ''

const DAYS = { en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] }
const MONTHS = { en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] }
export function dayText(iso, lang = 'en') {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return ''
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return lang === 'es'
    ? `${DAYS.es[d.getUTCDay()]} ${+m[3]} ${MONTHS.es[+m[2] - 1]}`
    : `${DAYS.en[d.getUTCDay()]}, ${MONTHS.en[+m[2] - 1]} ${+m[3]}`
}
function whenText(t, lang = 'en') {
  const a = dayText(t.startDate, lang), b = dayText(t.endDate, lang)
  if (a && b && a !== b) return lang === 'es' ? `Del ${a} al ${b}.` : `${a} to ${b}.`
  if (a) return lang === 'es' ? `Empieza el ${a}.` : `Starts ${a}.`
  if (b) return lang === 'es' ? `Terminar antes del ${b}.` : `Finish by ${b}.`
  return ''
}
const CHANGE_ES = { service: 'el servicio', dates: 'las fechas', notes: 'las notas', 'electrical items': 'los artículos eléctricos', 'inspection date': 'la fecha de inspección' }
const changeEs = (note) => tidy(note).split(',').map(s => CHANGE_ES[s.trim()] || s.trim()).filter(Boolean).join(', ')
const money = (n) => `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// What one alert says. → { subject, en, es (Spanish, for the crews; null for the office), sms, path, cta } or null
export function messageFor(info) {
  const t = info.task || {}, d = info.draw || {}
  const who = tidy(info.sender?.name, 60) || 'Deck Plus'
  const by = tidy(info.by?.name, 60) || who
  const job = [tidy(t.title), tidy(t.client)].filter(Boolean).join(' · ')
  const at = [tidy(t.client), tidy(t.address)].filter(Boolean).join(', ')
  const taskPath = `/task/${encodeURIComponent(t.id || '')}`
  switch (info.kind) {
    case 'booked': return {
      subject: `New job: ${job}`,
      en: `${who} booked you for ${tidy(t.title)} at ${at}. ${whenText(t)}`.trim(),
      es: `${who} le asignó ${tidy(t.title)} en ${at}. ${whenText(t, 'es')}`.trim(),
      sms: `Deck Plus: ${who} booked you for ${tidy(t.title, 40)}, ${tidy(t.client, 40)}. ${whenText(t)}`.trim(),
      path: taskPath, cta: 'Open the job / Abrir el trabajo',
    }
    case 'assigned': return {
      subject: `You're on a job: ${job}`,
      en: `${by} put you on ${tidy(t.title)} at ${at}. ${whenText(t)} Send photos each day you work, and tap the status as you go.`.replace(/\s+/g, ' ').trim(),
      es: `${by} lo puso en ${tidy(t.title)} en ${at}. ${whenText(t, 'es')} Envíe fotos cada día que trabaje y marque el estado según avance.`.replace(/\s+/g, ' ').trim(),
      sms: `Deck Plus: ${by} put you on ${tidy(t.title, 40)}, ${tidy(t.client, 40)}. ${whenText(t)}`.trim(),
      path: taskPath, cta: 'Open the job / Abrir el trabajo',
    }
    case 'changed': {
      // Sent back for the next stage of the job (lib/subTasks sendBackChanges)
      if (t.changeNote === 'next stage') {
        const note = tidy(t.assignment, 400)
        return {
          subject: `Back on the job: ${job}`,
          en: `${who} needs you back at ${at} for the next stage of ${tidy(t.title)}.${note ? ` ${note}` : ''} ${whenText(t)}`.replace(/\s+/g, ' ').trim(),
          es: `${who} lo necesita de regreso en ${at} para la siguiente etapa de ${tidy(t.title)}.${note ? ` ${note}` : ''} ${whenText(t, 'es')}`.replace(/\s+/g, ' ').trim(),
          sms: `Deck Plus: ${who} needs you back at ${tidy(t.client, 40)} for the next stage.${note ? ` ${tidy(note, 120)}` : ''} ${whenText(t)}`.trim(),
          path: taskPath, cta: 'Open the job / Abrir el trabajo',
        }
      }
      const what = tidy(t.changeNote) || 'details'
      return {
        subject: `Job updated: ${job}`,
        en: `${who} changed the ${what} for ${tidy(t.title)} at ${at}. ${whenText(t)}`.trim(),
        es: `${who} cambió ${changeEs(t.changeNote) || 'los detalles'} de ${tidy(t.title)} en ${at}. ${whenText(t, 'es')}`.trim(),
        sms: `Deck Plus: ${who} changed the ${what} for ${tidy(t.title, 40)}, ${tidy(t.client, 40)}. ${whenText(t)}`.trim(),
        path: taskPath, cta: 'See what changed / Ver el cambio',
      }
    }
    case 'inspection': {
      if (!t.inspectionDate) return null
      return {
        subject: `Inspection ${dayText(t.inspectionDate)}: ${job}`,
        en: `The inspection for ${tidy(t.title)} at ${at} is set for ${dayText(t.inspectionDate)}.`,
        es: `La inspección de ${tidy(t.title)} en ${at} es el ${dayText(t.inspectionDate, 'es')}.`,
        sms: `Deck Plus: inspection for ${tidy(t.title, 40)}, ${tidy(t.client, 40)} is ${dayText(t.inspectionDate)}.`,
        path: taskPath, cta: 'Open the job / Abrir el trabajo',
      }
    }
    case 'inspection_result': {
      // The latest pass / fail on this booking (it only carries its own trade's results)
      const r = [...(Array.isArray(t.inspections) ? t.inspections : [])].reverse().find(i => i && (i.state === 'pass' || i.state === 'fail'))
      if (!r) return null
      const ok = r.state === 'pass'
      const name = tidy(r.name, 60) || 'Inspection'
      const note = tidy(r.note, 400)
      const on = dayText(r.date), el = dayText(r.date, 'es')
      return {
        subject: `${ok ? 'Passed' : 'Did not pass'}: ${name} inspection · ${tidy(t.client)}`,
        en: ok
          ? `The ${name.toLowerCase()} inspection at ${at} passed${on ? ` on ${on}` : ''}.`
          : `The ${name.toLowerCase()} inspection at ${at} did not pass${on ? ` on ${on}` : ''} (${tidy(r.result, 60) || 'failed'}).${note ? ` Inspector's note: ${note}` : ''} ${who} will be in touch about going back.`,
        es: ok
          ? `La inspección (${name.toLowerCase()}) en ${at} fue aprobada${el ? ` el ${el}` : ''}.`
          : `La inspección (${name.toLowerCase()}) en ${at} no fue aprobada${el ? ` el ${el}` : ''}.${note ? ` Nota del inspector: ${note}` : ''} ${who} se comunicará con usted para regresar.`,
        sms: ok ? `Deck Plus: ${name} inspection passed, ${tidy(t.client, 40)}.` : `Deck Plus: ${name} inspection did not pass, ${tidy(t.client, 40)}. ${who} will be in touch.`,
        path: taskPath, cta: 'Open the job / Abrir el trabajo',
      }
    }
    case 'done': return {
      subject: `Completed: ${job}`,
      en: `${by}${t.subName && t.subName !== by ? ` (${tidy(t.subName, 60)})` : ''} marked ${tidy(t.title)} at ${at} completed. Line up the inspection if this one needs it.`,
      es: null,
      sms: `Deck Plus: ${by} completed ${tidy(t.title, 40)}, ${tidy(t.client, 40)}.`,
      path: t.proposalId ? `/field/job/${encodeURIComponent(t.proposalId)}` : '/field', cta: 'Open the job',
    }
    case 'invoice_submitted': return {
      subject: `Sub invoice: ${tidy(d.subName, 60) || by} · ${money(d.total)}`,
      en: `${tidy(d.subName, 60) || by} sent an invoice for ${money(d.total)}${d.weekOf ? ` (week of ${dayText(d.weekOf)})` : ''}. It is waiting for you under Money › Bills.`,
      es: null,
      sms: `Deck Plus: ${tidy(d.subName, 40) || by} sent an invoice for ${money(d.total)}.`,
      path: '/money?tab=bills', cta: 'Review it',
    }
    case 'invoice_decision': {
      const ok = d.status === 'approved'
      if (!ok && d.status !== 'rejected') return null
      const why = tidy(d.reason, 200)
      return {
        subject: ok ? `Invoice approved: ${money(d.total)}` : `Invoice sent back: ${money(d.total)}`,
        en: ok ? `Your invoice for ${money(d.total)} was approved.` : `Your invoice for ${money(d.total)} was sent back${why ? `: ${why}` : '.'} Fix it and send it again.`,
        es: ok ? `Su factura por ${money(d.total)} fue aprobada.` : `Su factura por ${money(d.total)} fue devuelta${why ? `: ${why}` : '.'} Corríjala y envíela de nuevo.`,
        sms: ok ? `Deck Plus: your invoice for ${money(d.total)} was approved.` : `Deck Plus: your invoice for ${money(d.total)} was sent back. Open the app to see why.`,
        path: '/invoices', cta: 'Open invoices / Abrir facturas',
      }
    }
    case 'message': {
      const m = info.message || {}
      const said = tidy(m.text, 600)
      if (!said) return null
      const toSub = m.from === 'pm'
      return {
        subject: `Message from ${by}: ${tidy(m.client, 60) || 'your job'}`,
        en: `${by} wrote about ${tidy(m.client, 80) || 'the job'}: "${said}"`,
        es: toSub ? `${by} escribió sobre ${tidy(m.client, 80) || 'el trabajo'}: "${said}"` : null,
        sms: `Deck Plus: ${by} (${tidy(m.client, 40) || 'job'}): ${tidy(m.text, 200)}`,
        path: toSub ? (m.taskId ? `/task/${encodeURIComponent(m.taskId)}` : '/') : (m.proposalId ? `/field/job/${encodeURIComponent(m.proposalId)}` : '/field'),
        cta: toSub ? 'Reply / Responder' : 'Reply',
      }
    }
    default: return null
  }
}

export function buildAlertEmail({ msg, toName, sender, link, logoUrl }) {
  const hi = first(toName)
  const signName = tidy(sender?.name, 60)
  const phone = tidy(sender?.phone, 30)
  const text = [hi ? `Hi ${hi},` : 'Hi,', '', msg.en, ...(msg.es ? ['', msg.es] : []), '', `${msg.cta}: ${link}`, '', signName, phone].join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const p = 'margin:0 0 14px;font-size:16px;line-height:1.55;color:#111827;'
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f3f4f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:22px 28px 14px;">${logoUrl ? `<img src="${esc(logoUrl)}" width="136" height="70" alt="Deck Plus" style="display:block;border:0;">` : `<span style="font-size:20px;font-weight:700;color:${TEAL};">Deck Plus</span>`}</td></tr>
    <tr><td style="height:4px;background:${TEAL};border-right:120px solid ${ORANGE};font-size:0;line-height:0;">&nbsp;</td></tr>
    <tr><td style="padding:24px 28px 8px;">
      <p style="${p}">${hi ? `Hi ${esc(hi)},` : 'Hi,'}</p>
      <p style="${p}">${esc(msg.en)}</p>
      ${msg.es ? `<p style="${p}color:#4b5563;">${esc(msg.es)}</p>` : ''}
      <p style="margin:22px 0;"><a href="${esc(link)}" style="display:inline-block;background:${TEAL};color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:13px 26px;border-radius:8px;">${esc(msg.cta)}</a></p>
      ${signName ? `<p style="margin:0;font-size:15px;line-height:1.6;font-weight:700;color:#111827;">${esc(signName)}</p>` : ''}
      ${phone ? `<p style="margin:0 0 6px;font-size:14px;line-height:1.6;color:#374151;"><a href="tel:${esc(phone.replace(/[^\d+]/g, ''))}" style="color:${TEAL};text-decoration:none;">${esc(phone)}</a></p>` : ''}
    </td></tr>
    <tr><td style="padding:14px 28px 22px;"><p style="margin:0;font-size:12px;color:#6b7280;">Deck Plus · www.deck.plus</p></td></tr>
  </table>
</td></tr></table></body></html>`
  return { html, text }
}

export async function sendNotification(req, res, body) {
  const header = req.headers?.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.headers?.['x-qx-token'] || null)
  const user = await verifyToken(token)
  if (!user) return res.status(401).json({ error: 'Unauthorized — please sign in again.' })

  const kind = String(body.kind || '')
  const id = String(body.id || '').slice(0, 80)
  if (!KINDS.includes(kind) || !id) return res.status(400).json({ error: 'Unknown alert.' })

  // Who is told, and about what: the database decides, as the signed-in person.
  const { data: info, error } = await asUser(token).rpc('notify_targets', { p_kind: kind, p_id: id })
  if (error) return res.status(500).json({ sent: false, error: 'Could not look up who to tell.' })
  if (!info) return res.status(404).json({ sent: false, reason: 'Nothing to tell anyone about.' })
  const people = (info.recipients || []).filter(p => p && p.email)
  if (!people.length) return res.status(200).json({ sent: false, reason: 'Nobody to tell yet.' })
  const msg = messageFor(info)
  if (!msg) return res.status(200).json({ sent: false, reason: 'Nothing to say.' })

  // Not twice in a minute (a date typed digit by digit, a double tap).
  // Chat: per conversation and direction, not per message
  const quietKey = kind === 'message' ? `notify:message:${info.message?.proposalId}:${info.message?.subId}:${info.message?.from}` : `notify:${kind}:${id}`
  try {
    const kv = await getKV()
    if (await kv.get(quietKey)) return res.status(200).json({ sent: false, reason: 'Already sent a moment ago.' })
    await kv.set(quietKey, { at: Date.now() }, { ex: kind === 'message' ? CHAT_QUIET_SECONDS : QUIET_SECONDS })
  } catch { /* storage hiccup: better a repeat than no alert */ }

  const host = req.headers?.host || 'www.deckplus.app'
  const origin = `${host.includes('localhost') ? 'http' : 'https'}://${host}`
  const link = `${origin}${msg.path}`
  const logoUrl = `${origin}/deckplus-logo.png`
  const sender = info.sender || {}
  // From the PM's own mailbox when they have one connected, else the company
  // mailbox with the PM's name on it; replies go to the PM either way.
  const member = await staffMembership(token, user).catch(() => null)
  const mailSender = { orgId: member?.org_id || null, ...(info.senderIsStaff && sender.id ? { userId: sender.id, email: sender.email } : {}) }

  let emailed = 0, texted = 0
  const errors = []
  for (const p of people) {
    const { html, text } = buildAlertEmail({ msg, toName: p.name, sender, link, logoUrl })
    const out = await sendMail({
      to: p.email, subject: msg.subject, html, text,
      fromName: sender.name ? `${tidy(sender.name, 60)} · Deck Plus` : 'Deck Plus',
      replyTo: info.senderIsStaff && sender.email ? sender.email : undefined,
      sender: mailSender,
    })
    if (out.error) errors.push(out.error); else emailed++
    if (smsConfigured() && p.phone) {
      const s = await sendSms(p.phone, `${msg.sms} ${link}`)
      if (s.sent) texted++; else if (s.error) errors.push(s.error)
    }
  }
  if (errors.length) console.error('notify:', kind, id, errors.join(' | '))
  res.status(200).json({ sent: emailed + texted > 0, emailed, texted, ...(errors.length && !emailed ? { error: errors[0] } : {}) })
}
