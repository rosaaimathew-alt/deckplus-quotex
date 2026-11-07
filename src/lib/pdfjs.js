// ── PDF reader, loaded only when a PDF is read ──────────────────────────────
// pdf.js is big and its regular build needs very recent browsers, so it is
// never part of the app's startup: Finance and Analyze load it the first time
// someone drops in a PDF. The "legacy" build carries its own polyfills, so it
// also works on older Safari / Chrome (e.g. an older Mac).
let ready = null
export function loadPdfjs() {
  if (!ready) {
    ready = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
    ]).then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default
      return lib
    })
    ready.catch(() => { ready = null })
  }
  return ready
}
