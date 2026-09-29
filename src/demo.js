// ── Demo mode ────────────────────────────────────────────────────────────────
// A completely isolated, shareable sandbox. When VITE_DEMO_MODE=true is compiled
// into a build:
//   • the app never talks to the backend / Vercel KV (see store.js),
//   • login is bypassed (see AuthGuard.jsx),
//   • data lives ONLY in the visitor's own browser under a separate key,
//   • realistic but 100% fictional sample data is seeded on first load.
// Production builds never set the flag, so none of this code path is reachable
// there — there is no way for the demo to read real company data.

// Demo turns on either way:
//   • the whole site is a demo build (VITE_DEMO_MODE=true), OR
//   • the visitor is under the /demo path on the normal site.
// The /demo path lets the real site and the demo live on ONE domain / project:
//   yoursite.com        → real app (login, real data)
//   yoursite.com/demo   → sandbox (no login, sample data, browser-only)
function detectDemo() {
  if (import.meta.env.VITE_DEMO_MODE === 'true') return true
  if (typeof window === 'undefined') return false
  const p = window.location.pathname
  return p === '/demo' || p.startsWith('/demo/')
}

export const DEMO = detectDemo()

// When entered by path, all routes live under this basename (see App.jsx) so the
// prefix — and therefore demo mode — sticks as the visitor navigates.
export const DEMO_BASENAME = (DEMO && import.meta.env.VITE_DEMO_MODE !== 'true') ? '/demo' : undefined

// Separate localStorage key so the demo can never read/write the real store.
export const DEMO_STORE_KEY = 'quotex-demo'

// Wipe the sandbox and reload — restores the original sample data.
export function resetDemo() {
  try { localStorage.removeItem(DEMO_STORE_KEY) } catch { /* ignore */ }
  try { window.location.reload() } catch { /* ignore */ }
}

// Fictional outdoor-living pricing catalog for the demo. Made-up items and
// prices — NOT anyone's real pricing sheet.
const DEMO_CATALOG = [
  { id: 13, name: 'Deck — Build to Spec (formula)',        description: 'Configure framing, decking, steps, landings, height and difficulty; price, cost and scope auto-calculate.', unit: 'EA', unitPrice: 0, minPrice: 0, maxPrice: 0, count: 0, category: 'Decks', confidence: 100, assembly: 'deck' },
  // "Porch Floor Upgrade" items — the Deck Builder reads these as decking collections (per LF, full price + cost). Demo placeholders.
  { id: 14, name: 'TimberTech Terrain+ Porch Floor Upgrade',       description: 'TimberTech PRO Terrain+ composite decking, per LF installed.', unit: 'LF', unitPrice: 5.20, minPrice: 5.20, maxPrice: 5.20, count: 0, category: 'Decks', confidence: 100, costMaterials: 3.10, costSub: 0 },
  { id: 15, name: 'TimberTech AZEK Vintage Porch Floor Upgrade',   description: 'TimberTech AZEK Vintage capped-polymer decking, per LF installed.', unit: 'LF', unitPrice: 7.10, minPrice: 7.10, maxPrice: 7.10, count: 0, category: 'Decks', confidence: 100, costMaterials: 4.40, costSub: 0 },
  { id: 16, name: 'TimberTech Prime+ Porch Floor Upgrade',         description: 'TimberTech PRO Prime+ composite decking, per LF installed.', unit: 'LF', unitPrice: 4.30, minPrice: 4.30, maxPrice: 4.30, count: 0, category: 'Decks', confidence: 100, costMaterials: 2.60, costSub: 0 },
  { id: 1,  name: 'Composite Deck (Trex Transcend)',       description: 'Supply and install composite decking with hidden fasteners over existing or new framing.',                 unit: 'SF', unitPrice: 42, minPrice: 36, maxPrice: 52, count: 24, category: 'Decks',            confidence: 95 },
  { id: 2,  name: 'Pressure-Treated Deck Framing',          description: 'Build pressure-treated deck substructure with joists, beams, and posts to code.',                            unit: 'SF', unitPrice: 18, minPrice: 15, maxPrice: 24, count: 21, category: 'Decks',            confidence: 94 },
  { id: 3,  name: 'Aluminum Deck Railing',                  description: 'Supply and install powder-coated aluminum railing with balusters.',                                          unit: 'LF', unitPrice: 62, minPrice: 52, maxPrice: 78, count: 19, category: 'Decks',            confidence: 92 },
  { id: 4,  name: 'Paver Patio (TechoBloc)',                description: 'Design and build paver patio with 4" ABC base, screening, and polymeric sand.',                             unit: 'SF', unitPrice: 34, minPrice: 28, maxPrice: 44, count: 26, category: 'Hardscapes',       confidence: 96 },
  { id: 5,  name: 'Seating / Retaining Wall',               description: 'Segmental block wall with cap stones and drainage.',                                                        unit: 'LF', unitPrice: 145, minPrice: 120, maxPrice: 185, count: 14, category: 'Hardscapes',      confidence: 90 },
  { id: 6,  name: 'Cedar Pergola (per sq ft)',              description: 'Western red cedar pergola with 6x6 posts, stained and sealed.',                                             unit: 'SF', unitPrice: 58, minPrice: 48, maxPrice: 72, count: 11, category: 'Structures',       confidence: 88 },
  { id: 7,  name: 'Screened Porch Enclosure',               description: 'Screened enclosure with aluminum frame, kick plate, and screen door.',                                     unit: 'SF', unitPrice: 46, minPrice: 38, maxPrice: 58, count: 9,  category: 'Structures',       confidence: 87 },
  { id: 8,  name: 'Outdoor Kitchen Grill Island',           description: 'Masonry grill island with granite counter, built-in grill, and storage doors.',                            unit: 'EA', unitPrice: 8800, minPrice: 6800, maxPrice: 12500, count: 6, category: 'Outdoor Kitchens', confidence: 84 },
  { id: 9,  name: 'Gas Fire Pit (Masonry)',                 description: 'Build masonry gas fire pit with burner kit and lava rock.',                                                unit: 'EA', unitPrice: 4200, minPrice: 3200, maxPrice: 5600, count: 8, category: 'Hardscapes',      confidence: 89 },
  { id: 10, name: 'Landscape Lighting Package',             description: 'Low-voltage LED path and accent lighting with transformer and timer.',                                    unit: 'EA', unitPrice: 2400, minPrice: 1800, maxPrice: 3400, count: 12, category: 'Electrical',      confidence: 86 },
  { id: 11, name: 'Concrete Footing (per post)',            description: 'Pour concrete footing for post, including excavation and inspection.',                                     unit: 'EA', unitPrice: 165, minPrice: 130, maxPrice: 210, count: 22, category: 'Materials',       confidence: 95 },
  { id: 12, name: 'Demo & Haul-off',                        description: 'Remove existing structure and haul off all debris.',                                                       unit: 'EA', unitPrice: 950, minPrice: 650, maxPrice: 1500, count: 16, category: 'Demo',             confidence: 91 },
]

