
# Unified Excel Import with Stage Selection & Multi-Building Editing

## Overview
Merge the two Excel import flows (regular + measurement) into a single, unified import page that:
1. Parses the Excel file (using the measurement parser — it handles the superset of fields)
2. Lets the user choose the **target project stage** (טרום חוזה / משקופים / מדידות / פעיל)
3. Shows parsed data grouped into buildings → floors → apartments (auto-detected from Excel)
4. Allows the user to **edit the structure** before creating: rename buildings/floors/apartments, clone buildings, delete, reorder — the same capabilities as the project wizard's floors/apartments steps
5. On "Create", produces the correct project(s) based on the selected stage

After this feature ships, the standalone `/import/measurement` route and `ImportMeasurement.tsx` page are **deprecated** and removed.

---

## Current State (what exists)

| Flow | Route | Parser | Creates | Stage |
|------|-------|--------|---------|-------|
| Regular import | `/import` | `excelParser.ts` (items-focused, generates labels) | floors + apartments + items + labels | `active` (implicit) |
| Measurement import | `/import/measurement` | `measurementParser.ts` (measurement-focused) | measurement_rows only | `measurement` |
| Wizard | `/wizard` | Manual entry | measurement_rows | `pre_contract` or `blind_jambs` |

### Key differences between parsers
- `excelParser.ts` → outputs `ParsedApartment[]` with `ParsedItem[]` (subpart_codes, item_type, side_rl). Used only for "active" projects.
- `measurementParser.ts` → outputs `MeasurementRow[]` with richer fields (hinge_direction, mamad, depth, glyph, jamb_height, engine_side, contract_item). Used for measurement-stage projects.

### Key insight
For stages `pre_contract`, `blind_jambs`, and `measurement`, we write to `measurement_rows` (the early-stage table). For stage `active`, we write to `floors` + `apartments` + `items` + `labels` (the production tables). So the parser choice depends on the target stage.

---

## Design

### New Unified Flow (replaces both import pages)

**Route**: `/import` (same URL, new implementation)

**Steps** (inline, not wizard — all on one scrollable page):

#### Step 1: Upload Excel
- Same drag-and-drop upload area
- Parse with **both** parsers to extract maximum data
- Primary parser: `measurementParser.ts` (richer field extraction)
- If user selects "active" stage → also run `excelParser.ts` for subpart_codes/item_type

#### Step 2: Configure (shown after parse)

**2a. Project Name** — text input, auto-filled from filename

**2b. Stage Selection** — 4 radio cards:
| Stage | Hebrew | Description |
|-------|--------|-------------|
| `pre_contract` | טרום חוזה | שלב תכנון ראשוני עם חוזה |
| `blind_jambs` | משקופים עיוורים | שלב משקופים עיוורים |
| `measurement` | מדידות | תיק מדידות לעריכה בשטח |
| `active` | פעיל | פרויקט מוכן לייצור |

Default: `measurement` (most common Excel import use case)

**2c. Building Structure Editor** — same UI as wizard steps 3+4:
- Auto-detect buildings from Excel data (each Excel file = 1 building by default)
- Show building bar (add building, clone building, rename)
- Under each building: floors → apartments tree (editable labels, add/delete/clone)
- Pre-populated from parsed Excel data
- User can split into multiple buildings by moving floors between buildings
- User can clone a building (deep-copy all floors/apartments/rows)

#### Step 3: Review & Create
- Summary stats (buildings, floors, apartments, rows)
- Validation warnings
- "Create Project" button

### Creation Logic (by stage)

**`pre_contract` / `blind_jambs` / `measurement`:**
- Create project with `status = <selected_stage>`
- Insert into `measurement_rows` (same as wizard does today)
- If multi-building → create father_project + per-building projects
- Upload Excel to `measurement-excels` storage bucket

**`active`:**
- Create project with `status = 'active'`
- Insert into `floors` + `apartments` + `items` + `labels` (same as current regular import)
- If multi-building → create father_project + per-building projects
- Upload Excel to `measurement-excels` storage bucket

---

## File Changes

### New Files
| File | Purpose |
|------|---------|
| `src/components/import/ImportUpload.tsx` | Upload area component |
| `src/components/import/ImportStageSelector.tsx` | Stage selection radio cards |
| `src/components/import/ImportStructureEditor.tsx` | Building/floor/apartment tree editor (reuses wizard components or shared logic) |
| `src/components/import/ImportReview.tsx` | Review summary + create button |
| `src/lib/excelToWizardState.ts` | Converts parsed Excel data → WizardBuilding[] structure for editing |

### Modified Files
| File | Change |
|------|--------|
| `src/pages/Import.tsx` | Complete rewrite — unified flow with stage selection + structure editing |
| `src/App.tsx` | Remove `/import/measurement` route |
| `src/lib/wizardTypes.ts` | Add `'measurement'` and `'active'` to `ProjectType` union |

### Deleted Files
| File | Reason |
|------|--------|
| `src/pages/ImportMeasurement.tsx` | Deprecated — functionality merged into unified Import |

### Reused (no changes needed)
- `src/lib/measurementParser.ts` — primary parser for all stages
- `src/lib/excelParser.ts` — secondary parser for `active` stage only
- `src/components/wizard/WizardContext.tsx` — NOT reused directly (import has its own local state), but building/floor/apartment manipulation logic is extracted or copied
- `WizardStepFloors.tsx` / `WizardStepApartments.tsx` — UI components could be refactored into shared components, but for v1 we'll create import-specific versions that are simpler

---

## Data Flow

```
Excel File
    ↓
measurementParser.ts → MeasurementRow[]
    ↓
excelToWizardState.ts → WizardBuilding[] (grouped by floor_label → apartment_label)
    ↓
User edits structure (rename, clone, delete buildings/floors/apartments)
    ↓
Stage = pre_contract|blind_jambs|measurement → insertMeasurementRows()
Stage = active → insertActiveProjectData() (floors + apartments + items + labels)
```

### `excelToWizardState.ts` conversion logic:
1. Group MeasurementRow[] by `floor_label`
2. Within each floor, group by `apartment_label`
3. Map each row → WizardApartmentRow (item_code, height, width, notes, etc.)
4. Wrap all floors in a single WizardBuilding
5. Return WizardBuilding[] (initially just 1 building)

---

## Implementation Order

1. **Create `excelToWizardState.ts`** — conversion utility
2. **Create Import sub-components** — ImportStageSelector, ImportStructureEditor, ImportReview
3. **Rewrite `Import.tsx`** — unified flow
4. **Update `wizardTypes.ts`** — extend ProjectType
5. **Remove `ImportMeasurement.tsx`** and route
6. **Test all 4 stage paths**

---

## Notes
- The wizard link card on the import page stays — it's a separate creation method (manual, no Excel)
- The existing wizard is NOT affected — it continues to work independently
- For `active` stage, we need `excelParser.ts` output for subpart_codes. We either run both parsers, or add subpart detection to the unified flow.
- Building cloning uses the same `cloneBuilding()` helper from `wizardTypes.ts`
- Draft persistence is NOT needed for import flow (unlike wizard) — it's a single-session operation

---

# Previous Plans (archived)

## קיבוץ ידני של פרויקטים (Manual Project Grouping)
(See git history for full plan)

## Blind Jambs → רכש (Purchasing) Export Feature
(See git history for full plan)
