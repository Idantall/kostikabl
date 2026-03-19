/**
 * hebrew-text.ts
 * A glyph-safe RTL formatter for Hebrew with numbers/Latin.
 * No BiDi control characters; only printable ASCII spaces/hyphens.
 */

const RE_BIDI = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;        // RLM/LRM/LRE/RLE/PDF/LRI/RLI/FSI/PDI
const RE_NBSP = /\u00A0|\u2007|\u202F/g;                           // NBSP, Figure space, NNBSP
const RE_HYPHENS = /[\u05BE\u2010\u2011\u2212\u2012\u2013]/g;      // maqaf & hyphen variants → '-'
const RE_WS = /[\t\r\n]+/g;
const RE_HEB = /[\u0590-\u05FF]+/u;
const RE_TOKEN = /([\u0590-\u05FF]+|[A-Za-z0-9]+(?:[.,][A-Za-z0-9]+)*|[^\s])/gu;

/**
 * Reverse only Hebrew tokens, keep others as-is; never insert BiDi marks.
 * This produces a visual RTL string ready for pdf-lib rendering.
 */
export function toGlyphSafeHebrew(input: string): string {
  if (!input) return '';

  // 1) normalize dangerous glyphs that become tofu
  let s = input
    .replace(RE_BIDI, '')
    .replace(RE_NBSP, ' ')
    .replace(RE_HYPHENS, '-')
    .replace(RE_WS, ' ')
    .trim();

  const tokens = [...s.matchAll(RE_TOKEN)].map(m => m[0]);

  // 2) Build visual RTL string: reverse token order, but ONLY reverse Hebrew tokens' characters.
  const visualTokens: string[] = tokens.reverse().map(tok => {
    if (RE_HEB.test(tok)) {
      // reverse Hebrew chars only
      return [...tok].reverse().join('');
    }
    return tok; // numbers/latin/punct unchanged
  });

  // 3) Join with a normal ASCII space; no control marks
  return visualTokens.join(' ');
}
