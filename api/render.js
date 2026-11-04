/**
 * /api/render — photo render of a 3D builder view.
 *
 * Accepts: { image: base64 JPEG/PNG (no data: prefix), mimeType, description }
 * Returns: { image: base64, mimeType }
 *
 * The 3D builder (public/porch-3d.html) sends a screenshot of the current
 * view. Gemini's image model repaints it as a photo, keeping the geometry,
 * dimensions and camera angle, so the porch/deck stays what was quoted.
 *
 * Requires env var: GEMINI_API_KEY (the same key /api/analyze uses).
 * Optional: GEMINI_IMAGE_MODEL (default gemini-2.5-flash-image).
 */
/* global process */
import { requireAuth } from './_auth.js'

const MODEL = () => process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image'
const MAX_B64 = 4_000_000   // stays under Vercel's 4.5 MB request limit

const PROMPT = (desc) => `Turn this 3D model screenshot into a photorealistic exterior photograph of the same scene, as if taken with a professional camera on a sunny afternoon.

Keep EXACTLY the same camera angle, framing, house, and every built element: the same posts, headers, roof shape and pitch, windows, doors, screens, railings, stairs, deck boards, patio and their positions, sizes and proportions. Do not add, remove, move or resize any structural element. Keep the same colors and materials.

Make it look real: true-to-life wood-grain composite decking with subtle board seams, crisp painted trim, real vinyl siding or brick with soft shadows, architectural asphalt shingles, natural lawn with depth, realistic shrubs and mature trees, soft natural sunlight with accurate shadows and ambient occlusion, clean glass with gentle reflections. No people, no text, no watermark.

Project: ${desc || 'a new porch and deck on the back of a house'}.`

export const config = { api: { bodyParser: { sizeLimit: '4.5mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!(await requireAuth(req, res))) return

  const key = process.env.GEMINI_API_KEY
  if (!key) return res.status(500).json({ error: 'GEMINI_API_KEY is not set on the server.' })

  const { image, mimeType = 'image/jpeg', description = '' } = req.body || {}
  if (!image || typeof image !== 'string') return res.status(400).json({ error: 'Send the view as a base64 image.' })
  if (image.length > MAX_B64) return res.status(413).json({ error: 'The view image is too large. Try a smaller window.' })
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) return res.status(400).json({ error: 'Use a JPEG, PNG or WEBP image.' })

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL())}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [
          { inline_data: { mime_type: mimeType, data: image } },
          { text: PROMPT(String(description).slice(0, 600)) },
        ] }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      }),
    })
    const data = await r.json().catch(() => ({}))
    if (!r.ok) {
      const msg = data?.error?.message || `Gemini returned ${r.status}`
      const quota = r.status === 429 || /quota|billing|free tier/i.test(msg)
      return res.status(quota ? 429 : 502).json({
        error: quota
          ? 'The Gemini key has no image-render allowance left. Image renders may need billing turned on for the key in Google AI Studio.'
          : msg,
      })
    }
    const parts = data?.candidates?.[0]?.content?.parts || []
    const img = parts.find(p => p.inlineData || p.inline_data)
    const out = img && (img.inlineData || img.inline_data)
    if (!out?.data) {
      const text = parts.map(p => p.text).filter(Boolean).join(' ').slice(0, 300)
      return res.status(502).json({ error: `No image came back${text ? `: ${text}` : '.'}` })
    }
    return res.status(200).json({ image: out.data, mimeType: out.mimeType || out.mime_type || 'image/png' })
  } catch (err) {
    return res.status(502).json({ error: `Render failed: ${err.message}` })
  }
}
