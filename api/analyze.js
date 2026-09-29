/**
 * /api/analyze — QUOTEX line-item extraction
 *
 * Accepts:
 *   { text: string }                          — plain text estimate
 *   { fileData: base64, fileName, mimeType }  — PDF, JPEG, PNG, GIF, WEBP
 *
 * PDFs: text extracted server-side via pdf-parse, then sent to Gemini as text.
 * Images: sent to Gemini via inline vision (base64).
 *
 * Requires env var: GEMINI_API_KEY
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import dotenv from 'dotenv'
import { requireAuth } from './_auth.js'

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') })

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const SYSTEM_PROMPT = `You are a construction estimating assistant. Your job is simple: extract only the line items that have a dollar amount in this estimate. Nothing else becomes a line item.

Return ONLY a valid JSON array (no markdown, no explanation):
[
  {
    "name": "Gable Roof",
    "section": "Gable Roof",
    "description": "Deck, columns, ceiling, rafters, LVL ridge beam, headers, sheathing, felt, shingles, drip edge — all materials and labor included.",
    "qty": 1,
    "unit": "LS",
    "unitPrice": 12500,
    "category": "Roofing",
    "confidence": 95
  }
]

RULES:

1. ONE LINE ITEM PER PRICED ENTRY — only create a JSON object if that item has a dollar amount in the estimate. If "Gable Roof" is priced at $12,500, that is ONE item. Do not split it into deck, rafters, shingles, etc. as separate items.

2. ALL MATERIALS BELONG IN THE DESCRIPTION — every material, component, or task mentioned anywhere under a priced section goes into that section's description field. Use your construction knowledge to identify what belongs to each priced section.

3. NEVER CREATE A NEW LINE ITEM for something that is not separately priced in the original document. If it doesn't have its own dollar amount, it belongs in a description — not as its own item.

4. DESCRIPTION — write as one clean professional sentence or two. No bullet points, no dashes, no line breaks. List all materials and scope that belong to this priced item. Max 500 chars.

5. SECTION — copy the exact name of the priced line from the estimate as the section value.

6. PRICING — use the price exactly as written. If total given with qty > 1, compute unitPrice = total / qty. Never set unitPrice to 0.

7. CATEGORY — assign best matching trade: Fencing, Gates, Demo, Materials, Labor, Framing, Concrete, Electrical, Plumbing, Roofing, Flooring, Drywall, Painting, HVAC, Windows, Doors, Tile, Insulation, Siding, General`

const CATEGORIES = ['Fencing','Gates','Demo','Materials','Labor','Framing','Concrete','Electrical','Plumbing','Roofing','Flooring','Drywall','Painting','HVAC','Windows','Doors','Tile','Insulation','Siding','General']
const UNITS = ['LF','SF','EA','LS']
const IMAGE_TYPES = ['image/jpeg','image/jpg','image/png','image/gif','image/webp']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!(await requireAuth(req, res))) return

  const { text, fileData, fileName, mimeType } = req.body || {}

  if (!text && !fileData) {
    return res.status(400).json({ error: 'Provide text or fileData' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured. Add it to your .env file.' })
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    systemInstruction: SYSTEM_PROMPT,
  })

  try {
    let prompt

    if (fileData) {
      const ext = (fileName?.split('.').pop() || '').toLowerCase()
      const detectedMime = mimeType || guessMime(ext)

      if (detectedMime === 'application/pdf') {
        // Extract text from PDF, then send as text to Gemini
        const buffer = Buffer.from(fileData, 'base64')
        let pdfText = ''
        try {
          const result = await pdfParse(buffer)
          pdfText = result.text?.trim()
        } catch (pdfErr) {
          console.error('pdf-parse error:', pdfErr.message)
          return res.status(400).json({ error: 'Could not read PDF. Make sure it is not password-protected and contains text (not just scanned images).' })
        }

        if (!pdfText) {
          return res.status(400).json({ error: 'PDF appears to be a scanned image with no text layer. Please upload a JPEG or PNG of the estimate instead.' })
        }

        prompt = `Extract all line items from this estimate:\n\n${pdfText}`
      } else if (IMAGE_TYPES.includes(detectedMime)) {
        // Vision — send image inline
        prompt = [
          { inlineData: { data: fileData, mimeType: detectedMime } },
          'Extract all line items from this estimate image.',
        ]
      } else {
        return res.status(400).json({ error: `Unsupported file type: ${ext || detectedMime}. Use PDF, JPEG, or PNG.` })
      }
    } else {
      prompt = `Extract line items from this estimate:\n\n${text}`
    }

    const result = await model.generateContent(prompt)
    const raw = result.response.text()
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    // If response was cut off, trim to last complete object
    let jsonStr = clean
    if (!jsonStr.endsWith(']')) {
      const lastClose = jsonStr.lastIndexOf('}')
      jsonStr = lastClose > 0 ? jsonStr.slice(0, lastClose + 1) + ']' : '[]'
    }

    let items = JSON.parse(jsonStr)

    items = items
      .filter(i => i.name && i.unitPrice > 0)
      .map(i => ({
        name: String(i.name).slice(0, 80),
        section: String(i.section || i.category || 'General').slice(0, 80),
        description: String(i.description || '').slice(0, 600),
        qty: Math.max(0, parseFloat(i.qty) || 1),
        unit: UNITS.includes(i.unit) ? i.unit : 'EA',
        unitPrice: Math.round(parseFloat(i.unitPrice) * 100) / 100,
        category: CATEGORIES.includes(i.category) ? i.category : 'General',
        confidence: Math.min(100, Math.max(0, parseInt(i.confidence) || 70)),
        source: 'ai',
      }))

    return res.status(200).json(items)
  } catch (err) {
    console.error('analyze error:', err)
    const msg = err?.message || 'Analysis failed'
    return res.status(500).json({ error: msg })
  }
}

function guessMime(ext) {
  const map = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  }
  return map[ext] || 'application/octet-stream'
}
