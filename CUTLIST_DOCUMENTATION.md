# רשימת חיתוך - Cutlist Feature Documentation

## Overview

The Cutlist feature (`/cutlist`) provides a digital production checklist system for aluminum window manufacturing. It parses PDF cut-list documents from "Alum Kostika" and creates interactive checklists that factory workers can use to track production progress.

## Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/cutlist` | `Cutlist.tsx` | Main cutlist management page with upload and saved files list |
| `/cutlist/:uploadId` | `CutlistDetail.tsx` | Interactive checklist view for a specific upload |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              User Interface                                  │
├─────────────────┬─────────────────────────────────────────┬─────────────────┤
│  Cutlist.tsx    │         CutlistDetail.tsx               │ CutlistChecklist│
│  (Upload/List)  │         (Checklist View)                │   (Component)   │
└────────┬────────┴────────────────┬────────────────────────┴────────┬────────┘
         │                         │                                  │
         │  PDF Upload             │  Toggle Items                    │
         ▼                         ▼                                  │
┌─────────────────┐    ┌─────────────────────────┐                    │
│ parse-cutlist-  │    │   Supabase Database     │◄───────────────────┘
│ pdf (Edge Fn)   │───▶│  - cutlist_uploads      │
│                 │    │  - cutlist_sections     │
│ Uses AI (Gemini)│    │  - cutlist_items        │
└─────────────────┘    └─────────────────────────┘
```

## Database Schema

### cutlist_uploads
Stores metadata about uploaded PDF files.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key (auto-generated) |
| `filename` | text | User-provided name for the upload |
| `project_name` | text | Extracted project name from PDF (nullable) |
| `uploaded_by` | uuid | User ID who uploaded the file |
| `status` | text | Upload status (default: 'active') |
| `created_at` | timestamp | Upload timestamp |

### cutlist_sections
Groups items by window/section identifier (זיהוי).

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key (auto-generated) |
| `upload_id` | uuid | Foreign key to cutlist_uploads |
| `section_ref` | text | Window identifier (e.g., "8", "9") |
| `section_name` | text | Optional section name (nullable) |
| `notes` | text | Section notes (nullable) |
| `ord` | integer | Display order |
| `created_at` | timestamp | Creation timestamp |

### cutlist_items
Individual cut-list line items with checkbox tracking.

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid | Primary key (auto-generated) |
| `section_id` | uuid | Foreign key to cutlist_sections |
| `profile_code` | text | Aluminum profile code (e.g., "4543", "03316") |
| `description` | text | Item description/role (תפקיד) |
| `dimensions` | text | Cut dimensions (e.g., "1328 W", "1035 H") |
| `required_qty` | integer | Quantity needed (default: 1) |
| `is_checked` | boolean | Completion status (default: false) |
| `checked_at` | timestamp | When item was checked (nullable) |
| `checked_by` | uuid | User who checked the item (nullable) |
| `ord` | integer | Display order within section |
| `created_at` | timestamp | Creation timestamp |

## Components

### 1. Cutlist.tsx (Main Page)

The main cutlist management page with three tabs:

#### Tab 1: קבצים שמורים (Saved Files)
- Lists all previously uploaded cutlist files
- Shows progress (checked/total items)
- Allows deletion and navigation to detail view

#### Tab 2: ייבוא חדש (New Import)
- PDF file upload interface
- Drag-and-drop or click to select
- Shows processing spinner during AI extraction

#### Tab 3: תצוגה מקדימה (Preview)
- Displays parsed data before saving
- Shows section/item counts
- Allows filename editing
- Confirm and save to database

### 2. CutlistDetail.tsx (Checklist View)

Interactive checklist for production tracking:

- **Header**: Filename and project name
- **Progress Bar**: Visual completion percentage
- **Search**: Filter items by profile code, description, or dimensions
- **Refresh**: Reload data from database
- **Accordion Sections**: Collapsible window sections
- **Checkboxes**: Toggle item completion status

### 3. CutlistChecklist.tsx (Reusable Component)

A shared component used in both preview and detail views:

```typescript
interface CutlistChecklistProps {
  sections: CutlistSectionDisplay[];  // Section data with items
  isPreview?: boolean;                // If true, checkboxes are disabled
  onToggleItem?: (itemId: string, isChecked: boolean) => void;  // Callback for checkbox changes
}
```

Features:
- Accordion-based section display
- Per-section completion badges (e.g., "3/5")
- Green highlighting for completed sections
- Table layout with columns: Checkbox, Profile, Description, Dimensions, Quantity
- Strike-through styling for checked items

## Edge Function: parse-cutlist-pdf

### Location
`supabase/functions/parse-cutlist-pdf/index.ts`

### Flow
1. Receives PDF file via FormData
2. Converts PDF to base64 encoding
3. Sends to Lovable AI (Gemini 2.5 Flash) with extraction prompt
4. AI returns structured markdown text
5. Parses markdown into `ParsedCutlist` structure
6. Returns JSON response

### AI Prompt Strategy
The AI is instructed to:
- Extract project name (פרוייקט)
- Identify section identifiers (זיהוי column)
- Format tables as markdown with `|` separators
- Preserve exact values for profile codes, dimensions, quantities

### Response Format
```typescript
{
  success: boolean;
  data: {
    project_name: string | null;
    sections: Array<{
      section_ref: string;
      section_name: string | null;
      notes: string | null;
      items: Array<{
        profile_code: string;
        description: string;
        dimensions: string;
        quantity: number;
      }>;
    }>;
  };
  raw_text: string;  // Original AI extraction for debugging
}
```

## Parser Logic (cutlistParser.ts)

### Key Functions

#### `parseKostikaFormat(text: string): ParsedCutlist`
Main parser that converts AI-extracted text into structured data.

**Process:**
1. Split text into lines
2. Extract project name using regex
3. Detect table headers (פרופיל, תפקיד, etc.)
4. Parse data rows, identifying:
   - Profile codes (2-6 digit numbers, optional suffix)
   - Dimensions (number + W or H)
   - Quantities (pure numbers)
   - Section identifiers (single digits)
5. Group items by section
6. Merge duplicate sections
7. Sort numerically by section ref

#### Helper Functions
- `cleanHebrewText(text)`: Normalize whitespace, remove zero-width chars
- `isProfileCode(text)`: Validate profile code format
- `isDimension(text)`: Validate dimension format (e.g., "1328 W")
- `extractSectionRef(text)`: Extract section ID from text
- `parseTableRow(row)`: Split markdown table row into cells
- `detectColumnMapping(headerRow)`: Identify column positions from headers

## RLS Policies

### cutlist_uploads
- **SELECT**: `is_email_allowed()` - Only allowed users can view
- **INSERT**: Must match `auth.uid() = uploaded_by`
- **UPDATE/DELETE**: Owner or app owner only

### cutlist_sections
- **SELECT**: `is_email_allowed()`
- **INSERT/UPDATE/DELETE**: Via upload owner check

### cutlist_items
- **SELECT**: `is_email_allowed()`
- **INSERT/DELETE**: Via section → upload owner check
- **UPDATE**: `is_email_allowed()` (for toggling checkboxes)

## User Flow

### Uploading a New Cutlist

1. Navigate to `/cutlist`
2. Click "ייבוא חדש" tab
3. Upload PDF file (Alum Kostika format)
4. Wait for AI processing (5-15 seconds)
5. Review parsed sections and items in preview
6. Enter filename and click "אשר ושמור"
7. Redirected to checklist view

### Using the Checklist

1. Navigate to `/cutlist` → click "פתח" on a saved upload
2. Expand window sections using accordion
3. Check items as they're completed
4. Use search to find specific profile codes
5. Progress bar shows overall completion

### Deleting an Upload

1. Navigate to `/cutlist`
2. Click trash icon next to upload
3. Confirm deletion
4. All sections and items cascade deleted

## Technical Notes

### Large PDF Handling
- Uses Deno's standard library `encodeBase64()` for safe conversion
- Avoids stack overflow with chunked encoding
- Supports PDFs up to ~9MB

### Hebrew RTL Support
- All pages use `dir="rtl"` for proper text alignment
- Component layout respects RTL direction
- Search and input fields support Hebrew

### Performance
- Lazy loading for route components
- Efficient database queries with nested selects
- Local state updates before database confirmation

## Kostika PDF Format

The parser expects PDFs from "Alum Kostika" software with:
- Project header with project name
- Table columns: קוד/פרופיל | תפקיד | אורך חיתוך | כמ' | זיהוי
- Section identifiers (זיהוי) as single digits (e.g., "8", "9*")
- Profile codes as 2-6 digit numbers with optional suffix
- Dimensions with W (width) or H (height) suffix

### Example Table Row
```
| 4543 | קו אמצעי עליון | 1328 W | 2 | 8 |
```

## Future Enhancements (Suggested)

1. **Offline Support**: Service worker for offline checklist access
2. **Multiple Workers**: Show who checked each item
3. **Export**: Generate completion reports
4. **Notifications**: Alert when section is 100% complete
5. **Duplicate Detection**: Warn on similar existing uploads
6. **Batch Operations**: Check/uncheck entire sections
