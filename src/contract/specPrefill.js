// ── Spec forms pre-filled from the proposal ──────────────────────────────────
// The calculators already know most answers on the electrical, porch, deck and
// patio forms (decking line, railing, skirting, box steps, porch type, roof,
// door, screen system, electrical counts…). This reads every quote line's
// saved calculator settings (`line.builder`) and returns the form ticks and
// blanks they imply, so the salesperson only reviews the forms. Only boxes
// and blanks are filled — never any wording. Answers the calculators don't
// capture (colors, cantilever, wall type, shingles…) are left for the rep.
//
// Ids are the form ids in deckPlusAgreement.js ({{check:id}} → checks[id],
// {{id}} → values[id]; electrical quantities are values `elecQty_<row>`).
import { DECK_COLLECTIONS, matchCollection } from '../lib/deckPricing'
import { PORCH_ROOFS, deckSlug } from '../porchBuild'
import { HS_PAVERS, HS_CONCRETE } from '../hardscape'

const n = (v) => (v === true ? 1 : Number(v) || 0)

// Electrical packages → what each includes, per form row.
const ELEC_PACKAGES = {
  elec_simple:   { fan: 1, flood: 1, outlets: 1 },
  elec_standard: { fan: 1, recessed: 4, flood: 1, outlets: 1 },
  elec_3s_min:   { fan: 1, flood: 1, outlets: 5 },
  elec_3s_gold:  { fan: 1, flood: 1, recessed: 4, dimmer: 1, outlets: 5 },
  elec_12v:      { fan: 1, lowvolt: 4 },
}
// Porch-builder electrical extras → form row.
const ELEC_EXTRAS = {
  elec_fan: 'fan', elec_fan_ucs: 'fan',
  elec_outlet: 'outlets', elec_outlet15: 'outlets', elec_gfi: 'outlets',
  elec_30amp: 'homerun', elec_flood: 'flood', elec_can: 'recessed', elec_can_ucs: 'recessed',
  elec_dimmer: 'dimmer', elec_lv_dimmer: 'dimmer', elec_sconce: 'sconces', elec_tv: 'cable',
  elec_lv_transformer: 'transformer',
  elec_riser: 'lowvolt', elec_riser_stair: 'lowvolt', elec_post_light: 'lowvolt', elec_cap_light: 'lowvolt',
  elec_heater_black: 'heatermount', elec_heater_recess: 'heaterbuilt',
}
// Porch-builder electrical extras with no row of their own → the "other" row.
const ELEC_OTHER = {
  elec_trench: 'Trench power line', elec_arc: 'ARC fault circuit', elec_pavilion_panel: 'Pavilion panel',
  elec_switch: 'Extra switch', elec_cat5: 'Cat 5 cable', elec_rope: 'Rope lighting',
  elec_coach: 'Coach light replacement', elec_fan_replace: 'Fan replacement',
}
const LF_ITEMS = new Set(['elec_trench', 'elec_rope'])
// Under-deck builder electrical → form row (the 12v package is a fan + 4 lights).
const UDC_ELEC = {
  fan: 'fan', can: 'recessed', lvTrans: 'transformer', riser: 'lowvolt', step: 'lowvolt',
  postMoon: 'lowvolt', capLight: 'lowvolt', lvDimmer: 'dimmer', heaterBlk: 'heatermount', heaterRec: 'heaterbuilt',
}
// A plain catalog line (no calculator) → form row, by its name.
const ELEC_BY_NAME = [
  [/simple electric package/i, ELEC_PACKAGES.elec_simple],
  [/standard electric package/i, ELEC_PACKAGES.elec_standard],
  [/3.?season minimum/i, ELEC_PACKAGES.elec_3s_min],
  [/3.?season gold/i, ELEC_PACKAGES.elec_3s_gold],
  [/12 ?v.*package|package.*12 ?v/i, ELEC_PACKAGES.elec_12v],
  [/30 ?amp|home run/i, 'homerun'],
  [/vent ?hood/i, 'venthood'],
  [/heater.*recess|recess.*heater|built.?in heater/i, 'heaterbuilt'],
  [/heater/i, 'heatermount'],
  [/transformer/i, 'transformer'],
  [/dimmer/i, 'dimmer'],
  [/riser|step light|post light|cap light|low.?volt/i, 'lowvolt'],
  [/sconce|pendant/i, 'sconces'],
  [/\btv\b|cable jack/i, 'cable'],
  [/can light|recessed/i, 'recessed'],
  [/flood/i, 'flood'],
  [/outlet|gfi/i, 'outlets'],
  [/\bfan\b/i, 'fan'],
]

