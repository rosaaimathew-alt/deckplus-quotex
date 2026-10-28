// ── Contract → PDF file, one page at a time ──────────────────────────────────
// Builds the PDF in the browser instead of going through the print dialog, so
// what's on screen is exactly what's in the file on every browser. Each page is
// drawn on its own small canvas: Safari refuses canvases over ~16.7M pixels, so
// one tall canvas for a 16-page contract comes out blank there.
//
// root: the element holding the document. Every `[data-pdf-block]` inside it
// starts on a new page (the contract's `.dp-page` sections count as blocks).
// A block taller than a page is laid out again as separate pages made of whole
// paragraphs, list items and table rows (a table's header repeats), each with
// its own margins, so no line is ever cut and every page has the same margins.

const PAGE_W_PX = 816              // 8.5in at 96px/in
const PAGE_H_PX = 1056             // 11in
const PIXEL_RATIO = 2
const MARGIN_PX = 48               // 0.5in page margin
const CONTENT_H_PX = PAGE_H_PX - 2 * MARGIN_PX
const MAX_SHRINK = 1.15            // shrink a page up to ~13% to keep it on one sheet

// Things a page never splits.
const WHOLE = 'p, li, tr, h1, h2, h3, h4, h5, img, svg, canvas, .dp-sigcols, .dp-sigline, .dp-yesno, [data-pdf-cut]'
const HEADING = 'h1, h2, h3, h4, h5'

const isSafari = () => /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent)

async function snapshot(toCanvas, el) {
  const opts = { pixelRatio: PIXEL_RATIO, backgroundColor: '#ffffff', width: PAGE_W_PX }
  // Safari draws images inside the snapshot only from the second pass on.
  if (isSafari()) await toCanvas(el, opts)
  return toCanvas(el, opts)
}

const hasOwnText = (el) => Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())

// The pieces a block is made of, in order: anything that must stay whole,
// small, or holds text of its own is one piece; bigger containers are opened up.
function pieces(el, out = []) {
  for (const child of el.children) {
    if (getComputedStyle(child).display === 'none') continue
    if (child.tagName === 'THEAD') continue          // repeated on every page with its table
    const whole = child.matches(WHOLE) || hasOwnText(child) || !child.children.length || child.getBoundingClientRect().height <= 64
    if (whole) out.push(child)
    else pieces(child, out)
  }
  return out
}

// Split a laid-out block into page-sized groups of pieces.
function paginate(block) {
  const top = block.getBoundingClientRect().top
  const items = pieces(block).map(el => {
    const r = el.getBoundingClientRect()
    return { el, top: r.top - top, bottom: r.bottom - top }
  }).filter(it => it.bottom > it.top)
  const pages = []
  let page = [], pageTop = 0
  for (const it of items) {
    if (page.length && it.bottom - pageTop > CONTENT_H_PX) {
      // A heading — or the first line of a section that carries on overleaf —
      // goes with what follows it.
      const last = page[page.length - 1].el
      const opensSection = last.parentElement !== block && last.parentElement.contains(it.el) &&
        page.filter(p => last.parentElement.contains(p.el)).length === 1
      const carry = page.length > 1 && (last.matches(HEADING) || opensSection) ? [page.pop()] : []
      pages.push(page)
      page = carry
      pageTop = (carry[0] || it).top
    }
    if (!page.length) pageTop = it.top
    page.push(it)
  }
  if (page.length) pages.push(page)
  // A last page holding only a few lines goes onto the page before, shrunk a little.
  if (pages.length > 1) {
    const prev = pages[pages.length - 2], tail = pages[pages.length - 1]
    if (tail[tail.length - 1].bottom - prev[0].top <= CONTENT_H_PX * MAX_SHRINK) pages.splice(-2, 2, [...prev, ...tail])
  }
  return pages
}

// One page's pieces, inside copies of their containers (a table keeps its header).
function buildPage(block, group) {
  const pageEl = block.cloneNode(false)
  const copies = new Map([[block, pageEl]])
  const holder = (node) => {
    if (copies.has(node)) return copies.get(node)
    const parent = holder(node.parentElement)
    const copy = node.cloneNode(false)
    if (node.tagName === 'TABLE') {
      const head = Array.from(node.children).find(c => c.tagName === 'THEAD')
      if (head) copy.appendChild(head.cloneNode(true))
    }
    parent.appendChild(copy)
    copies.set(node, copy)
    return copy
  }
  for (const { el } of group) holder(el.parentElement).appendChild(el.cloneNode(true))
  return pageEl
}

function pageStyle(el) {
  el.style.minHeight = '0'
  el.style.width = `${PAGE_W_PX}px`
  el.style.margin = '0'
  el.style.padding = `${MARGIN_PX}px`
  el.style.breakBefore = 'auto'
}

