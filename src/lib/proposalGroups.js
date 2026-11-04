// ── One client = one group of proposals ─────────────────────────────────────
// Every count of "clients" (win rate, open pipeline, the proposal list) groups
// proposals the same way: versions linked by revision history — however deep,
// and even when the version they were copied from is a draft, archived or
// deleted — plus estimates for the same client name by the same rep.
// Each group: { root (earliest), revisions (the rest, oldest first), all }.

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()
const created = (p) => new Date(p.createdAt || p.sentAt || 0).getTime() || 0

export function clientGroups(proposals = []) {
  const up = new Map()
  const add = (k) => { if (!up.has(k)) up.set(k, k) }
  const find = (k) => { while (up.get(k) !== k) { up.set(k, up.get(up.get(k))); k = up.get(k) } return k }
  const join = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) up.set(ra, rb) }
  for (const p of proposals) {
    const k = `p:${p.id}`
    add(k)
    if (p.parentId != null && p.parentId !== '') join(k, `p:${p.parentId}`)
    const name = norm(p.client)
    if (name) join(k, `c:${p.ownerId || ''}:${name}`)
  }
  const byKey = new Map()
  for (const p of proposals) {
    const r = find(`p:${p.id}`)
    if (!byKey.has(r)) byKey.set(r, [])
    byKey.get(r).push(p)
  }
  return [...byKey.values()].map(all => {
    all.sort((a, b) => created(a) - created(b))
    return { root: all[0], revisions: all.slice(1), all }
  })
}

// One proposal per client: the won version if one was won, else the latest.
export function latestIterations(proposals = []) {
  return clientGroups(proposals).map(({ all }) => all.find(p => p.status === 'Won') || all[all.length - 1])
}
