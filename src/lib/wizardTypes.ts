// Wizard Types for Project Creation Wizard

export interface BankItem {
  id: string;
  item_no: string;    // unique within project
  height: string;     // allows non-integer like "253+"
  width: string;
  floor_height: string; // גובה מהריצוף
}

export interface WizardApartmentRow {
  id: string;
  opening_no: number;                   // 1-20, auto-incremented
  location_in_apartment: string | null;
  contract_item: string | null;         // פרט חוזה
  item_code: string | null;             // References bank item_no
  height: string | null;
  height_overridden: boolean;           // Track manual override
  width: string | null;
  width_overridden: boolean;
  notes: string | null;                 // גובה מהריצוף
  hinge_direction: string | null;       // L/R (ציר מבט מבפנים)
  mamad: string | null;                 // ☒☐/☐☒/☒☐☒ (ממד כיס בצד)
  glyph: string | null;
  jamb_height: string | null;           // מדרגה בשיש
  depth: string | null;                 // עומק עד הפריקסט
  is_manual: boolean;                   // מנואלה
  engine_side: string | null;           // ימין/שמאל/null
  field_notes: string | null;           // הערות
  internal_wing: string | null;         // כנף פנימית מבט פנים (L/R)
  wing_position: string | null;         // ציר מבט פנים פתיחה פנימה (TL/TR/BL/BR)
  wing_position_out: string | null;     // ציר מבט פנים פתיחה החוצה (TL/TR/BL/BR)
}

export interface WizardApartment {
  id: string;
  label: string;                        // "דירה 1"
  rows: WizardApartmentRow[];
  sourceApartmentTypeName?: string | null; // Name of apartment type applied
}

export interface WizardFloor {
  id: string;
  label: string;                        // "קומה 1" or custom
  apartments: WizardApartment[];
  isTypical: boolean;                   // For cloning reference
  sourceFloorTypeName?: string | null;  // Name of floor type applied
}

export interface WizardBuilding {
  id: string;
  label: string;                        // "בניין 1"
  floors: WizardFloor[];
}

export type ProjectType = 'pre_contract' | 'blind_jambs';

// Saved apartment type template
export interface ApartmentType {
  id: string;
  name: string;
  rows: WizardApartmentRow[]; // template rows (IDs regenerated on apply)
}

// Saved floor type template
export interface FloorType {
  id: string;
  name: string;
  apartments: WizardApartment[]; // template apartments (IDs regenerated on apply)
}

export interface WizardDraft {
  id: string;
  name: string;
  bankItems: BankItem[];
  floors: WizardFloor[];
  projectType: ProjectType;
  contractPdfPath: string | null;
  contractParseResult: any | null;
  createdAt: string;
  updatedAt: string;
}

// Standard location options (consistent across all projects)
export const LOCATION_OPTIONS = [
  'סלון',
  'מטבח',
  'ממ"ד',
  'ממד',
  'ח. הורים',
  'ח. שינה',
  'ח. רחצה',
  'ח. שירות',
  'מסדרון',
  'כביסה',
  'מרפסת שרות',
  'לובי',
  'מדרגות',
  'מחסן',
  'משרד',
  'חלל כפול',
  'פ. אוכל',
  'פ. משפחה',
  'ש. הורים',
  'ש. אורחים',
  'מקלחת',
  'שירותים',
  'מרתף',
  // Pocket door options (for ממד items)
  'כיס ימין',
  'כיס שמאל',
  'כיס כפול',
] as const;

// Mamad (pocket door) options with glyphs
export const MAMAD_OPTIONS = [
  { value: '☒☐', label: '☒☐ כיס שמאל' },
  { value: '☐☒', label: '☐☒ כיס ימין' },
  { value: '☒☐☒', label: '☒☐☒ כיס כפול' },
] as const;

// Helper to create empty apartment row
export const createEmptyRow = (openingNo: number): WizardApartmentRow => ({
  id: crypto.randomUUID(),
  opening_no: openingNo,
  location_in_apartment: null,
  contract_item: null,
  item_code: null,
  height: null,
  height_overridden: false,
  width: null,
  width_overridden: false,
  notes: null,
  hinge_direction: null,
  mamad: null,
  glyph: null,
  jamb_height: null,
  depth: null,
  is_manual: false,
  engine_side: null,
  field_notes: null,
  internal_wing: null,
  wing_position: null,
  wing_position_out: null,
});

// Helper to create empty apartment
export const createEmptyApartment = (label: string): WizardApartment => ({
  id: crypto.randomUUID(),
  label,
  rows: [createEmptyRow(1)],
});

// Helper to create empty floor
export const createEmptyFloor = (label: string): WizardFloor => ({
  id: crypto.randomUUID(),
  label,
  apartments: [],
  isTypical: false,
});

// Helper to create empty building
export const createEmptyBuilding = (label: string): WizardBuilding => ({
  id: crypto.randomUUID(),
  label,
  floors: [],
});

// Helper to deep-clone a building with new IDs
export const cloneBuilding = (source: WizardBuilding, newLabel: string, globalAptCounter: { value: number }): WizardBuilding => ({
  id: crypto.randomUUID(),
  label: newLabel,
  floors: source.floors.map(floor => ({
    id: crypto.randomUUID(),
    label: floor.label,
    isTypical: false,
    apartments: floor.apartments.map(apt => ({
      id: crypto.randomUUID(),
      label: `דירה ${globalAptCounter.value++}`,
      rows: apt.rows.map(row => ({
        ...row,
        id: crypto.randomUUID(),
      })),
    })),
  })),
});
