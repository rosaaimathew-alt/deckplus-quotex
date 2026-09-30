// ── Deck Plus contract packet — renderer ─────────────────────────────────────
// Prints the attorney-reviewed packet from src/contract/deckPlusAgreement.js
// exactly as written. This file decides layout only: it never contains
// contract wording. Blanks, checkboxes, initials and signatures are rendered
// through the hooks below so the same component serves the office editor
// (ContractView), the signing page (SignPage) and the signed copy
// (ContractViewFull).
//
// Print order: pages 1–7 (every contract), then our own Scope of Work pages
// drafted from the proposal (clause 2 of the agreement refers to the Scope of
// Work "annexed hereto"), then the trade spec sheets whose key is in `packet`
// (source pages 8–11), then the Processing Form (source page 12, every
// contract).
import { Fragment } from 'react'
import {
  AGREEMENT, SCOPE_CLARIFICATION, INITIALS, UNFORESEEN, ELECTRICAL_FORM,
  PORCH_FORM, DECK_FORM, PATIO_FORM, PROCESSING_FORM, PACKET_FORMS,
} from './deckPlusAgreement'
import { roleOfSigId, fmtDate } from './contractFields'

const CONTRACT_IMAGES = {
  logo:            '/contract/deckplus-logo.png',
  house:           '/contract/house-sketch.png',
  electricalTitle: '/contract/electrical-title.png',
  electricalRule:  '/contract/electrical-rule.png',
  clientNameLabel: '/contract/client-name-label.png',
  contractNoLabel: '/contract/contract-no-label.png',
  processingTitle: '/contract/processing-title.png',
}

const FORMS = { electrical: ELECTRICAL_FORM, porch: PORCH_FORM, deck: DECK_FORM, hardscape: PATIO_FORM }
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const PageBreak = () => <div className="pdf-page-break" style={{ pageBreakAfter: 'always', breakAfter: 'page', height: 0, overflow: 'hidden' }} />
const Logo = ({ className = '', style }) => <img src={CONTRACT_IMAGES.logo} alt="Deck Plus — Outdoor Additions" className={`dp-logo ${className}`} style={style} />

// ── Inline markup → React ───────────────────────────────────────────────────
const TOKEN = /(<\/?(?:b|i|u|sup)>|\{\{[^}]+\}\})/g
function Inline({ text, ctx }) {
  const parts = String(text ?? '').split(TOKEN)
  const st = { b: 0, i: 0, u: 0, sup: 0 }
  const out = []
  parts.forEach((p, k) => {
    if (!p) return
    const tag = /^<(\/?)(b|i|u|sup)>$/.exec(p)
    if (tag) { st[tag[2]] += tag[1] ? -1 : 1; return }
    const ph = /^\{\{([^}]+)\}\}$/.exec(p)
    let node = ph ? ctx.placeholder(ph[1]) : p
    if (st.sup > 0) node = <sup>{node}</sup>
    if (st.u > 0) node = <u>{node}</u>
    if (st.i > 0) node = <i>{node}</i>
    if (st.b > 0) node = <b>{node}</b>
    out.push(<Fragment key={k}>{node}</Fragment>)
  })
  return out
}

// Builds the placeholder renderer from the hooks the host page supplies.
function makeCtx({ values, checks, editable, onValue, onCheck, renderSig, renderSigDate, renderInit }) {
  const blank = (name, opts = {}) => {
    const val = values?.[name] ?? ''
    if (editable && onValue) {
      const w = Math.max(opts.min || 10, String(val).length + 2)
      return <input className="dp-blank-input" value={val} onChange={e => onValue(name, e.target.value)} style={{ width: `${w}ch` }} aria-label={name} />
    }
    return <span className="dp-blank" style={opts.min ? { minWidth: `${opts.min}ch` } : undefined}>{val || ' '}</span>
  }
  const check = (id) => {
    const on = !!checks?.[id]
    const cls = `dp-box${on ? ' on' : ''}${editable && onCheck ? ' clickable' : ''}`
    return <span className={cls} role={editable && onCheck ? 'checkbox' : undefined} aria-checked={on} aria-label={id}
      onClick={editable && onCheck ? () => onCheck(id, !on) : undefined}>{on ? '✗' : ''}</span>
  }
  const init = (id) => <span className="dp-init">{renderInit?.(id) || null}</span>
  const sig = (id) => <span className="dp-sig">{renderSig?.(id, roleOfSigId(id)) || null}</span>
  const sigdate = (id) => <span className="dp-sigdate">{renderSigDate?.(id, roleOfSigId(id)) || null}</span>
  return {
    blank, check, init, sig, sigdate,
    placeholder(spec) {
      const [kind, id] = spec.includes(':') ? spec.split(':') : [null, spec]
      if (kind === 'check') return check(id)
      if (kind === 'init') return init(id)
      if (kind === 'sig') return sig(id)
      if (kind === 'sigdate') return sigdate(id)
      if (id === 'houseSketch') return <img src={CONTRACT_IMAGES.house} alt="House — mark power location with P" className="dp-house" />
      return blank(id)
    },
  }
}

