// Types for parsed cutlist data (from edge function)

export interface ProfileRow {
  ident: string;
  qty: number;
  orientation: string;
  cut_length: string;
  role: string;
  profile_code: string;
}

export interface MiscRow {
  qty: number;
  unit: string;
  description: string;
  sku_code: string;
}

export interface GlassRow {
  code: string;
  size_text: string;
  qty: number;
  description: string;
  sku_name: string;
}

export interface ParsedPage {
  page_number: number;
  item_ref: string;
  title: string | null;
  dimensions_meta: string | null;
  quantity_total: number | null;
  technical_text: string | null;
  notes: string | null;
  raw_page_text: string;
  profile_rows: ProfileRow[];
  misc_rows: MiscRow[];
  glass_rows: GlassRow[];
}

export interface ParsedCutlistV2 {
  project_name: string | null;
  pages: ParsedPage[];
}

// Types for database records

export interface CutlistUpload {
  id: string;
  filename: string;
  project_name: string | null;
  pdf_path: string | null;
  status: string;
  created_at: string;
  uploaded_by: string | null;
}

export interface CutlistSection {
  id: string;
  upload_id: string;
  section_ref: string;
  section_name: string | null;
  notes: string | null;
  page_number: number | null;
  title: string | null;
  dimensions_meta: string | null;
  quantity_total: number | null;
  technical_text: string | null;
  raw_page_text: string | null;
  ord: number;
  created_at: string;
  // New status fields
  status: "open" | "done" | "issue" | "packed";
  issue_text: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
  parse_error: string | null;
  packed_at: string | null;
  packed_by: string | null;
}

export type RowStatus = "open" | "done" | "issue";

export interface CutlistProfileRow {
  id: string;
  section_id: string;
  ident: string | null;
  qty: number;
  orientation: string | null;
  cut_length: string | null;
  role: string | null;
  profile_code: string;
  ord: number;
  is_checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
  created_at: string;
  status: RowStatus;
  issue_text: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
}

export interface CutlistMiscRow {
  id: string;
  section_id: string;
  qty: number;
  unit: string | null;
  description: string;
  sku_code: string | null;
  ord: number;
  is_checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
  created_at: string;
  status: RowStatus;
  issue_text: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
}

export interface CutlistGlassRow {
  id: string;
  section_id: string;
  code: string | null;
  size_text: string | null;
  qty: number;
  description: string | null;
  sku_name: string | null;
  ord: number;
  is_checked: boolean;
  checked_at: string | null;
  checked_by: string | null;
  created_at: string;
  status: RowStatus;
  issue_text: string | null;
  finalized_at: string | null;
  finalized_by: string | null;
}

// Combined section with all row types for UI
export interface CutlistSectionWithRows extends CutlistSection {
  profile_rows: CutlistProfileRow[];
  misc_rows: CutlistMiscRow[];
  glass_rows: CutlistGlassRow[];
}
