# Cutlist Handover (/cutlist) — current state

_Last updated: 2026-01-18_

This document is a “full handover” of the **/cutlist** feature: what it does, how data flows through the system, where parsing happens, how the UI renders, and where the **“16 profiles per item”** cap is currently coming from.

---

## 0) TL;DR (what /cutlist is + the 16-profile bug)

- **/cutlist** lets authenticated users upload a Kostika PDF cutlist, parse each PDF page into one “item/section”, preview results, then save to the backend.
- Parsing is **deterministic** (PDF text extraction + coordinates), implemented in `supabase/functions/parse-cutlist-pdf/index.ts`.
- The UI renders per-page results as:
  - **Profiles** (table with role/length/orientation/qty)
  - **Accessories** (misc)
  - **Glass**

### The “16 profiles per item” issue (most likely root cause)
In `parseProfileRowsV3()` the parser:
1) finds “profile code anchors” (one per profile row)
2) **deduplicates anchors by Y only** (vertical proximity)

Code location:
- `supabase/functions/parse-cutlist-pdf/index.ts`
  - `parseProfileRowsV3(...)` around **lines ~745–917**
  - the anchor dedupe logic is:
    ```ts
    const yTol = computeAnchorTol(anchors.map(a => a.y));
    const uniqueAnchors: TextItem[] = [];
    for (const a of anchors) {
      const exists = uniqueAnchors.some(u => Math.abs(u.y - a.y) <= yTol);
      if (!exists) uniqueAnchors.push(a);
    }
    console.log(`Deduped to ${uniqueAnchors.length} anchors...`);
    ```

If a PDF page renders **two profile tables side-by-side**, you can have **two profile codes at the same Y** (same “row”), one in each table column. Because the dedupe ignores X, it collapses the two anchors into one per Y band.

That makes the output look like a **hard cap of ~16**, because you often have **16 visual “row lines”** in the table region; everything else sits in the second column at the same Y positions.

> The most useful debug line to search for in backend logs is: `Deduped to 16 anchors`.

---

## 1) User flow (product behavior)

1. User goes to **/cutlist**.
2. Uploads a **PDF**.
3. App uploads the PDF to storage (temporary path), then calls a backend function to:
   - get `pageCount` and `projectName` (`mode: "info"`)
   - parse pages in **chunks** (`mode: "chunk"`, 15 pages per chunk)
4. App shows a **preview**: a list of parsed pages and counts of profile/misc/glass rows per page.
5. User clicks **save** → app uploads the PDF to a permanent storage path and inserts:
   - `cutlist_uploads` row
   - `cutlist_sections` row for each page
   - plus child row inserts for profile/misc/glass
6. User is navigated to **/cutlist/:uploadId**, where they can track completion.

---

## 2) Routing

- **/cutlist** → upload/import/preview UI
  - file: `src/pages/Cutlist.tsx`
- **/cutlist/:uploadId** → interactive checklist UI
  - file: `src/pages/CutlistDetail.tsx`

---

## 3) Frontend architecture

### 3.1 `/cutlist` page (upload + parse + preview + save)
File: `src/pages/Cutlist.tsx`

Key constants / behavior:
- `const CHUNK_SIZE = 15;` (pages per parsing chunk)
- Upload is restricted to PDFs only.

Parsing pipeline in the browser:
1) Upload the PDF to storage at a temp key:
   - `temp/${user.id}/${Date.now()}_${safeFileName}`
2) Call backend function `parse-cutlist-pdf`:
   - `mode: "info"` → returns `pageCount`, `projectName`
   - then loop chunks:
     - `mode: "chunk"` with `startPage/endPage`
3) Merge all chunk pages into a `ParsedCutlistV2`:
   ```ts
   const combinedResult: ParsedCutlistV2 = {
     project_name: projectName,
     pages: allPages,
   };
   ```
4) Preview tab shows per page counts:
   - `page.profile_rows.length`
   - `page.misc_rows.length`
   - `page.glass_rows.length`

Saving pipeline (important notes):
- A permanent PDF is uploaded to storage at:
  - `${user.id}/${Date.now()}_${safeName}`
- Then the app inserts rows sequentially:
  - `cutlist_uploads` (1 row)
  - For each page:
    - `cutlist_sections` (1 row)
    - `cutlist_profile_rows` (bulk insert)
    - `cutlist_misc_rows` (bulk insert)
    - `cutlist_glass_rows` (bulk insert)

**No 16-row limitation exists in the frontend**—if you see 16, it is already present in `parsedData.pages[x].profile_rows`.

### 3.2 `/cutlist/:uploadId` page (interactive checklist)
File: `src/pages/CutlistDetail.tsx`

