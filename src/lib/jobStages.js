// ── A job's checklist (its stages) ───────────────────────────────────────────
// Which steps a sold job goes through, from the job types picked on it (or
// read from the quote and contract), the PM's own order and edits, and the
// "No permit needed" switch. Shown and ticked on Projects › Jobs; also read
// by the inspection check on the server (api/_permit-tick.js), so this file
// holds plain rules only (no store, no screens). Imports name their .js file
// for Node.
import { noPermit, PERMIT_KEYS, isInspectionKey } from './permitRules.js'

// A job on the Jobs page: a won deal, or an ongoing job brought in from the
// office's project sheet (status 'Imported' — never counted as a sale). Not a
// record kept only for its invoices (jobData.invoicesOnly: an old Knowify
// invoice or a collection, no job behind it): that one stays in Money only.
export const isJob = (p) => (p.status === 'Won' || p.status === 'Imported') && !p.jobData?.invoicesOnly

const STAGE_TEMPLATES = {
  porch_conversion: [
    { key: 'hoa',               label: 'HOA Approval' },
    { key: 'precon',            label: 'Pre-Con Scheduled' },
    { key: 'start',             label: 'Start Date Given' },
    { key: 'demo',              label: 'Demo' },
    { key: 'materials',         label: 'Material Ordered' },
    { key: 'framing',           label: 'Framing Complete' },
    { key: 'measurements',      label: 'Measurements Received' },
    { key: 'paint',             label: 'Paint Completed' },
    { key: 'windows_delivered', label: 'Windows Delivered' },
    { key: 'windows_installed', label: 'Windows Installed' },
    { key: 'punch',             label: 'Punch List' },
    { key: 'closed',            label: 'Job Closed' },
  ],
  deck_resurface: [
    { key: 'hoa',                 label: 'HOA Approval' },
    { key: 'precon',              label: 'Pre-Con Scheduled' },
    { key: 'start',               label: 'Start Date Given' },
    { key: 'demo',                label: 'Demo' },
    { key: 'materials',           label: 'Material Ordered' },
    { key: 'framing_restructure', label: 'Framing/Restructuring Complete' },
    { key: 'decking_railings',    label: 'Decking and Railings Installed' },
    { key: 'paint',               label: 'Paint Completed' },
    { key: 'punch',               label: 'Punch List' },
    { key: 'closed',              label: 'Job Closed' },
  ],
  deck_new: [
    { key: 'hoa',               label: 'HOA Approval' },
    { key: 'zoning',            label: 'Zoning Permit' },
    { key: 'building',          label: 'Building Permit' },
    { key: 'precon',            label: 'Pre-Con Scheduled' },
    { key: 'start',             label: 'Start Date Given' },
    { key: 'demo_footings',     label: 'Demo and Footings' },
    { key: 'footing_insp',      label: 'Footing Inspection Completed' },
    { key: 'materials',         label: 'Material Ordered' },
    { key: 'framing',           label: 'Framing Complete' },
    { key: 'floor_framing_insp',label: 'Floor Framing Inspection' },
    { key: 'decking_railings',  label: 'Decking and Railings Installed' },
    { key: 'paint',             label: 'Paint Completed' },
    { key: 'final_insp',        label: 'Final Inspection' },
    { key: 'punch',             label: 'Punch List' },
    { key: 'closed',            label: 'Job Closed' },
  ],
  porch_ground: [
    { key: 'hoa',                 label: 'HOA Approval' },
    { key: 'zoning',              label: 'Zoning Permit' },
    { key: 'building',            label: 'Building Permit' },
    { key: 'precon',              label: 'Pre-Con Scheduled' },
    { key: 'start',               label: 'Start Date Given' },
    { key: 'demo_footings',       label: 'Demo and Footings' },
    { key: 'footing_insp',        label: 'Footing Inspection Completed' },
    { key: 'materials',           label: 'Material Ordered' },
    { key: 'roof',                label: 'Roof Complete' },
    { key: 'rough_electrical',    label: 'Rough Electrical Complete' },
    { key: 'rough_building_insp', label: 'Rough Building Inspection' },
    { key: 'rough_elec_insp',     label: 'Rough Electrical Inspection' },
    { key: 'carpentry',           label: 'Carpentry Finish' },
    { key: 'paint',               label: 'Paint Completed' },
    { key: 'electrical_finish',   label: 'Electrical Finish' },
    { key: 'final_insp',          label: 'Final Inspection' },
    { key: 'punch',               label: 'Punch List' },
    { key: 'closed',              label: 'Job Closed' },
  ],
  porch_ground_windows: [
    { key: 'hoa',                 label: 'HOA Approval' },
    { key: 'zoning',              label: 'Zoning Permit' },
    { key: 'building',            label: 'Building Permit' },
    { key: 'precon',              label: 'Pre-Con Scheduled' },
    { key: 'start',               label: 'Start Date Given' },
    { key: 'demo_footings',       label: 'Demo and Footings' },
    { key: 'footing_insp',        label: 'Footing Inspection Completed' },
    { key: 'materials',           label: 'Material Ordered' },
    { key: 'roof',                label: 'Roof Complete' },
    { key: 'rough_electrical',    label: 'Rough Electrical Complete' },
    { key: 'rough_building_insp', label: 'Rough Building Inspection' },
    { key: 'rough_elec_insp',     label: 'Rough Electrical Inspection' },
    { key: 'carpentry',           label: 'Carpentry Finish' },
    { key: 'paint',               label: 'Paint Completed' },
    { key: 'electrical_finish',   label: 'Electrical Finish' },
    { key: 'window_delivery',     label: 'Window Delivery' },
    { key: 'windows_glass',       label: 'Windows, Doors and Glass Installed' },
    { key: 'final_insp',          label: 'Final Inspection' },
    { key: 'punch',               label: 'Punch List' },
    { key: 'closed',              label: 'Job Closed' },
  ],
  porch_over_deck: [
    { key: 'hoa',                 label: 'HOA Approval' },
    { key: 'zoning',              label: 'Zoning Permit' },
    { key: 'building',            label: 'Building Permit' },
    { key: 'precon',              label: 'Pre-Con Scheduled' },
    { key: 'start',               label: 'Start Date Given' },
    { key: 'demo_footings',       label: 'Demo and Footings' },
    { key: 'footing_insp',        label: 'Footing Inspection Completed' },
    { key: 'floor_framing_insp',  label: 'Floor Framing Inspection' },
    { key: 'install_decking',     label: 'Install Decking' },
    { key: 'roof_framing',        label: 'Roof Framing Complete' },
    { key: 'rough_electrical',    label: 'Rough Electrical Complete' },
    { key: 'rough_building_insp', label: 'Rough Building Inspection' },
    { key: 'rough_elec_insp',     label: 'Rough Electrical Inspection' },
    { key: 'carpentry',           label: 'Carpentry Finish' },
    { key: 'paint',               label: 'Paint Completed' },
    { key: 'electrical_finish',   label: 'Electrical Finish' },
    { key: 'final_insp',          label: 'Final Inspection' },
    { key: 'punch',               label: 'Punch List' },
    { key: 'closed',              label: 'Job Closed' },
  ],
  porch_over_deck_windows: [
    { key: 'hoa',                 label: 'HOA Approval' },
    { key: 'zoning',              label: 'Zoning Permit' },
    { key: 'building',            label: 'Building Permit' },
    { key: 'precon',              label: 'Pre-Con Scheduled' },
    { key: 'start',               label: 'Start Date Given' },
    { key: 'demo_footings',       label: 'Demo and Footings' },
    { key: 'footing_insp',        label: 'Footing Inspection Completed' },
    { key: 'floor_framing_insp',  label: 'Floor Framing Inspection' },
    { key: 'install_decking',     label: 'Install Decking' },
    { key: 'roof_framing',        label: 'Roof Framing Complete' },
    { key: 'rough_electrical',    label: 'Rough Electrical Complete' },
    { key: 'rough_building_insp', label: 'Rough Building Inspection' },
    { key: 'rough_elec_insp',     label: 'Rough Electrical Inspection' },
    { key: 'carpentry',           label: 'Carpentry Finish' },
    { key: 'paint',               label: 'Paint Completed' },
    { key: 'electrical_finish',   label: 'Electrical Finish' },
    { key: 'window_delivery',     label: 'Window Delivery' },
    { key: 'windows_glass',       label: 'Windows, Doors and Glass Installed' },
    { key: 'final_insp',          label: 'Final Inspection' },
    { key: 'punch',               label: 'Punch List' },
    { key: 'closed',              label: 'Job Closed' },
  ],
  pergola: [
    { key: 'hoa',       label: 'HOA Approval' },
    { key: 'precon',    label: 'Pre-Con Scheduled' },
    { key: 'start',     label: 'Start Date Given' },
    { key: 'materials', label: 'Materials Ordered' },
    { key: 'demo',      label: 'Demo / Site Prep' },
    { key: 'footing',   label: 'Posts & Footings' },
    { key: 'framing',   label: 'Beam & Rafter Install' },
    { key: 'finish',    label: 'Stain / Seal' },
    { key: 'punch',     label: 'Punch List' },
    { key: 'closed',    label: 'Job Closed' },
  ],
  gazebo: [
    { key: 'hoa',        label: 'HOA Approval' },
    { key: 'building',   label: 'Building Permit' },
    { key: 'precon',     label: 'Pre-Con Scheduled' },
    { key: 'start',      label: 'Start Date Given' },
    { key: 'materials',  label: 'Materials Ordered' },
    { key: 'footing',    label: 'Foundation / Footings' },
    { key: 'framing',    label: 'Structure Complete' },
    { key: 'roof',       label: 'Roof Installed' },
    { key: 'finish',     label: 'Stain / Seal / Finish' },
    { key: 'final_insp', label: 'Final Inspection' },
    { key: 'punch',      label: 'Punch List' },
    { key: 'closed',     label: 'Job Closed' },
  ],
  hardscape: [
    { key: 'hoa',        label: 'HOA Approval' },
    { key: 'precon',     label: 'Pre-Con Scheduled' },
    { key: 'start',      label: 'Start Date Given' },
    { key: 'materials',  label: 'Material Ordered' },
    { key: 'excavation', label: 'Excavation and Base' },
    { key: 'pavers',     label: 'Pavers / Stone Installed' },
    { key: 'punch',      label: 'Punch List' },
    { key: 'closed',     label: 'Job Closed' },
  ],
}

