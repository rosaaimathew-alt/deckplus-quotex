import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { supabase, currentUserId, loadOrg, armAdapter, disarmAdapter, reserveIdBlock } from './supabase'
import { DEMO, DEMO_STORE_KEY, buildDemoSeed } from './demo'
import { HISTORICAL_JOBS, HISTORICAL_APPTS } from './historicalData'
import { PORCH_BUILD_DEFAULTS, PORCH_BUILD_SCOPE_DEFAULTS } from './porchBuild'

// ── Persistence ───────────────────────────────────────────────────────────────
// Real data lives in Supabase as one row per record (see src/supabase.js).
// This store is a live cache of those rows: bootstrapOrg() loads them after
// sign-in, then the adapter turns every store change into one row write and
// applies every Realtime row change back into the store. Nothing is merged,
// and nothing is persisted in this browser — except DEMO builds, which keep a
// sandbox copy in localStorage under their own key.
const demoLocalStorage = {
  getItem:    (name) => { try { return localStorage.getItem(name) } catch { return null } },
  setItem:    (name, value) => { try { localStorage.setItem(name, value) } catch { /* ignore */ } },
  removeItem: (name) => { try { localStorage.removeItem(name) } catch { /* ignore */ } },
}
// Non-demo builds: the persist middleware is inert (reads nothing, writes nothing).
const nullStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }

export { currentUserEmail } from './supabase'

// Contract numbers: the packet starts at "<prefix>-0000" (DP-0000) and the
// office types the real number before the contract goes out. The prefix is per
// org (org_settings.contractPrefix, default "DP").
export function contractNumberFor(id, prefix) {
  const pre = prefix || useStore.getState().contractPrefix || 'DP'
  return `${pre}-0000`
}

const SEED_CATALOG = [
  { id: 1, name: 'Chain Link Fence Installation', description: 'Supply and install chain link fence with posts set in concrete, including all hardware.', unit: 'LF', unitPrice: 0, minPrice: 0, maxPrice: 0, count: 12, category: 'Fencing', confidence: 95 },
  { id: 2, name: 'Wood Privacy Fence (6ft Cedar)', description: 'Supply and install 6ft cedar privacy fence with pressure-treated posts set in concrete, including all hardware and fasteners.', unit: 'LF', unitPrice: 0, minPrice: 0, maxPrice: 0, count: 18, category: 'Fencing', confidence: 97 },
  { id: 3, name: 'Fence Post (Set in Concrete)', description: 'Set fence post in concrete footing, including excavation and backfill.', unit: 'EA', unitPrice: 0, minPrice: 0, maxPrice: 0, count: 22, category: 'Fencing', confidence: 94 },
  { id: 4, name: 'Single Walk Gate', description: 'Supply and install single walk gate with hardware, hinges, and latch.', unit: 'EA', unitPrice: 0, minPrice: 0, maxPrice: 0, count: 15, category: 'Gates', confidence: 92 },
  { id: 5, name: 'Double Drive Gate', description: 'Supply and install double drive gate with hardware, hinges, drop rod, and latch.', unit: 'EA', unitPrice: 0, minPrice: 0, maxPrice: 0, count: 9, category: 'Gates', confidence: 89 },
  { id: 6, name: 'Fence Removal & Haul-off', description: 'Remove existing fence and haul off all debris.', unit: 'LF', unitPrice: 0, minPrice: 0, maxPrice: 0, count: 14, category: 'Demo', confidence: 91 },
  { id: 7, name: 'Debris Haul-off', description: 'Load and haul off job site debris.', unit: 'EA', unitPrice: 0, minPrice: 0, maxPrice: 0, count: 11, category: 'Demo', confidence: 88 },
  { id: 8, name: 'Vinyl Fence Installation', description: 'Supply and install vinyl fence panels with posts set in concrete.', unit: 'LF', unitPrice: 0, minPrice: 0, maxPrice: 0, count: 7, category: 'Fencing', confidence: 85 },
  { id: 9, name: 'Aluminum Fence Installation', description: 'Supply and install aluminum fence panels with posts set in concrete.', unit: 'LF', unitPrice: 0, minPrice: 0, maxPrice: 0, count: 6, category: 'Fencing', confidence: 83 },
  { id: 10, name: 'Concrete Footing (per post)', description: 'Pour concrete footing for fence post, including excavation.', unit: 'EA', unitPrice: 0, minPrice: 0, maxPrice: 0, count: 20, category: 'Materials', confidence: 96 },
]

// Deck Builder pricing lives in one place (the "Deck Builder Pricing" editor,
// opened from the Item Catalog) instead of loose catalog rows.
//
//  • Per-collection prices (decking $/LF AND fascia $/LF) ride on each
//    "… Porch Floor Upgrade" catalog item — decking in unitPrice/cost, fascia in
//    the fasciaRate/fasciaCost fields — so every collection carries its own two prices.
//  • Shared component rates (framing, stairs, railing, etc.) that don't vary by
//    collection live in the `deckComponentRates` slice below.
// The Deck Builder reads from both; nothing is typed twice.
export const DECK_COMPONENT_DEFAULTS = {
  framing:     { label: 'Framing',                unit: 'SF', rate: 14,   cost: 9 },
  stairs:      { label: 'Stairs (per step)',      unit: 'EA', rate: 145,  cost: 90 },
  railing:     { label: 'Railing',                unit: 'LF', rate: 52,   cost: 30 },
  landing:     { label: 'Landing',                unit: 'SF', rate: 75,   cost: 43.75 },  // per SF of landing (the rep sets each size)
  boxstep:     { label: 'Box steps (per step)',   unit: 'EA', rate: 100,  cost: 0 },
  blocking:    { label: 'Picture-frame blocking', unit: 'LF', rate: 3.5,  cost: 2.2 },
  borderlabor: { label: 'Border labor / miters',  unit: 'LF', rate: 4,    cost: 2 },
  splinejoist: { label: 'Spline sister joist',    unit: 'LF', rate: 9,    cost: 6 },
  fascia:      { label: 'Fascia 1×12 board (16′, default)', unit: 'EA', rate: 55, cost: 34 },  // sold per 16' board
}

// Porch Conversion (Eze-Breeze) formula. Placeholder rates — the manager sets the
// real numbers in Item Catalog → Formulas. Layout math lives in the builder.
export const PORCH_COMPONENT_DEFAULTS = {
  column:    { label: 'Plates & 6×6 columns',       unit: 'EA', rate: 350,  cost: 150 },  // per column (plates rolled in)
  window:    { label: 'Eze-Breeze window unit',     unit: 'EA', rate: 700,  cost: 0 },    // per window (Deck Plus, 700 going forward)
  transom:   { label: 'Transom unit (wall > 105″)', unit: 'EA', rate: 130,  cost: 0 },    // per transom (Deck Plus sheet)
  door:      { label: 'Exit / storm door (36″)',    unit: 'EA', rate: 900,  cost: 560 },  // per door
  finishing: { label: 'Paint, seal & refinish',     unit: 'LS', rate: 1500, cost: 800 },  // flat per porch
}

// Standard open-deck scope of work (materials & methods) — one bullet per line.
// The builder prepends the deck size and appends option lines (decking brand,
// railing, stairs, fascia, border…) so the customer sees the build, not our math.
// Extra standard lines for the Deck Builder scope (the deck wording itself comes
// from the catalog). Empty by default; the office can add lines in Formulas.
export const DECK_SCOPE_DEFAULT = ''

