// ── Upgrades are sold as their own line ───────────────────────────────────────
// T&G ceiling, faux beams, Cox columns and the like are upgrades: when one is
// sold it is its own priced line on the quote and writes its own scope line.
// Scope text that comes from anywhere else — past contracts the AI copies the
// style of, lines reps kept adding on earlier jobs — must never bring one in
// unless it is on this quote. (Standard ceiling is ply-bead; T&G is an upgrade.)
export const UPGRADES = [
  ['T&G ceiling',      /\bt\s*&\s*g\b|tongue\s*(?:&|and)\s*groove/i],
  ['Coffered ceiling', /coffer/i],
  ['Metal roof',       /metal\s+roof/i],
  ['Faux beam',        /faux\s+beam/i],
  ['Corbels',          /corbel/i],
  ['Gable trim',       /wagon.?wheel|sunrise\s+gable|gable\s+trim/i],
  ['Skylight',         /sky\s?light/i],
  ['Gable dormer',     /dormer/i],
  ['Shiplap',          /ship\s?lap/i],
  ['TV wall',          /\btv\s+wall/i],
  ['Cox columns',      /\bcox\b|lam(?:inated)?\.?\s+(?:cox\s+)?column/i],
  ['8×8 columns',      /\b8\s*[”"″']?\s*[x×]\s*8\b[^.\n]{0,25}(?:column|post)|(?:column|post)[^.\n]{0,25}\b8\s*[”"″']?\s*[x×]\s*8\b/i],
  ['Box steps',        /box\s+step/i],
  ['Privacy wall',     /privacy\s+wall/i],
  ['Lattice',          /lattice/i],
  ['Sconce / pendant', /sconce|pendant/i],
]

// Upgrade names a piece of text mentions.
export const upgradesIn = (text = '') => UPGRADES.filter(([, re]) => re.test(String(text))).map(([name]) => name)

// Upgrades `text` mentions that `quoteText` (everything on this quote) doesn't.
export function unsoldUpgrades(text = '', quoteText = '') {
  const sold = new Set(upgradesIn(quoteText))
  return upgradesIn(text).filter(u => !sold.has(u))
}

// `text` without the lines that bring in an upgrade this quote doesn't have.
export const dropUnsold = (text = '', quoteText = '') =>
  String(text).split('\n').filter(l => !unsoldUpgrades(l, quoteText).length).join('\n')
