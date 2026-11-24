// ── Weekly inspection report (Projects › Inspections › Print weekly report) ──
// A printable page for the weekly job-progress meeting: every ongoing
// Mecklenburg job, grouped by PM, with where each inspection stands, what
// happened in the past 7 days, what's next, and only the latest note on file.
import { BOARD_COLUMNS, boardCells, inspectionLabel, allPermits, jobCounty, jobJurisdiction } from './permitTracking'

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const md = (d) => { if (!d) return ''; const [, m, day] = d.split('-'); return `${Number(m)}/${Number(day)}` }
const long = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const MARK = { pass: '✓', partial: '◐', fail: '✗', sched: '◷', void: '–' }

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
  for (const p of allPermits(proposal)) {
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
  for (const p of allPermits(proposal)) {
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

  const countyNames = [...new Set(rows.map(r => jobCounty(r.p)).filter(Boolean))].sort()
  const counties = countyNames.length === 1 ? `${countyNames[0]} County` : countyNames.length ? `${countyNames.join(', ')} counties` : ''
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

  // One column of chips — only the inspections this job has — so the page
  // fits on letter paper however many inspection types are in use.
  const chips = (r) => {
    const list = cols.filter(c => r.cells[c.key]?.state)
    return list.length
      ? list.map(c => { const x = r.cells[c.key]; return `<span class="c ${x.state}" title="${esc(c.title)}: ${esc(x.result)}"><b>${esc(c.label)}</b> ${MARK[x.state]} ${md(x.date)}</span>` }).join('')
      : '<span class="muted">none yet</span>'
  }

  const rowHtml = (r) => `
    <tr class="${r.failed ? 'failed' : ''}">
      <td class="job">
        <b>${esc(r.p.client)}</b>${r.failed ? ' <span class="flag">FAILED</span>' : ''}
        ${r.type ? `<div class="type">${esc(r.type)}</div>` : ''}
        <div class="sub">${esc(r.p.address)}${jobCounty(r.p) ? ` · ${esc(jobCounty(r.p))}${r.p.imported?.jurisdiction ? ` (${esc(r.p.imported.jurisdiction)})` : ''}` : ''}</div>
        <div class="sub"><span class="mono">${esc(r.building?.record || r.p.imported?.permit || '')}</span>${r.building?.recordStatus ? ` · ${esc(r.building.recordStatus)}` : ''}</div>
      </td>
      <td class="ins">${chips(r)}</td>
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
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #555; border-bottom: 1px solid #999; padding: 4px; }
  td { border-bottom: 1px solid #ddd; padding: 5px 4px; vertical-align: top; }
  tr { page-break-inside: avoid; }
  tr.failed td { background: #fff1f1; }
  .pmrow td { background: #f2f2f2; font-weight: 700; font-size: 12px; padding: 5px 6px; border-bottom: 1px solid #999; }
  .job b { font-size: 12px; }
  .type { color: #333; } .sub { color: #777; font-size: 10px; } .mono { font-family: ui-monospace, Menlo, monospace; }
  .flag { color: #b00; font-size: 9px; font-weight: 700; border: 1px solid #b00; border-radius: 3px; padding: 0 3px; }
  td.ins { line-height: 1.9; }
  .c { display: inline-block; white-space: nowrap; border-radius: 4px; padding: 0 4px; margin: 0 3px 0 0; font-size: 10px; line-height: 1.5; border: 1px solid; }
  .c b { font-weight: 700; }
  .c.pass { background: #dcfce7; border-color: #86efac; } .c.fail { background: #fee2e2; border-color: #fca5a5; } .c.partial { background: #fef3c7; border-color: #fcd34d; }
  .c.sched { background: #dbeafe; border-color: #93c5fd; } .c.void { background: #f3f4f6; border-color: #d1d5db; color: #666; }
  .job { overflow-wrap: anywhere; }
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
      <div>${esc(company)}${company ? ' · ' : ''}${esc(counties)} · ${long(from)} – ${long(to)}</div>
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
    <colgroup><col style="width:26%"><col style="width:20%"><col style="width:11%"><col style="width:12%"><col style="width:31%"></colgroup>
    <thead><tr>
      <th>Job</th><th>Inspections</th><th>This week</th><th>Next inspection</th><th>Last note on file</th>
    </tr></thead>
    <tbody>
      ${groups.map(g => `<tr class="pmrow"><td colspan="5">${g.pm === 'not assigned' ? 'No PM assigned' : `PM ${esc(g.pm)}`} · ${g.rows.length} job${g.rows.length === 1 ? '' : 's'}</td></tr>${g.rows.map(rowHtml).join('')}`).join('')}
    </tbody>
  </table>
  <div class="legend">✓ passed · ◐ partial pass · ✗ failed / inaccessible (latest result) · ◷ scheduled at the county · – cancelled.
    ${cols.map(c => `${esc(c.label)} ${esc(c.title.toLowerCase())}`).join(' · ')}.</div>
</body></html>`
}

// ── One job's inspection report (the job's Permits tab › Inspection report) ──
// Everything on file for a job, for the office or a homeowner who asks: each
// permit the county has (and earlier ones kept in jobData.permitHistory), every
// inspection with its date, result and inspector and all the inspectors'
// notes, what's scheduled, and results the office recorded by hand.
const resultClass = (r) => (/^pass/i.test(r || '') ? 'ok' : /fail|not pass|disapprov|reject|correction/i.test(r || '') ? 'bad' : '')
const noteHtml = (n) => `<div class="note1"><span class="meta">${esc(n.at || '')}${n.by ? ` · ${esc(n.by)}` : ''}</span><br>${esc(n.text || '')}</div>`

function permitSection(p, { earlier = false } = {}) {
  const done = [...(p.completed || [])].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  const up = (p.upcoming || []).filter(u => u?.date || u?.code)
  const title = p.role === 'office' ? 'Results recorded by the office' : `Permit ${esc(p.record || '')}`
  return `<section>
  <h2>${title}${earlier ? ' <span class="tag">earlier permit</span>' : ''}</h2>
  ${p.role === 'office' ? '' : `<p class="sub">${[p.type, p.status, p.description].filter(Boolean).map(esc).join(' · ')}</p>`}
  ${done.length ? `<table>
    <thead><tr><th style="width:12%">Date</th><th style="width:24%">Inspection</th><th style="width:12%">Result</th><th style="width:16%">Inspector</th><th>Notes</th></tr></thead>
    <tbody>${done.map(i => `<tr>
      <td>${i.date ? long(i.date) : ''}${i.time ? `<div class="sub">${esc(i.time)}</div>` : ''}</td>
      <td>${esc([i.code, i.name].filter(Boolean).join(' - '))}</td>
      <td class="${resultClass(i.result)}"><b>${esc(i.result || '')}</b></td>
      <td>${esc(i.inspector || '')}</td>
      <td>${(i.notes || []).length ? i.notes.map(noteHtml).join('') : (i.note ? esc(i.note) : '<span class="muted">—</span>')}</td>
    </tr>`).join('')}</tbody></table>` : '<p class="muted">No inspections on this permit yet.</p>'}
  ${up.length ? `<p class="sched"><b>Scheduled:</b> ${up.map(u => `${esc([u.code, u.name].filter(Boolean).join(' - '))}${u.date ? ` on ${long(u.date)}` : ''}`).join('; ')}</p>` : ''}
</section>`
}

export function buildJobInspectionReportHtml(proposal, { company = '', now = new Date() } = {}) {
  const permits = allPermits(proposal)
  const earlier = proposal.jobData?.permitHistory || []
  // results the office ticked on the job's steps, before the county was connected
  const steps = Object.entries(proposal.jobData?.inspections || {})
    .flatMap(([key, rec]) => (rec?.attempts || []).map(a => ({ key, ...a })))
    .filter(a => a.date || a.result)
  const manual = proposal.jobData?.nextInspection
  const where = jobCounty(proposal)
  const sections = [
    ...permits.map(p => permitSection(p)),
    ...earlier.map(p => permitSection(p, { earlier: true })),
  ]
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Inspection report · ${esc(proposal.client || '')}</title>
<style>
  @page { size: letter; margin: 0.5in; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font: 12px/1.4 -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; margin: 0; padding: 20px; }
  .head { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
  h1 { font-size: 20px; margin: 0; } h2 { font-size: 14px; margin: 16px 0 2px; }
  .sub { color: #666; font-size: 11px; margin: 0 0 6px; } .muted { color: #999; } .meta { color: #666; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #555; border-bottom: 1px solid #999; padding: 4px; }
  td { border-bottom: 1px solid #ddd; padding: 6px 4px; vertical-align: top; overflow-wrap: anywhere; }
  tr { page-break-inside: avoid; } section { page-break-inside: auto; }
  .ok { color: #15803d; } .bad { color: #b91c1c; }
  .note1 + .note1 { margin-top: 4px; }
  .tag { font-size: 10px; font-weight: 600; color: #555; border: 1px solid #bbb; border-radius: 3px; padding: 0 4px; vertical-align: middle; }
  .sched { margin: 6px 0 0; }
  .foot { margin-top: 18px; color: #777; font-size: 10px; }
</style></head><body>
<div class="head">
  <div><h1>Inspection report</h1>
    <div><b>${esc(proposal.client || '')}</b>${proposal.address ? ` · ${esc(proposal.address)}` : ''}</div>
    ${where ? `<div class="sub">${esc(jobJurisdiction(proposal) || `${where} County`)}</div>` : ''}</div>
  <div class="sub" style="text-align:right">${esc(company)}<br>As of ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
</div>
${sections.length ? sections.join('') : '<p class="muted">No permit or inspection on file for this job.</p>'}
${steps.length ? `<section><h2>Recorded on the job's steps</h2><table>
  <thead><tr><th style="width:12%">Date</th><th style="width:24%">Step</th><th style="width:12%">Result</th><th style="width:16%">Inspector</th><th>Notes</th></tr></thead>
  <tbody>${steps.map(a => `<tr><td>${a.date ? long(a.date) : ''}</td><td>${esc(a.key.replace(/_insp$/, '').replace(/_/g, ' '))}</td><td class="${resultClass(a.result)}"><b>${esc(a.result || '')}</b></td><td>${esc(a.inspector || '')}</td><td>${esc(a.notes || '')}</td></tr>`).join('')}</tbody></table></section>` : ''}
${manual?.code ? `<p class="sched"><b>Next inspection (office):</b> ${esc(inspectionLabel(manual.code))}${manual.date ? ` on ${long(manual.date)}` : ''}</p>` : ''}
<p class="foot">From the county's permit site as last read ${proposal.countyPermit?.checkedAt ? `on ${new Date(proposal.countyPermit.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}, and the office's own records.</p>
</body></html>`
}
