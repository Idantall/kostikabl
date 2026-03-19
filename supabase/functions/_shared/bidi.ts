// supabase/functions/_shared/bidi.ts

// BiDi marks
const RLM = "\u200F";   // Right-to-Left Mark
const LRI = "\u2066";   // Left-to-Right Isolate
const PDI = "\u2069";   // Pop Directional Isolate
const NBSP = "\u00A0";  // Non-breaking space
const MAQAF = "\u05BE"; // Hebrew maqaf (use instead of '-' or U+2011)

/** Collapse internal whitespace & trim */
export function collapseWS(s?: string) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** Normalize hyphens into Hebrew maqaf to avoid missing glyphs */
export function normalizeMaqaf(v: string) {
  // collapse spaces around hyphen, then replace with maqaf
  return v.replace(/\s*-\s*/g, MAQAF);
}

/** Wrap any ASCII/number run in an LTR isolate so digits never flip */
export function protectLTR(v: string) {
  return v
    .replace(/([A-Za-z]+)/g, `${LRI}$1${PDI}`)
    .replace(/([0-9]+(?:[.,][0-9]+)*)/g, `${LRI}$1${PDI}`);
}

/**
 * Build a Hebrew "key value" line, RTL, with a single NBSP between parts.
 * 
 * Example outputs:
 *  - בניין 12   => RLM + "בניין" + NBSP + LRI 12 PDI
 *  - מס' פרט ח־2 => RLM + "מס' פרט" + NBSP + "ח" + MAQAF + LRI 2 PDI
 *  - מס' פרט A־3 => RLM + "מס' פרט" + NBSP + LRI A PDI + MAQAF + LRI 3 PDI
 */
export function bidiLine(heKey: string, rawValue?: string | number) {
  const key = collapseWS(heKey);
  const raw = collapseWS(String(rawValue ?? ""));
  
  if (!raw) return `${RLM}${key}`; // only the key
  
  const safeVal = protectLTR(normalizeMaqaf(raw));
  return `${RLM}${key}${NBSP}${safeVal}`;
}

/** Pure Hebrew (no numbers) */
export function bidiHeb(s?: string) {
  return `${RLM}${collapseWS(s)}`;
}