// Extra standard lines for the Porch Conversion scope (its wording comes from the
// catalog's Porch Remodel items). Empty by default.
export const PORCH_SCOPE_DEFAULT = ''

// One-time cleanup: an earlier build injected "Deck Components" catalog items
// (tagged `deckComp`). That approach was dropped in favor of the Deck Pricing
// editor, so strip those orphaned rows from any catalog on load.
const stripDeckItems = (catalog) => {
  const list = Array.isArray(catalog) ? catalog : []
  return list.some(c => c?.deckComp) ? list.filter(c => !c?.deckComp) : list
}

export const PROPOSAL_STATUSES = ['Draft', 'Sent', 'Followed Up', 'Negotiating', 'Won', 'Lost', 'MIA', 'Archived']

// 'Archived' = an earlier revision the customer didn't move forward with, but
// the deal was won on a different version. Kept in the system and grouped under
// the customer, but neutral in analytics: excluded from won, lost, and pipeline.

// Starter follow-up email templates. {client} is replaced with the customer name.
export const DEFAULT_EMAIL_TEMPLATES = [
  { id: 1, name: 'Gentle nudge', body: "Hi {client},\n\nJust circling back on the proposal I sent over — did you have any questions? Happy to walk through anything or adjust the scope to fit your needs.\n\nTalk soon!" },
  { id: 2, name: 'Ready to schedule', body: "Hi {client},\n\nWe have a few openings coming up and I'd love to get your project on the calendar. A 20% deposit locks in your start date. Want me to send over the next steps?\n\nThanks!" },
  { id: 3, name: 'Last check-in', body: "Hi {client},\n\nWanted to check in one more time before I close out your file. Are you still interested in moving forward? Just reply and let me know either way — no pressure.\n\nAppreciate it!" },
  { id: 4, name: 'Thanks for your time', body: "Hi {client},\n\nThank you for taking the time to meet with us. It was great learning about your project. Your proposal is attached — reach out anytime with questions.\n\nBest," },
]

// Fill in any branding fields missing from an older persisted install. Existing
// installs (which predate the plan/color fields) are treated as the owner's own
// account: full Enterprise access, and their prior look (sky blue) is preserved
// rather than being reset to the new free-tier charcoal/brass default.
export function normalizeBranding(b) {
  if (!b) {
    return {
      companyName: 'QUOTEX', tagline: 'Smart Contractor Pricing', logo: null,
      gcName: '', licenseNo: '',
      primaryColor: '#b0894f', sidebarColor: '#26262b', accentColor: null, plan: 'enterprise',
    }
  }
  return {
    companyName: b.companyName ?? 'QUOTEX',
    tagline: b.tagline ?? 'Smart Contractor Pricing',
    logo: b.logo ?? null,
    gcName: b.gcName ?? '',       // licensed General Contractor named in the contract (blank = none)
    licenseNo: b.licenseNo ?? '', // GC license number printed in the client acknowledgment
    primaryColor: b.primaryColor || '#b0894f',   // brass default when unset (matches charcoal/brass identity)
    sidebarColor: b.sidebarColor || '#26262b',     // charcoal default when unset
    accentColor: b.accentColor ?? null,
    plan: b.plan || 'enterprise',
  }
}

export const WIN_REASONS = [
  'Price competitive', 'Strong relationship', 'Fast turnaround',
  'Client referral', 'Quality reputation', 'Best value', 'Other',
]
export const LOSS_REASONS = [
  'Price too high', 'Went with competitor', 'Project cancelled',
  'No response', 'Timing not right', 'Scope mismatch', 'Other',
]

export const ACTIVITY_TYPES = ['Call', 'Follow-up', 'Meeting', 'Email', 'Objection', 'Note']

