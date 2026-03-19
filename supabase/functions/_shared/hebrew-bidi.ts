// Unicode BiDi marks
const RLM = "\u200F"; // Right-to-Left Mark
const LRM = "\u200E"; // Left-to-Right Mark

/**
 * Build an RTL line for pdf-lib WITHOUT reversing characters.
 * Hebrew stays RTL due to RLM; any numbers/Latin are forced LTR via LRM.
 * Examples that stay correct:
 *  - "דירה 12"   => RLM + "דירה " + LRM + "12"
 *  - "קומה 10"   => RLM + "קומה " + LRM + "10"
 *  - "ח-2"       => RLM + "ח-" + LRM + "2"
 *  - "A-3"       => RLM + "A-" + LRM + "3"
 */
export function bidiHebrewLine(labelHeb: string, value?: string | number) {
  const v = value == null ? "" : String(value);

  // Insert LRM before latin/digit runs and after hyphen separators before digits
  const withLTRIslands =
    v
      .replace(/([\-\/])([0-9]+)/g, (_m, sep, digits) => `${sep}${LRM}${digits}`)
      .replace(/([0-9]+(?:[.,][0-9]+)*)/g, (m) => `${LRM}${m}`)
      .replace(/([A-Za-z]+)/g, (m) => `${LRM}${m}`);

  return `${RLM}${labelHeb}${withLTRIslands ? " " + withLTRIslands : ""}`;
}

/** Pure Hebrew text (no numbers) */
export function bidiHebrewPure(s: string) {
  return `${RLM}${s}`;
}
