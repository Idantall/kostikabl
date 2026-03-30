

# Allocation Export XLSX — Add Branded Wrapper (Header/Footer Images)

## What We're Building

The allocation grid XLSX export will be wrapped with the Kostika branded letterhead from the uploaded DOCX:
- **Top of sheet**: Kostika logo + company info header image
- **Bottom of data**: Signature text ("לאישורך לביצוע / יריב קוסטיקה") + brand logos strip (MASACHIM, SCREENEX, RESIDENCE, WINEX, RAILTECH)
- **Middle**: The allocation table data — untouched

## Layout (A3 Landscape)

```text
┌─────────────────────────────────────────────┐
│  [Header image: Kostika logo + contact info]│  ← Rows 1-4 (reserved, merged)
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  מידות │ מספר פרט │ דירה 1 │ ...    │    │  ← Data starts at row 5
│  │  ...   │  ...     │  ...   │ ...    │    │
│  │  סה״כ  │  ...     │  ...   │ ...    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│         לאישורך לביצוע                       │  ← 2 rows below data
│         יריב קוסטיקה                        │
│  [Footer image: brand logos strip]          │  ← Bottom
└─────────────────────────────────────────────┘
```

## Technical Approach

### 1. Copy brand images to project assets
- Copy the two extracted images (`img_p0_2.jpg` = header logo, `img_p0_1.jpg` = footer brands strip) into `public/branding/` so they can be fetched at runtime during export.

### 2. Modify `AllocationGrid.tsx` — `exportXLSX` function

**Image loading**: Fetch the two branding images as ArrayBuffers using `fetch()` before building the workbook.

**Header section (rows 1-4)**:
- Reserve rows 1-4 by inserting blank rows before the data
- Set row heights for header area (~80px total)
- Use `workbook.addImage()` + `worksheet.addImage(imageId, { tl, ext })` to place the header image spanning the full width across rows 1-3
- The header image contains the Kostika logo + address + contact info

**Data section (starts row 5)**:
- Shift all existing data rows down by 4 (offset row indices)
- Table content remains completely unchanged

**Footer section (after data)**:
- Add 2 text rows after the totals row: "לאישורך לביצוע" and "יריב קוסטיקה" — centered, bold
- Add the brand logos strip image below, spanning the full width
- Use `worksheet.addImage()` with `tl`/`ext` positioning

### 3. Print setup
- Update page setup to account for the header/footer images in margins

### Files Modified
- `src/components/allocation/AllocationGrid.tsx` — export function updated
- `public/branding/allocation-header.jpg` — header image (copied from parsed doc)
- `public/branding/allocation-footer.jpg` — footer brands image (copied from parsed doc)