const DECK_RAIL_FORM = {
  '2x2 pickets wood rail':      { check: 'rl_other', values: { railOther: '2x2 pickets wood rail' } },
  'Hybrid Railing / wood cap':  { check: 'rl_hybrid', values: { railHybridCap: 'Wood' } },
  'Hybrid Railing / trex cap':  { check: 'rl_hybrid', values: { railHybridCap: 'Trex' } },
  'Trex Transcend Railing':     { check: 'rl_comp', values: { railCompLine: 'Trex Transcend' } },
  'Trex Select Railing WHITE ONLY': { check: 'rl_comp', values: { railCompLine: 'Trex Select', railCompColor: 'White' } },
  'Trex SIGNATURE Alum. Railing': { check: 'rl_alum' },
  'Trex SIGNATURE Alum. Railing BETWEEN POSTS ONLY': { check: 'rl_alum' },
  'TimberTech Alum. Railing':   { check: 'rl_alum' },
  'TimberTech Railing BETWEEN POSTS ONLY': { check: 'rl_alum' },
  'Iron Rod Railing LF':        { check: 'rl_other', values: { railOther: 'Iron rod railing' } },
}
const DECK_SKIRT_FORM = { 'None': 'sk_none', 'Trex skirt': 'sk_comp', 'PT skirt (stained)': 'sk_pt', 'Lattice (stained)': 'sk_lattice' }

const PORCH_RAIL_FORM = {
  rail_wood_2x2:       { values: { railBaluster: '2x2 wood pickets' } },
  rail_hybrid_wood:    { values: { railCap: 'Wood', railBaluster: 'Round aluminum' } },
  rail_hybrid_trex:    { values: { railCap: 'Trex', railBaluster: 'Round aluminum' } },
  rail_trex_transcend: { check: 'rail_composite', values: { railCompositeType: 'Trex Transcend' } },
  rail_trex_select:    { check: 'rail_composite', values: { railCompositeType: 'Trex Select', railCompositeColor: 'White' } },
  rail_trex_signature: { check: 'rail_alum' },
  rail_trex_signature_between: { check: 'rail_alum' },
  rail_tt_alum:        { check: 'rail_alum' },
  rail_tt_between:     { check: 'rail_alum' },
}
const PORCH_DOORS = { door_tradewinds: 'Tradewinds', door_savannah: 'Savannah', door_savannah_pet: 'Savannah with pet door' }

// Decking collection key → the deck form's type box and line blank.
function deckTypeAnswers(collKey, put) {
  const coll = DECK_COLLECTIONS.find(c => c.key === collKey)
  if (!coll) return
  if (coll.group === 'Wood') put.check('dt_pt')
  if (coll.group === 'Trex') { put.check('dt_trex'); put.value('trexLine', coll.key.replace(/^Trex\s+/i, '')) }
  if (coll.group === 'TimberTech') { put.check('dt_tt'); put.value('ttLine', coll.key.replace(/^TimberTech\s+/i, '')) }
  if (coll.group === 'TimberTech PVC') { put.check('dt_tt'); put.value('ttpvcLine', coll.key.replace(/^TimberTech\s+/i, '')) }
}

