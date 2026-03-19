# Excel Import Format Guide - QR Tracking System

## Overview
The system imports construction items from Excel files (.xlsx, .xls) with specific Hebrew headers and structure.

---

## File Structure

### Sheet Names
- **Must contain at least one digit** (e.g., "1", "דירה 1", "Sheet 1")
- Sheets without digits are skipped (assumed to be summary sheets)
- Each sheet represents one apartment

---

## Required Format

### Section 1: Header Information (First 10 rows)

The system searches the first 10 rows for floor and apartment information:

```
קומה: 0
דירה: 1
```

**Formats supported**:
- `קומה: קרקע` → Converted to floor code "0"
- `קומה: 1` → Floor code "1"  
- `קומה: -1` → Floor code "-1" (basement)
- Can be in the same cell or adjacent cells

**Special floor mappings**:
- "קרקע" or "ground" → "0"
- Any other text → Used as-is

---

### Section 2: Data Table

After the header section, the table must have column headers including:

#### Required Columns (Hebrew):
| Column Name | English | Notes |
|-------------|---------|-------|
| מיקום בדירה | Location in apartment | Required - item location |
| מס' פרט | Item code | Required - unique item identifier |

#### Optional Columns:
| Column Name | English | Notes |
|-------------|---------|-------|
| מס' פתח | Opening number | Opening/door number |
| רוחב | Width | Item width (any format) |
| גובה | Height | Item height (any format) |
| הערות | Notes | Used for subpart classification |
| צד ימין/שמאל | Side R/L | Right or Left side indicator |

---

## Data Rows

Each row after the header represents one item.

**Example Row**:
```
| מיקום בדירה | מס' פתח | מס' פרט | רוחב | גובה | הערות | צד ימין/שמאל |
|-------------|---------|---------|------|------|-------|--------------|
| סלון        | 1       | A100    | 120  | 200  | כנפיים | R           |
```

---

## Subpart Auto-Classification

The system automatically detects which subparts (01-05) an item needs based on keywords in the `הערות` (Notes) column:

| Keyword | Subpart Code | Subpart Name (Hebrew) |
|---------|--------------|---------------------|
| משקוף | 01 | משקוף (Frame) |
| כנפי, כנף | 02 | כנפיים (Wings) |
| תריס, גלילה | 03 | תריס גלילה (Rolling Shutter) |
| מסילו, מסיל | 04 | מסילות (Rails) |
| ארגז | 05 | ארגז (Box) |

**Default behavior**: If no keywords detected → All 5 subparts assigned

---

## Complete Example

```excel
Sheet Name: "דירה 1"

Row 1: קומה: קרקע    דירה: 1
Row 2: 
Row 3: 
Row 4: מיקום בדירה | מס' פתח | מס' פרט | רוחב | גובה | הערות | צד ימין/שמאל
Row 5: סלון | 1 | A100 | 120 | 200 | כנפיים + משקוף | R
Row 6: חדר שינה | 2 | A101 | 100 | 200 | תריס גלילה | L
Row 7: מטבח | 3 | A102 | 80 | 190 | כל החלקים | R
```

**This imports**:
- Floor: 0 (קרקע)
- Apartment: 1
- Item A100: Subparts 01, 02 (detected from הערות)
- Item A101: Subpart 03 (detected from הערות)
- Item A102: All subparts 01-05 (default)

---

## Multiple Apartments

### Option 1: Multiple Sheets
```
Sheet "1" → Apartment 1
Sheet "2" → Apartment 2
```

### Option 2: Same Sheet, Different Headers
The system searches each section for new `קומה:` and `דירה:` markers.

---

## Validation & Warnings

The system generates warnings for:

### Critical Warnings (Must Fix):
- ❌ Missing `קומה:` or `דירה:` header
- ❌ Missing column `מס' פרט`
- ❌ Empty `מס' פרט` value in data row
- ❌ No table header found

### Info Warnings (Optional):
- ⚠️ Sheet name has no digit (skipped)
- ⚠️ Missing `מיקום בדירה` column
- ⚠️ Empty `מיקום` value (item still imported)

**All warnings can be exported as CSV** for bulk fixing in Excel.

---

## CSV Export Feature

After parsing, if warnings exist:
1. Click "הורד CSV" button
2. Downloads: `import-warnings-{date}.csv`
3. Format: UTF-8 with BOM (Hebrew compatible)
4. Columns: Row number | Warning message

Open in Excel → Fix issues → Re-import

---

## Import Process

1. **Upload** Excel file on `/import` page
2. **Preview**:
   - Summary: Floor count, Apartment count, Item count
   - Warnings (if any)
   - First 5 items per apartment shown
3. **Review** warnings → Download CSV if needed
4. **Confirm** → "אשר ושמור" button
5. **Database Insert**:
   - Creates/updates floors
   - Creates/updates apartments  
   - Inserts items with `status_cached = 'NOT_SCANNED'`
   - Creates temporary label placeholders

---

## Technical Details

### Parser Logic
```typescript
1. Read Excel file (xlsx library)
2. For each sheet with digit in name:
   a. Search first 10 rows for "קומה:" and "דירה:"
   b. Find table header row (contains "מיקום בדירה" or "מס' פרט")
   c. Map column indices
   d. Parse data rows (skip empty rows)
   e. Auto-classify subparts from הערות
   f. Collect warnings
3. Group items by (floor_code, apt_number)
4. Return: { apartments[], warnings[] }
```

### Database Schema
```sql
floors: (project_id, floor_code) UNIQUE
apartments: (project_id, floor_id, apt_number) UNIQUE
items: References floor_id, apt_id, project_id
labels: References item_id (one per item + subpart)
```

---

## Common Issues & Solutions

### Issue: "לא נמצאו פרטי קומה ודירה"
**Solution**: Add `קומה:` and `דירה:` in first 10 rows

### Issue: "לא נמצא כותרת טבלה"
**Solution**: Ensure column headers include "מיקום בדירה" or "מס' פרט"

### Issue: "חסר מס' פרט"
**Solution**: Fill in missing item codes in data rows

### Issue: Sheet skipped
**Solution**: Sheet name must contain at least one digit

### Issue: Wrong subparts assigned
**Solution**: Add keywords in הערות column (משקוף, כנפיים, etc.)

---

## Sample Template

Download a sample Excel file structure:

```
Sheet: "1"

A1: קומה: 0
B1: דירה: 1

A3: מיקום בדירה
B3: מס' פתח  
C3: מס' פרט
D3: רוחב
E3: גובה
F3: הערות
G3: צד ימין/שמאל

A4: סלון
B4: 1
C4: A100
D4: 120
E4: 200
F4: כנפיים
G4: R

... (more rows)
```

---

## Best Practices

1. ✅ Use consistent floor codes across project
2. ✅ Fill in all required fields (מס' פרט, מיקום בדירה)
3. ✅ Use clear item codes (unique per apartment)
4. ✅ Include subpart keywords in הערות for auto-classification
5. ✅ Review warnings before confirming import
6. ✅ Test with small file first (1-2 apartments)
7. ✅ Keep backup of original Excel file

---

## Support

For import issues:
1. Check warnings section carefully
2. Download warnings CSV
3. Verify Excel format matches guide
4. Test with minimal data first
5. Check browser console for errors

The import system is designed to be flexible and provide clear feedback for any issues! 📊