// A screen porch, sunroom or Eze-Breeze built on a deck: the office's own
// progression, top to bottom. The enclosure step is named for what the job
// has; LVP, when the job has it, goes in last. A fireplace adds its stone after
// the ceiling and before painting; a gas one also needs the mechanical gas
// line inspected at the framing inspection. Keys the old porch-over-deck
// list used are kept, so steps already checked stay checked.
// It starts with the approvals (HOA, zoning, building permit), so a newly sold
// porch waits in Permitting like any other build. Jobs that were already under
// way before the approvals were added carry jobData.noApprovalSteps.
function porchOnDeckStages(text, proposal) {
  const enclosure = /eze[- ]?breeze/i.test(text) ? 'Eze-Breeze'
    : /screen/i.test(text) ? 'Screen'
    : 'Screen or Eze-Breeze'
  const lvp = /\bLVP\b|luxury vinyl|vinyl plank/i.test(text)
  const fireplace = /fire ?place/i.test(text)
  const gas = fireplace && /\bgas\b|propane|ventless|vent[- ]free|natural gas|\bLP\b/i.test(text)
  const approvals = proposal?.jobData?.noApprovalSteps ? [] : [
    { key: 'hoa',                 label: 'HOA Approval' },
    { key: 'zoning',              label: 'Zoning Permit' },
    { key: 'building',            label: 'Building Permit' },
  ]
  return [
    ...approvals,
    { key: 'demo_footings',       label: 'Demo / Footings' },
    { key: 'footing_insp',        label: 'Footing Inspection' },
    { key: 'materials',           label: 'Material Delivery' },
    { key: 'deck_framing',        label: 'Deck Framing' },
    { key: 'floor_framing_insp',  label: 'Deck Framing Inspection' },
    { key: 'materials_2',         label: 'Material Delivery' },
    { key: 'install_decking',     label: 'Install Decking, Walls and Roof' },
    { key: 'shingles',            label: 'Shingles' },
    { key: 'rough_elec_insp',     label: 'Rough Electrical Inspection' },
    ...(gas ? [{ key: 'rough_mech_insp', label: 'Mechanical Gas Line Inspection' }] : []),
    { key: 'rough_building_insp', label: 'Rough Building Inspection' },
    { key: 'ceiling_trim',        label: 'Ceiling & Trim' },
    ...(fireplace ? [{ key: 'fireplace_stone', label: 'Fireplace Stone' }] : []),
    { key: 'ready_paint',         label: 'Ready for Paint' },
    { key: 'painting',            label: 'Painting' },
    { key: 'paint',               label: 'Painting Complete' },
    { key: 'electrical_finish',   label: 'Electrical Trim' },
    { key: 'gutters',             label: 'Gutters' },
    { key: 'windows_glass',       label: enclosure },
    { key: 'walkthrough',         label: 'Final Walk-through' },
    { key: 'punch',               label: 'Punch List' },
    { key: 'final_elec_insp',     label: 'Final Electrical Inspection' },
    { key: 'final_insp',          label: 'Final Building Inspection' },
    { key: 'touchups',            label: 'Paint Touch-ups / Cleaning' },
    ...(lvp ? [{ key: 'lvp', label: 'LVP Flooring' }] : []),
    { key: 'closed',              label: 'Job Closed' },
  ]
}

