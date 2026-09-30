#!/usr/bin/env node
// Verifies that src/contract/deckPlusAgreement.js reproduces the attorney-
// reviewed contract WORD FOR WORD. Compares the word sequence of every string
// in the module (in page order) against the text extracted from the source PDF.
//
//   node scripts/verify-contract-text.mjs path/to/2026_CONTRACTOR_AGREEMENT.pdf
//
// Exit 0 = identical. Otherwise prints the first divergence with context.
import fs from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import * as A from '../src/contract/deckPlusAgreement.js'

const pdfPath = process.argv[2]
if (!pdfPath) { console.error('usage: node scripts/verify-contract-text.mjs <contract.pdf>'); process.exit(2) }

// ── Source text ─────────────────────────────────────────────────────────────
const data = new Uint8Array(fs.readFileSync(pdfPath))
const doc = await pdfjs.getDocument({ data }).promise
const pageText = []
for (let p = 1; p <= doc.numPages; p++) {
  const page = await doc.getPage(p)
  const tc = await page.getTextContent()
  let last = null, t = ''
  for (const it of tc.items) {
    if (it.str === undefined) continue
    if (last && Math.abs(it.transform[5] - last.transform[5]) > 2) t += '\n'
    else if (last && it.transform[4] - (last.transform[4] + last.width) > 2) t += ' '
    t += it.str
    last = it
  }
  // Not contract text: DocuSign's per-page envelope footer.
  t = t.replace(/Docusign Envelope ID: [0-9A-F-]+/g, '')
  // Superscripts come out on their own line: "1\nst \npunch" → "1st punch".
  t = t.replace(/(\d)\n(st|nd|rd|th) ?\n/gi, '$1$2 ')
  pageText.push(t + '\n')
}
// Pages 1–8 read top to bottom; pages 9–12 are grid forms whose cells the PDF
// text layer emits column-wise, so those are compared as per-page word sets.
const src = pageText.slice(0, 8).join('')
// [page, export, checkboxes drawn as small images in the source (the rest are
// Wingdings ☐ glyphs in the text layer); counted from the page's XObject draws]
const GRID_PAGES = [[9, 'PORCH_FORM', 17], [10, 'DECK_FORM', 10], [11, 'PATIO_FORM', 7], [12, 'PROCESSING_FORM', 2]]
// Page 8's header ("ELECTRICAL SPECIFICATIONS", "CLIENT NAME:", "CONTRACT #:")
// is artwork in the source, so its words are not in the text layer.
const ARTWORK_WORDS = ['ELECTRICAL SPECIFICATIONS', 'CLIENT NAME:', 'CONTRACT #:']

// ── Module text, in page order ──────────────────────────────────────────────
const strs = []
const walk = (v) => {
  if (typeof v === 'string') strs.push(v)
  else if (Array.isArray(v)) v.forEach(walk)
  else if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (['when','key','id','role','w','center','date','page','version','title','n','dateLabel','initialLabel'].includes(k)) continue; walk(v[k]) }
}
// Emit strings in the order the renderer prints them (labels included).
const sigCols = (cols) => { const lines = []; if (cols.some(c => c.heading)) lines.push(cols.map(c => c.heading || '').join(' ')); lines.push(cols.map(c => c.dateLabel || '').join(' ')); lines.push(cols.map(c => c.label).join(' ')); return lines }
const initialsTable = (items) => items.flatMap(it => [A.INITIALS.initialLabel, it.text, ...(it.lines || [])])
walk([A.AGREEMENT.heading, A.AGREEMENT.clauses, A.AGREEMENT.signatureLine])
walk([A.SCOPE_CLARIFICATION.heading, A.SCOPE_CLARIFICATION.intro, A.SCOPE_CLARIFICATION.bullets, A.SCOPE_CLARIFICATION.finalPaymentNote, A.SCOPE_CLARIFICATION.bullets2, A.SCOPE_CLARIFICATION.signatureLine])
walk([A.INITIALS.header, A.INITIALS.instruction, initialsTable(A.INITIALS.items1), A.INITIALS.instruction, initialsTable(A.INITIALS.items2), initialsTable(A.INITIALS.items3), A.INITIALS.yesNoInstruction, A.INITIALS.yesNo.map(y => y.text), sigCols(A.INITIALS.signatureColumns)])
walk([A.UNFORESEEN.heading, A.UNFORESEEN.projectName, A.UNFORESEEN.intro, A.UNFORESEEN.bullets, A.UNFORESEEN.closing, A.UNFORESEEN.acknowledgment, sigCols(A.UNFORESEEN.signatureColumns)])
walk(A.ELECTRICAL_FORM)
let mod = strs.join('\n')
const gridMod = (name) => { const before = strs.length; walk(A[name]); return strs.splice(before).join('\n') }

