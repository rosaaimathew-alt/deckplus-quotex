/**
 * /api/ai-chat — server-side AI proxy (Google Gemini, free tier).
 *
 * All browser AI (catalog assistant, scope generation, estimate analysis,
 * Sales Suggest, statement import) routes through here so the API key stays on
 * the server and is never shipped in the frontend bundle.
 *
 * Uses GEMINI_API_KEY (free from Google AI Studio). Falls back to
 * ANTHROPIC_API_KEY (Claude) if that's what's configured instead.
 *
 * Body: { system?: string, messages: [{role, content}], maxTokens?: number }
 *   content may be a plain string or a content array (for vision/images).
 */
import { GoogleGenerativeAI } from '@google/generative-ai'
import { requireAuth } from './_auth.js'

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

// Remembers a model we've confirmed works, so we don't re-discover on every call
// (survives within a warm serverless instance).
let _groqModelCache = null

// Convert our Anthropic-style messages into Gemini "contents".
function toGeminiContents(messages) {
  return messages.map(m => {
    const role = m.role === 'assistant' ? 'model' : 'user'
    if (typeof m.content === 'string') return { role, parts: [{ text: m.content }] }
    const parts = (m.content || []).map(part => {
      if (part?.type === 'text') return { text: part.text || '' }
      if (part?.type === 'image' && part.source?.data) {
        return { inlineData: { mimeType: part.source.media_type || 'image/jpeg', data: part.source.data } }
      }
      return { text: '' }
    })
    return { role, parts }
  })
}

// Flatten our Anthropic-style messages into OpenAI chat format (text only).
function toOpenAIMessages(system, messages) {
  const out = []
  if (system) out.push({ role: 'system', content: system })
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'assistant' : 'user'
    const content = typeof m.content === 'string'
      ? m.content
      : (m.content || []).map(p => (p?.type === 'text' ? p.text : typeof p === 'string' ? p : '')).join('\n')
    out.push({ role, content })
  }
  return out
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!(await requireAuth(req, res))) return

  const { system, messages, maxTokens } = req.body || {}
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages required' })
  }

  // Groq / any OpenAI-compatible free provider takes priority when configured.
  const groqKey = process.env.GROQ_API_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY

  try {
    if (groqKey) {
      const base = process.env.OPENAI_BASE_URL || 'https://api.groq.com/openai/v1'
      const authHdr = { 'Content-Type': 'application/json', Authorization: `Bearer ${groqKey}` }
      const callModel = (model) => fetch(`${base}/chat/completions`, {
        method: 'POST', headers: authHdr,
        body: JSON.stringify({ model, max_tokens: maxTokens || 4096, messages: toOpenAIMessages(system, messages) }),
      })

      const preferred = process.env.GROQ_MODEL || _groqModelCache || 'llama-3.1-8b-instant'
      let r = await callModel(preferred)
      let j = await r.json().catch(() => ({}))

      // Self-heal: if the model is unknown/unavailable for this key, ask the
      // provider what IS available and retry once with a usable chat model.
      if (!r.ok && /model|does not exist|not found|access|decommission/i.test(j.error?.message || '')) {
        try {
          const lr = await fetch(`${base}/models`, { headers: authHdr })
          const lj = await lr.json().catch(() => ({}))
          const ids = (lj.data || []).map(m => m.id).filter(Boolean)
          const usable = ids.filter(id => !/whisper|guard|tts|embed|vision|prompt/i.test(id))
          const pick = usable.find(id => /instant|8b/i.test(id)) || usable.find(id => /llama/i.test(id)) || usable[0] || ids[0]
          if (pick && pick !== preferred) {
            _groqModelCache = pick
            r = await callModel(pick)
            j = await r.json().catch(() => ({}))
          }
        } catch { /* fall through to the error below */ }
      } else if (r.ok) {
        _groqModelCache = preferred
      }

      if (!r.ok) return res.status(500).json({ error: j.error?.message || `AI request failed (${r.status})` })
      return res.status(200).json({ text: j.choices?.[0]?.message?.content || '' })
    }

    if (geminiKey) {
      const genAI = new GoogleGenerativeAI(geminiKey)
      const model = genAI.getGenerativeModel({
        // Overridable via env so a Google model rename never needs a code change.
        model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
        systemInstruction: system || undefined,
      })
      const result = await model.generateContent({
        contents: toGeminiContents(messages),
        generationConfig: { maxOutputTokens: maxTokens || 4096 },
      })
      return res.status(200).json({ text: result.response.text() || '' })
    }

    if (anthropicKey) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const anthropic = new Anthropic({ apiKey: anthropicKey })
      const resp = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: maxTokens || 4096,
        system: system || undefined,
        messages,
      })
      return res.status(200).json({ text: resp.content?.[0]?.text || '' })
    }

    return res.status(500).json({ error: 'No AI key configured. Add a free GEMINI_API_KEY on the server.' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
