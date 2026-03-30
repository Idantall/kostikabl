

# Wizard UX Improvements — 6 Fixes

## Issues & Solutions

### 1. Add multiple bank items at once (בנק פרטים)
Currently only "הוסף פרט" adds one row. Add a "הוסף מספר פרטים" button with a count input (similar to the existing "הוסף מספר פתחים" popover in WizardStepApartments).

**File**: `src/components/wizard/WizardStepBank.tsx`
- Add a Popover next to the existing "הוסף פרט" button with a numeric input for count
- Loop and dispatch `ADD_BANK_ITEM` for each new empty row

### 2. Add multiple apartments per floor at once
Currently "הוסף דירה" adds one apartment. Add a "הוסף מספר דירות" button with count input.

**File**: `src/components/wizard/WizardStepFloors.tsx`
- Add a Popover or small dialog next to "הוסף דירה" (line 534)
- Loop `ADD_APARTMENT` dispatch with auto-incremented labels

### 3. Cancel/clear applied apartment or floor type
Add a button to clear `sourceApartmentTypeName` / `sourceFloorTypeName` from an apartment or floor, essentially "un-applying" a type without deleting data.

**Files**: 
- `src/components/wizard/WizardContext.tsx` — Add `CLEAR_APARTMENT_TYPE_TAG` and `CLEAR_FLOOR_TYPE_TAG` actions that null out the source type name fields
- `src/components/wizard/WizardStepFloors.tsx` — Add an X button on the floor type badge to clear it
- `src/components/wizard/WizardStepApartments.tsx` — Add an X button on the apartment type badge in the apartment selector

### 4. Remove expand/collapse arrows from floors
Replace ChevronDown/ChevronUp icons on each floor's collapsible trigger. Keep the collapsible functionality (click to toggle) but remove the arrow icons — the entire header bar is clickable.

**File**: `src/components/wizard/WizardStepFloors.tsx` (line 460)
- Remove the `{expandedFloors.has(floor.id) ? <ChevronUp> : <ChevronDown>}` icons entirely

### 5. Sticky header row in apartment table
When scrolling vertically through 20+ rows, the table header scrolls out of view. Make the `<TableHeader>` sticky.

**File**: `src/components/wizard/WizardStepApartments.tsx`
- Add `sticky top-0 z-10 bg-background` to the `<TableHeader>` element
- Wrap the table area in a max-height container with `overflow-y-auto` so vertical scroll is contained

### 6. Add scroll to apartment type selection dialog
The "החל סוג דירה" dialog (line 608-636) doesn't scroll when there are many types.

**File**: `src/components/wizard/WizardStepApartments.tsx`
- Wrap the type list in a `ScrollArea` with `max-h-[60vh]` or similar inside the dialog content

## Files Modified
- `src/components/wizard/WizardStepBank.tsx`
- `src/components/wizard/WizardStepFloors.tsx`
- `src/components/wizard/WizardStepApartments.tsx`
- `src/components/wizard/WizardContext.tsx`