export function specPrefill(lines = []) {
  const checks = {}, values = {}
  const put = {
    check: (id) => { checks[id] = true },
    value: (id, v) => { if (v != null && v !== '' && values[id] == null) values[id] = String(v) },
  }
  const elec = {}            // form row → qty
  const elecOther = []
  const addElec = (row, qty) => { if (qty > 0) elec[row] = (elec[row] || 0) + qty }
  const addPackage = (pkg, times = 1) => Object.entries(pkg).forEach(([row, q]) => addElec(row, q * times))
  const lv = { postcap: 0, halfmoon: 0, riser: 0, transformer: 0 }
  let deckFromTool = false

  for (const l of (lines || []).filter(Boolean)) {
    if (l.isDiscount) continue
    const tool = l.builder?.tool
    const st = l.builder?.state || {}

    if (tool === 'deck') {
      deckFromTool = true
      deckTypeAnswers(st.collKey, put)
      if (st.freestanding) put.check('dc_free')
      if (DECK_SKIRT_FORM[st.skirt]) put.check(DECK_SKIRT_FORM[st.skirt])
      if (n(st.extras?.hottub) > 0) put.check('ft_spa')
      if (st.border === '1-board') put.check('ft_border1')
      if (st.border === '2-board') put.check('ft_border2')
      const rail = DECK_RAIL_FORM[st.rail]
      if (rail) { put.check(rail.check); Object.entries(rail.values || {}).forEach(([k, v]) => put.value(k, v)) }
      const stairs = st.stairs || []
      if (stairs.some(s => s.style === 'Box')) put.check('bs_yes')
      else if (stairs.length) put.check('bs_no')
      if (st.fascia === 'PVC white') put.check('tr_whitepvc')
      if (st.fascia === 'Matching') {
        const f = DECK_COLLECTIONS.find(c => c.key === st.collKey)?.fascia
        if (f === 'ttp') put.check('tr_ttpvcfascia')
        else if (f) put.check('tr_compfascia')
      }
      if (st.paint) put.check(st.paint === 'None' ? 'pd_no' : 'pd_yes')
      continue
    }

    if (tool === 'porchbuild' || tool === 'porch') {
      const pb = tool === 'porch' ? { type: 'ezebreeze', doors: { door_tradewinds: n(st.doors) || 0 }, conversion: true } : (st.inp || l.porchBuild || {})
      const type = pb.type
      if (type === 'screen') { put.check('jt_screen'); put.check('ss_screeneze') }
      if (type === 'open') put.check('jt_open')
      if (type === 'ezebreeze' || type === 'sunroom') put.check('jt_3season')
      if (type === 'sunroom' && n(pb.kneeWallIn ?? 30) > 0) put.value('kneeHeight', `${n(pb.kneeWallIn ?? 30)}″`)
      if (type === 'ezebreeze') { put.check('ss_ezebreeze'); put.check('post_6lam'); put.check('mw_vertical') }
      if (!pb.conversion) {
        const roof = PORCH_ROOFS.find(r => r.key === pb.roof)
        if (roof) put.value('roofType', roof.label.replace(/\s*\(standard\)/i, ''))
        if (pb.tie === 'roof') put.check('conn_roof')
        if (pb.tie === 'wall') put.check('conn_wall')
        if (n(pb.glassEnds) > 0) put.check('gable_glass')
        const ex = pb.extras || {}
        if (n(ex.tg_ceiling) > 0) put.check('ceil_tg')
        else if (type === 'ezebreeze' || type === 'sunroom') put.check('ceil_plybead')
        put.check(pb.paintPorch ? 'paint_deckplus' : 'paint_client')
        const rp = pb.railing?.product
        if (rp && PORCH_RAIL_FORM[rp]) {
          put.check('rail_yes')
          const r = PORCH_RAIL_FORM[rp]
          if (r.check) put.check(r.check)
          Object.entries(r.values || {}).forEach(([k, v]) => put.value(k, v))
        } else put.check('rail_no')
        // A porch on a new deck: its floor answers the deck form when no deck was priced on its own.
        if (pb.floor === 'deck') {
          const coll = DECK_COLLECTIONS.find(c => `deckfloor_${deckSlug(c.key)}` === pb.flooring)
          if (coll && !deckFromTool) deckTypeAnswers(coll.key, put)
          if (pb.hotTub) put.check('ft_spa')
          if (n(ex.border_1) > 0) put.check('ft_border1')
          if (n(ex.border_2) > 0) put.check('ft_border2')
          if (n(ex.box_step) > 0) put.check('bs_yes')
          if (n(ex.skirt_pt) > 0) put.check('sk_pt')
          if (n(ex.skirt_trex) > 0) put.check('sk_comp')
          if (n(ex.lattice_sheet) > 0) put.check('sk_lattice')
        }
        if (pb.tie === 'free') put.check('dc_free')
        if (pb.elecPackage && ELEC_PACKAGES[pb.elecPackage]) addPackage(ELEC_PACKAGES[pb.elecPackage])
        for (const [k, q] of Object.entries(ex)) {
          if (ELEC_EXTRAS[k]) addElec(ELEC_EXTRAS[k], n(q))
          else if (ELEC_OTHER[k] && n(q) > 0) elecOther.push(`${ELEC_OTHER[k]}${LF_ITEMS.has(k) ? ` (${n(q)} LF)` : n(q) > 1 ? ` (${n(q)})` : ''}`)
        }
        lv.postcap += n(ex.elec_cap_light); lv.halfmoon += n(ex.elec_post_light)
        lv.riser += n(ex.elec_riser) + n(ex.elec_riser_stair); lv.transformer += n(ex.elec_lv_transformer)
      }
      const doors = Object.entries(pb.doors || {}).filter(([k, q]) => PORCH_DOORS[k] && n(q) > 0)
      if (doors.length) { put.check('door_larson'); put.value('doorType', doors.map(([k]) => PORCH_DOORS[k]).join(', ')) }
      continue
    }

    if (tool === 'underdeck') {
      const e = (st.inp || l.underDeck || {}).electrical || {}
      if (n(e.pkg12v) > 0) addPackage(ELEC_PACKAGES.elec_12v, n(e.pkg12v))
      for (const [k, row] of Object.entries(UDC_ELEC)) addElec(row, n(e[k]))
      lv.postcap += n(e.capLight); lv.halfmoon += n(e.postMoon); lv.riser += n(e.riser) + n(e.step); lv.transformer += n(e.lvTrans)
      continue
    }

    if (tool === 'hardscape') {
      const h = st.inp || l.hardscape || {}
      const q = h.qty || {}
      const surface = h.patio?.surface
      if (surface) {
        put.check('pt_patio')
        const label = [...HS_PAVERS, ...HS_CONCRETE].find(p => p.key === surface)?.label
        if (/^tb/.test(surface)) put.value('techoLine', label?.replace(/^Techo Bloc\s+/i, ''))
        else if (/^(plaza|panorama)/.test(surface)) put.value('keystoneLine', label?.replace(/^Keystone\s+/i, ''))
        else put.value('otherLine', label)
      }
      if (n(q.firepitKit) + n(q.firepitVen) + n(q.firepitStone) > 0) put.check('pt_firepit')
      if (n(q.sitVeneer) + n(q.sitKeystone) + n(q.sitTecho) > 0) put.check('pt_wall')
      if (n(q.kitchenLF) + n(q.backsplash) + n(q.overhang) > 0 || h.granite?.level) put.check('pt_kitchen')
      if (n(q.pizzaOven) > 0) put.check('pt_fireplace')
      if (h.granite?.level) put.check('ok_granite')
      put.check(h.wall?.type ? 'rw_yes' : 'rw_no')
      addElec('outlets', n(q.kOutlet))
      continue
    }

    // A plain catalog line: electrical items by name; a decking line by its collection.
    const name = `${l.name || ''}`
    if (/electric/i.test(l.category || '') || ELEC_BY_NAME.some(([re]) => re.test(name))) {
      const hit = ELEC_BY_NAME.find(([re]) => re.test(name))
      if (hit) {
        const qty = n(l.qty) || 1
        if (typeof hit[1] === 'string') addElec(hit[1], qty)
        else addPackage(hit[1], qty)
      }
    } else if (!deckFromTool && /deck|decking/i.test(name)) {
      const coll = matchCollection(name)
      if (coll && coll !== 'PT') deckTypeAnswers(coll, put)
    }
  }

  for (const [row, qty] of Object.entries(elec)) put.value(`elecQty_${row}`, qty)
  if (elecOther.length) { put.value('elecOther', elecOther.join('; ')); put.value('elecQty_other', 1) }
  if (lv.postcap) { put.check('lv_postcap'); put.value('lvPostCapQty', lv.postcap) }
  if (lv.halfmoon) { put.check('lv_halfmoon'); put.value('lvHalfMoonQty', lv.halfmoon) }
  if (lv.riser) { put.check('lv_riser'); put.value('lvRiserQty', lv.riser) }
  if (lv.transformer) { put.check('lv_transformer'); put.value('lvTransformerQty', lv.transformer) }

  return { checks, values, hasElectrical: Object.keys(elec).length > 0 || elecOther.length > 0 }
}
