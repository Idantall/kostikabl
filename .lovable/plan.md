

# Enhanced Apartment/Floor Label Editing with Validation

## Current State
Floor and apartment labels are already inline-editable with batch rename confirmation. But there's no validation when the new value doesn't match any existing apartment/floor.

## Changes

### 1. Enhanced rename dialog with 3 options (`src/pages/MeasurementEditor.tsx`)
When a user changes an apartment_label (or floor_label) on a row that shares the old label with other rows, show an enhanced dialog with:
- **"Update all X rows"** — batch rename all rows with old label → new label (existing behavior)
- **"Only this row"** — change just this one row (existing behavior)

### 2. Validate new apartment label against existing apartments (`src/pages/MeasurementEditor.tsx`)
After the user types a new apartment label on blur:
- If the new value doesn't match any existing apartment in the `apartments` list AND the row's old value had matching siblings, show a warning in the confirmation dialog: "דירה '{newValue}' לא קיימת. האם ליצור דירה חדשה או לבחור מרשימה?"
- Add a Select dropdown in the dialog listing existing apartments so the user can pick one instead of typing a new name
- Same logic for floor_label against `floors` list

### 3. Update rename confirmation state and dialog UI
Extend the `renameConfirm` state to include an `isNewLabel: boolean` flag and an optional `selectedExisting: string` override. The dialog will conditionally show:
- A warning badge when the label is new/unknown
- A Select with existing apartments/floors to pick from
- The existing "update all" / "only this row" buttons

### Files Modified
- `src/pages/MeasurementEditor.tsx` — Extend `handleLabelChange` validation, enhance `renameConfirm` state, update AlertDialog UI with existing-label picker and warning