export const useStore = create(
  persist(
    (set, get) => ({
      // ── Catalog ──────────────────────────────────────────────────────────
      catalog: SEED_CATALOG,
      nextCatalogId: SEED_CATALOG.length + 1,

      addCatalogItems: (items) => {
        const { catalog, nextCatalogId } = get()
        let idCounter = nextCatalogId
        const updated = [...catalog]
        items.forEach((item) => {
          const existing = updated.find(
            (c) => c.name.toLowerCase().trim() === item.name.toLowerCase().trim()
          )
          const weight = item.profitable ? 1.3 : 1.0
          if (existing) {
            const totalWeight = existing.count + weight
            existing.unitPrice = Math.round(
              (existing.unitPrice * existing.count + item.unitPrice * weight) / totalWeight
            )
            existing.minPrice = Math.min(existing.minPrice, item.unitPrice)
            existing.maxPrice = Math.max(existing.maxPrice, item.unitPrice)
            existing.count += 1
            existing.confidence = Math.min(99, existing.confidence + 1)
            existing.lastUpdated = new Date().toLocaleDateString()
            if (item.description) existing.description = item.description
          } else {
            updated.push({
              id: idCounter++,
              name: item.name,
              section: item.section || '',
              description: item.description || '',
              unit: item.unit || 'EA',
              unitPrice: item.unitPrice,
              minPrice: item.unitPrice,
              maxPrice: item.unitPrice,
              count: 1,
              category: item.category || 'General',
              confidence: item.confidence || 70,
              lastUpdated: new Date().toLocaleDateString(),
            })
          }
        })
        set({ catalog: updated, nextCatalogId: idCounter })
      },

      updateCatalogItem: (id, changes) =>
        set((s) => ({
          catalog: s.catalog.map((c) => (c.id === id ? { ...c, ...changes } : c)),
        })),

      deleteCatalogItem: (id) =>
        set((s) => ({ catalog: s.catalog.filter((c) => c.id !== id) })),

      // ── Deck Builder shared component rates (edited in the Deck Pricing editor) ──
      // Per-collection decking + fascia prices live on the catalog items themselves;
      // these are the rates that DON'T vary by collection.
      deckComponentRates: JSON.parse(JSON.stringify(DECK_COMPONENT_DEFAULTS)),

      setDeckComponentRate: (key, changes) =>
        set((s) => ({
          deckComponentRates: {
            ...s.deckComponentRates,
            [key]: { ...(s.deckComponentRates?.[key] || DECK_COMPONENT_DEFAULTS[key]), ...changes },
          },
        })),

      // User-defined shared components — manual-qty lines the contractor adds once
      // (e.g. "$1,000 per extra foot of height"); they appear on every deck quote.
      deckCustomComponents: [],

      addDeckCustomComponent: (comp) =>
        set((s) => ({
          deckCustomComponents: [
            ...s.deckCustomComponents,
            {
              id: `dcc-${Math.random().toString(36).slice(2, 9)}`,
              label: (comp?.label || '').trim() || 'Custom component',
              unit: comp?.unit || 'EA',
              rate: Number(comp?.rate) || 0,
              cost: Number(comp?.cost) || 0,
            },
          ],
        })),

      updateDeckCustomComponent: (id, changes) =>
        set((s) => ({
          deckCustomComponents: s.deckCustomComponents.map(c => c.id === id ? { ...c, ...changes } : c),
        })),

      removeDeckCustomComponent: (id) =>
        set((s) => ({ deckCustomComponents: s.deckCustomComponents.filter(c => c.id !== id) })),

      // Manager control: when true, sales can't change any deck-formula pricing in
      // the builder — they enter dimensions/quantities and the rates come from here.
      deckFormulaLocked: false,
      setDeckFormulaLocked: (locked) => set({ deckFormulaLocked: !!locked }),

      // Standard open-deck scope of work (materials & methods) — one bullet per line.
      // The builder prepends the deck size and appends option lines (decking brand,
      // railing, stairs, fascia, border…) so the customer sees the build, not our math.
      deckScopeTemplate: DECK_SCOPE_DEFAULT,
      setDeckScopeTemplate: (t) => set({ deckScopeTemplate: t }),

      // ── Porch Conversion (Eze-Breeze) formula — mirrors the deck slices ──────
      porchComponentRates: JSON.parse(JSON.stringify(PORCH_COMPONENT_DEFAULTS)),
      setPorchComponentRate: (key, changes) =>
        set((s) => ({
          porchComponentRates: {
            ...s.porchComponentRates,
            [key]: { ...(s.porchComponentRates?.[key] || PORCH_COMPONENT_DEFAULTS[key]), ...changes },
          },
        })),

      porchCustomComponents: [],
      addPorchCustomComponent: (comp) =>
        set((s) => ({
          porchCustomComponents: [
            ...s.porchCustomComponents,
            {
              id: `pcc-${Math.random().toString(36).slice(2, 9)}`,
              label: (comp?.label || '').trim() || 'Custom component',
              unit: comp?.unit || 'EA',
              rate: Number(comp?.rate) || 0,
              cost: Number(comp?.cost) || 0,
            },
          ],
        })),
      updatePorchCustomComponent: (id, changes) =>
        set((s) => ({ porchCustomComponents: s.porchCustomComponents.map(c => c.id === id ? { ...c, ...changes } : c) })),
      removePorchCustomComponent: (id) =>
        set((s) => ({ porchCustomComponents: s.porchCustomComponents.filter(c => c.id !== id) })),

      porchFormulaLocked: false,
      setPorchFormulaLocked: (locked) => set({ porchFormulaLocked: !!locked }),

      porchScopeTemplate: PORCH_SCOPE_DEFAULT,
      setPorchScopeTemplate: (t) => set({ porchScopeTemplate: t }),

      // ── Porch Builder (new-build open / ScreenEze / Eze-Breeze porches) ─────
      // Rules in docs/PORCH_BUILDER_SPEC.md; engine in src/porchBuild.js.
      // Rates are stored sparsely: only keys the office changed are kept, so new
      // defaults still flow in and a rate the office set never gets overwritten.
      porchBuildRates: {},
      setPorchBuildRate: (key, changes) =>
        set((s) => ({
          porchBuildRates: {
            ...(s.porchBuildRates || {}),
            [key]: { ...PORCH_BUILD_DEFAULTS[key], ...(s.porchBuildRates?.[key] || {}), ...changes },
          },
        })),
      porchBuildLocked: false,
      setPorchBuildLocked: (locked) => set({ porchBuildLocked: !!locked }),
      // Scope text per porch type: { open, screen, ezebreeze }
      porchBuildScopes: { ...PORCH_BUILD_SCOPE_DEFAULTS },
      setPorchBuildScope: (type, text) =>
        set((s) => ({ porchBuildScopes: { ...PORCH_BUILD_SCOPE_DEFAULTS, ...(s.porchBuildScopes || {}), [type]: text } })),

      // ── Catalog categories (user-editable) ───────────────────────────────
      catalogCategories: [
        'Fencing','Gates','Demo','Materials','Labor','Framing','Concrete','Electrical',
        'Plumbing','Roofing','Flooring','Drywall','Painting','HVAC','Windows','Doors',
        'Tile','Insulation','Siding','General',
      ],

      addCatalogCategory: (name) =>
        set((s) => {
          const trimmed = name.trim()
          if (!trimmed || s.catalogCategories.includes(trimmed)) return s
          return { catalogCategories: [...s.catalogCategories, trimmed] }
        }),

      renameCatalogCategory: (oldName, newName) =>
        set((s) => {
          const trimmed = newName.trim()
          if (!trimmed || trimmed === oldName) return s
          return {
            catalogCategories: s.catalogCategories.map(c => c === oldName ? trimmed : c),
            catalog: s.catalog.map(item => item.category === oldName ? { ...item, category: trimmed } : item),
          }
        }),

      deleteCatalogCategory: (name) =>
        set((s) => ({ catalogCategories: s.catalogCategories.filter(c => c !== name) })),

      // ── Project / service types (analytics, user-editable) ───────────────
      projectTypes: [
        'Open Deck','Screen Porches','Eze-Breeze Porches','Open Porches',
        'Porch Conversions','Sunrooms','Hardscapes',
      ],

      addProjectType: (name) =>
        set((s) => {
          const t = name.trim()
          if (!t || s.projectTypes.includes(t)) return s
          return { projectTypes: [...s.projectTypes, t] }
        }),

      renameProjectType: (oldName, newName) =>
        set((s) => {
          const t = newName.trim()
          if (!t || t === oldName) return s
          return {
            projectTypes: s.projectTypes.map(p => p === oldName ? t : p),
            proposals: s.proposals.map(p => ({
              ...p,
              projectTypes: (p.projectTypes || []).map(pt => pt === oldName ? t : pt),
              contractDraft: p.contractDraft ? {
                ...p.contractDraft,
                projectTypes: (p.contractDraft.projectTypes || []).map(pt => pt === oldName ? t : pt),
              } : p.contractDraft,
            })),
          }
        }),

      deleteProjectType: (name) =>
        set((s) => ({ projectTypes: s.projectTypes.filter(p => p !== name) })),

      // ── Templates (quote line items) ─────────────────────────────────────
      templates: [],
      nextTemplateId: 1,

      saveTemplate: ({ name, description, lines }) => {
        const { templates, nextTemplateId } = get()
        set({
          templates: [
            { id: nextTemplateId, name, description, lines, createdAt: new Date().toISOString() },
            ...templates,
          ],
          nextTemplateId: nextTemplateId + 1,
        })
      },

      deleteTemplate: (id) =>
        set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),

      // ── Scope Templates (pre-built bullet sets for contract scope) ────────
      scopeTemplates: [],
      nextScopeTemplateId: 1,

      saveScopeTemplate: ({ name, projectType, bullets }) => {
        const { scopeTemplates, nextScopeTemplateId } = get()
        set({
          scopeTemplates: [
            { id: nextScopeTemplateId, name, projectType, bullets, createdAt: new Date().toISOString() },
            ...scopeTemplates,
          ],
          nextScopeTemplateId: nextScopeTemplateId + 1,
        })
      },

      deleteScopeTemplate: (id) =>
        set((s) => ({ scopeTemplates: s.scopeTemplates.filter((t) => t.id !== id) })),

      // ── Payment Schedule Templates ─────────────────────────────────────────
      paymentSchedules: [],
      nextPaymentScheduleId: 1,

      savePaymentSchedule: ({ name, milestones }) => {
        const { paymentSchedules, nextPaymentScheduleId } = get()
        set({
          paymentSchedules: [
            { id: nextPaymentScheduleId, name, milestones, createdAt: new Date().toISOString() },
            ...paymentSchedules,
          ],
          nextPaymentScheduleId: nextPaymentScheduleId + 1,
        })
      },

      deletePaymentSchedule: (id) =>
        set((s) => ({ paymentSchedules: s.paymentSchedules.filter((t) => t.id !== id) })),

      // ── Payment Schedule Learning ──────────────────────────────────────────
      // Tracks { [projectTag]: { [scheduleKey]: usageCount } }
      paymentScheduleLearning: {},

      recordPaymentScheduleUsage: (tag, scheduleKey) => {
        if (!tag || !scheduleKey || scheduleKey === 'auto') return
        set(s => {
          const learning = { ...s.paymentScheduleLearning }
          if (!learning[tag]) learning[tag] = {}
          learning[tag] = { ...learning[tag], [scheduleKey]: (learning[tag][scheduleKey] || 0) + 1 }
          return { paymentScheduleLearning: learning }
        })
      },

      // ── Proposals (CRM log) ───────────────────────────────────────────────
      proposals: [],
      nextProposalId: 1,

      saveProposal: (proposalData) => {
        const { proposals, nextProposalId } = get()
        const existing = proposals.find((p) => p.id === proposalData.id)
        if (existing) {
          set({
            proposals: proposals.map((p) =>
              p.id === proposalData.id ? { ...p, ...proposalData } : p
            ),
          })
          return proposalData.id
        }
        // Auto-compute version number for revisions
        const version = proposalData.parentId
          ? proposals.filter(
              (p) => p.id === proposalData.parentId || p.parentId === proposalData.parentId
            ).length + 1
          : 1
        const id = nextProposalId
        set({
          proposals: [
            {
              id,
              parentId: proposalData.parentId || null,
              version,
              ownerId: currentUserId(),
              pmId: null,
              ...proposalData,
              status: 'Draft',
              createdAt: new Date().toISOString(),
              sentAt: null,
              closedAt: null,
              winLossReason: null,
              activities: [],
              reminders: [],
            },
            ...proposals,
          ],
          nextProposalId: id + 1,
        })
        return id
      },

      // Sending or printing moves a Draft to Sent. A proposal that is already
      // further along (Followed Up, Negotiating, Won, Lost…) keeps its status —
      // re-printing a Won proposal must never knock it back to Sent.
      markProposalSent: (id) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id !== id ? p
              : (!p.status || p.status === 'Draft')
                ? { ...p, status: 'Sent', sentAt: new Date().toISOString() }
                : { ...p, sentAt: p.sentAt || new Date().toISOString() }
          ),
        })),

      // Remember the tracked view-link token for a proposal so the activity log
      // can pull its open history (how many times the customer viewed it).
      setProposalViewToken: (id, viewToken) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === id ? { ...p, viewToken } : p
          ),
        })),

      updateProposalStatus: (id, status) =>
        set((s) => {
          const target = s.proposals.find((p) => p.id === id)
          // When a proposal is Won, the other revisions in the same customer's
          // group weren't lost — they were superseded by the winning version.
          // Auto-archive those siblings (unless already Won/Lost/Archived) so
          // they stay in the system without distorting win/loss/pipeline stats.
          const rootId = target ? (target.parentId || target.id) : null
          const siblingIds =
            status === 'Won' && rootId != null
              ? new Set(
                  s.proposals
                    .filter(
                      (p) =>
                        p.id !== id &&
                        (p.parentId || p.id) === rootId &&
                        !['Won', 'Lost', 'Archived'].includes(p.status)
                    )
                    .map((p) => p.id)
                )
              : new Set()
          return {
            proposals: s.proposals.map((p) => {
              if (p.id === id) {
                const closed = status === 'Won' || status === 'Lost'
                // Stamp the change so any manual status action resets the
                // 90-day stale-Sent clock (e.g. reviving an MIA back to Sent).
                return {
                  ...p,
                  status,
                  statusChangedAt: new Date().toISOString(),
                  autoMIA: false,
                  closedAt: closed ? new Date().toISOString() : p.closedAt,
                }
              }
              if (siblingIds.has(p.id)) return { ...p, status: 'Archived' }
              return p
            }),
          }
        }),

      setWinLossReason: (id, reason) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === id ? { ...p, winLossReason: reason } : p
          ),
        })),

      // ── Activities ───────────────────────────────────────────────────────
      addActivity: (proposalId, { type, text }) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === proposalId
              ? {
                  ...p,
                  activities: [
                    { id: Date.now(), type, text, createdAt: new Date().toISOString() },
                    ...(p.activities || []),
                  ],
                }
              : p
          ),
        })),

      deleteActivity: (proposalId, activityId) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === proposalId
              ? { ...p, activities: (p.activities || []).filter((a) => a.id !== activityId) }
              : p
          ),
        })),

      // ── Reminders ────────────────────────────────────────────────────────
      addReminder: (proposalId, reminder) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === proposalId
              ? {
                  ...p,
                  reminders: [
                    ...p.reminders,
                    { id: Date.now(), ...reminder, dismissed: false },
                  ],
                }
              : p
          ),
        })),

      dismissReminder: (proposalId, reminderId) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === proposalId
              ? {
                  ...p,
                  reminders: p.reminders.map((r) =>
                    r.id === reminderId ? { ...r, dismissed: true } : r
                  ),
                }
              : p
          ),
        })),

      // Bulk-add historical non-won proposals (Lost / MIA) to calibrate win rate.
      // Distributes count proposals evenly across the startDate–endDate range.
      bulkImportHistoricalProposals: ({ count, status, startDate, endDate }) =>
        set((s) => {
          const start = new Date(startDate + 'T12:00:00').getTime()
          const end   = new Date(endDate   + 'T12:00:00').getTime()
          const step  = count > 1 ? (end - start) / (count - 1) : 0
          let id = s.nextProposalId
          const newProposals = Array.from({ length: count }, (_, i) => {
            const ts = new Date(start + step * i).toISOString()
            const closed = status === 'Lost' || status === 'MIA'
            return {
              id: id++,
              parentId: null,
              version: 1,
              client: '', email: '', phone: '', address: '',
              total: 0, projectTypes: [], projectSummary: '',
              lines: [], isAlaCarte: false, showBreakdown: false,
              margin: 0, expiration: '',
              status,
              createdAt: ts,
              sentAt: ts,
              closedAt: closed ? ts : null,
              winLossReason: null,
              activities: [],
              reminders: [],
              isHistorical: true,
            }
          })
          return { proposals: [...s.proposals, ...newProposals], nextProposalId: id }
        }),

      // Import a historical won job with a real sale date (bypasses saveProposal's
      // forced status=Draft and createdAt=now so analytics bucket it correctly).
      importHistoricalJob: ({ client, address, projectTypes, total, saleDate }) =>
        set((s) => {
          const id = s.nextProposalId
          const iso = saleDate
            ? new Date(saleDate + 'T12:00:00').toISOString()
            : new Date().toISOString()
          return {
            proposals: [
              ...s.proposals,
              {
                id,
                parentId: null,
                version: 1,
                client: client || '',
                email: '',
                phone: '',
                address: address || '',
                total: Number(total) || 0,
                projectTypes: projectTypes || [],
                projectSummary: '',
                lines: [],
                isAlaCarte: false,
                showBreakdown: false,
                margin: 0,
                expiration: '',
                status: 'Won',
                createdAt: iso,
                sentAt: iso,
                closedAt: iso,
                winLossReason: null,
                activities: [],
                reminders: [],
                isHistorical: true,
              },
            ],
            nextProposalId: id + 1,
          }
        }),

      // One-click load of the real 2024–2025 history from historicalData.js:
      // every won job as a dated Won proposal, plus the non-won remainder of each
      // month's real appointment count as blank Lost proposals — all isHistorical
      // so they feed revenue/appointment analytics without touching the live
      // pipeline. Guarded so it can't double-import.
      historyImported: false,
      importHistory2024_2025: () =>
        set((s) => {
          if (s.historyImported) return {}
          let id = s.nextProposalId
          const mk = (over) => ({
            id: id++, parentId: null, version: 1,
            client: '', email: '', phone: '', address: '',
            total: 0, projectTypes: ['Other'], projectSummary: '',
            lines: [], isAlaCarte: false, showBreakdown: false,
            margin: 0, expiration: '',
            status: 'Won', winLossReason: null, activities: [], reminders: [],
            isHistorical: true, ...over,
          })
          const props = []
          for (const j of HISTORICAL_JOBS) {
            const iso = new Date(j.date + 'T12:00:00Z').toISOString()
            props.push(mk({ client: j.client, total: Number(j.total) || 0, status: 'Won', createdAt: iso, sentAt: iso, closedAt: iso }))
          }
          const wonByKey = {}
          HISTORICAL_JOBS.forEach(j => { const k = j.date.slice(0, 7); wonByKey[k] = (wonByKey[k] || 0) + 1 })
          for (const a of HISTORICAL_APPTS) {
            const key = `${a.year}-${String(a.month + 1).padStart(2, '0')}`
            const blanks = Math.max(0, a.appts - (wonByKey[key] || 0))
            for (let i = 0; i < blanks; i++) {
              const iso = new Date(Date.UTC(a.year, a.month, 2 + (i % 26), 12)).toISOString()
              props.push(mk({ status: 'Lost', createdAt: iso, sentAt: iso, closedAt: iso }))
            }
          }
          return { proposals: [...s.proposals, ...props], nextProposalId: id, historyImported: true }
        }),

      // Undo the historical import (remove every isHistorical proposal + reset the flag).
      clearHistory2024_2025: () =>
        set((s) => ({
          proposals: s.proposals.filter(p => !p.isHistorical),
          historyImported: false,
          tombstones: [...(s.tombstones || []), ...s.proposals.filter(p => p.isHistorical).map(p => `proposal:${p.id}`)],
        })),

      deleteProposal: (id) =>
        set((s) => ({
          proposals: s.proposals.filter((p) => p.id !== id),
          // Tombstone so the delete survives the union merge (and propagates to
          // other users) instead of being resurrected from the server copy.
          tombstones: [...(s.tombstones || []), `proposal:${id}`],
        })),

      // ── Manual grouping controls ─────────────────────────────────────────
      // Pull a single proposal out of its group so it stands alone as its own
      // client. If the proposal is the group's root and still has alternatives,
      // the earliest remaining alternative is promoted to anchor the rest so
      // nothing gets orphaned.
      detachProposal: (id) =>
        set((s) => {
          const target = s.proposals.find((p) => p.id === id)
          if (!target) return {}
          const rootId = target.parentId || target.id
          if (target.id === rootId) {
            const children = s.proposals.filter(
              (p) => p.parentId === rootId && p.id !== id
            )
            if (children.length === 0) return {} // already standalone
            const newRoot = children.reduce((a, b) =>
              new Date(a.createdAt || 0) <= new Date(b.createdAt || 0) ? a : b
            )
            return {
              proposals: s.proposals.map((p) => {
                if (p.id === id) return { ...p, parentId: null, version: 1 }
                if (p.id === newRoot.id) return { ...p, parentId: null, version: 1 }
                if (p.parentId === rootId) return { ...p, parentId: newRoot.id }
                return p
              }),
            }
          }
          // Target is an alternative — simply cut it loose.
          return {
            proposals: s.proposals.map((p) =>
              p.id === id ? { ...p, parentId: null, version: 1 } : p
            ),
          }
        }),

      // Merge an entire client group into another. Every proposal in the source
      // group becomes an alternative under the target group's root.
      mergeProposalGroups: (sourceId, targetId) =>
        set((s) => {
          const byId = Object.fromEntries(s.proposals.map((p) => [p.id, p]))
          const rootOf = (pid) => {
            const p = byId[pid]
            return p && p.parentId && byId[p.parentId] ? p.parentId : pid
          }
          const srcRoot = rootOf(sourceId)
          const tgtRoot = rootOf(targetId)
          if (!srcRoot || !tgtRoot || srcRoot === tgtRoot) return {}
          const srcMemberIds = new Set(
            s.proposals
              .filter((p) => p.id === srcRoot || p.parentId === srcRoot)
              .map((p) => p.id)
          )
          let version = s.proposals.filter(
            (p) => p.id === tgtRoot || p.parentId === tgtRoot
          ).length
          return {
            proposals: s.proposals.map((p) => {
              if (!srcMemberIds.has(p.id)) return p
              version += 1
              return { ...p, parentId: tgtRoot, version }
            }),
          }
        }),

      clearAllProposals: () =>
        set((s) => ({ proposals: [], nextProposalId: 1, tombstones: [...(s.tombstones || []), ...s.proposals.map(p => `proposal:${p.id}`)] })),

      saveContractDraft: (proposalId, draft) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === proposalId ? { ...p, contractDraft: { ...(p.contractDraft || {}), ...draft, savedAt: new Date().toISOString() } } : p
          ),
        })),

      markContractSigned: (proposalId, signed) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === proposalId
              ? {
                  ...p,
                  contractDraft: {
                    ...(p.contractDraft || {}),
                    signed,
                    signedAt: signed ? new Date().toISOString() : null,
                  },
                }
              : p
          ),
        })),

      // Bulk-mark contracts that were signed OUTSIDE the software (paper /
      // pre-existing deals imported into the app). Marks each given proposal's
      // contract as signed and tags it signedOffPlatform so it's clear these
      // weren't e-signed here. Gives them a contract number if missing so they
      // sit correctly in the Signed section.
      markContractsSignedOffPlatform: (ids) =>
        set((s) => {
          const idSet = new Set(ids)
          const now = new Date().toISOString()
          return {
            proposals: s.proposals.map((p) => {
              if (!idSet.has(p.id)) return p
              const existing = p.contractDraft || {}
              return {
                ...p,
                contractDraft: {
                  ...existing,
                  contractNum: existing.contractNum || contractNumberFor(p.id),
                  signed: true,
                  signedAt: existing.signedAt || now,
                  signedOffPlatform: true,
                },
              }
            }),
          }
        }),

      // Auto-flag stale proposals: a 'Sent' proposal that has gone 90 days with
      // no newer iteration, no logged activity, and no status change becomes
      // 'MIA' (missing in action). Uses the most recent touch across the whole
      // customer group, so making another revision anywhere in the group keeps
      // all its proposals alive. Idempotent — safe to call on every app load.
      //
      // CRITICAL: this reads state via get() and only calls set() when something
      // actually changes. It must NEVER write on an empty/unhydrated store —
      // otherwise, if it runs before async data has loaded, persist would save
      // the empty startup state over the real data (in localStorage AND the KV
      // server). The `proposals.length === 0` guard and the change check ensure
      // no write happens unless there is real, loaded data with a stale 'Sent'.
      autoExpireStaleSent: () => {
        const s = get()
        const list = s.proposals || []
        if (list.length === 0) return   // unhydrated or genuinely empty → never write
        const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000
        const now = Date.now()
        const lastTouch = (p) => {
          const ts = [p.sentAt, p.createdAt, p.updatedAt, p.statusChangedAt,
            ...((p.activities || []).map((a) => a.createdAt))]
            .filter(Boolean)
            .map((t) => new Date(t).getTime())
            .filter((n) => !Number.isNaN(n))
          return ts.length ? Math.max(...ts) : 0
        }
        // Most recent touch per customer group (root id).
        const groupTouch = {}
        for (const p of list) {
          const root = p.parentId || p.id
          groupTouch[root] = Math.max(groupTouch[root] || 0, lastTouch(p))
        }
        let changed = false
        const proposals = list.map((p) => {
          if (p.status !== 'Sent') return p
          const root = p.parentId || p.id
          const touch = groupTouch[root] || lastTouch(p)
          if (touch && now - touch >= NINETY_DAYS) {
            changed = true
            return { ...p, status: 'MIA', autoMIA: true, statusChangedAt: new Date().toISOString() }
          }
          return p
        })
        if (changed) set({ proposals })   // only write when a real change occurred
      },

      // ── Job Management (stages, notes, dates per won proposal) ──────────
      updateJobData: (proposalId, changes) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === proposalId
              ? { ...p, jobData: { ...(p.jobData || {}), ...changes } }
              : p
          ),
        })),

      // Schedule (or clear) a single job stage on the PM calendar.
      setJobStageDate: (proposalId, stageKey, date) =>
        set((s) => ({
          proposals: s.proposals.map((p) => {
            if (p.id !== proposalId) return p
            const stageDates = { ...((p.jobData?.stageDates) || {}) }
            if (date) stageDates[stageKey] = date
            else delete stageDates[stageKey]
            return { ...p, jobData: { ...(p.jobData || {}), stageDates } }
          }),
        })),

      toggleJobStage: (proposalId, stageKey) =>
        set((s) => ({
          proposals: s.proposals.map((p) => {
            if (p.id !== proposalId) return p
            const completed = new Set(p.jobData?.completedStages || [])
            if (completed.has(stageKey)) completed.delete(stageKey)
            else completed.add(stageKey)
            return { ...p, jobData: { ...(p.jobData || {}), completedStages: [...completed] } }
          }),
        })),

      // ── Change Orders ────────────────────────────────────────────────────
      addChangeOrder: (proposalId, co) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id !== proposalId ? p : {
              ...p,
              jobData: {
                ...(p.jobData || {}),
                changeOrders: [
                  ...((p.jobData?.changeOrders) || []),
                  { id: Date.now(), status: 'Pending', ...co, createdAt: new Date().toISOString() },
                ],
              },
            }
          ),
        })),

      updateChangeOrder: (proposalId, coId, changes) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id !== proposalId ? p : {
              ...p,
              jobData: {
                ...(p.jobData || {}),
                changeOrders: (p.jobData?.changeOrders || []).map((co) =>
                  co.id === coId ? { ...co, ...changes } : co
                ),
              },
            }
          ),
        })),

      deleteChangeOrder: (proposalId, coId) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id !== proposalId ? p : {
              ...p,
              jobData: {
                ...(p.jobData || {}),
                changeOrders: (p.jobData?.changeOrders || []).filter((co) => co.id !== coId),
              },
            }
          ),
        })),

      // ── Standalone Change Orders (for contracts signed outside QuoteX) ────
      addStandaloneCO: (co) =>
        set((s) => ({
          standaloneChangeOrders: [
            { id: Date.now(), status: 'Pending', createdAt: new Date().toISOString(), ...co },
            ...(s.standaloneChangeOrders || []),
          ],
        })),

      updateStandaloneCO: (coId, changes) =>
        set((s) => ({
          standaloneChangeOrders: (s.standaloneChangeOrders || []).map((co) =>
            co.id === coId ? { ...co, ...changes } : co
          ),
        })),

      deleteStandaloneCO: (coId) =>
        set((s) => ({
          standaloneChangeOrders: (s.standaloneChangeOrders || []).filter((co) => co.id !== coId),
        })),

      // ── Daily Logs ───────────────────────────────────────────────────────
      addDailyLog: (proposalId, log) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id !== proposalId ? p : {
              ...p,
              jobData: {
                ...(p.jobData || {}),
                dailyLogs: [
                  { id: Date.now(), ...log, createdAt: new Date().toISOString() },
                  ...((p.jobData?.dailyLogs) || []),
                ],
              },
            }
          ),
        })),

      deleteDailyLog: (proposalId, logId) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id !== proposalId ? p : {
              ...p,
              jobData: {
                ...(p.jobData || {}),
                dailyLogs: (p.jobData?.dailyLogs || []).filter((l) => l.id !== logId),
              },
            }
          ),
        })),

      // ── Warranty / Callback Log ──────────────────────────────────────────
      addWarrantyItem: (proposalId, item) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id !== proposalId ? p : {
              ...p,
              jobData: {
                ...(p.jobData || {}),
                warrantyItems: [
                  { id: Date.now(), ...item, status: 'Open', createdAt: new Date().toISOString() },
                  ...((p.jobData?.warrantyItems) || []),
                ],
              },
            }
          ),
        })),

      updateWarrantyItem: (proposalId, itemId, changes) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id !== proposalId ? p : {
              ...p,
              jobData: {
                ...(p.jobData || {}),
                warrantyItems: (p.jobData?.warrantyItems || []).map((w) =>
                  w.id === itemId ? { ...w, ...changes } : w
                ),
              },
            }
          ),
        })),

      // ── Subcontractors ───────────────────────────────────────────────────
      subcontractors: [],
      nextSubId: 1,

      addSubcontractor: (sub) =>
        set((s) => ({
          subcontractors: [
            { id: s.nextSubId, ...sub, createdAt: new Date().toISOString() },
            ...s.subcontractors,
          ],
          nextSubId: s.nextSubId + 1,
        })),

      updateSubcontractor: (id, changes) =>
        set((s) => ({
          subcontractors: s.subcontractors.map((sub) =>
            sub.id === id ? { ...sub, ...changes } : sub
          ),
        })),

      deleteSubcontractor: (id) =>
        set((s) => ({ subcontractors: s.subcontractors.filter((s) => s.id !== id) })),

      // ── Standalone change orders (contracts signed outside QuoteX) ────────
      standaloneChangeOrders: [],

      // ── Job Costs (actual costs entered per won proposal) ────────────────
      jobCosts: {},

      saveJobCosts: (proposalId, costs) =>
        set((s) => ({
          jobCosts: {
            ...s.jobCosts,
            [proposalId]: { ...costs, updatedAt: new Date().toISOString() },
          },
        })),

      deleteJobCosts: (proposalId) =>
        set((s) => {
          const updated = { ...s.jobCosts }
          delete updated[proposalId]
          return { jobCosts: updated }
        }),

      // ── Scope Examples (learned from past contracts) ──────────────────────
      scopeExamples: [],

      saveScopeExamples: (contractId, examples) =>
        set((s) => {
          const updated = [...s.scopeExamples]
          examples.forEach(ex => {
            if (!ex.itemName || !ex.bulletText?.trim()) return
            const idx = updated.findIndex(e => e.itemName === ex.itemName && e.contractId === contractId)
            if (idx >= 0) updated[idx] = { ...updated[idx], ...ex }
            else updated.push({ id: `${contractId}-${ex.itemName}`, contractId, savedAt: new Date().toISOString(), ...ex })
          })
          return { scopeExamples: updated }
        }),

      // ── Import (from backup JSON) ─────────────────────────────────────────
      importCatalog: (items) => {
        if (!Array.isArray(items) || items.length === 0) return
        const maxId = items.reduce((m, i) => Math.max(m, i.id || 0), 0)
        set({ catalog: items, nextCatalogId: maxId + 1 })
      },

      importProposals: (items) => {
        if (!Array.isArray(items) || items.length === 0) return
        const maxId = items.reduce((m, i) => Math.max(m, i.id || 0), 0)
        set({ proposals: items, nextProposalId: maxId + 1 })
      },

      importTemplates: (items) => {
        if (!Array.isArray(items) || items.length === 0) return
        const maxId = items.reduce((m, i) => Math.max(m, i.id || 0), 0)
        set({ templates: items, nextTemplateId: maxId + 1 })
      },

      // ── Theme ────────────────────────────────────────────────────────────────
      theme: 'light',
      setTheme: (theme) => set({ theme }),

      // ── Active role view (sales | pm | manager) ──────────────────────────────
      role: 'manager',
      setRole: (role) => set({ role }),

      // ── PM calendar: tentative projects + which jobs are hidden ───────────────
      plannedProjects: [],
      addPlannedProject: (proj) =>
        set((s) => ({ plannedProjects: [{ id: Date.now(), color: '#2563eb', ...proj }, ...s.plannedProjects] })),
      updatePlannedProject: (id, changes) =>
        set((s) => ({ plannedProjects: s.plannedProjects.map((p) => (p.id === id ? { ...p, ...changes } : p)) })),
      deletePlannedProject: (id) =>
        set((s) => ({ plannedProjects: s.plannedProjects.filter((p) => p.id !== id) })),
      calendarHiddenJobs: [],
      toggleCalendarHiddenJob: (id) =>
        set((s) => ({
          calendarHiddenJobs: s.calendarHiddenJobs.includes(id)
            ? s.calendarHiddenJobs.filter((x) => x !== id)
            : [...s.calendarHiddenJobs, id],
        })),

      // ── Finance: cards + expenses (manager / accounting side) ────────────────
      financeCards: [],
      addFinanceCard: (c) =>
        set((s) => ({ financeCards: [...s.financeCards, { id: Date.now(), color: '#0f766e', ...c }] })),
      updateFinanceCard: (id, changes) =>
        set((s) => ({ financeCards: s.financeCards.map((c) => (c.id === id ? { ...c, ...changes } : c)) })),
      deleteFinanceCard: (id) =>
        set((s) => ({ financeCards: s.financeCards.filter((c) => c.id !== id) })),

      // ── Subscriptions (recurring software / services) — org-wide setting ────
      subscriptions: [],
      addSubscription: (sub) =>
        set((s) => ({ subscriptions: [...(s.subscriptions || []), { id: Date.now(), active: true, cycle: 'monthly', ...sub }] })),
      updateSubscription: (id, changes) =>
        set((s) => ({ subscriptions: (s.subscriptions || []).map((x) => (x.id === id ? { ...x, ...changes } : x)) })),
      deleteSubscription: (id) =>
        set((s) => ({ subscriptions: (s.subscriptions || []).filter((x) => x.id !== id) })),

      // ── Customer payments received on a job (jobData.paymentsReceived) ──────
      addJobPayment: (proposalId, payment) =>
        set((s) => ({
          proposals: s.proposals.map((p) => p.id === proposalId
            ? { ...p, jobData: { ...(p.jobData || {}), paymentsReceived: [...(p.jobData?.paymentsReceived || []), { id: Date.now(), ...payment }] } }
            : p),
        })),
      removeJobPayment: (proposalId, paymentId) =>
        set((s) => ({
          proposals: s.proposals.map((p) => p.id === proposalId
            ? { ...p, jobData: { ...(p.jobData || {}), paymentsReceived: (p.jobData?.paymentsReceived || []).filter((x) => x.id !== paymentId) } }
            : p),
        })),

      expenses: [],
      addExpense: (e) =>
        set((s) => ({ expenses: [{ id: Date.now(), createdAt: new Date().toISOString(), ...e }, ...s.expenses] })),
      addExpenses: (arr) =>
        set((s) => ({
          expenses: [
            ...arr.map((e, i) => ({ id: Date.now() + i, createdAt: new Date().toISOString(), ...e })),
            ...s.expenses,
          ],
        })),
      updateExpense: (id, changes) =>
        set((s) => ({ expenses: s.expenses.map((e) => (e.id === id ? { ...e, ...changes } : e)) })),
      deleteExpense: (id) =>
        set((s) => ({ expenses: s.expenses.filter((e) => e.id !== id), tombstones: [...(s.tombstones || []), `expense:${id}`] })),

      // ── One-click follow-up email templates ──────────────────────────────────
      emailTemplates: DEFAULT_EMAIL_TEMPLATES,
      addEmailTemplate: (t) =>
        set((s) => ({ emailTemplates: [...s.emailTemplates, { id: Date.now(), ...t }] })),
      updateEmailTemplate: (id, changes) =>
        set((s) => ({ emailTemplates: s.emailTemplates.map((t) => (t.id === id ? { ...t, ...changes } : t)) })),
      deleteEmailTemplate: (id) =>
        set((s) => ({ emailTemplates: s.emailTemplates.filter((t) => t.id !== id) })),

      // ── Daily to-do list ─────────────────────────────────────────────────────
      todos: [],
      // Deletion tombstones ("proposal:<id>", "todo:<id>", …) so removals survive
      // the union merge and propagate to other users instead of resurrecting.
      tombstones: [],
      todoPin: 'off', // 'off' | 'right' — pins the list as a side panel
      addTodo: (text) =>
        set((s) => ({ todos: [{ id: Date.now(), text, done: false, createdAt: new Date().toISOString() }, ...s.todos] })),
      toggleTodo: (id) =>
        set((s) => ({ todos: s.todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })),
      deleteTodo: (id) =>
        set((s) => ({ todos: s.todos.filter((t) => t.id !== id), tombstones: [...(s.tombstones || []), `todo:${id}`] })),
      clearDoneTodos: () =>
        set((s) => ({
          todos: s.todos.filter((t) => !t.done),
          tombstones: [...(s.tombstones || []), ...s.todos.filter((t) => t.done).map((t) => `todo:${t.id}`)],
        })),
      setTodoPin: (side) => set({ todoPin: side }),

      // ── Shared checklists ────────────────────────────────────────────────────
      // Named checklists that live in the shared workspace, so every member of the
      // org sees the same lists and (with live sync) each other's checks in real
      // time. Each change stamps updatedAt so the newest-wins merge propagates
      // item toggles reliably (toggling an item doesn't move a top-level date).
      checklists: [],
      addChecklist: (title) =>
        set((s) => ({
          checklists: [
            { id: Date.now(), title: (title || '').trim() || 'Untitled checklist', items: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
            ...s.checklists,
          ],
        })),
      renameChecklist: (id, title) =>
        set((s) => ({ checklists: s.checklists.map((c) => (c.id === id ? { ...c, title: (title || '').trim() || c.title, updatedAt: new Date().toISOString() } : c)) })),
      deleteChecklist: (id) =>
        set((s) => ({ checklists: s.checklists.filter((c) => c.id !== id), tombstones: [...(s.tombstones || []), `checklist:${id}`] })),
      addChecklistItem: (id, text) =>
        set((s) => ({
          checklists: s.checklists.map((c) =>
            c.id === id
              ? { ...c, items: [...(c.items || []), { id: Date.now(), text: (text || '').trim(), done: false, doneBy: '', doneAt: null }], updatedAt: new Date().toISOString() }
              : c
          ),
        })),
      toggleChecklistItem: (id, itemId, byEmail) =>
        set((s) => ({
          checklists: s.checklists.map((c) =>
            c.id === id
              ? {
                  ...c,
                  items: (c.items || []).map((it) =>
                    it.id === itemId
                      ? { ...it, done: !it.done, doneBy: !it.done ? (byEmail || '') : '', doneAt: !it.done ? new Date().toISOString() : null }
                      : it
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : c
          ),
        })),
      deleteChecklistItem: (id, itemId) =>
        set((s) => ({
          checklists: s.checklists.map((c) =>
            c.id === id ? { ...c, items: (c.items || []).filter((it) => it.id !== itemId), updatedAt: new Date().toISOString() } : c
          ),
        })),

      // ── Branding ─────────────────────────────────────────────────────────────
      branding: {
        companyName: 'QUOTEX',
        tagline: 'Smart Contractor Pricing',
        logo: null,           // base64 data URL
        primaryColor: '#b0894f',  // brass (free-tier default accent)
        sidebarColor: '#26262b',  // charcoal (free-tier default sidebar)
        accentColor: null,        // optional secondary highlight (Pro)
        plan: 'free',             // 'free' | 'pro' — Pro unlocks custom colors
      },

      updateBranding: (changes) =>
        set((s) => ({ branding: { ...s.branding, ...changes } })),

      // ── Read message tracking (IDs of messages the user has opened) ───────
      readMessageIds: [],

      markMessageRead: (id) =>
        set((s) => ({
          readMessageIds: s.readMessageIds.includes(id)
            ? s.readMessageIds
            : [...s.readMessageIds, id],
        })),

      // ── Org / members (rows architecture) ─────────────────────────────────
      orgId: null,
      orgLoaded: false,
      me: null,                     // { id, role: 'rep'|'pm'|'office'|'admin', displayName, email }
      members: [],                  // everyone in the org, for the PM picker
      officeView: 'everyone',       // office/admin: 'everyone' | 'mine'
      contractPrefix: 'DP',
      setOfficeView: (v) => set({ officeView: v }),
      // A rep assigns one of the org's PMs to a deal; that PM then sees the job.
      setProposalPm: (id, pmId) =>
        set((s) => ({
          proposals: s.proposals.map((p) => (p.id === id ? { ...p, pmId: pmId || null } : p)),
        })),
    }),
    {
      name: DEMO ? DEMO_STORE_KEY : 'quotex-store',
      storage: createJSONStorage(() => (DEMO ? demoLocalStorage : nullStorage)),
      version: 6,
      // Non-demo builds persist nothing here — the rows adapter is the store's memory.
      partialize: (s) => (DEMO ? s : {}),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...(persistedState || {}),
        branding: normalizeBranding(persistedState?.branding),
        catalog: stripDeckItems((persistedState?.catalog?.length > 0)
          ? persistedState.catalog
          : currentState.catalog),
      }),
    }
  )
)

