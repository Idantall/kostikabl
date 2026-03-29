

## Plan: "תוספות" (Additions) Menu in Measurement Editor

### What Changes

Replace the "שורה חדשה" button with a "תוספות" dropdown that offers three options:
1. **הוסף קומה** — Add a new floor (with apartments and openings)
2. **הוסף דירה** — Add a new apartment to an existing floor (with openings)
3. **הוסף שורה** — Add a single row (current behavior)

### How It Works

The `measurement_rows` table uses **text labels** (`floor_label`, `apartment_label`) — not foreign keys. So adding a floor or apartment simply means inserting new `measurement_rows` with the correct label values. **No database schema changes needed.**

### UI Flow

**"תוספות" Button → DropdownMenu with 3 options:**

1. **הוסף קומה**: Opens a dialog asking for:
   - Floor label (e.g. "5")
   - Number of apartments on this floor
   - Apartment labels (auto-generated like "1", "2", "3"... but editable)
   - Number of openings per apartment (default 1)
   - Inserts `measurement_rows` for each apartment × opening combination

2. **הוסף דירה**: Opens a dialog asking for:
   - Which floor (dropdown from existing floors)
   - Apartment label (text input)
   - Number of openings (default 1)
   - Inserts `measurement_rows` for each opening

3. **הוסף שורה**: Current single-row add behavior (existing `addRow` function), using the currently selected floor/apartment filters.

### Stage Awareness

All three options work across every project status (`pre_contract`, `blind_jambs`, `measurement`). The rows are inserted with the same field set — stage-specific columns (like `blind_jamb_item`, `item_code`) simply remain null until the user fills them in.

### Technical Details

**File: `src/pages/MeasurementEditor.tsx`**

- Import `DropdownMenu` components from UI library
- Replace the `<Button>שורה חדשה</Button>` with a `<DropdownMenu>` trigger labeled "תוספות"
- Add state for dialog visibility: `addFloorOpen`, `addApartmentOpen`
- Add two new dialog components (inline or extracted):
  - `AddFloorDialog` — floor label, apartment count, apartment labels, openings per apt
  - `AddApartmentDialog` — floor picker (from `floors` state), apt label, opening count
- Each dialog's submit handler:
  - Validates inputs
  - Calls `supabase.from('measurement_rows').insert(rows).select()` with batch of new rows
  - Appends returned rows to local `rows` state
  - Updates `floors` and `apartments` filter lists
  - Shows success toast
- All three options disabled when `connectionStatus === 'offline'`

**No other files need changes.** No migrations. No edge functions.

