// Uptime check for deckplus.app — run by the hourly monitor (and by hand after
// every deploy):  node scripts/uptime-check.mjs [https://deckplus.app]
//
// Checks what customers and the team actually hit: the server health check
// (storage + the canary proposal), a proposal link opened exactly the way a
// customer's link opens, and the main pages. Prints one PASS/FAIL line per
// check and exits 1 if anything failed.
const base = (process.argv[2] || 'https://deckplus.app').replace(/\/$/, '')
const UA = { 'user-agent': 'headless-uptime-monitor' }   // "headless" → not counted as a customer open

const results = []
async function check(name, fn) {
  try {
    const detail = await fn()
    results.push({ name, ok: true, detail })
  } catch (err) {
    results.push({ name, ok: false, detail: err.message })
  }
}
async function get(path, opts = {}) {
  const r = await fetch(base + path, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20000), ...opts })
  const text = await r.text()
  return { status: r.status, text, json: (() => { try { return JSON.parse(text) } catch { return null } })() }
}

await check('Server health (storage + proposal store)', async () => {
  const r = await get('/api/sign/health')
  if (r.status !== 200 || !r.json?.ok) throw new Error(`HTTP ${r.status}: ${r.text.slice(0, 300)}`)
  // The live site must be built from main: when another branch was published
  // over it (Oct 23) customers' proposal links broke.
  const want = process.env.EXPECT_BRANCH
  if (want && r.json.branch !== want) throw new Error(`the live site is running branch "${r.json.branch}" (commit ${r.json.commit}), not ${want}`)
  return `live commit ${r.json.commit || '?'} from ${r.json.branch || '?'}`
})
await check('Customer proposal link (API)', async () => {
  const r = await get('/api/sign/popen-health-canary')
  if (r.status !== 200 || !r.json?.snapshot) throw new Error(`HTTP ${r.status}: ${r.text.slice(0, 300)}`)
  return 'opens'
})
for (const [name, path, must] of [
  ['Customer proposal link (page)', '/p/health-canary', '<div id="root"'],
  ['Login page', '/login', '<div id="root"'],
  ['Booking page', '/book', '<html'],
]) {
  await check(name, async () => {
    const r = await get(path)
    if (r.status !== 200 || !r.text.includes(must)) throw new Error(`HTTP ${r.status}`)
    return 'loads'
  })
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`)
const failed = results.filter(r => !r.ok)
console.log(failed.length ? `\nALERT: ${failed.length} check(s) failing on ${base}` : `\nALL OK on ${base}`)
process.exit(failed.length ? 1 : 0)