Data loading:
- Loads upload:
  - `from("cutlist_uploads").select("*")`
- Loads sections with child tables:
  - `cutlist_sections` + `cutlist_profile_rows` + `cutlist_misc_rows` + `cutlist_glass_rows`

Row-level interactions:
- Clicking a profile/glass row opens `CutlistRowConfirmDialog`.
- “Done” updates set:
  - `status = "done"`
  - `is_checked = true`
  - timestamps + user IDs (`checked_at`, `checked_by`, `finalized_at`, `finalized_by`)
- “Issue” updates set:
  - `status = "issue"`
  - `issue_text` set

Section-level completion:
- `CutlistItemCard` only enables “Confirm item completion” when:
  - all rows in the section are `done`
  - no rows are `issue`

Key UI component:
- `src/components/cutlist/CutlistItemCard.tsx`
  - renders PDF preview, notes, tabs for tables

### 3.3 PDF preview rendering
File: `src/components/cutlist/CutlistPdfPreview.tsx`

- Uses `react-pdf` to render a cropped “drawingLeft” preview.
- Uses signed URLs from the storage bucket `cutlist-pdfs`.
- Cropping is controlled by `DRAWING_CROP_CONFIG`.

### 3.4 Language / RTL
- Context: `src/contexts/CutlistLanguageContext.tsx`
- Translations: `src/lib/cutlistTranslations.ts`
- Supports Hebrew (`he`, RTL) and Thai (`th`, LTR).

### 3.5 Legacy / unused component
There is an older checklist UI component:
- `src/components/cutlist/CutlistChecklist.tsx`

It appears **not used** by the current `/cutlist/:uploadId` route, which now renders `CutlistItemCard` + per-table components. Keep this in mind when grepping for “cutlist UI” behavior.

---

## 4) Data model (frontend types)
File: `src/lib/cutlistTypes.ts`

### Parsed (ephemeral) types (returned by backend function)
- `ParsedCutlistV2`
  - `project_name: string | null`
  - `pages: ParsedPage[]`

- `ParsedPage`
  - `page_number`
  - `item_ref`
  - `title`, `technical_text`, `notes`
  - `raw_page_text`
  - `profile_rows: ProfileRow[]`
  - `misc_rows: MiscRow[]`
  - `glass_rows: GlassRow[]`

### Persisted (database) types
- `cutlist_uploads`
- `cutlist_sections`
- `cutlist_profile_rows`
- `cutlist_misc_rows`
- `cutlist_glass_rows`

Status model:
- Section + rows use: `"open" | "done" | "issue"`

---

## 5) Backend function: `parse-cutlist-pdf`
File: `supabase/functions/parse-cutlist-pdf/index.ts`

### 5.1 Interface
The frontend calls this function via:
```ts
supabase.functions.invoke('parse-cutlist-pdf', {
  body: { storagePath, mode: "info" | "chunk", startPage, endPage },
})
```

Supported `mode`s:
- `"info"`: returns `{ pageCount, projectName }`
- `"chunk"`: parses the requested page range and returns `{ project_name, pages }`

Response shape:
```json
{
  "success": true,
  "data": {
    "project_name": "..." | null,
    "pages": [ ...ParsedPage ]
  },
  "meta": { "startPage": 1, "endPage": 15, "totalPages": 42 }
}
```

### 5.2 Core parsing pipeline per page
Key functions:
- `extractPageItems(pdfDoc, pageNum)`
  - returns positioned text items: `{ str, x, y, width, height }`
- `groupIntoRows(items)`
  - groups items into `TextRow[]` by Y proximity, sorts RTL by X desc.
- `parsePage(pageNum, items)`
  - detects table headers + boundaries
  - extracts metadata
  - parses profiles/misc/glass

Header detection:
- `findProfileTableHeaders(rows)`
  - attempts to detect **multiple** profile headers on the same Y row (for dual-table layout)
- `findIdentRowForHeader(rows, header.rowIndex, header)`
  - injects ident column position into that header
- `findGlassTableHeader(rows)`
- `findNotesRow(rows)`
- `findMiscTableHeader(rows, startAt)`

Boundary calculation:
- The parser computes `profileEnd` using `nextIndexAfter()` with candidates (glass/misc/notes).

### 5.3 Profile parsing (the important part)
The profile parser is:
- `parseProfileRowsV3(rows, items, header, endRowIndex, sectionRef)`

High-level steps:
1) Build per-column bounds from header centers:
   - `buildColumnBoundsMap(header.columnPositions, pageWidth)`
2) Derive a table-wide X range:
   - `tableMinX/tableMaxX` from min/max of the column bounds.