// A 1x1 PNG standing in for an uploaded Certificate of Insurance, so the
// "Audit Pack" export is demoable out of the box.
const SAMPLE_COI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// Build the sample dataset. Dates are relative to "now" so the scheduler and
// job board always look current.
export function buildDemoSeed() {
  const now = Date.now()
  const DAY = 86400000
  const iso = (d) => new Date(now + d * DAY).toISOString()
  const ymd = (d) => iso(d).slice(0, 10)

  const line = (id, name, unitPrice, description) => ({ id, name, qty: 1, unitPrice, description, section: 'General' })

  const proposals = [
    {
      id: 1, parentId: null, version: 1,
      client: 'Marcus Bell', email: 'marcus.bell@example.com', phone: '(704) 555-0142',
      address: '212 Larkspur Dr, Waxhaw, NC 28173',
      total: 12400, isAlaCarte: false,
      projectTypes: ['Pergola'], projectSummary: 'Cedar pergola over existing patio',
      lines: [
        line('l1', '12x14 Cedar Pergola', 9800, 'Design and build a 12x14 western red cedar pergola with 6x6 posts on existing patio, stained.'),
        line('l2', 'Post Footings', 1600, 'Four concrete footings for pergola posts.'),
        line('l3', 'Stain & Seal', 1000, 'Stain and seal all cedar members.'),
      ],
      status: 'Draft', createdAt: iso(-3), sentAt: null, closedAt: null,
      winLossReason: null, activities: [], reminders: [],
    },
    {
      id: 2, parentId: null, version: 1,
      client: 'Priya Nair', email: 'priya.nair@example.com', phone: '(704) 555-0188',
      address: '5540 Cambridge Way, Matthews, NC 28105',
      total: 18750, isAlaCarte: false,
      projectTypes: ['Hardscapes'], projectSummary: 'Paver patio with seating wall',
      lines: [
        line('l1', 'TechoBloc Paver Patio (380 sf)', 15250, 'Design and build paver patio with 4" ABC base, screening, and polymeric sand.'),
        line('l2', 'Seating Wall (24 lf)', 3500, 'Build matching seating wall with cap stones.'),
      ],
      status: 'Sent', createdAt: iso(-6), sentAt: iso(-6), closedAt: null,
      expiration: ymd(24), winLossReason: null, activities: [],
      reminders: [{ id: 'r1', date: ymd(1), frequency: 'once', note: 'Follow up on patio color choice' }],
    },
    {
      id: 3, parentId: null, version: 1,
      client: 'The Delgado Family', email: 'delgado.home@example.com', phone: '(980) 555-0110',
      address: '881 Providence Rd, Charlotte, NC 28207',
      total: 41200, isAlaCarte: false,
      projectTypes: ['Outdoor Kitchen'], projectSummary: 'Covered outdoor kitchen & grill island',
      lines: [
        line('l1', 'Grill Island & Counter', 22400, 'Masonry grill island with granite counter, built-in grill, and storage.'),
        line('l2', 'Cedar Pavilion 14x16', 15800, 'Cedar pavilion with metal roof over kitchen.'),
        line('l3', 'Electrical & Lighting', 3000, 'Dedicated circuits, outlets, and recessed lighting.'),
      ],
      status: 'Followed Up', createdAt: iso(-16), sentAt: iso(-14), closedAt: null,
      expiration: ymd(16), winLossReason: null, activities: [],
      reminders: [{ id: 'r1', date: ymd(-1), frequency: 'weekly', note: 'Waiting on financing decision' }],
    },
    {
      id: 4, parentId: null, version: 1,
      client: 'Karen Whitfield', email: 'kwhitfield@example.com', phone: '(704) 555-0173',
      address: '3307 Sharon View Rd, Charlotte, NC 28210',
      total: 9800, isAlaCarte: false,
      projectTypes: ['Hardscapes'], projectSummary: 'Fire pit & flagstone seating area',
      lines: [
        line('l1', 'Gas Fire Pit', 4200, 'Build masonry gas fire pit with lava rock.'),
        line('l2', 'Flagstone Seating Area', 5600, 'Irregular flagstone patio set on gravel base.'),
      ],
      status: 'Negotiating', createdAt: iso(-11), sentAt: iso(-9), closedAt: null,
      expiration: ymd(19), winLossReason: null, activities: [], reminders: [],
    },
    {
      id: 5, parentId: null, version: 1,
      client: 'Jerome Carter', email: 'jcarter@example.com', phone: '(980) 555-0155',
      address: '7420 Old Course Ln, Waxhaw, NC 28173',
      total: 63500, isAlaCarte: false,
      projectTypes: ['Deck (New)'], projectSummary: 'Multi-level composite deck & screened porch',
      lines: [
        line('l1', 'Composite Deck 20x24', 38500, 'Multi-level Trex Transcend deck with aluminum railings.'),
        line('l2', 'Screened Porch 14x16', 22000, 'Screened porch with cathedral ceiling and fan.'),
        line('l3', 'Permit & Engineering', 3000, 'Building permit and engineered footing plan.'),
      ],
      status: 'Won', createdAt: iso(-40), sentAt: iso(-38), closedAt: iso(-20),
      winLossReason: { category: 'Design & trust', note: 'Chose us for the 3D design and reviews.' },
      activities: [], reminders: [],
      jobData: {
        projectTypeOverride: 'Deck (New)',
        startDate: ymd(-10), targetDate: ymd(14),
        completedStages: ['hoa', 'zoning', 'building', 'precon', 'start', 'demo_footings', 'footing_insp', 'materials'],
        notes: 'Framing inspection scheduled for next week.',
        changeOrders: [
          { id: 'co1', number: 1, status: 'Approved', total: 2400, description: 'Add under-deck lighting package.', createdAt: iso(-8) },
        ],
      },
      contractDraft: {
        contractNum: 'EOL070005', signed: false,
        projectTypes: ['Deck (New)'],
        scopeBullets: ['Multi-level composite deck', 'Screened porch with cathedral ceiling'],
      },
    },
    {
      id: 6, parentId: null, version: 1,
      client: 'Alicia Monroe', email: 'alicia.monroe@example.com', phone: '(704) 555-0129',
      address: '1024 Wendover Rd, Charlotte, NC 28211',
      total: 8600, isAlaCarte: false,
      projectTypes: ['Deck (Resurface / Rebuild)'], projectSummary: 'Deck resurface & new railings',
      lines: [
        line('l1', 'Deck Resurface 16x20', 6100, 'Replace decking boards with composite; reuse framing.'),
        line('l2', 'Aluminum Railings', 2500, 'New black aluminum railings around deck perimeter.'),
      ],
      status: 'Won', createdAt: iso(-30), sentAt: iso(-28), closedAt: iso(-25),
      winLossReason: { category: 'Price & timeline', note: 'Best value and quickest start.' },
      activities: [], reminders: [],
      jobData: {
        projectTypeOverride: 'Deck (Resurface / Rebuild)',
        startDate: ymd(-24), targetDate: ymd(-2),
        completedStages: ['hoa', 'precon', 'start', 'demo', 'materials', 'framing_restructure', 'decking_railings', 'paint', 'punch'],
        notes: 'Punch list complete — ready to close and collect final payment.',
        changeOrders: [],
      },
      contractDraft: {
        contractNum: 'EOL070006', signed: true,
        projectTypes: ['Deck (Resurface / Rebuild)'],
        scopeBullets: ['Composite deck resurface', 'New aluminum railings'],
      },
    },
    {
      id: 7, parentId: null, version: 1,
      client: 'The Grant Family', email: 'grant.family@example.com', phone: '(980) 555-0198',
      address: '640 Fairview Rd, Charlotte, NC 28210',
      total: 32750, isAlaCarte: false,
      projectTypes: ['Deck (New)'], projectSummary: 'Elevated composite deck with stairs',
      lines: [
        line('l1', 'Elevated Composite Deck 18x22', 29750, 'Elevated deck with composite boards and lighting.'),
        line('l2', 'Stairs & Landing', 3000, 'Wide stairs with landing to yard.'),
      ],
      status: 'Won', createdAt: iso(-8), sentAt: iso(-6), closedAt: iso(-2),
      winLossReason: { category: 'Referral', note: 'Referred by the Carters.' },
      activities: [], reminders: [],
      jobData: {
        projectTypeOverride: 'Deck (New)',
        startDate: ymd(6), targetDate: ymd(26),
        completedStages: ['hoa', 'zoning', 'building'],
        notes: 'Permit approved — awaiting pre-con walkthrough.',
        changeOrders: [],
      },
      // No contractDraft yet → shows as "not started" in the Contracts list.
    },
    {
      id: 8, parentId: null, version: 1,
      client: 'Tom Rundgren', email: 'trundgren@example.com', phone: '(704) 555-0164',
      address: '2210 Colony Rd, Charlotte, NC 28209',
      total: 15400, isAlaCarte: false,
      projectTypes: ['Hardscapes'], projectSummary: 'Segmental retaining wall',
      lines: [
        line('l1', 'Retaining Wall (110 sf face)', 13400, 'Engineered segmental block retaining wall with drainage.'),
        line('l2', 'Backfill & Grading', 2000, 'Import stone backfill and regrade slope.'),
      ],
      status: 'Lost', createdAt: iso(-34), sentAt: iso(-32), closedAt: iso(-18),
      winLossReason: { category: 'Price', note: 'Went with a lower bid.' },
      activities: [], reminders: [],
    },
  ]

  const subcontractors = [
    { id: 1, name: 'Cardinal Framing Co.', trade: 'Framing', phone: '704-555-2201', email: 'ops@cardinalframing.example', rating: 5, startDate: ymd(-420), endDate: '', notes: 'Go-to framing crew. Fast and clean.', incidents: [], cois: [{ id: 101, name: 'Cardinal-COI-2026.png', type: 'image/png', size: 68, dataUrl: SAMPLE_COI, uploadedAt: iso(-40) }] },
    { id: 2, name: 'Bright Spark Electric', trade: 'Electrical', phone: '704-555-2233', email: 'dispatch@brightspark.example', rating: 5, startDate: ymd(-300), endDate: '', notes: 'Licensed & insured. Handles all permit inspections.', incidents: [], cois: [] },
    { id: 3, name: 'Stoneworks Hardscape', trade: 'Concrete / Footings', phone: '980-555-2244', email: 'crew@stoneworks.example', rating: 4, startDate: ymd(-210), endDate: '', notes: 'Great paver work; occasionally runs behind on scheduling.', incidents: [{ id: 301, date: iso(-22), text: 'Arrived a day late to the Whitfield footing pour.' }], cois: [] },
    { id: 4, name: 'ClearView Screens', trade: 'Other', phone: '704-555-2255', email: 'install@clearview.example', rating: 4, startDate: ymd(-150), endDate: '', notes: 'Screen enclosures and Eze-Breeze windows.', incidents: [], cois: [] },
    { id: 5, name: 'Summit Roofing', trade: 'Roofing', phone: '704-555-2266', email: 'office@summitroof.example', rating: 5, startDate: ymd(-500), endDate: '', notes: 'Porch and pavilion roofing. Excellent cleanup.', incidents: [], cois: [] },
  ]

  return {
    proposals,
    nextProposalId: 9,
    subcontractors,
    nextSubId: 6,
    catalog: DEMO_CATALOG,
    nextCatalogId: DEMO_CATALOG.length + 1,
    branding: { companyName: 'Evergreen Outdoor Living', plan: 'enterprise', primaryColor: '#2c2926', sidebar: '#26262b' },
  }
}
