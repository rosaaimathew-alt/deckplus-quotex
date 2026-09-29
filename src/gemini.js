// AI adapter — all calls go through the server proxy at /api/ai-chat so the
// Anthropic API key lives only on the server and is never shipped to the
// browser. The provider (Claude) is unchanged from the client's perspective.

async function callAI({ system, messages, maxTokens }) {
  const res = await fetch('/api/ai-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages, maxTokens }),
  })
  let data
  try {
    data = await res.json()
  } catch {
    throw new Error(`AI request failed (${res.status})`)
  }
  if (!res.ok) throw new Error(data.error || `AI request failed (${res.status})`)
  return data.text || ''
}

// Normalize a prompt (string | array-with-inlineData) into Anthropic content.
function toContent(prompt, fallback) {
  if (Array.isArray(prompt)) {
    const imgPart = prompt.find(p => p?.inlineData)
    const txtPart = prompt.find(p => typeof p === 'string') || fallback
    if (imgPart) {
      return [
        { type: 'image', source: { type: 'base64', media_type: imgPart.inlineData.mimeType, data: imgPart.inlineData.data } },
        { type: 'text', text: txtPart },
      ]
    }
    return txtPart
  }
  return prompt
}

// ── getModel — Chat + Catalog + Scope ─────────────────────────────────────────
export function getModel(systemInstruction) {
  return {
    startChat({ history = [] }) {
      const normalized = history.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }))
      return {
        async sendMessage(text) {
          const messages = [...normalized, { role: 'user', content: text }]
          const out = await callAI({ system: systemInstruction, messages, maxTokens: 4096 })
          return { response: { text: () => out } }
        },
      }
    },
    async generateContent(prompt, opts = {}) {
      const content = toContent(prompt, 'Extract all line items.')
      const out = await callAI({ system: systemInstruction, messages: [{ role: 'user', content }], maxTokens: opts.maxTokens || 8192 })
      return { response: { text: () => out } }
    },
  }
}

// ── getAnalyzeModel — Analyze page ────────────────────────────────────────────
export function getAnalyzeModel(systemInstruction) {
  return {
    async generateContent(prompt) {
      const content = toContent(prompt, 'Extract all line items from this estimate.')
      const out = await callAI({ system: systemInstruction, messages: [{ role: 'user', content }], maxTokens: 8192 })
      return { response: { text: () => out } }
    },
  }
}
