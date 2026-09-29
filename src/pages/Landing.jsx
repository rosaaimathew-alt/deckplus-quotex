import { Link } from 'react-router-dom'
import {
  FileText, PenLine, HardHat, Sparkles, BarChart3, Palette,
  Check, ArrowRight, ShieldCheck, Clock, Building2,
} from 'lucide-react'
import { DEMO } from '../demo'

// "Get started" drops visitors into the live demo. It uses a real full-page link
// (href, not a client-side route) so demo mode activates from the /demo URL.
// "Log in" is for existing customers.
const DEMO_HREF = '/demo'
const CTA = '/login'
const CTA_LABEL = 'Get started'

// Brand identity for the marketing site — charcoal + brass, matching the
// product's standard tier. Georgia display for a premium, built-to-last feel.
const CHARCOAL = '#211f1c'
const CHARCOAL_2 = '#2c2926'
const BRASS = '#b0894f'
const BRASS_DK = '#8a6a3a'
const CREAM = '#f6f2ea'
const INK = '#20201e'

const serif = { fontFamily: 'Georgia, "Times New Roman", serif' }

const FEATURES = [
  { icon: FileText, title: 'Proposals in minutes', body: 'Build itemized, à-la-carte proposals from a smart pricing catalog. Send a branded PDF or a live link — no more copy-pasting into email.' },
  { icon: PenLine, title: 'Contracts that sign themselves', body: 'Turn a won proposal into a full contract with legally-sound e-signature. Client, builder, and GC each sign their own fields from any device.' },
  { icon: HardHat, title: 'Run the whole job', body: 'Change orders, payment milestones, daily logs, and closeout — track a project from deposit to final payment in one place.' },
  { icon: Sparkles, title: 'AI that knows your prices', body: 'Bulk-edit your catalog in plain English, auto-write scope language, and extract line items from any estimate. Your numbers, faster.' },
  { icon: BarChart3, title: 'Pipeline & win rates', body: 'See every quote from sent to signed. Real win-rate math, revenue forecasting, and follow-up reminders so nothing slips.' },
  { icon: Palette, title: 'Your brand, not ours', body: 'Your logo, your colors, your company on every proposal and contract. Clients see you — never the software.' },
]

const STEPS = [
  { n: '01', title: 'Quote it', body: 'Pull from your catalog, price the job, and send a polished proposal the same day you walk the site.' },
  { n: '02', title: 'Sign it', body: 'Client accepts and e-signs the contract online. Deposits and milestones are baked in from the start.' },
  { n: '03', title: 'Build it', body: 'Manage the work, issue change orders, and collect every payment — all tied back to the signed contract.' },
]

const TIERS = [
  {
    name: 'Starter', price: '$49', cadence: '/mo',
    blurb: 'For solo pros who just need to quote and close.',
    features: ['Proposal builder & catalog', 'Proposal tracker / pipeline', 'Branded proposal PDFs', 'Email proposals from your account'],
    cta: 'Start with Starter', highlight: false,
  },
  {
    name: 'Professional', price: '$99', cadence: '/mo',
    blurb: 'The full sales engine — everything but the field ops.',
    features: ['Everything in Starter', 'Analytics, clients & inbox', 'AI catalog assistant', 'Custom colors & full branding'],
    cta: 'Go Professional', highlight: true,
  },
  {
    name: 'Enterprise', price: 'Custom', cadence: '',
    blurb: 'For teams that run jobs start to finish.',
    features: ['Everything in Professional', 'E-signed contracts', 'Full job management', 'Change orders & payment tracking'],
    cta: 'Talk to us', highlight: false,
  },
]

function Logo({ light }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md" style={{ background: BRASS }}>
        <span className="font-black text-sm" style={{ color: CHARCOAL }}>Q</span>
      </span>
      <span className="font-black tracking-tight text-lg" style={{ color: light ? '#fff' : INK }}>
        Quote<span style={{ color: BRASS }}>X</span>
      </span>
    </div>
  )
}