// Demo mode: seed the sandbox with fictional sample data the first time a
// visitor loads it (i.e. when their browser has no demo data yet).
if (DEMO && typeof window !== 'undefined') {
  const seedIfEmpty = () => {
    const s = useStore.getState()
    if (!s.proposals || s.proposals.length === 0) {
      useStore.setState(buildDemoSeed())
    }
  }
  if (useStore.persist?.hasHydrated?.()) seedIfEmpty()
  else useStore.persist?.onFinishHydration?.(seedIfEmpty)
}


// ── Org bootstrap (rows architecture) ────────────────────────────────────────
// After sign-in: load every row this user may see (RLS decides), put it in the
// store in the store's own shape, then arm the adapter so changes flow both
// ways. Membership role → app role: rep→sales, pm→pm, office/admin→manager.
const ROLE_MAP = { rep: 'sales', pm: 'pm', office: 'manager', admin: 'manager' }
const SETTINGS_DEFAULTS = () => ({
  projectTypes: ['Open Deck', 'Screen Porches', 'Eze-Breeze Porches', 'Open Porches', 'Porch Conversions', 'Sunrooms', 'Hardscapes'],
  catalogCategories: ['Fencing', 'Gates', 'Demo', 'Materials', 'Labor', 'Framing', 'Concrete', 'Electrical',
    'Plumbing', 'Roofing', 'Flooring', 'Drywall', 'Painting', 'HVAC', 'Windows', 'Doors', 'Tile', 'Insulation', 'Siding', 'General'],
  deckComponentRates:  JSON.parse(JSON.stringify(DECK_COMPONENT_DEFAULTS)),
  porchComponentRates: JSON.parse(JSON.stringify(PORCH_COMPONENT_DEFAULTS)),
  deckCustomComponents: [], porchCustomComponents: [],
  deckFormulaLocked: false, porchFormulaLocked: false,
  deckScopeTemplate: DECK_SCOPE_DEFAULT, porchScopeTemplate: PORCH_SCOPE_DEFAULT,
  paymentScheduleLearning: {}, scopeExamples: [], historyImported: false, calendarHiddenJobs: [],
  contractPrefix: 'DP',
  porchBuildRates: {}, porchBuildLocked: false, porchBuildScopes: { ...PORCH_BUILD_SCOPE_DEFAULTS },
  subscriptions: [],
})
const ID_COUNTERS = ['nextProposalId', 'nextCatalogId', 'nextTemplateId', 'nextScopeTemplateId', 'nextPaymentScheduleId', 'nextSubId']

