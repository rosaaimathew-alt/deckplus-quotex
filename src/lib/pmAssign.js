// ── A signed job goes to its PM by the kind of work ─────────────────────────
// The owner's rule:
//   any job that builds a new porch (on its own, or with a deck or hardscape)
//     → the new-porch PM (Bill)
//   any other mix of deck, hardscape and porch remodel (a conversion)
//     → the deck / hardscape PM (Vitoria)
// Applied when the contract is signed by all parties (e-signed, marked signed,
// signed on paper), or when a signed job's job type is first picked, and only
// to a job with no PM yet: a PM picked by hand is never changed. Who is who is
// in the pm_rules table (supabase/pm_auto_assign.sql). The e-signature's last
// signer is handled on the server the same way (api/sign/[token].js).

const NEW_PORCH_TYPES = ['screen porches', 'open porches', 'sunrooms', 'ground level porch', 'ground level porch + windows', 'porch over deck', 'porch over deck + windows']
const CONVERSION_TYPES = ['porch conversions', 'porch conversion']

const list = (v) => (Array.isArray(v) ? v : [])

// 'new_porch', 'other', or null when the job says nothing about its work.
// Same as public.pm_work_kind in the database.
export function workKind(p) {
  if (!p) return null
  const jd = p.jobData || {}
  const types = [...list(p.projectTypes), ...list(p.contractDraft?.projectTypes), ...list(jd.projectTypeOverrides), ...(jd.projectTypeOverride ? [jd.projectTypeOverride] : [])]
    .map(t => String(t).toLowerCase())
  const tools = list(p.lines).map(l => l?.builder?.tool || (l?.porchBuild ? 'porchbuild' : null)).filter(Boolean)
  if (tools.includes('porchbuild') || types.some(t => NEW_PORCH_TYPES.includes(t))
    || (types.includes('eze-breeze porches') && !types.some(t => CONVERSION_TYPES.includes(t)))) return 'new_porch'
  return types.length || tools.length ? 'other' : null
}

// Signed: the contract is signed, or the job came over from Knowify sold
export const jobSigned = (p) => !!p?.contractDraft?.signed || p?.status === 'Imported'

// The PM the rule gives a job, or null (already has one, not signed, kind unknown)
export function pmFor(p, rules) {
  if (!p || p.pmId || !jobSigned(p)) return null
  const kind = workKind(p)
  return (kind && rules?.[kind]) || null
}