// One line of a form cell: a string, an inline group (array), or a spacer ('').
function Line({ line, ctx }) {
  if (Array.isArray(line)) return <div className="dp-inline">{line.map((l, i) => <span key={i}><Inline text={l} ctx={ctx} /></span>)}</div>
  if (line === '') return <div className="dp-spacer" />
  return <div className="dp-line"><Inline text={line} ctx={ctx} /></div>
}

// ── Pages 1–3 ───────────────────────────────────────────────────────────────
function AgreementPages({ ctx }) {
  const clause = (c) => (
    <div key={c.n} className="dp-clause">
      {c.paras.map((p, i) => <p key={i} className={p.startsWith('{{') ? 'dp-address' : ''}><Inline text={p} ctx={ctx} /></p>)}
      {c.payments && <div className="dp-payments">{c.payments.map((p, i) => <p key={i}><Inline text={p} ctx={ctx} /></p>)}</div>}
      {c.subclauses && c.subclauses.map((p, i) => <p key={`s${i}`}><Inline text={p} ctx={ctx} /></p>)}
    </div>
  )
  const page = (from, to) => AGREEMENT.clauses.filter(c => c.n >= from && c.n <= to).map(clause)
  return (
    <>
      <section className="dp-page">
        <div className="dp-center"><Logo /></div>
        <h1 className="dp-h1"><Inline text={AGREEMENT.heading} ctx={ctx} /></h1>
        {page(1, 5)}
      </section>
      <PageBreak />
      <section className="dp-page">{page(6, 12)}</section>
      <PageBreak />
      <section className="dp-page">
        {page(13, 25)}
        <p className="dp-sigline dp-mt"><Inline text={AGREEMENT.signatureLine} ctx={ctx} /></p>
      </section>
    </>
  )
}

// ── Page 4 ──────────────────────────────────────────────────────────────────
function ScopeClarificationPage({ ctx }) {
  const S = SCOPE_CLARIFICATION
  return (
    <section className="dp-page">
      <div className="dp-center"><Logo /></div>
      <h1 className="dp-h1"><Inline text={S.heading} ctx={ctx} /></h1>
      <p><Inline text={S.intro} ctx={ctx} /></p>
      <ul className="dp-bullets">
        {S.bullets.map((b, i) => <li key={i}><Inline text={b} ctx={ctx} /></li>)}
        <p className="dp-indent"><Inline text={S.finalPaymentNote} ctx={ctx} /></p>
        {S.bullets2.map((b, i) => <li key={`b${i}`}><Inline text={b} ctx={ctx} /></li>)}
      </ul>
      <p className="dp-sigline dp-mt"><Inline text={S.signatureLine} ctx={ctx} /></p>
    </section>
  )
}

