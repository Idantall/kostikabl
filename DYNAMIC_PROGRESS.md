# Dynamic Item Progress Implementation

## Overview
The system now displays dynamic per-item progress based on each item's actual `required_codes` array instead of hardcoded "/5" values.

## Implementation Details

### Database Schema
- `items.required_codes`: TEXT[] column storing the canonical subpart codes for each item
- Populated during import from Excel parser's `subpart_codes` field
- Examples:
  - חלון מושלם: `["00"]` → progress shown as X/1
  - דלת: `["01","03","04"]` → progress shown as X/3  
  - דלת מונובלוק: `["01","02","03","04","05"]` → progress shown as X/5

### Frontend (ProjectDetail.tsx)
- Fetches `required_codes` along with other item fields
- Calculates `required_count` as `required_codes.length` for each item
- Displays progress as `{scanned_parts}/{required_count}` in:
  - Apartments tab (collapsed item view)
  - Items tab (main table)

### Backend (scan-confirm edge function)
- Already implemented: computes progress using `item.required_codes`
- Returns dynamic `progress: { scanned, required }` based on actual subparts
- Progress calculation is per-source (load vs install)
- Returns `ready: true` when `scanned === required`

### Import Process
- Excel parser extracts `subpart_codes` based on:
  1. Client template: "הערות" column with exact-match mapping
  2. System template: Keyword detection fallback
- Import.tsx saves `subpart_codes` as `required_codes` in database
- Normalizes '0' to '00' for consistency

## Examples

| Item Type | required_codes | Display |
|-----------|---------------|---------|
| חלון מושלם | ["00"] | 0/1 → 1/1 |
| דלת | ["01","03","04"] | 0/3 → 1/3 → 2/3 → 3/3 |
| דלת מונובלוק | ["01","02","03","04","05"] | 0/5 → ... → 5/5 |
| חלון | ["00"] | 0/1 → 1/1 |
| קיפ | ["00"] | 0/1 → 1/1 |
| ממד | ["01","02"] | 0/2 → 1/2 → 2/2 |

## Status
✅ Implemented and working in production
