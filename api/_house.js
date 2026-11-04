/* global process */
/**
 * House photo → house description, for the design editor's 3D view.
 *
 * The rep uploads a photo of the back of the customer's house (or a Google Earth
 * screenshot). Claude reads it once and returns the house as numbers and colors:
 * stories, roof pitch, siding, trim and roof colors, wall width, and where the
 * windows sit on the back wall. The 3D engine (public/porch-3d.html) builds that
 * house; the result is saved with the design, so it only runs once per photo.
 *
 * Needs ANTHROPIC_API_KEY on the server. HOUSE_MODEL picks the model
 * (default claude-opus-5-5; claude-sonnet-5-5 costs about half).
 *
 * Not its own serverless function (Vercel Hobby allows 12): an existing function
 * calls houseHandler(req, res) for POST requests that ask for it.
 * Body: { image: <base64 JPEG/PNG/WebP, no data: prefix>, mediaType: 'image/jpeg' }
 */
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from './_auth.js'

const MAX_B64 = 6_000_000          // ~4.5 MB image; the editor sends ~1568 px JPEGs (well under)
const TYPES = ['image/jpeg', 'image/png', 'image/webp']

const COLOR = { type: 'string', description: 'Hex color like #c8b994, as the surface looks in daylight' }
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['usable', 'reason', 'stories', 'walkout', 'siding', 'sidingColor', 'trimColor', 'roofColor', 'roofPitch', 'roofStyle', 'wallWidthFt',
    'lower', 'lowerHeightFt', 'lowerColor', 'chimney', 'chimneyAt', 'chimneyMaterial', 'chimneyColor', 'shutters', 'shutterColor', 'windows', 'doors', 'notes'],
  properties: {
    usable: { type: 'boolean', description: 'false if the photo does not show a house wall clearly enough to describe' },
    reason: { type: 'string', description: 'If not usable, why, in one short sentence for the salesperson. Otherwise empty.' },
    stories: { type: 'integer', enum: [1, 2, 3], description: 'Stories above grade on the wall facing the camera' },
    walkout: { type: 'boolean', description: 'true if a basement level is exposed at grade on this wall (walkout / raised foundation)' },
    siding: { type: 'string', enum: ['vinyl', 'brick', 'stone', 'stucco', 'wood'], description: 'Main wall material' },
    sidingColor: COLOR,
    trimColor: COLOR,
    roofColor: COLOR,
    roofPitch: { type: 'number', description: 'Main roof rise per 12 in of run, e.g. 6 for 6/12. Typical 4-12.' },
    roofStyle: { type: 'string', enum: ['gable-side', 'gable-front', 'hip'], description: 'Main roof over the wall facing the camera: gable-side = the ridge runs along this wall (eave and gutter along its top, triangular gables at the ends); gable-front = a triangular gable on this wall (ridge points at the camera); hip = slopes on all four sides, no gables' },
    lower: { type: 'string', enum: ['none', 'brick', 'stone'], description: 'A different material on the lower part of the wall (brick or stone wainscot / lower story), else none' },
    lowerHeightFt: { type: 'number', description: 'Height of that lower material from the ground, in feet (0 if none)' },
    lowerColor: COLOR,
    chimney: { type: 'string', enum: ['none', 'left', 'right', 'back', 'roof'], description: 'A visible chimney: on the left or right end wall (as seen in the photo), on the wall facing the camera, or coming up through the roof' },
    chimneyAt: { type: 'number', description: 'For back or roof: chimney centre along the wall, 0 = left end, 1 = right end. Otherwise 0.5' },
    chimneyMaterial: { type: 'string', enum: ['brick', 'stone', 'siding'] },
    chimneyColor: COLOR,
    shutters: { type: 'boolean', description: 'true if the windows have shutters' },
    shutterColor: COLOR,
    wallWidthFt: { type: 'number', description: 'Estimated width of the main wall facing the camera, in feet (a standard door is 3 ft wide, 6 ft 8 in tall)' },
    windows: {
      type: 'array',
      description: 'Windows on the main wall facing the camera, left to right as seen in the photo',
      items: {
        type: 'object', additionalProperties: false, required: ['center', 'story', 'widthFt', 'heightFt'],
        properties: {
          center: { type: 'number', description: 'Window centre along the wall: 0 = left end, 1 = right end, as seen in the photo' },
          story: { type: 'integer', description: '1 = first floor above grade (or main floor over a walkout), 2 = second floor' },
          widthFt: { type: 'number' },
          heightFt: { type: 'number' },
        },
      },
    },
    doors: {
      type: 'array',
      description: 'Doors on the main wall facing the camera (sliding patio doors, entry doors)',
      items: {
        type: 'object', additionalProperties: false, required: ['center', 'kind'],
        properties: {
          center: { type: 'number', description: '0 = left end, 1 = right end, as seen in the photo' },
          kind: { type: 'string', enum: ['slider', 'entry'] },
        },
      },
    },
    notes: { type: 'string', description: 'One short sentence on anything the salesperson should check (e.g. bay window, chimney, wall partly hidden by trees). Empty if nothing.' },
  },
}

