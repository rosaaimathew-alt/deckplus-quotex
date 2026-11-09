/* global process */
/**
 * Property address → the job-info blanks on the contract packet: subdivision,
 * beds, baths, and the water / energy / gas providers.
 *
 * Claude searches the web (county GIS and tax records, listing sites, the
 * utilities' service-area pages) and hands the answers back through one tool
 * call. Blank means it couldn't confirm the answer; the rep fills it in. The
 * contract page runs this once per address and saves the result on the
 * proposal, so a contract opened again doesn't search again.
 *
 * Needs ANTHROPIC_API_KEY on the server. PROPERTY_MODEL picks the model
 * (default claude-opus-5-5).
 *
 * Not its own serverless function (Vercel Hobby allows 12): api/ai-chat.js
 * calls propertyHandler(req, res) for ?task=property.
 * Body: { address: '123 Maple Lane, Waxhaw, NC 28173', county?: 'Union' }
 */
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from './_auth.js'

export const PROPERTY_FIELDS = ['subdivision', 'beds', 'baths', 'waterProvider', 'energyProvider', 'gasProvider']

const FIELD = (description) => ({ type: 'string', description })
const RECORD_TOOL = {
  name: 'record_property_info',
  description: 'Save what you found about the property. Call it once, at the end. Use an empty string for anything you could not confirm.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: PROPERTY_FIELDS,
    properties: {
      subdivision:    FIELD('Subdivision / neighborhood name as the county records or plat show it, e.g. "Brackenbury". Empty if none or not found.'),
      beds:           FIELD('Number of bedrooms, digits only, e.g. "4". Empty if not found.'),
      baths:          FIELD('Number of bathrooms, e.g. "2.5" (a half bath counts .5). Empty if not found.'),
      waterProvider:  FIELD('Who supplies water at this address, e.g. "Charlotte Water", "Union County Water", "Private well". Empty if not found.'),
      energyProvider: FIELD('Electric utility at this address, e.g. "Duke Energy", "Union Power Cooperative", "York Electric Cooperative". Empty if not found.'),
      gasProvider:    FIELD('Natural gas utility at this address, e.g. "Piedmont Natural Gas", "York County Natural Gas". "None" if the street has no natural gas service. Empty if not found.'),
    },
  },
}

const SYSTEM = `You fill in the job-information blanks of a construction contract for Deck Plus, a deck and porch builder in the Charlotte, NC area (North and South Carolina). For the property address you are given, find:
- the subdivision name and the number of bedrooms and bathrooms (county GIS / tax assessor records first, then real-estate listing sites);
- the water, electric and natural-gas providers that serve that exact address (city or county utility pages, electric cooperative service-area maps).
Search briefly; a few searches are enough. Only report what the sources support for this address. When you are done, call record_property_info once with your answers, leaving a field empty when you could not confirm it.`

let _client = null
const client = () => _client || (_client = new Anthropic())

// Keep each answer short and plain before it lands in the contract.
export function cleanPropertyInfo(raw = {}) {
  const out = {}
  for (const k of PROPERTY_FIELDS) {
    let v = String(raw?.[k] ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)
    if (/^(unknown|n\/?a|not (found|available|listed)|none found|-+)$/i.test(v)) v = ''
    if ((k === 'beds' || k === 'baths') && v) {
      const m = /\d+(?:\.\d+)?/.exec(v)
      v = m && Number(m[0]) > 0 && Number(m[0]) < 30 ? m[0] : ''
    }
    out[k] = v
  }
  return out
}

export async function propertyHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!(await requireAuth(req, res))) return
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'Property lookup is not connected yet (no ANTHROPIC_API_KEY on the server).' })

  const address = String(req.body?.address || '').trim().slice(0, 200)
  const county = String(req.body?.county || '').trim().slice(0, 40)
  if (address.length < 8) return res.status(400).json({ error: 'Send the property address.' })

  const messages = [{ role: 'user', content: `Property address: ${address}${county ? ` (${county} County)` : ''}` }]
  try {
    // The function has 60 s; stop the search in time to answer.
    const deadline = Date.now() + 50_000
    for (let turn = 0; turn < 4; turn++) {
      const left = deadline - Date.now()
      if (left < 5_000) break
      const response = await client().beta.messages.create({
        model: process.env.PROPERTY_MODEL || 'claude-opus-5-5',
        max_tokens: 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: SYSTEM,
        output_config: { effort: 'low' },
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }, RECORD_TOOL],
        messages,
      }, { timeout: left, maxRetries: 0 })
      if (response.stop_reason === 'refusal') return res.status(422).json({ error: 'Could not look up this address.' })
      const call = response.content.find(b => b.type === 'tool_use' && b.name === RECORD_TOOL.name)
      if (call) return res.status(200).json({ info: cleanPropertyInfo(call.input), model: response.model })
      messages.push({ role: 'assistant', content: response.content })
      // A paused server-side search resumes when its turn is sent back as-is.
      if (response.stop_reason === 'pause_turn') continue
      messages.push({ role: 'user', content: 'Call record_property_info now with what you found.' })
    }
    return res.status(504).json({ error: 'The property lookup ran out of time. Fill the blanks in by hand.' })
  } catch (err) {
    if (err instanceof Anthropic.APIConnectionTimeoutError) return res.status(504).json({ error: 'The property lookup ran out of time. Fill the blanks in by hand.' })
    if (err instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: 'The Anthropic API key on the server was not accepted.' })
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Busy right now. Try again in a minute.' })
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `Property lookup failed (${err.status}).` })
    return res.status(500).json({ error: 'Property lookup failed.' })
  }
}