// Everything the job says about itself, as one piece of text: project types,
// the quote's lines, the summary, the contract scope and the county permits.
// (The sub app gets this from sub_job_sheet as checklistText.)
function jobScopeText(proposal) {
  if (typeof proposal.checklistText === 'string') return proposal.checklistText
  const d = proposal.contractDraft || {}
  const line = (l) => (typeof l === 'string' ? l : `${l?.name || ''} ${l?.category || ''} ${l?.description || ''} ${l?.text || ''}`)
  return [
    ...(proposal.projectTypes || []), ...(d.projectTypes || []),
    proposal.projectSummary || '',
    ...(proposal.lines || []).map(line), ...(proposal.upgrades || []).map(line),
    ...(d.scopeBullets || []).map(line), ...(d.scopeLines || []).map(line),
    ...((proposal.countyPermit?.permits) || []).map(pm => `${pm?.type || ''} ${pm?.description || ''}`),
  ].join(' \n ')
}

export const JOB_TYPE_OPTIONS = [
  'Porch Conversion',
  'Deck (New)',
  'Deck (Resurface / Rebuild)',
  'Ground Level Porch',
  'Ground Level Porch + Windows',
  'Porch Over Deck',
  'Porch Over Deck + Windows',
  'Pergola',
  'Gazebo',
  'Hardscape / Patio',
]

