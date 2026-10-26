/**
 * Hebrew punctuation and quote-like marks that should read as a word
 * break: the maqaf (U+05BE, Hebrew's own hyphen), paseq, sof pasuq, nun
 * hafukha, geresh and gershayim, the ASCII hyphen, and straight and
 * curly quotes.
 *
 * Folded to a space rather than deleted, so "בת־שבע" and "בת שבע" both
 * normalize to the same two words instead of collapsing into one.
 */
const SEPARATORS = /[\u05BE\u05C0\u05C3\u05C6\u05F3\u05F4'"`\u2018\u2019\u201C\u201D-]/g

/**
 * Hebrew combining marks - cantillation (te'amim), vowel points
 * (nikud), meteg, rafe, the shin/sin dots and qamats qatan.
 *
 * Deliberately *not* the whole U+0591-U+05C7 block: that range also
 * contains the punctuation handled by SEPARATORS above, and deleting the
 * maqaf outright would turn "בת־שבע" into "בתשבע", which no reasonable
 * query matches. The marks listed here carry no word boundary, so
 * removing them is safe.
 */
const COMBINING_MARKS = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g

/**
 * Normalizes a string for forgiving substring search on Hebrew names.
 *
 * Three things a plain `includes()` gets wrong here:
 *
 *   Nikud / te'amim  "יוֹסֵף" as entered in the sheet with vowel points
 *     would never match a search for "יוסף". The marks are stripped so
 *     the consonantal skeleton is what gets compared.
 *   Maqaf and friends  Hebrew's hyphen and quote marks become spaces,
 *     so "בת־שבע" is findable as "בת שבע" and vice versa.
 *   Whitespace runs  collapsed, so a stray double space in the sheet
 *     doesn't hide a record.
 *
 * Order matters: separators are folded *before* the combining marks are
 * removed, because the maqaf lives inside the same Unicode block as the
 * vowel points and would otherwise be deleted along with them.
 *
 * Latin text is lowercased too, so the same field works for names
 * entered in English.
 */
export function normalizeForSearch(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(SEPARATORS, ' ')
    .replace(COMBINING_MARKS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * True when `query` appears anywhere in `name`, both normalized. An
 * empty query matches everything, so a cleared search box shows the
 * whole list rather than nothing.
 */
export function matchesNameQuery(name, query) {
  const needle = normalizeForSearch(query)
  if (!needle) return true
  return normalizeForSearch(name).includes(needle)
}
