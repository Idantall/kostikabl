export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      allowed_emails: {
        Row: {
          email: string
        }
        Insert: {
          email: string
        }
        Update: {
          email?: string
        }
        Relationships: []
      }
      apartments: {
        Row: {
          apt_number: string
          created_at: string
          floor_id: number
          id: number
          project_id: number
        }
        Insert: {
          apt_number: string
          created_at?: string
          floor_id: number
          id?: number
          project_id: number
        }
        Update: {
          apt_number?: string
          created_at?: string
          floor_id?: number
          id?: number
          project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "apartments_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apartments_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "v_floor_totals"
            referencedColumns: ["floor_id"]
          },
          {
            foreignKeyName: "apartments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apartments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "apartments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
        ]
      }
      apt_labels: {
        Row: {
          apt_id: number
          created_at: string
          expires_at: string | null
          id: number
          project_id: number
          qr_token_hash: string
          revoked_at: string | null
        }
        Insert: {
          apt_id: number
          created_at?: string
          expires_at?: string | null
          id?: never
          project_id: number
          qr_token_hash: string
          revoked_at?: string | null
        }
        Update: {
          apt_id?: number
          created_at?: string
          expires_at?: string | null
          id?: never
          project_id?: number
          qr_token_hash?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apt_labels_apt_id_fkey"
            columns: ["apt_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apt_labels_apt_id_fkey"
            columns: ["apt_id"]
            isOneToOne: false
            referencedRelation: "v_apartment_totals"
            referencedColumns: ["apartment_id"]
          },
          {
            foreignKeyName: "apt_labels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apt_labels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "apt_labels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
        ]
      }
      cutlist_glass_rows: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          code: string | null
          created_at: string
          description: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          is_checked: boolean
          issue_text: string | null
          ord: number
          qty: number
          section_id: string
          size_text: string | null
          sku_name: string | null
          status: string
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          is_checked?: boolean
          issue_text?: string | null
          ord?: number
          qty?: number
          section_id: string
          size_text?: string | null
          sku_name?: string | null
          status?: string
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          code?: string | null
          created_at?: string
          description?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          is_checked?: boolean
          issue_text?: string | null
          ord?: number
          qty?: number
          section_id?: string
          size_text?: string | null
          sku_name?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cutlist_glass_rows_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "cutlist_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      cutlist_items: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          created_at: string
          description: string | null
          dimensions: string | null
          id: string
          is_checked: boolean
          ord: number
          profile_code: string
          required_qty: number
          section_id: string
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          description?: string | null
          dimensions?: string | null
          id?: string
          is_checked?: boolean
          ord?: number
          profile_code: string
          required_qty?: number
          section_id: string
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          description?: string | null
          dimensions?: string | null
          id?: string
          is_checked?: boolean
          ord?: number
          profile_code?: string
          required_qty?: number
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cutlist_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "cutlist_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      cutlist_misc_rows: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          created_at: string
          description: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          is_checked: boolean
          issue_text: string | null
          ord: number
          qty: number
          section_id: string
          sku_code: string | null
          status: string
          unit: string | null
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          description: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          is_checked?: boolean
          issue_text?: string | null
          ord?: number
          qty?: number
          section_id: string
          sku_code?: string | null
          status?: string
          unit?: string | null
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          description?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          is_checked?: boolean
          issue_text?: string | null
          ord?: number
          qty?: number
          section_id?: string
          sku_code?: string | null
          status?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cutlist_misc_rows_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "cutlist_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      cutlist_profile_rows: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          created_at: string
          cut_length: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          ident: string | null
          is_checked: boolean
          issue_text: string | null
          ord: number
          orientation: string | null
          profile_code: string
          qty: number
          role: string | null
          section_id: string
          status: string
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          cut_length?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          ident?: string | null
          is_checked?: boolean
          issue_text?: string | null
          ord?: number
          orientation?: string | null
          profile_code: string
          qty?: number
          role?: string | null
          section_id: string
          status?: string
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          cut_length?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          ident?: string | null
          is_checked?: boolean
          issue_text?: string | null
          ord?: number
          orientation?: string | null
          profile_code?: string
          qty?: number
          role?: string | null
          section_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cutlist_profile_rows_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "cutlist_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      cutlist_sections: {
        Row: {
          created_at: string
          dimensions_meta: string | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          issue_text: string | null
          notes: string | null
          ord: number
          packed_at: string | null
          packed_by: string | null
          page_number: number | null
          parse_error: string | null
          quantity_total: number | null
          raw_page_text: string | null
          section_name: string | null
          section_ref: string
          status: string
          technical_text: string | null
          title: string | null
          upload_id: string
        }
        Insert: {
          created_at?: string
          dimensions_meta?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          issue_text?: string | null
          notes?: string | null
          ord?: number
          packed_at?: string | null
          packed_by?: string | null
          page_number?: number | null
          parse_error?: string | null
          quantity_total?: number | null
          raw_page_text?: string | null
          section_name?: string | null
          section_ref: string
          status?: string
          technical_text?: string | null
          title?: string | null
          upload_id: string
        }
        Update: {
          created_at?: string
          dimensions_meta?: string | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          issue_text?: string | null
          notes?: string | null
          ord?: number
          packed_at?: string | null
          packed_by?: string | null
          page_number?: number | null
          parse_error?: string | null
          quantity_total?: number | null
          raw_page_text?: string | null
          section_name?: string | null
          section_ref?: string
          status?: string
          technical_text?: string | null
          title?: string | null
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cutlist_sections_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "cutlist_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      cutlist_uploads: {
        Row: {
          created_at: string
          filename: string
          id: string
          pdf_path: string | null
          project_name: string | null
          status: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          filename: string
          id?: string
          pdf_path?: string | null
          project_name?: string | null
          status?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          filename?: string
          id?: string
          pdf_path?: string | null
          project_name?: string | null
          status?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      father_project_buildings: {
        Row: {
          building_number: string
          building_project_id: number
          created_at: string
          father_project_id: string
        }
        Insert: {
          building_number: string
          building_project_id: number
          created_at?: string
          father_project_id: string
        }
        Update: {
          building_number?: string
          building_project_id?: number
          created_at?: string
          father_project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "father_project_buildings_building_project_id_fkey"
            columns: ["building_project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "father_project_buildings_building_project_id_fkey"
            columns: ["building_project_id"]
            isOneToOne: true
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "father_project_buildings_building_project_id_fkey"
            columns: ["building_project_id"]
            isOneToOne: true
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "father_project_buildings_father_project_id_fkey"
            columns: ["father_project_id"]
            isOneToOne: false
            referencedRelation: "father_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      father_projects: {
        Row: {
          contractor: string | null
          created_at: string
          created_by: string | null
          id: string
          metadata: Json | null
          name: string
        }
        Insert: {
          contractor?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json | null
          name: string
        }
        Update: {
          contractor?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          metadata?: Json | null
          name?: string
        }
        Relationships: []
      }
      floors: {
        Row: {
          created_at: string
          floor_code: string
          id: number
          project_id: number
        }
        Insert: {
          created_at?: string
          floor_code: string
          id?: number
          project_id: number
        }
        Update: {
          created_at?: string
          floor_code?: string
          id?: number
          project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "floors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "floors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
        ]
      }
      items: {
        Row: {
          apt_id: number | null
          contract_item: string | null
          created_at: string
          depth: string | null
          field_notes: string | null
          floor_id: number | null
          height: string | null
          hinge_direction: string | null
          id: number
          install_status_cached:
            | Database["public"]["Enums"]["install_status"]
            | null
          is_manual: boolean
          item_code: string
          item_type: string | null
          loading_status_cached:
            | Database["public"]["Enums"]["loading_status"]
            | null
          location: string | null
          mamad: string | null
          motor_side: string | null
          notes: string | null
          opening_no: string | null
          project_id: number
          purchasing_status: string | null
          required_codes: string[]
          side_rl: string | null
          status_cached: string
          width: string | null
        }
        Insert: {
          apt_id?: number | null
          contract_item?: string | null
          created_at?: string
          depth?: string | null
          field_notes?: string | null
          floor_id?: number | null
          height?: string | null
          hinge_direction?: string | null
          id?: number
          install_status_cached?:
            | Database["public"]["Enums"]["install_status"]
            | null
          is_manual?: boolean
          item_code: string
          item_type?: string | null
          loading_status_cached?:
            | Database["public"]["Enums"]["loading_status"]
            | null
          location?: string | null
          mamad?: string | null
          motor_side?: string | null
          notes?: string | null
          opening_no?: string | null
          project_id: number
          purchasing_status?: string | null
          required_codes?: string[]
          side_rl?: string | null
          status_cached?: string
          width?: string | null
        }
        Update: {
          apt_id?: number | null
          contract_item?: string | null
          created_at?: string
          depth?: string | null
          field_notes?: string | null
          floor_id?: number | null
          height?: string | null
          hinge_direction?: string | null
          id?: number
          install_status_cached?:
            | Database["public"]["Enums"]["install_status"]
            | null
          is_manual?: boolean
          item_code?: string
          item_type?: string | null
          loading_status_cached?:
            | Database["public"]["Enums"]["loading_status"]
            | null
          location?: string | null
          mamad?: string | null
          motor_side?: string | null
          notes?: string | null
          opening_no?: string | null
          project_id?: number
          purchasing_status?: string | null
          required_codes?: string[]
          side_rl?: string | null
          status_cached?: string
          width?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_apt_id_fkey"
            columns: ["apt_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_apt_id_fkey"
            columns: ["apt_id"]
            isOneToOne: false
            referencedRelation: "v_apartment_totals"
            referencedColumns: ["apartment_id"]
          },
          {
            foreignKeyName: "items_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "v_floor_totals"
            referencedColumns: ["floor_id"]
          },
          {
            foreignKeyName: "items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
        ]
      }
      label_job_items: {
        Row: {
          id: number
          item_id: number
          job_id: number | null
          ord: number
          rendered: boolean
          scan_url: string
          subpart_code: string
          token_plain: string
        }
        Insert: {
          id?: never
          item_id: number
          job_id?: number | null
          ord: number
          rendered?: boolean
          scan_url: string
          subpart_code: string
          token_plain: string
        }
        Update: {
          id?: never
          item_id?: number
          job_id?: number | null
          ord?: number
          rendered?: boolean
          scan_url?: string
          subpart_code?: string
          token_plain?: string
        }
        Relationships: [
          {
            foreignKeyName: "label_job_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "label_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      label_jobs: {
        Row: {
          created_at: string | null
          done: number
          error: string | null
          format: string | null
          id: number
          layout: string | null
          pdf_path: string | null
          project_id: number
          status: string
          total: number
        }
        Insert: {
          created_at?: string | null
          done?: number
          error?: string | null
          format?: string | null
          id?: never
          layout?: string | null
          pdf_path?: string | null
          project_id: number
          status?: string
          total: number
        }
        Update: {
          created_at?: string | null
          done?: number
          error?: string | null
          format?: string | null
          id?: never
          layout?: string | null
          pdf_path?: string | null
          project_id?: number
          status?: string
          total?: number
        }
        Relationships: []
      }
      labels: {
        Row: {
          created_at: string
          expires_at: string | null
          id: number
          item_id: number
          qr_token_hash: string
          revoked_at: string | null
          subpart_code: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: number
          item_id: number
          qr_token_hash: string
          revoked_at?: string | null
          subpart_code: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: number
          item_id?: number
          qr_token_hash?: string
          revoked_at?: string | null
          subpart_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "labels_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labels_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_status"
            referencedColumns: ["id"]
          },
        ]
      }
      load_issues: {
        Row: {
          created_at: string
          created_by_ip_hash: string | null
          free_text: string | null
          id: number
          issue_codes: string[]
          item_id: number
          project_id: number
          scan_id: number
          source: string
        }
        Insert: {
          created_at?: string
          created_by_ip_hash?: string | null
          free_text?: string | null
          id?: number
          issue_codes?: string[]
          item_id: number
          project_id: number
          scan_id: number
          source: string
        }
        Update: {
          created_at?: string
          created_by_ip_hash?: string | null
          free_text?: string | null
          id?: number
          issue_codes?: string[]
          item_id?: number
          project_id?: number
          scan_id?: number
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "load_issues_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_issues_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "load_issues_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "load_issues_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_floor_exports: {
        Row: {
          exported_at: string
          exported_by: string | null
          floor_label: string
          id: string
          measurement_project_id: number
          running_project_id: number
        }
        Insert: {
          exported_at?: string
          exported_by?: string | null
          floor_label: string
          id?: string
          measurement_project_id: number
          running_project_id: number
        }
        Update: {
          exported_at?: string
          exported_by?: string | null
          floor_label?: string
          id?: string
          measurement_project_id?: number
          running_project_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "measurement_floor_exports_measurement_project_id_fkey"
            columns: ["measurement_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_floor_exports_measurement_project_id_fkey"
            columns: ["measurement_project_id"]
            isOneToOne: false
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "measurement_floor_exports_measurement_project_id_fkey"
            columns: ["measurement_project_id"]
            isOneToOne: false
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "measurement_floor_exports_running_project_id_fkey"
            columns: ["running_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_floor_exports_running_project_id_fkey"
            columns: ["running_project_id"]
            isOneToOne: false
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "measurement_floor_exports_running_project_id_fkey"
            columns: ["running_project_id"]
            isOneToOne: false
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
        ]
      }
      measurement_rows: {
        Row: {
          apartment_label: string | null
          contract_item: string | null
          created_at: string
          depth: string | null
          engine_side: string | null
          field_notes: string | null
          floor_label: string | null
          glyph: string | null
          height: string | null
          hinge_direction: string | null
          id: string
          internal_wing: string | null
          is_manual: boolean
          item_code: string | null
          jamb_height: string | null
          location_in_apartment: string | null
          mamad: string | null
          notes: string | null
          opening_no: string | null
          project_id: number
          sheet_name: string | null
          updated_at: string
          wall_thickness: string | null
          width: string | null
          wing_position: string | null
          wing_position_out: string | null
        }
        Insert: {
          apartment_label?: string | null
          contract_item?: string | null
          created_at?: string
          depth?: string | null
          engine_side?: string | null
          field_notes?: string | null
          floor_label?: string | null
          glyph?: string | null
          height?: string | null
          hinge_direction?: string | null
          id?: string
          internal_wing?: string | null
          is_manual?: boolean
          item_code?: string | null
          jamb_height?: string | null
          location_in_apartment?: string | null
          mamad?: string | null
          notes?: string | null
          opening_no?: string | null
          project_id: number
          sheet_name?: string | null
          updated_at?: string
          wall_thickness?: string | null
          width?: string | null
          wing_position?: string | null
          wing_position_out?: string | null
        }
        Update: {
          apartment_label?: string | null
          contract_item?: string | null
          created_at?: string
          depth?: string | null
          engine_side?: string | null
          field_notes?: string | null
          floor_label?: string | null
          glyph?: string | null
          height?: string | null
          hinge_direction?: string | null
          id?: string
          internal_wing?: string | null
          is_manual?: boolean
          item_code?: string | null
          jamb_height?: string | null
          location_in_apartment?: string | null
          mamad?: string | null
          notes?: string | null
          opening_no?: string | null
          project_id?: number
          sheet_name?: string | null
          updated_at?: string
          wall_thickness?: string | null
          width?: string | null
          wing_position?: string | null
          wing_position_out?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "measurement_rows_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_rows_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "measurement_rows_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
        ]
      }
      optimization_jobs: {
        Row: {
          bar_length_mm: number | null
          created_at: string
          id: string
          parse_warnings: string[] | null
          project_id: number
          source_file_name: string
          source_file_path: string
          status: string
          updated_at: string
        }
        Insert: {
          bar_length_mm?: number | null
          created_at?: string
          id?: string
          parse_warnings?: string[] | null
          project_id: number
          source_file_name: string
          source_file_path: string
          status?: string
          updated_at?: string
        }
        Update: {
          bar_length_mm?: number | null
          created_at?: string
          id?: string
          parse_warnings?: string[] | null
          project_id?: number
          source_file_name?: string
          source_file_path?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "optimization_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "optimization_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "optimization_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
        ]
      }
      optimization_pattern_progress: {
        Row: {
          done: boolean
          done_at: string | null
          id: string
          pattern_id: string
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          done?: boolean
          done_at?: string | null
          id?: string
          pattern_id: string
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          done?: boolean
          done_at?: string | null
          id?: string
          pattern_id?: string
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "optimization_pattern_progress_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "optimization_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      optimization_patterns: {
        Row: {
          created_at: string
          id: string
          job_id: string
          pattern_index: number
          profile_code: string
          raw_text: string | null
          remainder_mm: number | null
          rod_count: number
          segments_json: Json | null
          segments_mm: number[]
          used_mm: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          pattern_index: number
          profile_code: string
          raw_text?: string | null
          remainder_mm?: number | null
          rod_count: number
          segments_json?: Json | null
          segments_mm: number[]
          used_mm?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          pattern_index?: number
          profile_code?: string
          raw_text?: string | null
          remainder_mm?: number | null
          rod_count?: number
          segments_json?: Json | null
          segments_mm?: number[]
          used_mm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "optimization_patterns_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "optimization_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      optimization_pdf_annotations: {
        Row: {
          annotation_data: Json
          annotation_type: string
          created_at: string
          created_by: string | null
          id: string
          page: number
          pdf_id: string
          profile_code: string | null
          updated_at: string
        }
        Insert: {
          annotation_data?: Json
          annotation_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          page?: number
          pdf_id: string
          profile_code?: string | null
          updated_at?: string
        }
        Update: {
          annotation_data?: Json
          annotation_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          page?: number
          pdf_id?: string
          profile_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "optimization_pdf_annotations_pdf_id_fkey"
            columns: ["pdf_id"]
            isOneToOne: false
            referencedRelation: "optimization_pdf_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      optimization_pdf_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          page: number
          pdf_id: string
          status: string
          updated_at: string
          worker_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          page: number
          pdf_id: string
          status?: string
          updated_at?: string
          worker_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          page?: number
          pdf_id?: string
          status?: string
          updated_at?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "optimization_pdf_progress_pdf_id_fkey"
            columns: ["pdf_id"]
            isOneToOne: false
            referencedRelation: "optimization_pdf_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      optimization_pdf_uploads: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string
          file_path: string
          id: string
          page_count: number | null
          project_id: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name: string
          file_path: string
          id?: string
          page_count?: number | null
          project_id: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string
          file_path?: string
          id?: string
          page_count?: number | null
          project_id?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "optimization_pdf_uploads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "optimization_pdf_uploads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "optimization_pdf_uploads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
        ]
      }
      project_folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_wizard_drafts: {
        Row: {
          bank_items: Json
          contract_parse_result: Json | null
          contract_pdf_path: string | null
          created_at: string
          created_by: string
          floors: Json
          id: string
          name: string | null
          project_type: string | null
          updated_at: string
        }
        Insert: {
          bank_items?: Json
          contract_parse_result?: Json | null
          contract_pdf_path?: string | null
          created_at?: string
          created_by: string
          floors?: Json
          id?: string
          name?: string | null
          project_type?: string | null
          updated_at?: string
        }
        Update: {
          bank_items?: Json
          contract_parse_result?: Json | null
          contract_pdf_path?: string | null
          created_at?: string
          created_by?: string
          floors?: Json
          id?: string
          name?: string | null
          project_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          building_code: string | null
          contract_parse_method: string | null
          contract_parse_result: Json | null
          contract_parse_warnings: Json | null
          contract_parsed_at: string | null
          contract_pdf_path: string | null
          contract_totals: Json | null
          contract_uploaded_at: string | null
          converted_to_measurement_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          folder_id: string | null
          id: number
          is_archived: boolean
          measurement_rule: string | null
          name: string
          parent_project_id: number | null
          production_batch_label: string | null
          production_file_path: string | null
          source_file_path: string | null
          source_measurement_project_id: number | null
          status: string
        }
        Insert: {
          building_code?: string | null
          contract_parse_method?: string | null
          contract_parse_result?: Json | null
          contract_parse_warnings?: Json | null
          contract_parsed_at?: string | null
          contract_pdf_path?: string | null
          contract_totals?: Json | null
          contract_uploaded_at?: string | null
          converted_to_measurement_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          folder_id?: string | null
          id?: number
          is_archived?: boolean
          measurement_rule?: string | null
          name: string
          parent_project_id?: number | null
          production_batch_label?: string | null
          production_file_path?: string | null
          source_file_path?: string | null
          source_measurement_project_id?: number | null
          status?: string
        }
        Update: {
          building_code?: string | null
          contract_parse_method?: string | null
          contract_parse_result?: Json | null
          contract_parse_warnings?: Json | null
          contract_parsed_at?: string | null
          contract_pdf_path?: string | null
          contract_totals?: Json | null
          contract_uploaded_at?: string | null
          converted_to_measurement_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          folder_id?: string | null
          id?: number
          is_archived?: boolean
          measurement_rule?: string | null
          name?: string
          parent_project_id?: number | null
          production_batch_label?: string | null
          production_file_path?: string | null
          source_file_path?: string | null
          source_measurement_project_id?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "project_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_parent_project_id_fkey"
            columns: ["parent_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_parent_project_id_fkey"
            columns: ["parent_project_id"]
            isOneToOne: false
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "projects_parent_project_id_fkey"
            columns: ["parent_project_id"]
            isOneToOne: false
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "projects_source_measurement_project_id_fkey"
            columns: ["source_measurement_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_source_measurement_project_id_fkey"
            columns: ["source_measurement_project_id"]
            isOneToOne: false
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "projects_source_measurement_project_id_fkey"
            columns: ["source_measurement_project_id"]
            isOneToOne: false
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_access_cutlist: boolean
          can_access_import: boolean
          can_access_labels: boolean
          can_access_measurement: boolean
          can_access_scan_install: boolean
          can_access_scan_loading: boolean
          can_create_projects: boolean
          can_delete_projects: boolean
          can_edit_items: boolean
          can_edit_projects: boolean
          can_finalize_measurement: boolean
          can_manage_users: boolean
          can_upload_files: boolean
          can_view_projects: boolean
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          can_access_cutlist?: boolean
          can_access_import?: boolean
          can_access_labels?: boolean
          can_access_measurement?: boolean
          can_access_scan_install?: boolean
          can_access_scan_loading?: boolean
          can_create_projects?: boolean
          can_delete_projects?: boolean
          can_edit_items?: boolean
          can_edit_projects?: boolean
          can_finalize_measurement?: boolean
          can_manage_users?: boolean
          can_upload_files?: boolean
          can_view_projects?: boolean
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          can_access_cutlist?: boolean
          can_access_import?: boolean
          can_access_labels?: boolean
          can_access_measurement?: boolean
          can_access_scan_install?: boolean
          can_access_scan_loading?: boolean
          can_create_projects?: boolean
          can_delete_projects?: boolean
          can_edit_items?: boolean
          can_edit_projects?: boolean
          can_finalize_measurement?: boolean
          can_manage_users?: boolean
          can_upload_files?: boolean
          can_view_projects?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      scan_events: {
        Row: {
          actor_email: string | null
          created_at: string | null
          id: number
          installed_status: Database["public"]["Enums"]["install_status"] | null
          ip_hash: string | null
          issue_code: Database["public"]["Enums"]["install_issue"] | null
          issue_note: string | null
          item_id: number
          label_id: number | null
          loading_mark: boolean | null
          mode: Database["public"]["Enums"]["scan_mode"]
          project_id: number
          source: string | null
          subpart_code: string
        }
        Insert: {
          actor_email?: string | null
          created_at?: string | null
          id?: number
          installed_status?:
            | Database["public"]["Enums"]["install_status"]
            | null
          ip_hash?: string | null
          issue_code?: Database["public"]["Enums"]["install_issue"] | null
          issue_note?: string | null
          item_id: number
          label_id?: number | null
          loading_mark?: boolean | null
          mode: Database["public"]["Enums"]["scan_mode"]
          project_id: number
          source?: string | null
          subpart_code: string
        }
        Update: {
          actor_email?: string | null
          created_at?: string | null
          id?: number
          installed_status?:
            | Database["public"]["Enums"]["install_status"]
            | null
          ip_hash?: string | null
          issue_code?: Database["public"]["Enums"]["install_issue"] | null
          issue_note?: string | null
          item_id?: number
          label_id?: number | null
          loading_mark?: boolean | null
          mode?: Database["public"]["Enums"]["scan_mode"]
          project_id?: number
          source?: string | null
          subpart_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_events_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_events_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "scan_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
        ]
      }
      scans: {
        Row: {
          id: number
          ip_hash: string | null
          item_id: number
          label_id: number | null
          scanned_at: string
          source: string | null
          subpart_code: string
        }
        Insert: {
          id?: number
          ip_hash?: string | null
          item_id: number
          label_id?: number | null
          scanned_at?: string
          source?: string | null
          subpart_code: string
        }
        Update: {
          id?: number
          ip_hash?: string | null
          item_id?: number
          label_id?: number | null
          scanned_at?: string
          source?: string | null
          subpart_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "scans_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scans_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "v_item_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scans_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          station: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          station?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          station?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_worker_assignments: {
        Row: {
          assigned_by: string | null
          confirmed: boolean
          confirmed_at: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string
          worker_id: string
        }
        Insert: {
          assigned_by?: string | null
          confirmed?: boolean
          confirmed_at?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          worker_id: string
        }
        Update: {
          assigned_by?: string | null
          confirmed?: boolean
          confirmed_at?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_worker_assignments_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_activity_logs: {
        Row: {
          action_type: Database["public"]["Enums"]["worker_action_type"]
          created_at: string
          details: Json | null
          entity_id: string
          entity_type: string
          id: string
          project_name: string | null
          section_ref: string | null
          upload_id: string | null
          user_email: string
          user_id: string
          worker_id: string | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["worker_action_type"]
          created_at?: string
          details?: Json | null
          entity_id: string
          entity_type: string
          id?: string
          project_name?: string | null
          section_ref?: string | null
          upload_id?: string | null
          user_email: string
          user_id: string
          worker_id?: string | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["worker_action_type"]
          created_at?: string
          details?: Json | null
          entity_id?: string
          entity_type?: string
          id?: string
          project_name?: string | null
          section_ref?: string | null
          upload_id?: string | null
          user_email?: string
          user_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worker_activity_logs_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "cutlist_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_activity_logs_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_sessions: {
        Row: {
          ended_at: string | null
          id: string
          is_active: boolean
          started_at: string
          station: string | null
          user_id: string
          worker_id: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          is_active?: boolean
          started_at?: string
          station?: string | null
          user_id: string
          worker_id: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          is_active?: boolean
          started_at?: string
          station?: string | null
          user_id?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_sessions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "workers"
            referencedColumns: ["id"]
          },
        ]
      }
      workers: {
        Row: {
          card_number: number
          created_at: string
          department: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          card_number: number
          created_at?: string
          department?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          card_number?: number
          created_at?: string
          department?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_apartment_totals: {
        Row: {
          apartment_id: number | null
          apt_number: string | null
          floor_id: number | null
          not_scanned_items: number | null
          partial_items: number | null
          project_id: number | null
          ready_items: number | null
          total_items: number | null
        }
        Relationships: [
          {
            foreignKeyName: "apartments_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apartments_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "v_floor_totals"
            referencedColumns: ["floor_id"]
          },
          {
            foreignKeyName: "apartments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apartments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "apartments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
        ]
      }
      v_floor_totals: {
        Row: {
          floor_code: string | null
          floor_id: number | null
          not_scanned_items: number | null
          partial_items: number | null
          project_id: number | null
          ready_items: number | null
          total_apartments: number | null
          total_items: number | null
        }
        Relationships: [
          {
            foreignKeyName: "floors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "floors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
        ]
      }
      v_item_status: {
        Row: {
          apt_id: number | null
          computed_status: string | null
          floor_id: number | null
          id: number | null
          item_code: string | null
          project_id: number | null
          scanned_parts: number | null
          status_cached: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_apt_id_fkey"
            columns: ["apt_id"]
            isOneToOne: false
            referencedRelation: "apartments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_apt_id_fkey"
            columns: ["apt_id"]
            isOneToOne: false
            referencedRelation: "v_apartment_totals"
            referencedColumns: ["apartment_id"]
          },
          {
            foreignKeyName: "items_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "v_floor_totals"
            referencedColumns: ["floor_id"]
          },
          {
            foreignKeyName: "items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_parent_project_totals"
            referencedColumns: ["parent_project_id"]
          },
          {
            foreignKeyName: "items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "v_project_totals"
            referencedColumns: ["project_id"]
          },
        ]
      }
      v_parent_project_totals: {
        Row: {
          building_code: string | null
          child_count: number | null
          not_scanned_items: number | null
          parent_name: string | null
          parent_project_id: number | null
          parent_status: string | null
          partial_items: number | null
          ready_items: number | null
          total_apartments: number | null
          total_floors: number | null
          total_items: number | null
        }
        Relationships: []
      }
      v_project_totals: {
        Row: {
          building_code: string | null
          name: string | null
          not_scanned_items: number | null
          partial_items: number | null
          project_id: number | null
          ready_items: number | null
          status: string | null
          total_apartments: number | null
          total_floors: number | null
          total_items: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_permission: { Args: { _permission: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_app_owner: { Args: never; Returns: boolean }
      is_email_allowed: { Args: never; Returns: boolean }
      latest_scan_events_per_subpart: {
        Args: {
          p_item_id: number
          p_mode: Database["public"]["Enums"]["scan_mode"]
        }
        Returns: {
          created_at: string
          installed_status: Database["public"]["Enums"]["install_status"]
          issue_code: Database["public"]["Enums"]["install_issue"]
          loading_mark: boolean
          subpart_code: string
        }[]
      }
    }
    Enums: {
      app_role: "owner" | "manager" | "worker" | "viewer"
      install_issue:
        | "GLASS_BROKEN"
        | "MOTOR_FAULT"
        | "SHUTTER_DAMAGED"
        | "RAILS_MISSING"
        | "ANGLES_MISSING"
        | "BOX_SILL_MISSING"
      install_status: "NOT_INSTALLED" | "PARTIAL" | "INSTALLED" | "ISSUE"
      loading_status: "NOT_LOADED" | "PARTIAL" | "LOADED"
      scan_mode: "loading" | "install"
      worker_action_type:
        | "cutlist_row_done"
        | "cutlist_row_issue"
        | "cutlist_row_reopened"
        | "cutlist_section_done"
        | "cutlist_section_issue"
        | "cutlist_section_reopened"
        | "cutlist_section_packed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "manager", "worker", "viewer"],
      install_issue: [
        "GLASS_BROKEN",
        "MOTOR_FAULT",
        "SHUTTER_DAMAGED",
        "RAILS_MISSING",
        "ANGLES_MISSING",
        "BOX_SILL_MISSING",
      ],
      install_status: ["NOT_INSTALLED", "PARTIAL", "INSTALLED", "ISSUE"],
      loading_status: ["NOT_LOADED", "PARTIAL", "LOADED"],
      scan_mode: ["loading", "install"],
      worker_action_type: [
        "cutlist_row_done",
        "cutlist_row_issue",
        "cutlist_row_reopened",
        "cutlist_section_done",
        "cutlist_section_issue",
        "cutlist_section_reopened",
        "cutlist_section_packed",
      ],
    },
  },
} as const
