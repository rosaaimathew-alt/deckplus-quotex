// ── Signed contract → PDF file, one page at a time ───────────────────────────
// Builds the PDF in the browser instead of going through the print dialog, so
// what's on screen is exactly what's in the file on every browser. Each page is
// drawn on its own small canvas: Safari refuses canvases over ~16.7M pixels, so
// one tall canvas for a 16-page contract comes out blank there.
//
// root: the element holding the document. Every `[data-pdf-block]` inside it
// starts on a new page (the contract's `.dp-page` sections count as blocks);
// a block taller than a page continues onto the next one, ending each page
// under a whole paragraph / row / line rather than through it.

const PAGE_W_PX = 816              // 8.5in at 96px/in
const PAGE_H_PX = 1056             // 11in
const PIXEL_RATIO = 2
const MARGIN_PX = 48               // 0.5in page margin
const MAX_SHRINK = 1.15            // shrink a page up to ~13% to keep it on one sheet

const isSafari = () => /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent)

async function blockCanvas(toCanvas, el) {
  const opts = { pixelRatio: PIXEL_RATIO, backgroundColor: '#ffffff', width: PAGE_W_PX }
  // Safari draws images inside the snapshot only from the second pass on.
  if (isSafari()) await toCanvas(el, opts)
  return toCanvas(el, opts)
}

export async function downloadContractPdf(root, fileName) {
  const { toCanvas } = await import('html-to-image')
  const { default: jsPDF } = await import('jspdf')

  // Lay a copy out at letter width, off to the side, so the PDF doesn't depend
  // on the size of the window it was made in.
  const overlay = document.createElement('div')
  overlay.style.cssText = `position:fixed;top:0;left:-${PAGE_W_PX * 2}px;width:${PAGE_W_PX}px;pointer-events:none;background:#fff;z-index:-1;`
  const clone = root.cloneNode(true)
  clone.style.cssText = `width:${PAGE_W_PX}px;max-width:${PAGE_W_PX}px;margin:0;border-radius:0;box-shadow:none;overflow:visible;background:#fff;`
  clone.querySelectorAll('.no-print').forEach(el => el.remove())
  clone.querySelectorAll('.print-only').forEach(el => { el.style.display = el.tagName === 'SPAN' ? 'inline' : 'block' })
  overlay.appendChild(clone)
  document.body.appendChild(overlay)

  try {
    await Promise.all(Array.from(clone.querySelectorAll('img')).map(img =>
      img.complete && img.naturalWidth > 0 ? (img.decode?.().catch(() => {}) ?? Promise.resolve()) : new Promise(r => { img.onload = img.onerror = r })))
    if (document.fonts?.ready) await document.fonts.ready

    const blocks = Array.from(clone.querySelectorAll('.dp-page, [data-pdf-block]'))
      .filter(el => !el.parentElement.closest('.dp-page, [data-pdf-block]'))
    if (!blocks.length) blocks.push(clone)

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter', compress: true })
    const pageW = pdf.internal.pageSize.getWidth()
    const ptPerPx = pageW / PAGE_W_PX
    let first = true

    for (const block of blocks) {
      block.style.minHeight = '0'
      block.style.width = `${PAGE_W_PX}px`
      block.style.margin = '0'
      block.style.padding = `${MARGIN_PX}px`
      const top = block.getBoundingClientRect().top
      // Stop under the last thing on the page, not at the bottom of its padding.
      const contentBottom = Math.max(0, ...Array.from(block.querySelectorAll('*')).map(el => el.getBoundingClientRect().bottom - top))
      const height = Math.ceil(Math.min(block.getBoundingClientRect().height, contentBottom + MARGIN_PX))
      // Places a page may end: under a whole paragraph, row, heading or image.
      const cuts = Array.from(block.querySelectorAll('p, li, tr, h1, h2, h3, img, .dp-clause, .dp-sigcols, [data-pdf-cut]'))
        .map(el => el.getBoundingClientRect().bottom - top).filter(y => y > 0).sort((a, b) => a - b)

      const canvas = await blockCanvas(toCanvas, block)
      const scale = canvas.height / height

      // A page only a little too tall is shrunk onto one sheet rather than
      // leaving a few lines on a page of their own.
      if (height > PAGE_H_PX && height <= PAGE_H_PX * MAX_SHRINK) {
        if (!first) pdf.addPage()
        first = false
        const w = pageW * (PAGE_H_PX / height)
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (pageW - w) / 2, 0, w, PAGE_H_PX * ptPerPx)
        continue
      }

      let y = 0
      while (y < height - 1) {
        let next = Math.min(y + PAGE_H_PX, height)
        if (next < height) {
          const fit = cuts.filter(c => c > y + PAGE_H_PX * 0.6 && c <= y + PAGE_H_PX)
          if (fit.length) next = fit[fit.length - 1]
        }
        const sliceH = Math.max(1, Math.round((next - y) * scale))
        const page = document.createElement('canvas')
        page.width = canvas.width
        page.height = sliceH
        const ctx = page.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, page.width, page.height)
        ctx.drawImage(canvas, 0, Math.round(y * scale), canvas.width, sliceH, 0, 0, canvas.width, sliceH)
        if (!first) pdf.addPage()
        first = false
        pdf.addImage(page.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, (next - y) * ptPerPx)
        y = next
      }
    }
    pdf.save(fileName)
  } finally {
    document.body.removeChild(overlay)
  }
}

export const signedContractFileName = (record) => {
  const name = record?.contractData?.dp?.values?.clientName || record?.contractData?.client || 'Client'
  return `Contract-${record?.contractNum || ''}-${name}-signed.pdf`.replace(/[^\w.-]+/g, '-').replace(/-+/g, '-')
}
