

## Plan: Improve Floor Dividers & XLSX Export Layout

### Problem
1. **Web table**: The vertical border between floor groups is too subtle — hard to distinguish where one floor ends and another begins.
2. **XLSX export**: Currently uses flat column headers like `"קומה 4 - 1"` instead of the reference layout which has a **merged floor header row** spanning apartment columns, with apartment numbers as a second sub-header row.

### Changes

#### 1. Web Table — Stronger Floor Dividers (`AllocationGrid.tsx`)

- Add a `floorBoundaryAptIds` set identifying the **last apartment column** in each floor group.
- Apply a thicker/darker left border (`border-l-2 border-gray-400`) on cells at floor boundaries in both header row 2, data rows, and totals row.
- This gives a clear vertical line separating floor groups, matching the reference screenshot.

#### 2. XLSX Export — Two-Row Header with Merged Floor Cells (`AllocationGrid.tsx`)

Rewrite `exportXLSX` to produce a structure matching the reference:

```text
Row 1: | (merged) מידות | (merged) מספר פרט | ← קומה 4 (colspan 5) → | ← קומה 5 (טיפוס 5+6) (colspan 7) → | ...
Row 2: |                |                    |  1  |  2  |  3  | ...  |  7  |  8  |  9  | ...              | ...
Row 3+: data rows with counts
```

- Use the `xlsx` library's merge feature (`ws["!merges"]`) to merge floor header cells across their apartment columns.
- Row 1: merged floor headers + "מידות" and "מספר פרט" spanning 2 rows.
- Row 2: individual apartment numbers.
- Data rows start at row 3.
- Apply thicker borders at floor boundaries in the XLSX output as well.

### Files Modified
- `src/components/allocation/AllocationGrid.tsx` — floor boundary styling + XLSX export rewrite