// ── Normalize both sides to a word list ─────────────────────────────────────
const norm = (s) => s
  .replace(/<\/?(b|i|u|sup)>/g, '')          // inline markup
  .replace(/\{\{[^}]*\}\}/g, ' ')            // fill-in blanks / checkboxes
  .replace(/_{2,}/g, ' ')                    // underscore blanks in the source
  .replace(/[•☐\uf0a8]/g, ' ')               // bullets / box glyphs (U+F0A8 = Wingdings checkbox)
  .replace(/[‘’]/g, '’')      // curly apostrophes
  .replace(/[“”]/g, '"')           // curly quotes
  .replace(/\s+/g, ' ')
  .trim()
  .split(' ')
  .filter(Boolean)

let srcWords = norm(src)
let modWords = norm(mod)
// Drop the artwork-only words from the module side before comparing.
for (const phrase of ARTWORK_WORDS) {
  const pw = norm(phrase)
  for (let i = 0; i <= modWords.length - pw.length; i++) {
    if (pw.every((w, j) => modWords[i + j] === w)) { modWords.splice(i, pw.length); break }
  }
}

// Signature labels appear in the source as "Client: ____ Date:" etc. Both sides
// carry them, so no special handling. Compare as ordered word sequences.
let i = 0, j = 0, diffs = 0
while (i < srcWords.length && j < modWords.length) {
  if (srcWords[i] === modWords[j]) { i++; j++; continue }
  diffs++
  console.log(`\nDIVERGENCE #${diffs} at source word ${i} / module word ${j}`)
  console.log('  source: …' + srcWords.slice(Math.max(0, i - 6), i + 8).join(' ') + '…')
  console.log('  module: …' + modWords.slice(Math.max(0, j - 6), j + 8).join(' ') + '…')
  // Resync: try skipping one word on either side.
  if (srcWords[i + 1] === modWords[j]) i++
  else if (srcWords[i] === modWords[j + 1]) j++
  else { i++; j++ }
  if (diffs >= 25) { console.log('… stopping after 25 divergences'); break }
}
if (i < srcWords.length && diffs < 25) { diffs++; console.log('\nSOURCE has extra words at the end: ' + srcWords.slice(i, i + 20).join(' ')) }
if (j < modWords.length && diffs < 25) { diffs++; console.log('\nMODULE has extra words at the end: ' + modWords.slice(j, j + 20).join(' ')) }

console.log(`\npages 1–8 — source words: ${srcWords.length}   module words: ${modWords.length}   divergences: ${diffs}`)

// ── Grid forms: same words, same counts, per page ───────────────────────────
for (const [pg, name, imageBoxes] of GRID_PAGES) {
  const modRaw = gridMod(name)
  const a = norm(pageText[pg - 1]), b = norm(modRaw)
  const count = (ws) => ws.reduce((m, w) => (m[w] = (m[w] || 0) + 1, m), {})
  const ca = count(a), cb = count(b)
  const missing = [], extra = []
  for (const w of new Set([...a, ...b])) {
    const d = (ca[w] || 0) - (cb[w] || 0)
    if (d > 0) missing.push(`${w}×${d}`)
    if (d < 0) extra.push(`${w}×${-d}`)
  }
  // Checkboxes: every ☐ / Wingdings box in the source must be a {{check:…}} in the module.
  const srcBoxes = (pageText[pg - 1].match(/[☐\uf0a8]/g) || []).length + imageBoxes
  const modBoxes = (modRaw.match(/\{\{check:/g) || []).length
  const ok = !missing.length && !extra.length && srcBoxes === modBoxes
  if (!ok) diffs++
  console.log(`page ${pg} ${name} — source words: ${a.length}   module words: ${b.length}   checkboxes ${srcBoxes}/${modBoxes}   ${ok ? 'OK' : ''}`)
  if (missing.length) console.log('  missing from module: ' + missing.join(' '))
  if (extra.length) console.log('  extra in module:     ' + extra.join(' '))
}
if (diffs === 0) console.log('OK — module text matches the source word for word.')
process.exit(diffs === 0 ? 0 : 1)
