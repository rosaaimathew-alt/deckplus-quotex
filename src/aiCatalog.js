// Runs catalog AI tasks in token-safe CHUNKS so we never exceed the free-tier
// per-minute token cap (Groq free ≈ 12K tokens/min). One big request that sends
// the whole catalog blows the cap; many small sequential requests don't.
import { getModel } from './gemini'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const isRateLimit = (msg) => /rate.?limit|\b429\b|per minute|tokens per|quota|too many/i.test(msg || '')

// Pull a <changes>[...]</changes> JSON array out of an AI reply (or []).
export function extractChanges(text) {
  const m = String(text || '').match(/<changes>([\s\S]*?)<\/changes>/)
  if (!m) return []
  try { const c = JSON.parse(m[1].trim()); return Array.isArray(c) ? c : [] } catch { return [] }
}

// Run buildPrompt(chunk) over the catalog in chunks, sequentially and paced, with
// backoff+retry on rate-limit errors. Returns { changes, text } — changes deduped
// by id (later chunks win), text = the first non-empty conversational reply.
export async function runOverCatalog(catalog, { system, buildPrompt, history = [], chunkSize = 50, onProgress } = {}) {
  const model = getModel(system)
  const items = Array.isArray(catalog) ? catalog : []
  const chunks = []
  for (let i = 0; i < items.length; i += chunkSize) chunks.push(items.slice(i, i + chunkSize))
  if (chunks.length === 0) chunks.push([])

  const all = []
  let firstText = ''
  for (let ci = 0; ci < chunks.length; ci++) {
    let attempt = 0
    while (true) {
      try {
        const chat = model.startChat({ history })
        const res = await chat.sendMessage(buildPrompt(chunks[ci]))
        const text = res.response.text()
        if (!firstText) { const clean = text.replace(/<changes>[\s\S]*?<\/changes>/, '').trim(); if (clean) firstText = clean }
        all.push(...extractChanges(text))
        break
      } catch (e) {
        if (isRateLimit(e.message) && attempt < 4) { attempt++; await sleep(Math.min(30000, 7000 * attempt)); continue }
        if (isRateLimit(e.message)) throw new Error('Hit the free-tier AI rate limit — wait a minute and try again.')
        throw e
      }
    }
    onProgress?.(ci + 1, chunks.length)
    if (ci < chunks.length - 1) await sleep(1500)   // stay under the rolling per-minute cap
  }

  const byId = new Map()
  for (const c of all) if (c && c.id != null) byId.set(c.id, { ...(byId.get(c.id) || {}), ...c })
  return { changes: [...byId.values()], text: firstText }
}
