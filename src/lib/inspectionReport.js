// ── Weekly inspection report (Projects › Inspections › Print weekly report) ──
// A printable page for the weekly job-progress meeting: every ongoing
// Mecklenburg job, grouped by PM, with where each inspection stands, what
// happened in the past 7 days, what's next, and only the latest note on file.
import { BOARD_COLUMNS, boardCells, inspectionLabel } from './permitTracking'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const md = (d) => { if (!d) return ''; const [, m, day] = d.split('-'); return `${Number(m)}/${Number(day)}` }
const long = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const MARK = { pass: '✓', fail: '✗', sched: '◷', void: '–' }

// "8/4/2026 4:35 PM" (as the county writes it) → sortable
const noteTime = (at, fallback) => {
  const t = Date.parse(at || '')
  return Number.isNaN(t) ? Date.parse(`${fallback || ''}T12:00:00`) || 0 : t
}

// The most recent note on the job: the county inspectors' notes and the
// office's own recorded results, whichever is latest.
export function lastNote(proposal) {
  let best = null
  const consider = (n) => { if (n.text && (!best || n.t > best.t)) best = n }
  for (const p of proposal.countyPermit?.permits || []) {
    for (const ins of p.completed || []) {
      for (const n of ins.notes || []) {
        consider({ t: noteTime(n.at, ins.date), date: ins.date, by: n.by || ins.inspector, what: `${ins.code} - ${ins.name}`, result: ins.result, text: n.text })
      }
    }
  }
  for (const [, rec] of Object.entries(proposal.jobData?.inspections || {})) {
    for (const a of rec.attempts || []) {
      if (a.notes) consider({ t: noteTime('', a.date), date: a.date, by: a.inspector || 'Office', what: '', result: a.result, text: a.notes })
    }
  }
  return best
}