let _booting = null
export function bootstrapOrg() {
  if (DEMO) return Promise.resolve()
  if (_booting) return _booting
  _booting = (async () => {
    const { orgId, me, members, settings, collections } = await loadOrg()
    const merged = { ...SETTINGS_DEFAULTS(), ...settings, branding: normalizeBranding(settings.branding) }
    const cols   = { ...collections, catalog: stripDeckItems(collections.catalog || []) }
    useStore.setState({ ...cols, ...merged, orgId, me, members, role: ROLE_MAP[me.role] || 'manager', orgLoaded: true })
    armAdapter(useStore, orgId, settings)
    // A brand-new org gets the built-in email templates once; the adapter
    // writes them as rows because they arrive after arming.
    if (!(collections.emailTemplates || []).length) useStore.setState({ emailTemplates: DEFAULT_EMAIL_TEMPLATES })
    // Reserve an id block so this session never mints an id another rep has.
    try {
      const start = await reserveIdBlock()
      const s = useStore.getState()
      const bump = {}
      for (const k of ID_COUNTERS) bump[k] = Math.max(Number(s[k]) || 0, start)
      useStore.setState(bump)
    } catch (e) {
      console.error('[quotex] could not reserve an id block', e)
    }
    try { useStore.getState().autoExpireStaleSent?.() } catch {}
  })().catch((e) => { _booting = null; throw e })
  return _booting
}

export function resetOrg() {
  _booting = null
  disarmAdapter()
}
