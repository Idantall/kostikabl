

# Enable Editing Floor & Apartment Labels in Measurement Editor

## What Changes

### 1. MeasurementRowCard — Make labels editable (line 74-76)
Replace the static `קומה {row.floor_label} | דירה {row.apartment_label}` text with two small inline editable inputs (or clickable-to-edit fields). Each calls `onFieldChange(id, 'floor_label', value)` / `onFieldChange(id, 'apartment_label', value)` on blur/enter.

### 2. MeasurementEditor — Handle ripple effects on label change
When a floor_label or apartment_label changes on a single row:
- **Batch update option**: Add a confirmation prompt — "Update all rows with floor X to new label Y?" — so renaming a floor/apartment applies to all rows sharing that label, not just one row.
- **Refresh filter lists**: After the update, recalculate the `floors` and `apartments` state arrays from the updated `rows` array so the filter dropdowns reflect the new labels immediately.

### 3. Batch rename logic
Wrap the `updateRow` handler with a special check: if the field is `floor_label` or `apartment_label` and the old value differs from the new value, show a small confirmation toast/dialog asking whether to rename all rows with the old label. If yes, loop through all matching rows and queue updates for each. If no, update only the single row.

## Technical Details

**Files modified:**
- `src/components/measurement/MeasurementRowCard.tsx` — Replace static label line with two small Input fields for floor_label and apartment_label, debounced on blur
- `src/pages/MeasurementEditor.tsx` — Add `renameFloor(oldLabel, newLabel)` and `renameApartment(floor, oldLabel, newLabel)` functions that batch-update all matching rows in state + queue DB updates. Add a rename confirmation dialog. Recalculate floor/apartment filter arrays after any label change.

**Ripple effects handled:**
- Filter dropdown lists (`floors`, `apartments`) are recalculated from rows after rename
- Selected filter values are updated if the currently-selected floor/apartment was renamed
- All rows sharing the old label are updated in one batch (with user confirmation)
- DB updates are queued via the existing `debouncedQueueUpdate` for each affected row

