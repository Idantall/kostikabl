# Projects & Import System - Complete Handover Documentation

## Overview

This document provides comprehensive documentation of the **Projects** and **Import** systems for the QR Tracking application. These systems handle project creation, management, and data import from Excel files.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Route Map](#route-map)
3. [Database Schema](#database-schema)
4. [Page-by-Page Documentation](#page-by-page-documentation)
5. [Component Dependencies](#component-dependencies)
6. [Data Flow](#data-flow)
7. [State Management](#state-management)
8. [Known Issues & Technical Debt](#known-issues--technical-debt)
9. [Refactoring Recommendations](#refactoring-recommendations)

---

## Architecture Overview

### Project Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          PROJECT CREATION PATHS                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐      │
│  │   /wizard       │    │   /import       │    │/import/measurement│    │
│  │  (Guided UI)    │    │ (Excel Full)    │    │  (Measurement)   │     │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘      │
│           │                      │                       │               │
│           ▼                      ▼                       ▼               │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              PROJECT STATUS DETERMINATION                        │    │
│  ├──────────────────────────┬──────────────────────────────────────┤    │
│  │     status: 'active'     │        status: 'measurement'         │    │
│  │  (Full project with      │    (Editable measurement data,       │    │
│  │   floors, apartments,    │     stored in measurement_rows)      │    │
│  │   items, labels)         │                                      │    │
│  └──────────────────────────┴──────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Two Project Types

| Type | Status | Data Storage | Features |
|------|--------|--------------|----------|
| **Active Project** | `active` | `floors`, `apartments`, `items`, `labels` tables | QR labels, scanning, loading/install tracking |
| **Measurement Project** | `measurement` | `measurement_rows` table | In-field editing, mobile-first UI, finalization to active |

---

## Route Map

| Route | Component | Purpose |
|-------|-----------|---------|
| `/projects` | `Projects.tsx` | Project list with search, folders, tabs |
| `/projects/:id` | `ProjectDetail.tsx` | Full project dashboard and management |
| `/projects/:id/measurement` | `MeasurementEditor.tsx` | Mobile-first measurement data editing |
| `/projects/:id/summary` | `ProjectItemsSummary.tsx` | Item summary and label generation |
| `/import` | `Import.tsx` | Main import hub with 3 options |
| `/import/measurement` | `ImportMeasurement.tsx` | Import measurement Excel files |
| `/wizard` | `ProjectWizard.tsx` | Multi-step guided project creation |

---

## Database Schema

### Core Tables

```sql
-- Projects table
projects (
  id: bigint PK
  name: text NOT NULL
  building_code: text
  status: text DEFAULT 'active'  -- 'active' | 'measurement'
  created_by: uuid FK -> auth.users
  folder_id: uuid FK -> project_folders
  source_file_path: text  -- Path in storage bucket
  production_file_path: text
  created_at: timestamptz
)

-- Project hierarchy
floors (
  id: bigint PK
  project_id: bigint FK -> projects
  floor_code: text NOT NULL
)

apartments (
  id: bigint PK
  project_id: bigint FK -> projects
  floor_id: bigint FK -> floors
  apt_number: text NOT NULL
)

items (
  id: bigint PK
  project_id: bigint FK -> projects
  floor_id: bigint FK -> floors
  apt_id: bigint FK -> apartments
  item_code: text NOT NULL
  location: text
  opening_no: text
  width: text
  height: text
  notes: text
  motor_side: text  -- 'R' | 'L' | null
  required_codes: text[]  -- ['01', '02', '03', '04', '05']
  status_cached: text
  loading_status_cached: loading_status
  install_status_cached: install_status
)

-- For measurement projects only
measurement_rows (
  id: uuid PK
  project_id: bigint FK -> projects
  floor_label: text
  apartment_label: text
  sheet_name: text
  location_in_apartment: text
  opening_no: text
  item_code: text
  height: text
  width: text
  notes: text  -- Contains angle data: "זווית1:value;זווית2:value;user notes"
  field_notes: text
  glyph: text
  jamb_height: text
  engine_side: text  -- 'R' | 'L' | 'ימין' | 'שמאל'
  wall_thickness: text
  created_at: timestamptz
  updated_at: timestamptz
)

-- Wizard drafts
project_wizard_drafts (
  id: uuid PK
  created_by: uuid FK -> auth.users
  name: text
  bank_items: jsonb  -- Array of BankItem
  floors: jsonb      -- Array of WizardFloor
  created_at: timestamptz
  updated_at: timestamptz
)
```

### Views

```sql
v_project_totals    -- Aggregated counts per project
v_floor_totals      -- Aggregated counts per floor
v_apartment_totals  -- Aggregated counts per apartment
v_item_status       -- Computed status per item
```

---

## Page-by-Page Documentation

### 1. `/projects` - Projects.tsx

**Purpose:** Main project listing and management interface.

**Features:**
- Project search by name/building code
- Folder organization (multi-select filtering)
- Tabs: "Active Projects" vs "Measurement Projects"
- Project cards with summary stats
- Actions: Edit name, Move to folder, Delete (with code confirmation)

**Key State:**
```typescript
const [searchQuery, setSearchQuery] = useState("");
const [activeTab, setActiveTab] = useState<"active" | "measurement">("active");
const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
```

**Data Fetching:**
- `projects` - All projects for user
- `projectTotals` - v_project_totals view
- `folders` - project_folders table

**Mutations:**
- `deleteProjectMutation` - Complex cascade delete
- `updateProjectMutation` - Update project name
- `moveProjectMutation` - Change folder_id

**Delete Cascade Order:**
1. label_job_items → label_jobs
2. load_issues, scan_events
3. scans, labels
4. items → apartments → floors
5. Storage cleanup
6. Project record

---

### 2. `/projects/:id` - ProjectDetail.tsx

**Purpose:** Comprehensive project dashboard with multiple views.

**File Size:** ~1600 lines (needs refactoring)

**Tabs:**
| Tab | Content |
|-----|---------|
| Dashboard | Charts, metrics, activity feed |
| Floors | Floor-by-floor breakdown |
| Apartments | Apartment list with items |
| Items | Full item table with pagination |
| Excel Sheets | Source file viewer |
| Production | Production PDF viewer |

**For Measurement Projects:**
- Shows MeasurementFileViewer
- "Finalize Measurement" button
- Links to MeasurementEditor

**Realtime Subscriptions:**
- `items` table changes
- `scans` table changes
- Debounced refetch (800ms)

**Key Functions:**
- `fetchProjectData()` - Loads all project data
- `downloadFullActivityLog()` - CSV export
- `downloadLoadReport()` / `downloadInstallReport()`
- `handleFinalizeMeasurement()` - Converts measurement → active

---

### 3. `/projects/:id/measurement` - MeasurementEditor.tsx

**Purpose:** Mobile-first editor for measurement data in the field.

**Features:**
- Offline sync support via `useOfflineSync` hook
- Floor/Apartment filters
- Card-based row display (not table)
- Real-time connection status badge
- Add/delete rows (online only)

**Row Fields Displayed:**
- מיקום (location)
- פתח (opening_no)
- פרט (item_code)
- גובה (height)
- רוחב (width)
- הערות (notes)
- גליף (glyph)
- גובה יואים (jamb_height)
- מנוע (engine_side)
- זווית עליונה/תחתונה (angles in notes)

**Angle Storage Pattern:**
Angles are stored in the `notes` field:
```
זווית1:55 מברשת;זווית2:95 מברשת;user visible notes
```

Helper functions:
- `getUserNotes(notes)` - Strips angle patterns
- `mergeUserNotes(newNotes, existingNotes)` - Preserves angles

---

### 4. `/import` - Import.tsx

**Purpose:** Hub for all import methods.

**Three Import Paths:**
1. **Wizard** (Link to `/wizard`)
2. **Regular Excel** (Inline upload)
3. **Measurement Import** (Link to `/import/measurement`)

**Regular Import Flow:**
1. User uploads `.xlsx` or `.xls` file
2. `parseExcelFile()` from `lib/excelParser.ts`
3. Display `ImportResults` component
4. User confirms → `handleImportToDatabase()`

**Import to DB Process:**
1. Create project record
2. Upload Excel to `measurement-excels` bucket
3. Loop through apartments:
   - Create/find floor
   - Create/find apartment
   - Insert items with required_codes
   - Create labels for each subpart
4. Navigate to new project

**File Validation:**
- Type: `.xlsx`, `.xls`
- Size: Max 20MB

---

### 5. `/import/measurement` - ImportMeasurement.tsx

**Purpose:** Import Excel specifically for measurement-mode projects.

**Key Differences from Regular Import:**
- Creates project with `status: 'measurement'`
- Data goes to `measurement_rows` table (not items)
- No labels created
- Uses `parseMeasurementExcel()` parser

**Parser Output:**
```typescript
interface MeasurementRow {
  floor_label: string | null;
  apartment_label: string | null;
  sheet_name: string | null;
  location_in_apartment: string | null;
  opening_no: string | null;
  item_code: string | null;
  height: string | null;
  width: string | null;
  notes: string | null;
  field_notes: string | null;
  wall_thickness: string | null;
  glyph: string | null;
  jamb_height: string | null;
  engine_side: string | null;
}
```

---

### 6. `/wizard` - ProjectWizard.tsx

**Purpose:** Multi-step guided project creation without Excel.

**Steps:**
| Step | Component | Purpose |
|------|-----------|---------|
| 0 | WizardStepName | Enter project name |
| 1 | WizardStepBank | Define item catalog |
| 2 | WizardStepFloors | Create building structure |
| 3 | WizardStepApartments | Fill apartment tables |
| 4 | WizardStepReview | Review & create |

**State Management:** `WizardContext.tsx`

**Persistent Drafts:**
- Stored in `project_wizard_drafts` table
- Auto-saved every 2 seconds
- Draft ID in URL: `/wizard?draft=xxx`

---

## Component Dependencies

### Wizard Components

```
src/components/wizard/
├── WizardContext.tsx      # State management
├── WizardShell.tsx        # Progress header + layout
├── WizardStepName.tsx     # Step 0
├── WizardStepBank.tsx     # Step 1
├── WizardStepFloors.tsx   # Step 2
├── WizardStepApartments.tsx # Step 3
└── WizardStepReview.tsx   # Step 4

src/lib/
└── wizardTypes.ts         # Type definitions
```

### Import/Parser Components

```
src/lib/
├── excelParser.ts         # Regular project parser
└── measurementParser.ts   # Measurement parser

src/components/
├── ImportResults.tsx      # Display parsed results
├── ExcelViewer.tsx        # View uploaded Excel
└── MeasurementDataViewer.tsx  # View measurement data
```

### Project Components

```
src/components/project/
├── ProductionFilePdfViewer.tsx
└── MeasurementFileViewer.tsx

src/components/projects/
└── ProjectFolders.tsx     # Folder management
```

---

## Data Flow

### Regular Import Flow

```
User uploads Excel
       │
       ▼
parseExcelFile() in excelParser.ts
       │
       ▼
Returns: { apartments: ParsedApartment[], errors, warnings }
       │
       ▼
Display in ImportResults component
       │
       ▼
User clicks "Import to Database"
       │
       ▼
handleImportToDatabase():
  1. INSERT into projects
  2. UPLOAD file to storage
  3. UPSERT floors
  4. UPSERT apartments
  5. INSERT items
  6. INSERT labels (5 per item)
       │
       ▼
Navigate to /projects/:id
```

### Wizard Creation Flow

```
User enters data across 5 steps
       │
       ▼
WizardContext auto-saves to project_wizard_drafts
       │
       ▼
User clicks "Create Project" on Step 4
       │
       ▼
handleCreate() in WizardStepReview:
  │
  ├── If projectMode === 'measurement':
  │     INSERT into measurement_rows
  │
  └── If projectMode === 'regular':
        1. INSERT into projects
        2. INSERT into floors
        3. INSERT into apartments
        4. INSERT into items
        5. INSERT into labels
       │
       ▼
DELETE draft from project_wizard_drafts
       │
       ▼
Navigate to /projects/:id
```

### Measurement Finalization Flow

```
User clicks "Finalize Measurement" on ProjectDetail
       │
       ▼
handleFinalizeMeasurement():
       │
       ▼
Supabase function: measurement-finalize
  1. Group measurement_rows by floor_label, apartment_label
  2. Create floors records
  3. Create apartments records
  4. Create items records (with motor_side normalization)
  5. Create labels records
  6. Update project status → 'active'
       │
       ▼
Refresh page, now shows full project UI
```

---

## State Management

### WizardContext State

```typescript
interface WizardState {
  draftId: string | null;
  name: string;
  bankItems: BankItem[];
  floors: WizardFloor[];
  currentStep: number;
  isSaving: boolean;
  lastSaved: Date | null;
}

interface BankItem {
  id: string;
  item_no: string;    // Unique within project
  height: string;     // Allows non-integer like "253+"
  width: string;
}

interface WizardFloor {
  id: string;
  label: string;                // "קומה 1" or custom
  apartments: WizardApartment[];
  isTypical: boolean;           // For cloning reference
}

interface WizardApartment {
  id: string;
  label: string;                // "דירה 1"
  rows: WizardApartmentRow[];
}

interface WizardApartmentRow {
  id: string;
  opening_no: number;           // 1-10, auto-incremented
  location_in_apartment: string | null;
  item_code: string | null;     // References bank item_no
  height: string | null;
  height_overridden: boolean;   // Track manual override
  width: string | null;
  width_overridden: boolean;
  notes: string | null;
  glyph: string | null;
  jamb_height: string | null;
  engine_side: string | null;   // ימין/שמאל/null
  angle1: string | null;
  angle2: string | null;
}
```

### Reducer Actions

```typescript
type WizardAction =
  | { type: 'SET_DRAFT'; payload: {...} }
  | { type: 'SET_NAME'; payload: string }
  | { type: 'SET_STEP'; payload: number }
  | { type: 'SET_BANK_ITEMS'; payload: BankItem[] }
  | { type: 'ADD_BANK_ITEM'; payload: BankItem }
  | { type: 'UPDATE_BANK_ITEM'; payload: {...} }
  | { type: 'DELETE_BANK_ITEM'; payload: string }
  | { type: 'SET_FLOORS'; payload: WizardFloor[] }
  | { type: 'ADD_FLOOR'; payload: WizardFloor }
  | { type: 'UPDATE_FLOOR'; payload: {...} }
  | { type: 'DELETE_FLOOR'; payload: string }
  | { type: 'ADD_APARTMENT'; payload: {...} }
  | { type: 'DELETE_APARTMENT'; payload: {...} }
  | { type: 'UPDATE_APARTMENT_ROW'; payload: {...} }
  | { type: 'ADD_APARTMENT_ROW'; payload: {...} }
  | { type: 'DELETE_APARTMENT_ROW'; payload: {...} }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_LAST_SAVED'; payload: Date }
  | { type: 'CLONE_FLOORS'; payload: {...} }
  | { type: 'RESET' };
```

---

## Known Issues & Technical Debt

### 1. ProjectDetail.tsx is Too Large
- **Problem:** ~1600 lines, hard to maintain
- **Impact:** Slow IDE, difficult testing
- **Recommendation:** Extract into sub-components

### 2. Duplicate Parser Logic
- **Problem:** `excelParser.ts` and `measurementParser.ts` have overlapping code
- **Impact:** Bug fixes need to be applied twice
- **Recommendation:** Create shared utility functions

### 3. Inconsistent Motor Side Storage
- **Problem:** Different formats: `'R'`, `'L'`, `'ימין'`, `'שמאל'`
- **Impact:** Requires normalization everywhere
- **Recommendation:** Standardize on database constraint

### 4. Angle Data in Notes Field
- **Problem:** Angle data stored as encoded string in notes
- **Impact:** Complex parsing, error-prone
- **Recommendation:** Migrate to dedicated columns

### 5. No Draft Cleanup
- **Problem:** Abandoned drafts never deleted
- **Impact:** Database clutter
- **Recommendation:** Add cron job or user-triggered cleanup

### 6. Hardcoded Subpart Codes
- **Problem:** `['01', '02', '03', '04', '05']` hardcoded
- **Impact:** Can't customize per item type
- **Recommendation:** Move to configuration

### 7. Missing Loading States
- **Problem:** Some operations lack proper loading indicators
- **Impact:** User confusion during slow operations
- **Recommendation:** Add consistent loading patterns

### 8. Error Handling Inconsistency
- **Problem:** Mix of toast errors and inline errors
- **Impact:** Inconsistent UX
- **Recommendation:** Standardize error display

---

## Refactoring Recommendations

### High Priority

1. **Split ProjectDetail.tsx**
   - Extract `ProjectDashboard.tsx`
   - Extract `ProjectFloorsTab.tsx`
   - Extract `ProjectApartmentsTab.tsx`
   - Extract `ProjectItemsTab.tsx`
   - Extract `ProjectDownloads.tsx`

2. **Unify Parsers**
   - Create `lib/excel/baseParser.ts`
   - Create `lib/excel/projectParser.ts`
   - Create `lib/excel/measurementParser.ts`

3. **Standardize Motor Side**
   ```sql
   ALTER TABLE items ADD CONSTRAINT check_motor_side 
   CHECK (motor_side IN ('R', 'L', NULL));
   
   ALTER TABLE measurement_rows ADD CONSTRAINT check_engine_side 
   CHECK (engine_side IN ('R', 'L', NULL));
   ```

### Medium Priority

4. **Add Dedicated Angle Columns**
   ```sql
   ALTER TABLE measurement_rows ADD COLUMN angle_top text;
   ALTER TABLE measurement_rows ADD COLUMN angle_bottom text;
   ALTER TABLE items ADD COLUMN angle_top text;
   ALTER TABLE items ADD COLUMN angle_bottom text;
   -- Migration script to parse existing notes
   ```

5. **Create Project Creation Service**
   ```typescript
   // lib/services/projectCreationService.ts
   export async function createRegularProject(data: ProjectData): Promise<number>
   export async function createMeasurementProject(data: MeasurementData): Promise<number>
   export async function finalizeProject(projectId: number): Promise<void>
   ```

6. **Add React Query Hooks**
   ```typescript
   // hooks/useProjectMutations.ts
   export function useCreateProject()
   export function useDeleteProject()
   export function useUpdateProject()
   export function useMoveProject()
   ```

### Low Priority

7. **Add Wizard Step Validation Schema**
   ```typescript
   // lib/wizardValidation.ts
   export const bankItemSchema = z.object({...})
   export const floorSchema = z.object({...})
   export const apartmentSchema = z.object({...})
   ```

8. **Create Shared Type File**
   ```typescript
   // types/project.ts
   export interface Project {...}
   export interface Floor {...}
   export interface Apartment {...}
   export interface Item {...}
   ```

---

## File Reference

### Main Pages
- `src/pages/Projects.tsx` (559 lines)
- `src/pages/ProjectDetail.tsx` (1613 lines) ⚠️
- `src/pages/Import.tsx` (457 lines)
- `src/pages/ImportMeasurement.tsx` (355 lines)
- `src/pages/MeasurementEditor.tsx` (533 lines)
- `src/pages/ProjectWizard.tsx` (107 lines)
- `src/pages/ProjectItemsSummary.tsx` (~825 lines)

### Wizard Components
- `src/components/wizard/WizardContext.tsx` (441 lines)
- `src/components/wizard/WizardShell.tsx` (89 lines)
- `src/components/wizard/WizardStepName.tsx` (54 lines)
- `src/components/wizard/WizardStepBank.tsx` (294 lines)
- `src/components/wizard/WizardStepFloors.tsx` (352 lines)
- `src/components/wizard/WizardStepApartments.tsx` (495 lines)
- `src/components/wizard/WizardStepReview.tsx` (407 lines)

### Parsers
- `src/lib/excelParser.ts` (~426 lines)
- `src/lib/measurementParser.ts` (~284 lines)
- `src/lib/wizardTypes.ts` (142 lines)

### Support Components
- `src/components/ImportResults.tsx` (~208 lines)
- `src/components/ExcelViewer.tsx` (~254 lines)
- `src/components/MeasurementDataViewer.tsx` (~802 lines) ⚠️
- `src/components/project/ProductionFilePdfViewer.tsx` (~364 lines)
- `src/components/project/MeasurementFileViewer.tsx` (~494 lines)
- `src/components/projects/ProjectFolders.tsx` (~320 lines)

### Hooks
- `src/hooks/useProjectData.ts` (~236 lines)
- `src/hooks/useOfflineSync.ts`
- `src/hooks/useRBAC.ts`

---

## Related Documentation

- `EXCEL_FORMAT_GUIDE.md` - Excel import format specification
- `CUTLIST_HANDOVER.md` - Cutlist system documentation
- `TESTING_GUIDE.md` - Testing procedures

---

*Last Updated: January 2026*
