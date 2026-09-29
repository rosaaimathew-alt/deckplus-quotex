// Natural-language → structured build spec. Powers the "Quick Build" box: a
// contractor types OR dictates (Wispr Flow) a job and we either fill a single
// parametric tool (deck / porch conversion) OR assemble a whole proposal from
// the catalog (the "playground"). Uses the app's server-proxied AI.
import { getModel } from './gemini'

const SYSTEM = `You convert a contractor's spoken job description into a structured build spec for an estimating tool.
Return ONLY a JSON object — no prose, no markdown, no code fences.

Two modes:

MODE "tool" — a SINGLE parametric item: an open deck, OR an Eze-Breeze porch CONVERSION/RETROFIT
(adding windows to an EXISTING porch — no new structure/floor/electrical mentioned):
{ "mode":"tool", "tool":"deck"|"porch", "width":ft, "depth":ft, "height":ft,
  "collection":"decking product matched to AVAILABLE COLLECTIONS", "railing":bool,
  "stairs":bool, "fascia":bool, "border":"None"|"Single"|"Double", "doors":n, "wallHeight":inches }

MODE "catalog" — a NEW BUILD assembled from multiple catalog pieces:
{ "mode":"catalog", "width":ft, "depth":ft, "roofType":"gable"|"cathedral"|"shed"|null,
  "newBuild":true, "wallHeight":inches_or_null, "doors":n_or_null,
  "items":[ { "kind":"structure"|"lvp"|"floor"|"cable_rail"|"eze_breeze_windows"|"electrical_package"|"other",
              "text":"the phrase the contractor used",
              "match":"the EXACT name from CATALOG ITEMS that best fits, copied verbatim, or null" } ] }

Rules:
- "16 by 16", "16x16" → width 16, depth 16. First number = width.
- A "gable/cathedral/shed roof Eze-Breeze porch" is a NEW BUILD → mode "catalog"; include BOTH a "structure" item AND an "eze_breeze_windows" item.
- kind "lvp" ONLY when the floor is literally LVP / luxury vinyl plank.
- kind "floor" for a composite/wood decking porch floor (TimberTech, Trex, PT wood, etc.) — match it to the porch-floor collection catalog item (often named "… Porch Floor Upgrade").
- kind "cable_rail" only for cable railing. kind "electrical_package" for a standard electrical/lighting package. kind "eze_breeze_windows" for the Eze-Breeze window units. kind "structure" for the roofed porch shell.
- EVERYTHING the contractor names must appear as an item. For anything not a known kind, use kind "other" and set "match" to the closest CATALOG ITEM name (or null if truly none fits).
- Always set "match" to an exact catalog name when a reasonable one exists — this is how items get pulled. Omit fields not stated. Never invent prices or dimensions.`

export async function parseBuildSpec(text, { collections = [], catalog = [] } = {}) {
  const clean = (text || '').trim()
  if (!clean) throw new Error('Say or type a job, e.g. "16 by 16 gable roof Eze-Breeze porch with LVP floors and cable rails".')
  const model = getModel(SYSTEM)
  const names = catalog.slice(0, 400).map(n => `- ${n}`).join('\n')
  const prompt = `AVAILABLE COLLECTIONS: ${collections.length ? collections.join(', ') : '(none configured)'}\n\nCATALOG ITEMS:\n${names || '(none)'}\n\nJOB: ${clean}`
  // The parse returns a small JSON spec, so cap the completion low — Groq counts
  // the reserved output tokens against the per-minute limit, and 8192 blew past it.
  const out = await model.generateContent(prompt, { maxTokens: 1200 })
  const raw = out.response.text()
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Could not read that. Try rephrasing the job.')
  let spec
  try { spec = JSON.parse(match[0]) } catch { throw new Error('Could not read that. Try rephrasing the job.') }
  if (!spec.mode) spec.mode = Array.isArray(spec.items) && spec.items.length ? 'catalog' : 'tool'
  if (spec.mode === 'tool' && !spec.tool) spec.tool = /porch|breeze|window/i.test(clean) ? 'porch' : 'deck'
  return spec
}