// only: print just these sections (e.g. the scope of work); drop: leave these out.
export async function buildContractPdf(root, { only, drop } = {}) {
  const { toCanvas } = await import('html-to-image')
  const { default: jsPDF } = await import('jspdf')

  // Lay a copy out at letter width, off to the side, so the PDF doesn't depend
  // on the size of the window it was made in.
  const overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;top:0;left:-${PAGE_W_PX * 2}px;width:${PAGE_W_PX}px;pointer-events:none;background:#fff;z-index:-1;`
  const clone = root.cloneNode(true)
  clone.style.cssText = `width:${PAGE_W_PX}px;max-width:${PAGE_W_PX}px;margin:0;padding:0;border-radius:0;box-shadow:none;overflow:visible;background:#fff;`
  clone.querySelectorAll('.no-print').forEach(el => el.remove())
  if (drop) clone.querySelectorAll(drop).forEach(el => el.remove())
  clone.querySelectorAll('.print-only').forEach(el => { el.style.display = el.tagName === 'SPAN' ? 'inline' : 'block' })
  // Wide tables (the audit log) fit the page instead of scrolling off its edge.
  clone.querySelectorAll('[data-pdf-block] .overflow-x-auto').forEach(el => { el.style.overflow = 'visible'; el.style.margin = '0' })
  clone.querySelectorAll('[data-pdf-block] table').forEach(t => {
    t.style.width = '100%'
    // Long values (emails, IPs, hashes) may wrap anywhere; short ones stay on one line.
    t.querySelectorAll('td, th').forEach(c => { c.style.whiteSpace = 'normal'; if (c.textContent.length > 16) c.style.overflowWrap = 'anywhere' })
  })
  overlay.appendChild(clone)
  document.body.appendChild(overlay)

  try {
    await Promise.all(Array.from(clone.querySelectorAll('img')).map(img =>
      img.complete && img.naturalWidth > 0 ? (img.decode?.().catch(() => {}) ?? Promise.resolve()) : new Promise(r => { img.onload = img.onerror = r })))
    if (document.fonts?.ready) await document.fonts.ready

    const blocks = Array.from(clone.querySelectorAll(only || '.dp-page, [data-pdf-block]'))
      .filter(el => !el.parentElement.closest(only || '.dp-page, [data-pdf-block]'))
    if (!blocks.length) {
      if (only) throw new Error('This contract has no scope of work page.')
      blocks.push(clone)
    }

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true })
    const pageW = pdf.internal.pageSize.getWidth()
    const ptPerPx = pageW / PAGE_W_PX
    let first = true
    // Draw one laid-out page element onto its own PDF page, shrunk to fit if needed.
    const addPage = async (el) => {
      const h = el.getBoundingClientRect().height
      const canvas = await snapshot(toCanvas, el)
      if (!first) pdf.addPage()
      first = false
      const img = canvas.toDataURL('image/jpeg', 0.92)
      if (h <= PAGE_H_PX) pdf.addImage(img, 'JPEG', 0, 0, pageW, h * ptPerPx)
      else {
        const w = pageW * (PAGE_H_PX / h)
        pdf.addImage(img, 'JPEG', (pageW - w) / 2, 0, w, PAGE_H_PX * ptPerPx)
      }
    }

    for (const block of blocks) {
      pageStyle(block)
      const height = block.getBoundingClientRect().height
      // Fits on one sheet (or nearly: shrink it rather than leave a few lines alone).
      if (height <= PAGE_H_PX * MAX_SHRINK) { await addPage(block); continue }
      // Too long: lay it out again as whole pages, each in the block's place so
      // the contract's styles still apply.
      for (const group of paginate(block)) {
        const pageEl = buildPage(block, group)
        pageStyle(pageEl)
        block.parentElement.insertBefore(pageEl, block)
        block.style.display = 'none'
        try { await addPage(pageEl) } finally { pageEl.remove(); block.style.display = '' }
      }
    }
    return pdf
  } finally {
    document.body.removeChild(overlay)
  }
}

export async function downloadContractPdf(root, fileName) {
  const pdf = await buildContractPdf(root)
  pdf.save(fileName)
}

// Just the scope of work, without prices or the payment schedule — for the
// HOA / architectural review packet.
export async function downloadScopePdf(root, fileName) {
  const pdf = await buildContractPdf(root, { only: '.dp-scope', drop: '.dp-scope-prices' })
  pdf.save(fileName)
}
export const scopeFileName = (contractNum, client) =>
  `Scope-of-Work-${contractNum || ''}-${client || 'Client'}.pdf`.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-')

export const signedContractFileName = (record) => {
  const name = record?.contractData?.dp?.values?.clientName || record?.contractData?.client || 'Client'
  return `Contract-${record?.contractNum || ''}-${name}-signed.pdf`.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-')
}