// The job types picked on the job (Stages tab). A job with two kinds of work
// (a porch conversion and a patio) has both, and gets the steps of both.
// jobData.projectTypeOverride, the single type the app had first, is kept in
// step as the first one picked.
export function jobTypesOf(proposal) {
  const jd = proposal.jobData || {}
  const many = Array.isArray(jd.projectTypeOverrides) ? jd.projectTypeOverrides.filter(t => JOB_TYPE_OPTIONS.includes(t)) : []
  return many.length ? many : jd.projectTypeOverride ? [jd.projectTypeOverride] : []
}

function stagesForType(type, proposal) {
  if (type === 'Porch Conversion')              return STAGE_TEMPLATES.porch_conversion
  if (type === 'Deck (Resurface / Rebuild)')    return STAGE_TEMPLATES.deck_resurface
  if (type === 'Deck (New)')                    return STAGE_TEMPLATES.deck_new
  if (type === 'Ground Level Porch')            return STAGE_TEMPLATES.porch_ground
  if (type === 'Ground Level Porch + Windows')  return STAGE_TEMPLATES.porch_ground_windows
  if (type === 'Porch Over Deck' || type === 'Porch Over Deck + Windows') return porchOnDeckStages(jobScopeText(proposal), proposal)
  if (type === 'Pergola')                       return STAGE_TEMPLATES.pergola
  if (type === 'Gazebo')                        return STAGE_TEMPLATES.gazebo
  if (type === 'Hardscape / Patio')             return STAGE_TEMPLATES.hardscape
  return null
}