// Inspections resulted or scheduled between from and to (ISO dates, inclusive).
function activity(proposal, from, to) {
  const out = []
  for (const p of proposal.countyPermit?.permits || []) {
    for (const ins of p.completed || []) if (ins.date >= from && ins.date <= to) out.push({ ...ins, kind: 'done' })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

function nextUp(proposal) {
  const manual = proposal.jobData?.nextInspection
  if (manual?.code) return `${inspectionLabel(manual.code)}${manual.date ? ` · ${md(manual.date)}` : ''}`
  const up = (proposal.countyPermit?.permits || []).flatMap(p => p.upcoming || []).sort((a, b) => (a.date || '').localeCompare(b.date || ''))[0]
  return up ? `${up.code} - ${up.name} · ${up.date ? md(up.date) : 'TBD'} (county)` : ''
}

export function buildWeeklyReportHtml({ jobs, company = '', now = new Date() }) {
  const to = iso(now)
  const fromD = new Date(now); fromD.setDate(fromD.getDate() - 6)
  const from = iso(fromD)

  const rows = jobs.map(({ p, type, pm, building }) => {
    const cells = boardCells(p)
    const week = activity(p, from, to)
    const failed = Object.values(cells).some(c => c.state === 'fail')
    return { p, type, pm: pm || 'not assigned', building, cells, week, failed, next: nextUp(p), note: lastNote(p) }
  }).sort((a, b) => a.pm.localeCompare(b.pm) || String(a.p.client).localeCompare(String(b.p.client)))

  const allWeek = rows.flatMap(r => r.week)
  const passed = allWeek.filter(i => /^pass/i.test(i.result)).length
  const failedWk = allWeek.filter(i => /fail|partial|inaccessible/i.test(i.result)).length
  const scheduled = rows.filter(r => r.next).length
  const cols = BOARD_COLUMNS.filter(c => rows.some(r => r.cells[c.key]))

  const groups = []
  for (const r of rows) {
    if (!groups.length || groups[groups.length - 1].pm !== r.pm) groups.push({ pm: r.pm, rows: [] })
    groups[groups.length - 1].rows.push(r)
  }

  const cellHtml = (c) => c?.state
    ? `<span class="c ${c.state}" title="${esc(c.result)}">${MARK[c.state]} ${md(c.date)}</span>`
    : '<span class="c none">·</span>'

  const rowHtml = (r) => `
    <tr class="${r.failed ? 'failed' : ''}">
      <td class="job">
        <b>${esc(r.p.client)}</b>${r.failed ? ' <span class="flag">FAILED</span>' : ''}
        ${r.type ? `<div class="type">${esc(r.type)}</div>` : ''}
        <div class="sub">${esc(r.p.address)}</div>
        <div class="sub mono">${esc(r.building?.record || r.p.imported?.permit || '')}${r.building?.recordStatus ? ` · ${esc(r.building.recordStatus)}` : ''}</div>
      </td>
      ${cols.map(c => `<td class="cell">${cellHtml(r.cells[c.key])}</td>`).join('')}
      <td class="wk">${r.week.length ? r.week.map(i => `<div>${md(i.date)} ${esc(i.code)} <b class="${/^pass/i.test(i.result) ? 'ok' : 'bad'}">${esc(i.result)}</b></div>`).join('') : '<span class="muted">—</span>'}</td>
      <td class="next">${r.next ? esc(r.next) : '<span class="muted">—</span>'}</td>
      <td class="note">${r.note
        ? `<div class="meta">${r.note.date ? md(r.note.date) : ''} · ${esc(r.note.by || '')}${r.note.what ? ` · ${esc(r.note.what)}` : ''}${r.note.result ? ` (${esc(r.note.result)})` : ''}</div>${esc(r.note.text)}`
        : '<span class="muted">No notes</span>'}</td>
    </tr>`

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Weekly inspection report ${md(from)}–${md(to)}</title>
<style>
  @page { size: letter landscape; margin: 0.4in; }
  * { box-sizing: border-box; }
  body { font: 11px/1.35 -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; margin: 0; padding: 16px; }
  h1 { font-size: 18px; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px; }
  .muted { color: #999; }
  .stats { display: flex; gap: 14px; margin: 6px 0 10px; font-size: 12px; }
  .stats b { font-size: 14px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #555; border-bottom: 1px solid #999; padding: 4px; }
  td { border-bottom: 1px solid #ddd; padding: 5px 4px; vertical-align: top; }
  tr { page-break-inside: avoid; }
  tr.failed td { background: #fff1f1; }
  .pmrow td { background: #f2f2f2; font-weight: 700; font-size: 12px; padding: 5px 6px; border-bottom: 1px solid #999; }
  .job b { font-size: 12px; }
  .type { color: #333; } .sub { color: #777; font-size: 10px; } .mono { font-family: ui-monospace, Menlo, monospace; }
  .flag { color: #b00; font-size: 9px; font-weight: 700; border: 1px solid #b00; border-radius: 3px; padding: 0 3px; }
  th.cell, td.cell { width: 54px; text-align: center; white-space: nowrap; }
  .c { display: inline-block; min-width: 46px; white-space: nowrap; border-radius: 4px; padding: 1px 2px; font-size: 10px; border: 1px solid; }
  .c.pass { background: #dcfce7; border-color: #86efac; } .c.fail { background: #fee2e2; border-color: #fca5a5; }
  .c.sched { background: #dbeafe; border-color: #93c5fd; } .c.void { background: #f3f4f6; border-color: #d1d5db; color: #666; }
  .c.none { border-color: transparent; color: #ccc; }
  .wk { width: 120px; } .next { width: 120px; } .note { width: 32%; }
  .ok { color: #15803d; } .bad { color: #b91c1c; }
  .meta { color: #555; font-size: 10px; margin-bottom: 2px; }
  .legend { margin-top: 8px; color: #666; font-size: 9px; }
  @media print { .noprint { display: none; } body { padding: 0; } }
  .noprint { margin-bottom: 10px; }
  .noprint button { font: inherit; font-size: 12px; padding: 6px 12px; border-radius: 6px; border: 1px solid #111; background: #111; color: #fff; cursor: pointer; }
</style></head>
<body>
  <div class="noprint"><button onclick="window.print()">Print / Save as PDF</button></div>
  <div class="head">
    <div>
      <h1>Weekly inspection report</h1>
      <div>${esc(company)}${company ? ' · ' : ''}Mecklenburg County · ${long(from)} – ${long(to)}</div>
    </div>
    <div class="muted">Printed ${now.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
  </div>
  <div class="stats">
    <span><b>${rows.length}</b> ongoing jobs</span>
    <span><b class="ok">${passed}</b> inspections passed this week</span>
    <span><b class="bad">${failedWk}</b> failed / inaccessible this week</span>
    <span><b>${rows.filter(r => r.failed).length}</b> jobs with a failed inspection open</span>
    <span><b>${scheduled}</b> with a next inspection set</span>
  </div>
  <table>
    <thead><tr>
      <th>Job</th>
      ${cols.map(c => `<th class="cell" title="${esc(c.title)}">${esc(c.label)}</th>`).join('')}
      <th class="wk">This week</th><th class="next">Next inspection</th><th class="note">Last note on file</th>
    </tr></thead>
    <tbody>
      ${groups.map(g => `<tr class="pmrow"><td colspan="${cols.length + 4}">PM ${esc(g.pm)} · ${g.rows.length} job${g.rows.length === 1 ? '' : 's'}</td></tr>${g.rows.map(rowHtml).join('')}`).join('')}
    </tbody>
  </table>
  <div class="legend">✓ passed · ✗ failed / inaccessible / partial (latest result) · ◷ scheduled at the county · – cancelled.
    ${cols.map(c => `${esc(c.label)} ${esc(c.title.toLowerCase())}`).join(' · ')}.</div>
</body></html>`
}
