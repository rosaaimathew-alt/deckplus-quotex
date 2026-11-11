// The email a customer gets with their proposal: the tracked link only (no
// PDF, so every look at the proposal is an open we can see), the wording the
// owner set, the salesperson's signature and the Deck Plus logo and colors.

export const PROPOSAL_SUBJECT = 'DeckPlus: Estimate for review'

// Deck Plus colors, from the logo.
const TEAL = '#1d758b'
const ORANGE = '#ea7a24'

// What a signature starts from until the salesperson's own details are saved.
export const SIGNATURE_DEFAULTS = { title: 'Sales / Design Consultant', office: '704-993-7696', website: 'www.deck.plus' }
const FIELDS = ['name', 'title', 'cell', 'office', 'website']

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))
const tidy = (v) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80)

// Signature fields as plain single-line text. `given` wins over `saved`, which
// wins over the defaults; a field `given` as '' is left out on purpose.
export function signatureOf(given, saved, fallbackName = '') {
  const out = {}
  for (const k of FIELDS) {
    const g = given && typeof given === 'object' && k in given ? tidy(given[k]) : null
    out[k] = g !== null ? g : tidy(saved?.[k] ?? SIGNATURE_DEFAULTS[k] ?? '')
  }
  if (!out.name) out.name = tidy(fallbackName)
  return out
}

const signatureKey = (userId) => `mailsig:${userId}`
export const loadSignature = async (kv, userId) => (userId ? (await kv.get(signatureKey(userId))) || null : null)
export const saveSignature = async (kv, userId, sig) => { if (userId) await kv.set(signatureKey(userId), sig) }

const digits = (s) => String(s || '').replace(/[^\d+]/g, '')
const siteHref = (s) => (/^https?:\/\//i.test(s) ? s : `https://${s}`)

export function buildProposalEmail({ client, viewUrl, signature, logoUrl }) {
  const sig = signatureOf(signature)
  const name = tidy(client) || 'there'
  const p1 = 'Thanks for welcoming me to your home to quote your project! It was great meeting with you. You can view your proposal online with the button below.'
  const p2 = 'I\'m looking forward to our scheduled call to review your estimate. If you have any questions or would like a walkthrough of our showroom between now and then, feel free to contact me using the cell number below.'

  const sigLines = [
    sig.name,
    sig.title,
    sig.cell ? `Tel: ${sig.cell}` : '',
    sig.office ? `Office: ${sig.office}` : '',
    sig.website,
  ].filter(Boolean)
  const text = [`Hi ${name},`, '', p1, '', `View your proposal: ${viewUrl}`, '', p2, '', ...sigLines].join('\n')

  const link = `color:${TEAL};text-decoration:none;`
  const line = 'margin:0;font-size:14px;line-height:1.6;color:#374151;'
  const sigHtml = [
    sig.name ? `<p style="margin:0;font-size:15px;line-height:1.6;font-weight:700;color:#111827;">${esc(sig.name)}</p>` : '',
    sig.title ? `<p style="${line}">${esc(sig.title)}</p>` : '',
    sig.cell ? `<p style="${line}">Tel: <a href="tel:${esc(digits(sig.cell))}" style="${link}">${esc(sig.cell)}</a></p>` : '',
    sig.office ? `<p style="${line}">Office: <a href="tel:${esc(digits(sig.office))}" style="${link}">${esc(sig.office)}</a></p>` : '',
    sig.website ? `<p style="${line}"><a href="${esc(siteHref(sig.website))}" style="${link}">${esc(sig.website)}</a></p>` : '',
    logoUrl ? `<p style="margin:14px 0 0;"><img src="${esc(logoUrl)}" width="117" height="60" alt="Deck Plus Outdoor Additions" style="display:block;border:0;width:117px;height:60px;"></p>` : '',
  ].filter(Boolean).join('\n          ')

  const body = 'margin:0 0 16px;font-size:15px;line-height:1.7;color:#374151;'
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f5f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f6;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">
      <tr><td align="center" style="background:#ffffff;padding:28px 40px 22px;">
        ${logoUrl
          ? `<img src="${esc(logoUrl)}" width="204" height="105" alt="Deck Plus Outdoor Additions" style="display:block;border:0;width:204px;height:105px;margin:0 auto;">`
          : `<p style="margin:0;font-size:24px;font-weight:800;color:${TEAL};">Deck Plus</p>`}
      </td></tr>
      <tr><td style="font-size:0;line-height:0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="70%" style="background:${TEAL};height:5px;line-height:5px;font-size:0;">&nbsp;</td>
          <td width="30%" style="background:${ORANGE};height:5px;line-height:5px;font-size:0;">&nbsp;</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:32px 40px 8px;">
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#111827;">Hi ${esc(name)},</p>
        <p style="${body}">${esc(p1)}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 28px;">
          <tr><td align="center" bgcolor="${TEAL}" style="background:${TEAL};border-radius:8px;">
            <a href="${esc(viewUrl)}" style="display:inline-block;padding:14px 36px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">View Your Proposal</a>
          </td></tr>
        </table>
        <p style="${body}">${esc(p2)}</p>
      </td></tr>
      <tr><td style="padding:0 40px 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #e5e7eb;padding-top:20px;">
          ${sigHtml}
        </td></tr></table>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`

  return { subject: PROPOSAL_SUBJECT, html, text }
}