// Steps every kind of job has once, whatever each list calls them.
const SHARED_STEPS = new Set(['hoa', 'zoning', 'building', 'precon', 'start', 'materials', 'paint', 'final_insp', 'punch', 'closed'])

// A second job type's steps joined onto the first's. A step both have is kept
// once. A step only the second has goes in just before the next step of its
// own list that is already there, so the second kind of work follows the
// first and they share one ending (punch list, job closed). Two different
// steps that happen to share a key ("framing" on a porch and on a pergola)
// are both kept; the second gets its own key so each is checked off on its own.
function joinStages(first, second, tag) {
  const out = [...first]
  const same = (s) => out.find(x => x.key === s.key && (SHARED_STEPS.has(s.key) || x.label === s.label))
  second.forEach((s, i) => {
    if (same(s)) return
    const step = out.some(x => x.key === s.key) ? { ...s, key: `${s.key}__${tag}` } : s
    if (out.some(x => x.key === step.key)) return
    const next = second.slice(i + 1).map(same).find(Boolean)
    out.splice(next ? out.indexOf(next) : out.length, 0, step)
  })
  return out
}

// The PM's own order (jobData.stageOrder, the step keys top to bottom). A
// step the saved order doesn't know yet (a job type was added since) goes
// right after the step that comes before it in the standard order.
function arrangeStages(list, order) {
  if (!list || !Array.isArray(order) || !order.length) return list
  const byKey = new Map(list.map(s => [s.key, s]))
  const out = [...new Set(order)].filter(k => byKey.has(k)).map(k => byKey.get(k))
  list.forEach((s, i) => {
    if (out.includes(s)) return
    const before = list.slice(0, i).reverse().find(x => out.includes(x))
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, s)
  })
  // Whatever the order, the job closes last
  const closed = out.findIndex(x => x.key === 'closed')
  if (closed >= 0 && closed !== out.length - 1) out.push(...out.splice(closed, 1))
  return out
}

// The PM's own changes to one job's checklist (jobData.checklistEdits):
//   labels  { key: 'New wording' }   a step renamed
//   added   [{ key, label }]          a step of their own (goes in before Job Closed)
//   removed [key]                     a step taken off (Job Closed always stays)
//   custom  true                      built from blank: no standard steps at all
function applyChecklistEdits(list, edits) {
  if (!list || !edits || typeof edits !== 'object') return list
  const labels = edits.labels && typeof edits.labels === 'object' ? edits.labels : {}
  const removed = new Set((Array.isArray(edits.removed) ? edits.removed : []).filter(k => k !== 'closed'))
  const added = (Array.isArray(edits.added) ? edits.added : [])
    .filter(a => a && a.key && String(a.label || '').trim() && !removed.has(a.key) && !list.some(s => s.key === a.key))
    .map(a => ({ key: a.key, label: String(a.label).trim() }))
  const out = list.filter(s => !removed.has(s.key))
  const ci = out.findIndex(s => s.key === 'closed')
  if (ci >= 0) out.splice(ci, 0, ...added); else out.push(...added)
  return out.map(s => (String(labels[s.key] || '').trim() ? { ...s, label: String(labels[s.key]).trim() } : s))
}