3) Find candidate anchors:
   - any token passing `isLikelyProfileAnchorToken()`
   - between header and profileEnd in Y
   - inside profile column bounds
   - inside overall table X range
4) **Deduplicate anchors** (currently by Y only)
5) Build “bands” between anchors and parse each band into a `ProfileRow`.
6) Filter “header garbage rows” via `isHeaderGarbageRow()`.

### 5.4 Why the cap looks like “16”
There is **no explicit `slice(0,16)` or “max 16”** in the codebase.

Instead:
- On dual-table pages, anchors frequently come in pairs at the same Y (left and right table).
- The dedupe step collapses those into a single anchor per Y band.
- If the table renders ~16 row lines before it switches into the second column, the output becomes ~16.

If you want to prove this quickly:
- Look at backend logs for a problematic page and find:
  - `Found X raw profile code anchors`
  - `Deduped to 16 anchors`

---

## 6) Where to focus to fix the 16-profile issue (engineering notes)

### 6.1 Primary suspect: anchor dedupe ignores X
In `parseProfileRowsV3`, dedupe is currently:
- duplicates if `|Δy| <= yTol`

For dual-table pages, you likely need:
- duplicates if `|Δy| <= yTol` **AND** `|Δx| <= xTol`

Where to implement:
- `parseProfileRowsV3()` right after `Found ${anchors.length} raw profile code anchors`.

### 6.2 Secondary suspect: per-table X bounds are too wide
Even though `findProfileTableHeaders()` attempts to isolate each table header, `buildColumnBoundsMap()` can produce wide bounds if:
- only a subset of columns is detected,
- or column positions accidentally include tokens spanning both tables.

If `tableMinX/tableMaxX` covers both tables, each `parseProfileRowsV3()` call can “see” anchors from both tables, and the Y-only dedupe guarantees a collapse.

### 6.3 What the code already attempted (and why it might not be sufficient)
The function already:
- detects multiple headers on the same row via `findProfileTableHeaders()`
- parses **all** detected profile tables and merges results in `parsePage()`

If the cap persists, it suggests:
- either the second header isn’t detected reliably (so only one table is parsed), **or**
- the profile parsing bounds still include both table columns, making the Y-only dedupe collapse them anyway.

---

## 7) Operational notes / gotchas

- `/cutlist` parsing is chunked by pages (`CHUNK_SIZE=15`). The “16” you see is **unrelated** to this chunk size.
- Storage bucket used: `cutlist-pdfs`.
- `CutlistPdfPreview` uses signed URLs with caching.
- Saving pages to DB is currently sequential per page (not a bug, but can affect large PDFs).

---

## 8) File map (quick reference)

Frontend:
- `src/pages/Cutlist.tsx` — upload/parse/preview/save
- `src/pages/CutlistDetail.tsx` — checklist view for a saved upload
- `src/components/cutlist/CutlistItemCard.tsx` — section card UI
- `src/components/cutlist/CutlistProfileTable.tsx` — profile rows table UI
- `src/components/cutlist/CutlistMiscTable.tsx` — misc rows table UI
- `src/components/cutlist/CutlistGlassTable.tsx` — glass rows table UI
- `src/components/cutlist/CutlistPdfPreview.tsx` — PDF drawing preview
- `src/components/cutlist/CutlistRowConfirmDialog.tsx` — row confirmation / issue modal
- `src/components/cutlist/CutlistSectionConfirmModal.tsx` — section completion modal
- `src/contexts/CutlistLanguageContext.tsx` — language/RTL context
- `src/lib/cutlistTypes.ts` — shared types

Backend (Lovable Cloud function):
- `supabase/functions/parse-cutlist-pdf/index.ts` — deterministic PDF parsing

Legacy parser (likely unused by current flow):
- `src/lib/cutlistParser.ts` — text-based parser for markdown-like extraction

---

## 9) Appendix: parsing flow diagram

```mermaid
graph TD
  A[/cutlist Upload PDF/] --> B[Upload temp PDF to storage]
  B --> C[parse-cutlist-pdf mode=info]
  C --> D{pageCount}
  D --> E[Loop chunks 15 pages]
  E --> F[parse-cutlist-pdf mode=chunk]
  F --> G[ParsedPage[] merged]
  G --> H[Preview tab counts]
  H --> I[Save: upload permanent PDF]
  I --> J[Insert cutlist_uploads]
  J --> K[Insert cutlist_sections + child rows]
  K --> L[/cutlist/:uploadId checklist]
```

---

If you want, I can also add a “debug mode” switch that exposes the backend parsing logs and anchor coordinates per page (without changing business logic) to make this type of issue much faster to diagnose.
