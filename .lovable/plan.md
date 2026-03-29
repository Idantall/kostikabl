

## Plan: Excel Output Fixes — Company Name, Apartment Types, Column Widths

### Issues Found

1. **Company name** — Code already says "אלום קוסטיקה י.ש בע״מ" (correct). If you're still seeing "יש קוסטיקה", it's from a cached/old export. No code change needed here.

2. **Apartment types missing in Excel** — Project 4 was created before the type-labeling feature. Its `apartment_label` values are plain numbers (1, 2, 3...) without "(טיפוס X)" suffix. The floor types ARE stored in `floor_label` (e.g., "10 (טיפוס 8-12)"). The fix: derive apartment type from its parent floor's type label in the Excel export, and also run a one-time DB migration to backfill `apartment_label` for project 4.

3. **"ציר מבט פנים פתיחה פנימה/החוצה" columns cut off** — Current width is 7, far too narrow for these long headers. Need to widen or use abbreviated headers that match the reference screenshot: "ציר מבט פנים" and "ציר מבט פנים החוצה".

---

### Changes

#### 1. Column width fix (`src/lib/measurementExcelExport.ts`)

Update the two wing position column definitions:
- `wing_position` header: **"ציר פנימה"**, width: **8**
- `wing_position_out` header: **"ציר החוצה"**, width: **8**

This matches the screenshot reference where these columns are labeled concisely.

#### 2. Apartment type in Excel output (`src/lib/measurementExcelExport.ts`)

In the `createWorksheet` function, when building the metadata row (row 3), derive the apartment type from the floor label:
- Extract type name from `floorLabel` using regex: `/\(טיפוס (.+?)\)/`
- If found, append it to `apartmentLabel` in the metadata display: `דירה: 31 (טיפוס 8-12)`

Also in the sheet tab name: prefix with "דירה " and include the type if available from the floor context.

#### 3. Retroactive DB fix for project 4 (SQL migration)

Run a migration that updates `apartment_label` for rows in project 4 where the `floor_label` contains a type:
```sql
UPDATE measurement_rows
SET apartment_label = apartment_label || ' (' || 
  substring(floor_label from '\((.+?)\)') || ')'
WHERE project_id = 4
  AND floor_label LIKE '%(טיפוס%'
  AND apartment_label NOT LIKE '%(טיפוס%';
```

This adds the floor's type suffix to all apartment labels that don't already have it.

#### 4. Future-proof: Ensure WizardStepReview always includes type

Already implemented — lines 70-71 of `WizardStepReview.tsx` already append `(טיפוס X)` to `apartment_label` when `sourceApartmentTypeName` exists. No change needed.

---

### Summary of File Changes

| File | Change |
|------|--------|
| `src/lib/measurementExcelExport.ts` | Shorten wing column headers, widen to 8, derive apt type from floor label for display |
| SQL migration | Backfill apartment_label with type info for project 4 |

### No Ripple Effects
- Labels, scans, items table: unaffected (they use `items` table, not `measurement_rows` labels)
- Allocation grid: unaffected (doesn't use these columns)
- Other projects: migration only touches project 4

