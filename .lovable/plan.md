

## Plan: Type-Aware Additions + Bank Editor in Measurement Editor

### Overview

Two features for the Measurement Editor (`/projects/:id/measurement`):

1. **Type-aware additions** — When adding a floor/apartment, ask if it should use a saved type (template), and if not, navigate the user to the new floor/apartment for manual editing.
2. **Bank Editor** — A panel to view, add, and edit bank items (פרט + height/width), with retroactive updates to all matching measurement rows.

---

### Feature 1: Type-Aware Floor/Apartment Additions

**Current state:** The Add Floor / Add Apartment dialogs create blank rows with just opening counts. Types (floor types, apartment types) only exist in the Wizard draft, which is deleted after project creation. The `measurement_rows` table has no reference to types.

**Problem:** After project creation, the type definitions are lost. We need to persist them on the project so they can be reused when adding floors/apartments in the editor.

#### Database Changes

**Migration: Add `project_metadata` JSONB column to `projects` table**
```sql
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_metadata jsonb DEFAULT '{}'::jsonb;
```

This column will store `{ bankItems: [...], apartmentTypes: [...], floorTypes: [...] }` — preserved at project creation time from the wizard draft.

**No new tables needed.** Types are lightweight templates that fit in a JSONB field.

#### Code Changes

1. **`WizardStepReview.tsx` — Persist metadata at creation time**
   - Before deleting the draft, save `bankItems`, `apartmentTypes`, and `floorTypes` into the new `project_metadata` column on the created project.

2. **`MeasurementEditor.tsx` — Fetch and use project metadata**
   - On load, fetch `project_metadata` from the project record.
   - Extract `apartmentTypes` and `floorTypes` from it.

3. **`MeasurementEditor.tsx` — Enhance Add Floor dialog**
   - After entering floor label/apt count, show a step: "האם להחיל טיפוס קומה?" with a dropdown of available `floorTypes` + "ללא טיפוס" option.
   - If a type is selected: pre-populate apartment labels, opening counts, and row data (location, contract_item, height, width, etc.) from the type template.
   - If no type: after creation, auto-set `selectedFloor` filter to the new floor so the user lands on it for manual editing.

4. **`MeasurementEditor.tsx` — Enhance Add Apartment dialog**
   - Same pattern: "האם להחיל טיפוס דירה?" dropdown with `apartmentTypes`.
   - If a type is selected: create rows pre-filled with template data.
   - If no type: auto-filter to the new apartment.

5. **Auto-navigation after creation**
   - When no type is selected, after inserting rows:
     - Set `selectedFloor` to the new floor label
     - Set `selectedApartment` to the first new apartment label
     - This scrolls/filters the user directly to the blank rows for editing

#### Ripple Effects
- The `project_metadata` column is new and defaults to `{}`, so existing projects won't break.
- No effect on Excel export, labels, scans, or any downstream system — types are only used as templates for row creation.

---

### Feature 2: Bank Editor (בנק פרטים)

**What it does:** A UI panel in the Measurement Editor to manage the project's bank items. Users can:
- View all bank items (פרט number, height, width)
- Add new bank items
- Edit existing bank item height/width
- **Retroactively update** all measurement rows that reference the changed bank item

**How bank items connect to rows:** In the wizard, when a user assigns `contract_item` (פרט חוזה) to a row, the row's `height` and `width` are auto-filled from the matching bank item. After creation, these values live independently in `measurement_rows`. The link is through `contract_item` matching `bankItem.item_no`.

#### Code Changes

1. **`MeasurementEditor.tsx` — Add "בנק פרטים" button in the toolbar**
   - Opens a Dialog/Sheet showing a table of bank items from `project_metadata.bankItems`.

2. **Bank Editor Dialog (`BankEditorDialog.tsx` — new component)**
   - Table with columns: פרט (item_no), גובה (height), רוחב (width), גובה מהריצוף (floor_height)
   - Inline editing for height/width/floor_height
   - "הוסף פרט" button to add new items
   - Delete button per row
   - "שמור" button that:
     a. Updates `project_metadata.bankItems` on the `projects` table
     b. For any changed height/width values: batch-updates all `measurement_rows` where `contract_item = item_no` AND the row's height/width still matches the OLD value (to avoid overwriting manual edits)
     c. Shows a confirmation dialog: "עדכון גובה/רוחב ישפיע על X שורות. להמשיך?"

3. **Retroactive update logic**
   - When a bank item's height or width changes:
     - Query `measurement_rows` where `project_id = X` AND `contract_item = item_no`
     - Option A (safe): Only update rows where current value matches the OLD bank value (preserves manual overrides)
     - Option B (aggressive): Update ALL matching rows regardless
     - **Recommendation: Option A** with a toggle "דרוס גם ערכים שנערכו ידנית" for Option B
   - After DB update, refresh local `rows` state

4. **New bank items availability**
   - When a new bank item is added, it becomes available in the `contract_item` dropdown/reference for new rows
   - Existing rows can be updated to reference the new item

#### Ripple Effects
- **Excel export**: No change needed — export reads from `measurement_rows` directly, not from bank.
- **Measurement finalize / convert to running**: No change — uses `measurement_rows` values.
- **Items table**: When measurement rows are converted to items (via `measurement-finalize` edge function), the values are already in the rows. No impact.
- **Labels / Scans**: No impact — these work with `items` table, downstream of measurement.
- **Wizard drafts**: Independent — the wizard has its own bank editing. This is for post-creation editing.

---

### Summary of Changes

| Area | Change |
|------|--------|
| **Migration** | Add `project_metadata` JSONB column to `projects` |
| **WizardStepReview.tsx** | Save bankItems + types to `project_metadata` at creation |
| **MeasurementEditor.tsx** | Load metadata, enhance add dialogs with type selection, add bank button |
| **BankEditorDialog.tsx** (new) | Full bank CRUD with retroactive row updates |
| **No changes needed** | Excel export, edge functions, labels, scans, allocation grid |

### Edge Cases
- Projects created before this feature: `project_metadata` will be `{}` — type dropdowns will be empty (graceful), bank editor will start empty (user can add items manually)
- Concurrent editing: Bank updates use Supabase `.update()` with `.eq()` filters — safe for single-user editing (which is the current model)
- Offline mode: Bank editor and type-aware additions disabled when offline (same as existing additions behavior)