export function getStages(proposal) {
  // A checklist the PM built from blank (checklistEdits.custom): only their own steps, then Job Closed
  const custom = !!proposal.jobData?.checklistEdits?.custom
  const base = custom ? [{ key: 'closed', label: 'Job Closed' }] : standardStages(proposal)
  const list = arrangeStages(applyChecklistEdits(base, proposal.jobData?.checklistEdits), proposal.jobData?.stageOrder)
  // "No permit needed": no permit or inspection steps to wait on
  return list && noPermit(proposal) ? list.filter(s => !PERMIT_KEYS.includes(s.key) && !isInspectionKey(s.key)) : list
}

// The job's steps in their standard order, before the PM's own arrangement.
export function standardStages(proposal) {
  // Job types picked on the job card take priority
  const picked = jobTypesOf(proposal).map(t => ({ type: t, list: stagesForType(t, proposal) })).filter(x => x.list)
  if (picked.length) {
    return picked.slice(1).reduce((all, x) => joinStages(all, x.list, x.type.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')), picked[0].list)
  }

  // The quote's project types ("Screen Porches", "Open Deck"…) and the
  // contract's, read the same way
  const ALIAS = { 'open deck': 'Deck', 'screen porches': 'Screened Porch', 'open porches': 'Open Porch', 'porch conversions': 'Porch Conversion',
    'sunrooms': 'Sunroom', 'eze-breeze porches': 'Eze-Breeze Porch' }
  const types = [...new Set([...(proposal.contractDraft?.projectTypes || []), ...(proposal.projectTypes || [])]
    .map(t => ALIAS[String(t).toLowerCase()] || t))]
  const text = jobScopeText(proposal)
  const scope = [
    ...(proposal.contractDraft?.scopeBullets || []),
    ...(proposal.contractDraft?.scopeLines   || []).map(l => (typeof l === 'string' ? l : `${l?.name || ''} ${l?.text || ''}`)),
  ].join(' ')
  const hasWindows = /window|glass|enclos/i.test(scope)

  // A screen porch, sunroom or Eze-Breeze built on a deck: the office's progression
  const enclosed = types.some(t => ['Screened Porch', 'Sunroom', 'Eze-Breeze Porch'].includes(t)) || /eze[- ]?breeze|screen ?eze|screen porch|sunroom/i.test(text)
  const onGround = /ground level|on (a |the )?(concrete )?slab/i.test(text)
  if (enclosed && !onGround && !types.includes('Porch Conversion')) return porchOnDeckStages(text, proposal)

  const isDeckType  = types.some(t => ['Deck', 'Deck (New)', 'Deck (Resurface / Rebuild)'].includes(t))
  const isPorchType = types.some(t => ['Screened Porch', 'Open Porch', 'Ground Level Porch', 'Porch Over Deck'].includes(t))

  if (types.includes('Porch Conversion') || types.includes('Sunroom'))
    return STAGE_TEMPLATES.porch_conversion
  if (types.includes('Deck (Resurface / Rebuild)'))
    return STAGE_TEMPLATES.deck_resurface
  if (types.includes('Porch Over Deck') || (isDeckType && isPorchType))
    return hasWindows ? STAGE_TEMPLATES.porch_over_deck_windows : STAGE_TEMPLATES.porch_over_deck
  if (types.includes('Deck (New)') || types.includes('Deck'))
    return STAGE_TEMPLATES.deck_new
  if (types.includes('Ground Level Porch') || types.includes('Screened Porch') || types.includes('Open Porch'))
    return hasWindows ? STAGE_TEMPLATES.porch_ground_windows : STAGE_TEMPLATES.porch_ground
  if (types.includes('Pergola')) return STAGE_TEMPLATES.pergola
  if (types.includes('Gazebo'))  return STAGE_TEMPLATES.gazebo

  return null  // no type detected — force manual selection
}
