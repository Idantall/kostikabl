import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, List, ArrowRight, Trash2, Loader2 } from "lucide-react";
import { CutlistLanguageProvider, useCutlistLanguage } from "@/contexts/CutlistLanguageContext";
import { CutlistLanguageSelector } from "@/components/cutlist/CutlistLanguageSelector";
import { Progress } from "@/components/ui/progress";
import type { ParsedCutlistV2, ParsedPage } from "@/lib/cutlistTypes";

interface SavedUpload {
  id: string;
  filename: string;
  project_name: string | null;
  created_at: string;
  section_count: number;
}

const toSafeStorageFileName = (originalName: string) => {
  const cleaned = originalName
    .normalize("NFKD")
    .replace(
      /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,
      ""
    )
    .replace(/[\\/]/g, "_")
    .trim();

  const lastDot = cleaned.lastIndexOf(".");
  const base = lastDot > 0 ? cleaned.slice(0, lastDot) : cleaned;
  const ext = lastDot > 0 ? cleaned.slice(lastDot + 1) : "pdf";

  const safeBase =
    base
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_+|_+$/g, "") || "file";

  const safeExt = ext.replace(/[^a-zA-Z0-9]+/g, "").toLowerCase() || "pdf";

  return `${safeBase}.${safeExt}`;
};

// Chunk size for parsing - 15 pages per chunk to stay safely under CPU limits
const CHUNK_SIZE = 15;