// ── Pages 5–6 ───────────────────────────────────────────────────────────────
function InitialsTable({ items, ctx }) {
  return (
    <table className="dp-initials">
      <tbody>
        {items.map(it => (
          <tr key={it.id}>
            <td className="dp-initcell">
              <div>{ctx.init(it.id)}</div>
              <div className="dp-initlabel">{INITIALS.initialLabel}</div>
            </td>
            <td>
              <div><Inline text={it.text} ctx={ctx} /></div>
              {(it.lines || []).map((l, i) => <div key={i} className={it.id === 'painting' ? 'dp-indent' : ''}><Inline text={l} ctx={ctx} /></div>)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
function SignatureColumns({ cols, ctx }) {
  const hasHeadings = cols.some(c => c.heading)
  return (
    <div className="dp-sigcols">
      {cols.map(c => (
        <div key={c.id} className="dp-sigcol">
          {hasHeadings && <div className="dp-sigcol-h"><Inline text={c.heading || ''} ctx={ctx} /></div>}
          <div className="dp-sigcol-line">
            {ctx.sig(c.id)}
            {c.dateLabel && <span className="dp-sigcol-date">{c.dateLabel}{ctx.sigdate(c.id)}</span>}
          </div>
          <div className="dp-sigcol-label">{c.label}</div>
        </div>
      ))}
    </div>
  )
}
function InitialsPages({ ctx }) {
  const I = INITIALS
  return (
    <>
      <section className="dp-page">
        <div className="dp-center"><Logo /></div>
        <p className="dp-mt"><Inline text={I.header} ctx={ctx} /></p>
        <p className="dp-instruction"><Inline text={I.instruction} ctx={ctx} /></p>
        <InitialsTable items={I.items1} ctx={ctx} />
        <p className="dp-instruction dp-mt"><Inline text={I.instruction} ctx={ctx} /></p>
        <InitialsTable items={I.items2} ctx={ctx} />
      </section>
      <PageBreak />
      <section className="dp-page">
        <InitialsTable items={I.items3} ctx={ctx} />
        <div className="dp-yesno">
          <p className="dp-instruction"><Inline text={I.yesNoInstruction} ctx={ctx} /></p>
          {I.yesNo.map(y => <p key={y.id}><Inline text={y.text} ctx={ctx} /></p>)}
        </div>
        <SignatureColumns cols={I.signatureColumns} ctx={ctx} />
        <div className="dp-center dp-mt"><Logo /></div>
      </section>
    </>
  )
}

// ── Page 7 ──────────────────────────────────────────────────────────────────
function UnforeseenPage({ ctx }) {
  const U = UNFORESEEN
  return (
    <section className="dp-page">
      <div className="dp-center"><Logo /></div>
      <h1 className="dp-h1"><Inline text={U.heading} ctx={ctx} /></h1>
      <p><Inline text={U.projectName} ctx={ctx} /></p>
      <p><Inline text={U.intro} ctx={ctx} /></p>
      <ul className="dp-bullets">{U.bullets.map((b, i) => <li key={i}><Inline text={b} ctx={ctx} /></li>)}</ul>
      <p><Inline text={U.closing} ctx={ctx} /></p>
      <p className="dp-mt"><Inline text={U.acknowledgment} ctx={ctx} /></p>
      <SignatureColumns cols={U.signatureColumns} ctx={ctx} />
    </section>
  )
}

// ── Page 8 ──────────────────────────────────────────────────────────────────
function ElectricalPage({ ctx }) {
  const E = ELECTRICAL_FORM
  return (
    <section className="dp-page dp-form">
      <div className="dp-formhead">
        <Logo />
        <img src={CONTRACT_IMAGES.electricalTitle} alt={E.heading} className="dp-title-img" style={{ height: '1.6em' }} />
      </div>
      <img src={CONTRACT_IMAGES.electricalRule} alt="" className="dp-rule-img" />
      <div className="dp-headerfields">
        <div><img src={CONTRACT_IMAGES.clientNameLabel} alt="CLIENT NAME:" className="dp-label-img" /> {ctx.blank('clientName', { min: 22 })}</div>
        <div><img src={CONTRACT_IMAGES.contractNoLabel} alt="CONTRACT #:" className="dp-label-img" /> {ctx.blank('contractNum', { min: 14 })}</div>
      </div>
      <div className="dp-headerfields">
        {E.headerFields[1].map((f, i) => <div key={i}><Inline text={f} ctx={ctx} /></div>)}
      </div>
      <p className="dp-mt"><Inline text={E.tableIntro} ctx={ctx} /></p>
      <table className="dp-grid dp-electable">
        <thead><tr>{E.columns.map((c, i) => <th key={i} className={i ? 'dp-qty' : ''}><Inline text={c} ctx={ctx} /></th>)}</tr></thead>
        <tbody>
          {E.items.map(it => (
            <tr key={it.id}>
              <td><Inline text={it.label} ctx={ctx} /></td>
              <td className="dp-qty">{ctx.blank(`elecQty_${it.id}`, { min: 4 })}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {E.notes.map((n, i) => <p key={i} className={i ? 'dp-center' : 'dp-mt'}><Inline text={n} ctx={ctx} /></p>)}
      <ul className="dp-bullets">{E.bullets.map((b, i) => <li key={i}><Inline text={b} ctx={ctx} /></li>)}</ul>
      <p className="dp-center dp-mt"><Inline text={E.footer} ctx={ctx} /></p>
      <p className="dp-sigline dp-mt"><Inline text={E.signatureLine} ctx={ctx} /></p>
    </section>
  )
}

// ── Pages 9–11 ──────────────────────────────────────────────────────────────
// Each row of the source table has its own column count, so rows are CSS
// grids stacked on top of each other rather than one <table>.
function GridForm({ form, ctx }) {
  const columns = (row) => {
    const fixed = row.reduce((s, c) => s + (c.w || 0), 0)
    const free = row.filter(c => !c.w).length
    return row.map(c => `${((c.w || (free ? (1 - fixed) / free : 0)) * 100).toFixed(2)}%`).join(' ')
  }
  const Head = ({ c }) => <div className={`dp-gcell dp-ghead${c.center ? ' dp-center' : ''}`}><Inline text={c.h} ctx={ctx} /></div>
  const Body = ({ c }) => (
    <div className="dp-gcell">
      {c.lines && c.lines.map((l, li) => <Line key={li} line={l} ctx={ctx} />)}
    </div>
  )
  return (
    <section className="dp-page dp-form">
      <div className="dp-formhead">
        <Logo />
        <div className="dp-formtitle"><Inline text={form.heading} ctx={ctx} /></div>
      </div>
      <div className="dp-gridform">
        {form.rows.map((row, ri) => {
          const cols = columns(row)
          const split = row.every(c => c.h && c.lines)
          if (split) return (
            <Fragment key={ri}>
              <div className="dp-grow" style={{ gridTemplateColumns: cols }}>{row.map((c, ci) => <Head key={ci} c={c} />)}</div>
              <div className="dp-grow" style={{ gridTemplateColumns: cols }}>{row.map((c, ci) => <Body key={ci} c={c} />)}</div>
            </Fragment>
          )
          return (
            <div key={ri} className="dp-grow" style={{ gridTemplateColumns: cols }}>
              {row.map((c, ci) => c.h && !c.lines
                ? <Head key={ci} c={c} />
                : <div key={ci} className="dp-gcell">
                    {c.h && <div className="dp-cellh"><Inline text={c.h} ctx={ctx} /></div>}
                    {(c.lines || []).map((l, li) => <Line key={li} line={l} ctx={ctx} />)}
                  </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="dp-sigline dp-mt-lg"><Inline text={form.signatureLine} ctx={ctx} /></p>
    </section>
  )
}

// ── Page 12 ─────────────────────────────────────────────────────────────────
function ProcessingPage({ ctx }) {
  const P = PROCESSING_FORM
  return (
    <section className="dp-page dp-form">
      <div className="dp-formhead">
        <Logo />
        <img src={CONTRACT_IMAGES.processingTitle} alt="PROCESSING FORM" className="dp-title-img" style={{ height: '1.6em' }} />
      </div>
      <div className="dp-proc-top">{P.top.map((t, i) => <div key={i}><Inline text={t} ctx={ctx} /></div>)}</div>
      {P.blocks.map((b, bi) => (
        <div key={bi} className={`dp-proc-block${bi % 2 === 0 ? ' shaded' : ''}`} style={{ gridTemplateColumns: `repeat(${b.cells.length}, 1fr)` }}>
          {b.cells.map((cell, ci) => <div key={ci} className="dp-proc-cell">{cell.map((l, li) => <Line key={li} line={l} ctx={ctx} />)}</div>)}
        </div>
      ))}
      <div className="dp-proc-block shaded dp-sigline"><div className="dp-proc-cell"><Inline text={P.signatureLine} ctx={ctx} /></div></div>
    </section>
  )
}

// ── Scope of Work annex (ours, drafted from the proposal) ───────────────────
function renderScopeLines(scopeLines = [], renderBold = (t) => t) {
  const hasBulletPrefix = scopeLines.some(l => (l.text || '').trimStart().startsWith('--'))
  return scopeLines.map((line, i) => {
    const txt = line.text || ''
    if (!txt.trim()) return <div key={line.id ?? i} className="dp-spacer" />
    const isBullet = txt.trimStart().startsWith('--') || !hasBulletPrefix
    const display = txt.trimStart().startsWith('--') ? txt.trimStart().slice(2).trimStart() : txt
    return isBullet
      ? <div key={line.id ?? i} className="dp-scope-bullet"><span>●</span><span className="dp-pre">{renderBold(display)}</span></div>
      : <p key={line.id ?? i} className="dp-pre">{renderBold(display)}</p>
  })
}
function ScopePages({ values, scopeLines, projectSummary, total, payments, scopeSlot, renderBold }) {
  const priced = scopeLines.filter(l => (l.name || '').trim() || Number(l.price) > 0)
  return (
    <section className="dp-page dp-scope">
      <div className="dp-formhead">
        <Logo />
        <div className="dp-formtitle dp-formtitle-dark">SCOPE OF WORK</div>
      </div>
      <div className="dp-scope-info">
        <p><b>DATE:</b> {values.effectiveDate || fmtDate(new Date())}</p>
        <p><b>CONTRACT #:</b> {values.contractNum}</p>
        <p><b>CUSTOMER NAME:</b> {values.clientName}</p>
        <p><b>ADDRESS:</b> {values.propertyAddress}</p>
        <p><b>EMAIL:</b> {values.clientEmail}</p>
        <p><b>PHONE:</b> {values.clientPhone}</p>
      </div>
      {(projectSummary || scopeSlot) && (
        <div className="dp-mt">
          <p><b>PROJECT SUMMARY:</b></p>
          <p className="dp-pre">{projectSummary}</p>
        </div>
      )}
      <div className="dp-mt">
        {scopeSlot ? <div className="no-print">{scopeSlot}</div> : null}
        <div className={scopeSlot ? 'print-only dp-scope-lines' : 'dp-scope-lines'}>{renderScopeLines(scopeLines, renderBold)}</div>
      </div>
      {priced.length > 0 && (
        <table className="dp-grid dp-pricing dp-mt-lg">
          <thead><tr><th>ITEM</th><th className="dp-price">PRICE</th></tr></thead>
          <tbody>
            {priced.map((l, i) => <tr key={l.id ?? i}><td>{(l.name || '').toUpperCase()}</td><td className="dp-price">${fmt(l.price)}</td></tr>)}
            <tr className="dp-total"><td>INVESTMENT TOTAL</td><td className="dp-price">${fmt(total)}</td></tr>
          </tbody>
        </table>
      )}
      {payments.length > 0 && (
        <table className="dp-grid dp-pricing dp-mt">
          <thead><tr><th>PAYMENT SCHEDULE</th><th className="dp-price">%</th><th className="dp-price">AMOUNT</th></tr></thead>
          <tbody>
            {payments.map((p, i) => <tr key={i}><td>{p.label}</td><td className="dp-price">{Math.round(p.pct * 100)}%</td><td className="dp-price">${fmt(p.amount)}</td></tr>)}
            <tr className="dp-total"><td>TOTAL</td><td className="dp-price">100%</td><td className="dp-price">${fmt(total)}</td></tr>
          </tbody>
        </table>
      )}
    </section>
  )
}

// ── The packet ──────────────────────────────────────────────────────────────
export default function DeckPlusContract({
  values = {}, checks = {}, packet = [],
  scopeLines = [], projectSummary = '', total = 0, payments = [],
  editable = false, onValue, onCheck, renderSig, renderSigDate, renderInit,
  scopeSlot = null, renderBold, includeScope = true,
  innerRef, className = '', style,
}) {
  const ctx = makeCtx({ values, checks, editable, onValue, onCheck, renderSig, renderSigDate, renderInit })
  const forms = PACKET_FORMS.filter(f => packet.includes(f.key))
  return (
    <div ref={innerRef} className={`dp-doc contract-doc ${className}`} style={style}>
      <AgreementPages ctx={ctx} />
      <PageBreak />
      <ScopeClarificationPage ctx={ctx} />
      <PageBreak />
      <InitialsPages ctx={ctx} />
      <PageBreak />
      <UnforeseenPage ctx={ctx} />
      {includeScope && (
        <>
          <PageBreak />
          <ScopePages values={values} scopeLines={scopeLines} projectSummary={projectSummary} total={total} payments={payments} scopeSlot={scopeSlot} renderBold={renderBold} />
        </>
      )}
      {forms.map(f => (
        <Fragment key={f.key}>
          <PageBreak />
          {f.key === 'electrical' ? <ElectricalPage ctx={ctx} /> : <GridForm form={FORMS[f.key]} ctx={ctx} />}
        </Fragment>
      ))}
      <PageBreak />
      <ProcessingPage ctx={ctx} />
    </div>
  )
}
