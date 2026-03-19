/**
 * visualHebrewMixed:
 * Produces a single "visual order" string for pdf-lib:
 * - Reverse Hebrew letters only
 * - Keep numbers/Latin in logical order (no digit flip)
 * - Keep composites like "ח-2", "2-ח", "A-3" intact
 * Then draw this string RIGHT-ALIGNED without further reordering.
 */
export function visualHebrewMixed(input: string): string {
  if (!input) return "";

  // Tokenize into runs of Hebrew, numbers, Latin, punctuation, and spaces
  const tokens: string[] = [];
  const re = /([\u0590-\u05FF]+)|([0-9]+(?:[.,][0-9]+)*)|([A-Za-z]+)|([^\s\u0590-\u05FFA-Za-z0-9]+)|(\s+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) tokens.push(m[0]);
  if (!tokens.length) return input;

  // Reverse token order for RTL layout, keep all characters in logical order
  return tokens.reverse().join("").replace(/\s{2,}/g, " ").trim();
}

// BiDi and formatting control characters that cause tofu in PDFs
const BIDI_AND_FORMAT = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

// Normalize every hyphen/maqaf-like codepoint to ASCII "-"
const HYPHENS = /[\u05BE\u2010\u2011\u2212\u2013]/g;

/**
 * Remove non-printing BiDi controls (they confuse some PDF renderers)
 * and normalize hyphen-like chars to plain ASCII "-" that exists in all fonts.
 */
export function sanitizeForPdf(input: string): string {
  if (!input) return input;
  return input
    .replace(BIDI_AND_FORMAT, '')   // strip control marks so no tofu boxes
    .replace(HYPHENS, '-');         // unify hyphen variant
}

/**
 * Convenience: make a PDF-ready Hebrew string.
 * 1) build visual RTL string (your existing helper),
 * 2) sanitize for PDF.
 */
export function hebrewPdf(text: string): string {
  return sanitizeForPdf(visualHebrewMixed(text));
}