function CutlistContent() {
  const navigate = useNavigate();
  const { t, tf, isRtl } = useCutlistLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState("uploads");
  const [parsedData, setParsedData] = useState<ParsedCutlistV2 | null>(null);
  const [filename, setFilename] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [savedUploads, setSavedUploads] = useState<SavedUpload[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // Progress tracking for chunked parsing
  const [parseProgress, setParseProgress] = useState({ current: 0, total: 0, phase: "" });

  useEffect(() => {
    fetchUploads();
  }, []);

  const fetchUploads = async () => {
    setIsLoading(true);
    try {
      const { data: uploads, error } = await supabase
        .from("cutlist_uploads")
        .select(`id, filename, project_name, created_at, cutlist_sections(id)`)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formattedUploads: SavedUpload[] = (uploads || []).map((upload: any) => ({
        id: upload.id,
        filename: upload.filename,
        project_name: upload.project_name,
        created_at: upload.created_at,
        section_count: upload.cutlist_sections?.length || 0,
      }));

      setSavedUploads(formattedUploads);
    } catch (error) {
      console.error("Error fetching uploads:", error);
      toast.error(t("errorLoadingFiles"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error(t("selectPdfFile"));
      return;
    }

    setSelectedFile(file);
    setFilename(file.name.replace('.pdf', ''));
    setIsProcessing(true);
    setParseProgress({ current: 0, total: 0, phase: t("uploadingFile") || "Uploading file..." });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Step 1: Upload PDF to temp storage for chunked processing
      const tempPath = `temp/${user.id}/${Date.now()}_${toSafeStorageFileName(file.name)}`;
      setParseProgress({ current: 0, total: 0, phase: t("uploadingFile") || "Uploading file..." });
      
      const { error: uploadError } = await supabase.storage
        .from("cutlist-pdfs")
        .upload(tempPath, file, { contentType: "application/pdf" });

      if (uploadError) throw uploadError;
      console.log("[chunked] Uploaded to:", tempPath);

      // Step 2: Get PDF info (page count, project name)
      setParseProgress({ current: 0, total: 0, phase: t("analyzingFile") || "Analyzing file..." });
      
      const { data: infoData, error: infoError } = await supabase.functions.invoke('parse-cutlist-pdf', {
        body: { storagePath: tempPath, mode: "info" },
      });

      if (infoError) throw infoError;
      if (!infoData.success) throw new Error(infoData.error || 'Failed to get PDF info');

      const { pageCount, projectName } = infoData.data;
      console.log(`[chunked] PDF has ${pageCount} pages, project: ${projectName}`);

      // Step 3: Parse in chunks sequentially
      const allPages: ParsedPage[] = [];
      const numChunks = Math.ceil(pageCount / CHUNK_SIZE);
      
      for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
        const startPage = chunkIndex * CHUNK_SIZE + 1;
        const endPage = Math.min((chunkIndex + 1) * CHUNK_SIZE, pageCount);
        
        setParseProgress({ 
          current: startPage, 
          total: pageCount, 
          phase: `${t("parsingPages") || "Parsing pages"} ${startPage}-${endPage}` 
        });
        
        console.log(`[chunked] Parsing chunk ${chunkIndex + 1}/${numChunks}: pages ${startPage}-${endPage}`);
        
        const { data: chunkData, error: chunkError } = await supabase.functions.invoke('parse-cutlist-pdf', {
          body: { storagePath: tempPath, startPage, endPage, mode: "chunk" },
        });

        if (chunkError) {
          console.error(`[chunked] Chunk ${chunkIndex + 1} failed:`, chunkError);
          throw chunkError;
        }
        
        if (!chunkData.success) {
          console.error(`[chunked] Chunk ${chunkIndex + 1} returned error:`, chunkData.error);
          throw new Error(chunkData.error || `Failed to parse pages ${startPage}-${endPage}`);
        }

        // Add parsed pages to collection
        allPages.push(...chunkData.data.pages);
        console.log(`[chunked] Chunk ${chunkIndex + 1} done: ${chunkData.data.pages.length} pages`);
      }

      // Step 4: Combine results
      const combinedResult: ParsedCutlistV2 = {
        project_name: projectName,
        pages: allPages,
      };

      setParsedData(combinedResult);
      setParseProgress({ current: pageCount, total: pageCount, phase: t("parseComplete") });

      // Clean up temp file (don't wait for it)
      supabase.storage.from("cutlist-pdfs").remove([tempPath]).catch(console.error);

      if (allPages.length === 0) {
        toast.warning(t("noItemsInFile"));
      } else {
        toast.success(tf("foundItems", { count: allPages.length }));
        setActiveTab("preview");
      }
    } catch (error) {
      console.error("Error processing PDF:", error);
      toast.error(t("errorProcessingFile"));
    } finally {
      setIsProcessing(false);
      setParseProgress({ current: 0, total: 0, phase: "" });
    }
  };

  const handleSave = async () => {
    if (!parsedData || parsedData.pages.length === 0 || !selectedFile) {
      toast.error(t("noDataToSave"));
      return;
    }

    if (!filename.trim()) {
      toast.error(t("enterFilename"));
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("notConnected"));

      const safeName = toSafeStorageFileName(selectedFile.name);
      const pdfPath = `${user.id}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("cutlist-pdfs")
        .upload(pdfPath, selectedFile, { contentType: "application/pdf" });

      if (uploadError) throw uploadError;

      const { data: upload, error: insertError } = await supabase
        .from("cutlist_uploads")
        .insert({
          filename: filename.trim(),
          project_name: parsedData.project_name,
          uploaded_by: user.id,
          pdf_path: pdfPath,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      for (let i = 0; i < parsedData.pages.length; i++) {
        const page = parsedData.pages[i];

        const { data: section, error: sectionError } = await supabase
          .from("cutlist_sections")
          .insert({
            upload_id: upload.id,
            section_ref: page.item_ref,
            page_number: page.page_number,
            title: page.title,
            dimensions_meta: page.dimensions_meta,
            quantity_total: page.quantity_total,
            technical_text: page.technical_text,
            notes: page.notes,
            raw_page_text: page.raw_page_text,
            ord: i,
          })
          .select()
          .single();

        if (sectionError) throw sectionError;

        const validProfileRows = page.profile_rows.filter(row => row.profile_code && row.profile_code.trim() !== '');
        if (validProfileRows.length > 0) {
          const profileRows = validProfileRows.map((row, idx) => ({
            section_id: section.id,
            ident: row.ident || null,
            qty: row.qty || 1,
            orientation: row.orientation || null,
            cut_length: row.cut_length || null,
            role: row.role || null,
            profile_code: row.profile_code.trim(),
            ord: idx,
          }));
          const { error: profileError } = await supabase.from("cutlist_profile_rows").insert(profileRows);
          if (profileError) console.error("Profile rows error:", profileError);
        }

        const validMiscRows = page.misc_rows.filter(row => row.description && row.description.trim() !== '');
        if (validMiscRows.length > 0) {
          const miscRows = validMiscRows.map((row, idx) => ({
            section_id: section.id,
            qty: row.qty || 1,
            unit: row.unit || null,
            description: row.description.trim(),
            sku_code: row.sku_code || null,
            ord: idx,
          }));
          const { error: miscError } = await supabase.from("cutlist_misc_rows").insert(miscRows);
          if (miscError) console.error("Misc rows error:", miscError);
        }

        if (page.glass_rows.length > 0) {
          const glassRows = page.glass_rows.map((row, idx) => ({
            section_id: section.id,
            code: row.code || null,
            size_text: row.size_text || null,
            qty: row.qty || 1,
            description: row.description || null,
            sku_name: row.sku_name || null,
            ord: idx,
          }));
          const { error: glassError } = await supabase.from("cutlist_glass_rows").insert(glassRows);
          if (glassError) console.error("Glass rows error:", glassError);
        }
      }

      toast.success(t("dataSavedSuccess"));
      resetUpload();
      fetchUploads();
      navigate(`/cutlist/${upload.id}`);
    } catch (error: any) {
      console.error("Error saving:", error);
      const errorMessage = error?.message || error?.error_description || t("errorSavingData");
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (uploadId: string) => {
    if (!confirm(t("deleteConfirm"))) return;
    try {
      await supabase.from("cutlist_uploads").delete().eq("id", uploadId);
      toast.success(t("fileDeleted"));
      fetchUploads();
    } catch (error) {
      toast.error(t("errorDeleting"));
    }
  };

  const resetUpload = () => {
    setParsedData(null);
    setSelectedFile(null);
    setFilename("");
    if (fileInputRef.current) fileInputRef.current.value = '';
    setActiveTab("uploads");
  };

  return (
    <div className="min-h-screen bg-background" dir={isRtl ? "rtl" : "ltr"}>
      <div className="container mx-auto p-4 max-w-4xl">
        <div className="flex items-center justify-between mb-6 gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
          <div className="flex items-center gap-2">
            <CutlistLanguageSelector />
            <Button variant="outline" onClick={() => navigate("/")}>{t("backToMenu")}</Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="uploads"><List className="h-4 w-4 ml-2" />{t("savedFiles")}</TabsTrigger>
            <TabsTrigger value="parse"><Upload className="h-4 w-4 ml-2" />{t("newImport")}</TabsTrigger>
            <TabsTrigger value="preview" disabled={!parsedData}><FileText className="h-4 w-4 ml-2" />{t("preview")}</TabsTrigger>
          </TabsList>

          <TabsContent value="uploads">
            <Card>
              <CardHeader><CardTitle>{t("savedCutlistFiles")}</CardTitle></CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-center py-8 text-muted-foreground">{t("loading")}</p>
                ) : savedUploads.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">{t("noSavedFiles")}</p>
                    <Button onClick={() => setActiveTab("parse")}><Upload className="h-4 w-4 ml-2" />{t("importNewFile")}</Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {savedUploads.map((upload) => (
                      <div key={upload.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                        <div>
                          <h3 className="font-medium">{upload.filename}</h3>
                          {upload.project_name && <p className="text-sm text-muted-foreground">{upload.project_name}</p>}
                          <p className="text-sm text-muted-foreground">{upload.section_count} {t("items")}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(upload.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                          <Button variant="outline" onClick={() => navigate(`/cutlist/${upload.id}`)}>
                            {t("open")} <ArrowRight className={`h-4 w-4 ${isRtl ? 'mr-2' : 'ml-2'}`} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="parse">
            <Card>
              <CardHeader><CardTitle>{t("importCutlist")}</CardTitle></CardHeader>
              <CardContent>
                <input ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileSelect} className="hidden" />
                {isProcessing ? (
                  <div className="flex flex-col items-center py-16 space-y-4">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="text-lg font-medium">{parseProgress.phase || t("processingPdf")}</p>
                    {parseProgress.total > 0 && (
                      <div className="w-full max-w-xs space-y-2">
                        <Progress value={(parseProgress.current / parseProgress.total) * 100} className="h-2" />
                        <p className="text-sm text-muted-foreground text-center">
                          {parseProgress.current} / {parseProgress.total}
                        </p>
                      </div>
                    )}
                    <p className="text-sm text-muted-foreground">{t("mayTakeMinute")}</p>
                  </div>
                ) : selectedFile ? (
                  <div className="flex flex-col items-center py-8 space-y-4">
                    <FileText className="h-16 w-16 text-primary" />
                    <p className="font-medium">{selectedFile.name}</p>
                    <Button variant="outline" onClick={resetUpload}>{t("selectAnotherFile")}</Button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:bg-muted/50" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-lg font-medium mb-2">{t("uploadPdf")}</p>
                    <p className="text-sm text-muted-foreground">{t("clickOrDrag")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview">
            {parsedData && (
              <div className="space-y-4">
                <Card>
                  <CardHeader><CardTitle>{t("previewTitle")}</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {parsedData.project_name && <p className="text-muted-foreground">{t("project")}: {parsedData.project_name}</p>}
                    <div className="bg-muted/50 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold">{parsedData.pages.length}</p>
                      <p className="text-sm text-muted-foreground">{t("itemsFound")}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">{t("fileName")}</label>
                      <Input value={filename} onChange={(e) => setFilename(e.target.value)} placeholder={t("enterFileName")} dir={isRtl ? "rtl" : "ltr"} />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={resetUpload}>{t("selectAnotherFile")}</Button>
                      <Button onClick={handleSave} disabled={isSaving || !filename.trim()}>
                        {isSaving ? t("saving") : t("confirmAndSave")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader><CardTitle>{t("itemsFoundTitle")}</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {parsedData.pages.map((page) => (
                        <div key={page.page_number} className="p-3 border rounded-lg">
                          <div className="flex justify-between items-center">
                            <span className="font-bold">{t("itemNumber")}: {page.item_ref}</span>
                            <div className="flex gap-3 text-sm text-muted-foreground">
                              <span>{page.profile_rows.length} {t("profiles")}</span>
                              <span>{page.misc_rows.length} {t("accessories")}</span>
                              <span>{page.glass_rows.length} {t("glass")}</span>
                            </div>
                          </div>
                          {page.title && <p className="text-sm text-muted-foreground mt-1">{page.title}</p>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default function Cutlist() {
  return (
    <CutlistLanguageProvider>
      <CutlistContent />
    </CutlistLanguageProvider>
  );
}