const SYSTEM = `You look at a photo of the outside of a customer's house for a deck and porch builder. A 3D model of their house is built from your description, with the new porch or deck attached to the wall that faces the camera. Describe only what you can see; when something is hidden, give the most likely value for this style of house. Measure against things of known size: a door is 3 ft wide and 6 ft 8 in tall, a story is about 9-10 ft, vinyl siding courses are about 4-5 in. Colors are how the surface looks in daylight, not shadowed.`

let _client = null
const client = () => _client || (_client = new Anthropic())

export async function houseHandler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!(await requireAuth(req, res))) return
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'House matching is not connected yet (no ANTHROPIC_API_KEY on the server).' })

  const { image, mediaType, widthFt } = req.body || {}
  const known = Number(widthFt) > 0 && Number(widthFt) < 200 ? Number(widthFt) : 0
  if (typeof image !== 'string' || !image || image.length > MAX_B64) return res.status(400).json({ error: 'Send one photo (JPEG, PNG or WebP) under 4 MB.' })
  if (!TYPES.includes(mediaType)) return res.status(400).json({ error: 'Photo must be JPEG, PNG or WebP.' })

  try {
    const response = await client().beta.messages.create({
      model: process.env.HOUSE_MODEL || 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
          { type: 'text', text: known ? `Describe this house so we can model it in 3D. The wall facing the camera measures ${known} ft wide; size and place everything against that.` : 'Describe this house so we can model it in 3D.' },
        ],
      }],
    })
    if (response.stop_reason === 'refusal') return res.status(422).json({ error: 'Could not read this photo. Try a different one.' })
    if (response.stop_reason === 'max_tokens') return res.status(502).json({ error: 'The house description was cut off. Try again.' })
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('')
    let house
    try { house = JSON.parse(text) } catch { return res.status(502).json({ error: 'Could not read the house description. Try again.' }) }
    if (!house.usable) return res.status(422).json({ error: house.reason || 'The photo does not show the house clearly enough.' })
    const out = clean(house)
    if (known) out.wallWidthFt = known                     // the measured width wins over the estimate
    return res.status(200).json({ house: out, model: response.model })
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return res.status(503).json({ error: 'The Anthropic API key on the server was not accepted.' })
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Busy right now. Try again in a minute.' })
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `House matching failed (${err.status}). Try again.` })
    return res.status(500).json({ error: 'House matching failed. Try again.' })
  }
}

// Keep the numbers in a sane range before they reach the 3D model.
const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d }
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : d)
function clean(h) {
  return {
    stories: clamp(h.stories, 1, 3, 1) | 0,
    walkout: !!h.walkout,
    siding: ['vinyl', 'brick', 'stone', 'stucco', 'wood'].includes(h.siding) ? h.siding : 'vinyl',
    sidingColor: hex(h.sidingColor, '#c8b994'),
    trimColor: hex(h.trimColor, '#f2f1ec'),
    roofColor: hex(h.roofColor, '#4a4b4f'),
    roofPitch: clamp(h.roofPitch, 3, 14, 6),
    roofStyle: ['gable-side', 'gable-front', 'hip'].includes(h.roofStyle) ? h.roofStyle : 'gable-side',
    lower: ['brick', 'stone'].includes(h.lower) ? h.lower : 'none',
    lowerHeightFt: clamp(h.lowerHeightFt, 1, 12, 3),
    lowerColor: hex(h.lowerColor, '#9c4a36'),
    chimney: ['left', 'right', 'back', 'roof'].includes(h.chimney) ? h.chimney : 'none',
    chimneyAt: clamp(h.chimneyAt, 0, 1, 0.5),
    chimneyMaterial: ['brick', 'stone', 'siding'].includes(h.chimneyMaterial) ? h.chimneyMaterial : 'brick',
    chimneyColor: hex(h.chimneyColor, '#9c4a36'),
    shutters: !!h.shutters,
    shutterColor: hex(h.shutterColor, '#2a2a2a'),
    wallWidthFt: clamp(h.wallWidthFt, 16, 120, 44),
    windows: (Array.isArray(h.windows) ? h.windows : []).slice(0, 24).map(w => ({
      center: clamp(w.center, 0, 1, 0.5), story: clamp(w.story, 1, 3, 1) | 0, widthFt: clamp(w.widthFt, 1.5, 12, 3), heightFt: clamp(w.heightFt, 1.5, 8, 4.5),
    })),
    doors: (Array.isArray(h.doors) ? h.doors : []).slice(0, 6).map(d => ({ center: clamp(d.center, 0, 1, 0.5), kind: d.kind === 'entry' ? 'entry' : 'slider' })),
    notes: String(h.notes || '').slice(0, 300),
  }
}