export default function Landing() {
  return (
    <div style={{ background: CREAM, color: INK, minHeight: '100vh' }}>
      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 backdrop-blur" style={{ background: 'rgba(246,242,234,0.85)', borderBottom: '1px solid rgba(33,31,28,0.08)' }}>
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <Logo />
          <nav className="hidden sm:flex items-center gap-7 text-sm font-medium" style={{ color: '#5b554d' }}>
            <a href="#features" className="hover:text-black transition-colors">Features</a>
            <a href="#how" className="hover:text-black transition-colors">How it works</a>
            <a href="#pricing" className="hover:text-black transition-colors">Pricing</a>
          </nav>
          <div className="flex items-center gap-3">
            {!DEMO && <Link to={CTA} className="text-sm font-semibold px-3 py-2 rounded-lg transition-colors hover:bg-black/5" style={{ color: INK }}>Log in</Link>}
            <a href={DEMO_HREF} className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition-transform hover:-translate-y-0.5" style={{ background: CHARCOAL }}>
              {CTA_LABEL}
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 pt-20 pb-16 sm:pt-28 sm:pb-24">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] px-3 py-1.5 rounded-full mb-7"
            style={{ background: 'rgba(176,137,79,0.14)', color: BRASS_DK }}>
            <Building2 size={13} /> Built for outdoor living & remodeling pros
          </span>
          <h1 className="text-5xl sm:text-7xl leading-[0.95] font-bold tracking-tight mb-6" style={{ ...serif, textWrap: 'balance' }}>
            Quote it. Sign it.<br /><span style={{ color: BRASS }}>Build it.</span>
          </h1>
          <p className="text-lg sm:text-xl leading-relaxed mb-9 max-w-2xl" style={{ color: '#514b43' }}>
            QuoteX takes contractors from first estimate to signed contract to finished job — proposals, e-signatures, change orders, and payments in one place. Stop juggling PDFs, spreadsheets, and email threads.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <a href={DEMO_HREF} className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl text-white font-semibold text-base transition-transform hover:-translate-y-0.5" style={{ background: CHARCOAL }}>
              {CTA_LABEL} <ArrowRight size={17} />
            </a>
            <a href="#how" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-base transition-colors hover:bg-black/5" style={{ border: `1.5px solid rgba(33,31,28,0.18)`, color: INK }}>
              See how it works
            </a>
          </div>
          <div className="flex flex-wrap gap-x-7 gap-y-2 mt-9 text-sm" style={{ color: '#6b655c' }}>
            <span className="inline-flex items-center gap-2"><Clock size={15} style={{ color: BRASS }} /> Same-day proposals</span>
            <span className="inline-flex items-center gap-2"><ShieldCheck size={15} style={{ color: BRASS }} /> Legally-sound e-signatures</span>
            <span className="inline-flex items-center gap-2"><Check size={15} style={{ color: BRASS }} /> No setup fees</span>
          </div>
        </div>
      </section>

      {/* ── Feature preview band ────────────────────────────── */}
      <section id="features" className="py-20 sm:py-28" style={{ background: CHARCOAL }}>
        <div className="max-w-6xl mx-auto px-5">
          <div className="max-w-2xl mb-14">
            <p className="text-xs font-bold uppercase tracking-[0.18em] mb-3" style={{ color: BRASS }}>Everything in one system</p>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight" style={{ ...serif, color: '#fff', textWrap: 'balance' }}>
              The whole job, from handshake to final payment
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl p-6 transition-transform hover:-translate-y-1"
                style={{ background: CHARCOAL_2, border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="inline-flex items-center justify-center w-11 h-11 rounded-xl mb-4" style={{ background: 'rgba(176,137,79,0.16)' }}>
                  <Icon size={20} style={{ color: BRASS }} />
                </span>
                <h3 className="text-lg font-bold mb-2" style={{ color: '#fff' }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#a9a29a' }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────── */}
      <section id="how" className="max-w-6xl mx-auto px-5 py-20 sm:py-28">
        <div className="max-w-2xl mb-14">
          <p className="text-xs font-bold uppercase tracking-[0.18em] mb-3" style={{ color: BRASS_DK }}>How it works</p>
          <h2 className="text-3xl sm:text-4xl font-bold leading-tight" style={{ ...serif, textWrap: 'balance' }}>
            Three steps. One source of truth.
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {STEPS.map(({ n, title, body }) => (
            <div key={n} className="relative">
              <div className="text-5xl font-bold mb-4 tabular-nums" style={{ ...serif, color: BRASS, opacity: 0.85 }}>{n}</div>
              <h3 className="text-xl font-bold mb-2">{title}</h3>
              <p className="text-base leading-relaxed" style={{ color: '#514b43' }}>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────── */}
      <section id="pricing" className="py-20 sm:py-28" style={{ background: '#efe9de' }}>
        <div className="max-w-6xl mx-auto px-5">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <p className="text-xs font-bold uppercase tracking-[0.18em] mb-3" style={{ color: BRASS_DK }}>Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-bold leading-tight mb-3" style={{ ...serif, textWrap: 'balance' }}>
              Plans that grow with your crew
            </h2>
            <p className="text-base" style={{ color: '#514b43' }}>Start where you are. Move up when you're ready to run whole jobs.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-5 items-start">
            {TIERS.map(t => (
              <div key={t.name} className="rounded-2xl p-7 flex flex-col h-full"
                style={t.highlight
                  ? { background: CHARCOAL, color: '#fff', boxShadow: '0 20px 40px -12px rgba(33,31,28,0.35)' }
                  : { background: '#fff', border: '1px solid rgba(33,31,28,0.1)' }}>
                {t.highlight && (
                  <span className="self-start text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mb-4" style={{ background: BRASS, color: CHARCOAL }}>Most popular</span>
                )}
                <h3 className="text-lg font-bold" style={{ color: t.highlight ? '#fff' : INK }}>{t.name}</h3>
                <div className="flex items-baseline gap-1 mt-3 mb-2">
                  <span className="text-4xl font-bold tabular-nums" style={{ ...serif, color: t.highlight ? '#fff' : INK }}>{t.price}</span>
                  <span className="text-sm" style={{ color: t.highlight ? '#a9a29a' : '#6b655c' }}>{t.cadence}</span>
                </div>
                <p className="text-sm mb-6" style={{ color: t.highlight ? '#a9a29a' : '#6b655c' }}>{t.blurb}</p>
                <ul className="space-y-3 mb-8 flex-1">
                  {t.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm" style={{ color: t.highlight ? '#d6d0c8' : '#3f3a33' }}>
                      <Check size={16} className="mt-0.5 shrink-0" style={{ color: BRASS }} /> {f}
                    </li>
                  ))}
                </ul>
                <a href={DEMO_HREF} className="text-center px-5 py-3 rounded-xl font-semibold text-sm transition-transform hover:-translate-y-0.5"
                  style={t.highlight ? { background: BRASS, color: CHARCOAL } : { background: CHARCOAL, color: '#fff' }}>
                  {t.cta}
                </a>
              </div>
            ))}
          </div>
          <p className="text-center text-xs mt-8" style={{ color: '#8a837a' }}>Prices shown are placeholders — set your real pricing anytime.</p>
        </div>
      </section>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-5 py-20 sm:py-28">
        <div className="rounded-3xl px-8 py-14 sm:px-16 sm:py-20 text-center" style={{ background: CHARCOAL }}>
          <h2 className="text-3xl sm:text-5xl font-bold leading-tight mb-5" style={{ ...serif, color: '#fff', textWrap: 'balance' }}>
            Win the job before your competition emails back
          </h2>
          <p className="text-lg mb-9 max-w-xl mx-auto" style={{ color: '#a9a29a' }}>
            Send a professional proposal today. Get it signed tomorrow.
          </p>
          <a href={DEMO_HREF} className="inline-flex items-center gap-2 px-7 py-4 rounded-xl font-semibold text-base transition-transform hover:-translate-y-0.5" style={{ background: BRASS, color: CHARCOAL }}>
            {CTA_LABEL} <ArrowRight size={18} />
          </a>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid rgba(33,31,28,0.1)' }}>
        <div className="max-w-6xl mx-auto px-5 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo />
          <p className="text-sm" style={{ color: '#8a837a' }}>© {new Date().getFullYear()} QuoteX. Software for contractors who build.</p>
          <Link to={CTA} className="text-sm font-semibold" style={{ color: INK }}>{DEMO ? 'Launch demo →' : 'Log in →'}</Link>
        </div>
      </footer>
    </div>
  )
}
