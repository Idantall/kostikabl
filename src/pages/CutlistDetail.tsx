import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CutlistItemCard } from "@/components/cutlist/CutlistItemCard";
import { CutlistSectionConfirmModal } from "@/components/cutlist/CutlistSectionConfirmModal";
import { CutlistRowConfirmDialog, RowType } from "@/components/cutlist/CutlistRowConfirmDialog";
import { CutlistLanguageSelector } from "@/components/cutlist/CutlistLanguageSelector";
import { CutlistLanguageProvider, useCutlistLanguage } from "@/contexts/CutlistLanguageContext";
import { CutlistPdfProvider } from "@/components/cutlist/CutlistPdfContext";
import { ArrowRight, Search, RefreshCw } from "lucide-react";
import type { CutlistSectionWithRows, CutlistUpload, CutlistProfileRow, CutlistGlassRow } from "@/lib/cutlistTypes";

function CutlistDetailContent() {
  const { uploadId } = useParams<{ uploadId: string }>();
  const navigate = useNavigate();
  const { t, tf, isRtl } = useCutlistLanguage();
  const [upload, setUpload] = useState<CutlistUpload | null>(null);
  const [sections, setSections] = useState<CutlistSectionWithRows[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [selectedSection, setSelectedSection] = useState<CutlistSectionWithRows | null>(null);
  
  const [rowDialogOpen, setRowDialogOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<{
    type: RowType;
    id: string;
    description: string;
  } | null>(null);

  const fetchData = useCallback(async () => {
    if (!uploadId) return;

    setIsLoading(true);
    try {
      const { data: uploadData, error: uploadError } = await supabase
        .from("cutlist_uploads")
        .select("*")
        .eq("id", uploadId)
        .single();

      if (uploadError) throw uploadError;
      setUpload(uploadData);

      const { data: sectionsData, error: sectionsError } = await supabase
        .from("cutlist_sections")
        .select(`
          *,
          cutlist_profile_rows(*),
          cutlist_misc_rows(*),
          cutlist_glass_rows(*)
        `)
        .eq("upload_id", uploadId)
        .order("ord", { ascending: true });

      if (sectionsError) throw sectionsError;

      // Custom sort: A-prefixed items first (A-1, A-2, ...), then Hebrew/other-prefixed items (מ-1, מ-2, ...)
      const sortSectionRef = (a: any, b: any) => {
        const refA = a.section_ref || "";
        const refB = b.section_ref || "";
        
        const isAPrefixA = /^A-/i.test(refA);
        const isAPrefixB = /^A-/i.test(refB);
        
        // A-prefix items come first
        if (isAPrefixA && !isAPrefixB) return -1;
        if (!isAPrefixA && isAPrefixB) return 1;
        
        // Extract numeric part after any prefix (handles A-, מ-, etc.)
        const numA = parseInt(refA.replace(/^[^\d-]*-?/, ""), 10) || 0;
        const numB = parseInt(refB.replace(/^[^\d-]*-?/, ""), 10) || 0;
        
        return numA - numB;
      };

      const formattedSections: CutlistSectionWithRows[] = (sectionsData || [])
        .map((section: any) => ({
          ...section,
          profile_rows: (section.cutlist_profile_rows || []).sort((a: any, b: any) => a.ord - b.ord),
          misc_rows: (section.cutlist_misc_rows || []).sort((a: any, b: any) => a.ord - b.ord),
          glass_rows: (section.cutlist_glass_rows || []).sort((a: any, b: any) => a.ord - b.ord),
        }))
        .sort(sortSectionRef);

      setSections(formattedSections);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast.error(t("errorLoadingData"));
    } finally {
      setIsLoading(false);
    }
  }, [uploadId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleProfileRowClick = (row: CutlistProfileRow) => {
    if (row.status === "done") {
      toast.info(t("rowAlreadyDone"));
      return;
    }
    
    setSelectedRow({
      type: "profile",
      id: row.id,
      description: `${row.profile_code} | ${row.role || "-"} | ${row.cut_length || "-"} ${row.orientation || ""} | ${t("qty")} ${row.qty}`,
    });
    setRowDialogOpen(true);
  };

  const handleGlassRowClick = (row: CutlistGlassRow) => {
    if (row.status === "done") {
      toast.info(t("rowAlreadyDone"));
      return;
    }
    
    setSelectedRow({
      type: "glass",
      id: row.id,
      description: `${row.code || row.description || "-"} | ${row.size_text || "-"} | ${t("qty")} ${row.qty}`,
    });
    setRowDialogOpen(true);
  };

  const handleMarkRowDone = async (rowId: string, type: RowType) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error(t("loginRequired"));
        return;
      }

      const now = new Date().toISOString();
      const tableName = type === "profile" ? "cutlist_profile_rows" 
                      : type === "misc" ? "cutlist_misc_rows" 
                      : "cutlist_glass_rows";

      const { error } = await supabase
        .from(tableName)
        .update({
          status: "done",
          is_checked: true,
          issue_text: null,
          finalized_at: now,
          finalized_by: user.id,
          checked_at: now,
          checked_by: user.id,
        })
        .eq("id", rowId);

      if (error) throw error;

      setSections((prev) =>
        prev.map((section) => ({
          ...section,
          profile_rows: type === "profile" 
            ? section.profile_rows.map((row) =>
                row.id === rowId ? { ...row, status: "done" as const, is_checked: true, issue_text: null } : row
              )
            : section.profile_rows,
          misc_rows: type === "misc"
            ? section.misc_rows.map((row) =>
                row.id === rowId ? { ...row, status: "done" as const, is_checked: true, issue_text: null } : row
              )
            : section.misc_rows,
          glass_rows: type === "glass"
            ? section.glass_rows.map((row) =>
                row.id === rowId ? { ...row, status: "done" as const, is_checked: true, issue_text: null } : row
              )
            : section.glass_rows,
        }))
      );

      toast.success(t("rowMarkedDone"));
    } catch (error) {
      console.error("Error marking row done:", error);
      toast.error(t("errorUpdatingRow"));
    }
  };

  const handleReportRowIssue = async (rowId: string, type: RowType, issueText: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error(t("loginRequired"));
        return;
      }

      const now = new Date().toISOString();
      const tableName = type === "profile" ? "cutlist_profile_rows" 
                      : type === "misc" ? "cutlist_misc_rows" 
                      : "cutlist_glass_rows";

      const { error } = await supabase
        .from(tableName)
        .update({
          status: "issue",
          is_checked: false,
          issue_text: issueText,
          finalized_at: now,
          finalized_by: user.id,
        })
        .eq("id", rowId);

      if (error) throw error;

      setSections((prev) =>
        prev.map((section) => ({
          ...section,
          profile_rows: type === "profile"
            ? section.profile_rows.map((row) =>
                row.id === rowId ? { ...row, status: "issue" as const, is_checked: false, issue_text: issueText } : row
              )
            : section.profile_rows,
          misc_rows: type === "misc"
            ? section.misc_rows.map((row) =>
                row.id === rowId ? { ...row, status: "issue" as const, is_checked: false, issue_text: issueText } : row
              )
            : section.misc_rows,
          glass_rows: type === "glass"
            ? section.glass_rows.map((row) =>
                row.id === rowId ? { ...row, status: "issue" as const, is_checked: false, issue_text: issueText } : row
              )
            : section.glass_rows,
        }))
      );

      toast.success(t("issueSaved"));
    } catch (error) {
      console.error("Error reporting issue:", error);
      toast.error(t("errorSavingIssue"));
    }
  };

  const handleOpenConfirmModal = (section: CutlistSectionWithRows) => {
    setSelectedSection(section);
    setConfirmModalOpen(true);
  };

  const handleMarkSectionDone = async () => {
    if (!selectedSection) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error(t("loginToUpdate"));
        return;
      }

      const now = new Date().toISOString();

      const { error: sectionError } = await supabase
        .from("cutlist_sections")
        .update({
          status: "done",
          finalized_at: now,
          finalized_by: user.id,
          issue_text: null,
        })
        .eq("id", selectedSection.id);

      if (sectionError) throw sectionError;

      setSections((prev) =>
        prev.map((section) =>
          section.id === selectedSection.id
            ? {
                ...section,
                status: "done" as const,
                finalized_at: now,
                finalized_by: user.id,
                issue_text: null,
              }
            : section
        )
      );

      toast.success(tf("itemMarkedComplete", { ref: selectedSection.section_ref }));
      setConfirmModalOpen(false);
      setSelectedSection(null);
    } catch (error) {
      console.error("Error marking section done:", error);
      toast.error(t("errorMarkingComplete"));
    }
  };

  const handleReportSectionIssue = async (issueText: string) => {
    if (!selectedSection) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error(t("loginToUpdate"));
        return;
      }

      const now = new Date().toISOString();

      const { error } = await supabase
        .from("cutlist_sections")
        .update({
          status: "issue",
          issue_text: issueText,
          finalized_at: now,
          finalized_by: user.id,
        })
        .eq("id", selectedSection.id);

      if (error) throw error;

      setSections((prev) =>
        prev.map((section) =>
          section.id === selectedSection.id
            ? {
                ...section,
                status: "issue" as const,
                issue_text: issueText,
                finalized_at: now,
                finalized_by: user.id,
              }
            : section
        )
      );

      toast.success(tf("issueReported", { ref: selectedSection.section_ref }));
      setConfirmModalOpen(false);
      setSelectedSection(null);
    } catch (error) {
      console.error("Error reporting issue:", error);
      toast.error(t("errorReportingIssue"));
    }
  };

  const filteredSections = sections.filter((section) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    
    // Direct substring match on all text fields first
    if (section.section_ref.toLowerCase().includes(query)) return true;
    if (section.section_name?.toLowerCase().includes(query)) return true;
    if (section.title?.toLowerCase().includes(query)) return true;
    if (section.notes?.toLowerCase().includes(query)) return true;
    if (section.dimensions_meta?.toLowerCase().includes(query)) return true;
    if (section.profile_rows.some(r => 
      r.profile_code.toLowerCase().includes(query) || 
      r.role?.toLowerCase().includes(query) ||
      r.cut_length?.toLowerCase().includes(query)
    )) return true;
    if (section.misc_rows.some(r => r.description.toLowerCase().includes(query))) return true;
    if (section.glass_rows.some(r => 
      r.code?.toLowerCase().includes(query) || 
      r.description?.toLowerCase().includes(query) ||
      r.sku_name?.toLowerCase().includes(query)
    )) return true;
    
    // Smart number search: if query is a plain number, also match extracted number from section_ref
    if (/^\d+$/.test(query)) {
      const refNum = section.section_ref.replace(/^[^\d]*-?/, "");
      if (refNum === query) return true;
    }
    
    return false;
  });

  const totalItems = sections.reduce(
    (sum, s) => sum + s.profile_rows.length + s.misc_rows.length + s.glass_rows.length,
    0
  );
  const doneItems = sections.reduce(
    (sum, s) =>
      sum +
      s.profile_rows.filter((r) => r.status === "done").length +
      s.misc_rows.filter((r) => r.status === "done").length +
      s.glass_rows.filter((r) => r.status === "done").length,
    0
  );
  const progressPercent = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir={isRtl ? "rtl" : "ltr"}>
        <p className="text-muted-foreground">{t("loading")}</p>
      </div>
    );
  }

  if (!upload) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" dir={isRtl ? "rtl" : "ltr"}>
        <div className="text-center">
          <p className="text-muted-foreground mb-4">{t("fileNotFound")}</p>
          <Button onClick={() => navigate("/cutlist")}>{t("backToList")}</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir={isRtl ? "rtl" : "ltr"}>
      <div className="container mx-auto p-4 max-w-5xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">{upload.filename}</h1>
            {upload.project_name && (
              <p className="text-muted-foreground">{upload.project_name}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <CutlistLanguageSelector />
            <Button variant="outline" onClick={() => navigate("/cutlist")}>
              <ArrowRight className={`h-4 w-4 ${isRtl ? 'ml-2' : 'mr-2'}`} />
              {t("back")}
            </Button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-muted rounded-full h-4 mb-4 overflow-hidden">
          <div
            className="bg-primary h-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground mb-4 text-center">
          {doneItems} / {totalItems} {t("itemsCompleted")} ({progressPercent}%)
        </p>

        {/* Search and refresh */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className={`absolute ${isRtl ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground`} />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className={isRtl ? "pr-10" : "pl-10"}
              dir={isRtl ? "rtl" : "ltr"}
            />
          </div>
          <Button variant="outline" size="icon" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Sections wrapped with PDF provider */}
        <CutlistPdfProvider pdfPath={upload.pdf_path}>
          <div className="space-y-4">
            {filteredSections.map((section) => (
              <CutlistItemCard
                key={section.id}
                section={section}
                isPreview={false}
                showDebug={false}
                onProfileRowClick={handleProfileRowClick}
                onGlassRowClick={handleGlassRowClick}
                onConfirmSection={() => handleOpenConfirmModal(section)}
              />
            ))}
          </div>
        </CutlistPdfProvider>

        {filteredSections.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery ? t("noResults") : t("noItemsToShow")}
          </div>
        )}
      </div>

      <CutlistRowConfirmDialog
        open={rowDialogOpen}
        onOpenChange={setRowDialogOpen}
        rowSummary={selectedRow}
        onMarkDone={handleMarkRowDone}
        onReportIssue={handleReportRowIssue}
      />

      <CutlistSectionConfirmModal
        open={confirmModalOpen}
        onOpenChange={setConfirmModalOpen}
        sectionRef={selectedSection?.section_ref || ""}
        sectionStatus={selectedSection?.status || "open"}
        existingIssueText={selectedSection?.issue_text || null}
        onMarkDone={handleMarkSectionDone}
        onReportIssue={handleReportSectionIssue}
      />
    </div>
  );
}

export default function CutlistDetail() {
  return (
    <CutlistLanguageProvider>
      <CutlistDetailContent />
    </CutlistLanguageProvider>
  );
}
