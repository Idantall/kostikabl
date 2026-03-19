// Display names for subpart codes
export const DISPLAY_NAMES: Record<string, string> = {
  "00": "חלון מושלם",
  "01": "משקוף",
  "02": "כנפיים",
  "03": "תריס גלילה",
  "04": "מסילות",
  "05": "ארגז",
};

// Map from notes/description names to subpart codes
export const NAME_TO_CODES: Record<string, string[]> = {
  "דלת": ["00", "03", "04"],
  "דלת מונובלוק": ["01", "02", "03", "05"], // Removed '04' (מסילות)
  "חלון": ["00"],
  "ממד": ["01", "02"],
  "קיפ": ["00"],
  "חלון מונובלוק": ["01", "02"],
  // Pocket door patterns
  "☐☒": ["00"],      // כיס שמאל - left pocket
  "☒☐☒": ["00"],     // כיס כפול - double pocket  
  "☒☐": ["00"],      // כיס ימין - right pocket
  // Emergency exit
  "ח. חילוץ": ["01", "02", "03", "05"],
  "חילוץ": ["01", "02", "03", "05"],
};

// Load issue codes for reporting problems during loading
export const LOAD_ISSUE_CODES: Record<string, string> = {
  'LACK_SHUTTER': 'חסר תריס',
  'LACK_WINGS': 'חסר כנפיים',
  'BROKEN_GLASS': 'זכוכית שבורה',
  'ANGLES': 'זוויות',
  'SHUTTER_RAILS': 'מסילות תריס',
};

// Item types that require multi-label loading (per subpart)
export const MULTI_LABEL_TYPES = ['דלת', 'דלת מונובלוק'];

// Check if item type requires single-label loading
export function isSingleLabelLoading(itemType: string | null | undefined): boolean {
  const t = (itemType || '').trim();
  return !MULTI_LABEL_TYPES.includes(t);
}

// Normalize a name value for lookup
export function normalizeNotesValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
