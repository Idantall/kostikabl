import { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Upload, Loader2, FileText, Trash2, CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import type { ParsedCutlistV2, ParsedPage } from "@/lib/cutlistTypes";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface ProductionFilePdfViewerProps {
  projectId: number;
  projectName: string;
  pdfPath: string | null;
  onPathChange: (newPath: string | null) => void;
}

// Cache for signed URLs
const signedUrlCache = new Map<string, { url: string; expires: number }>();

async function getSignedUrl(pdfPath: string, bucket: string = "production-files"): Promise<string> {
  const cacheKey = `${bucket}:${pdfPath}`;
  const now = Date.now();
  const cached = signedUrlCache.get(cacheKey);
  
  if (cached && cached.expires > now + 300000) {
    return cached.url;
  }
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(pdfPath, 3600);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("No signed URL returned");
  
  signedUrlCache.set(cacheKey, {
    url: data.signedUrl,
    expires: now + 3600000,
  });
  
  return data.signedUrl;
}

const toSafeStorageFileName = (originalName: string) => {
  const cleaned = originalName
    .normalize("NFKD")
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
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

export function ProductionFilePdfViewer({
  projectId,
  projectName,
  pdfPath,
  onPathChange,
}: ProductionFilePdfViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [parseProgress, setParseProgress] = useState({ current: 0, total: 0, phase: "" });
  const [linkedCutlistId, setLinkedCutlistId] = useState<string | null>(null);

  // Check if there's already a cutlist for this project
  useEffect(() => {
    const checkExistingCutlist = async () => {
      const { data } = await supabase
        .from("cutlist_uploads")
        .select("id")
        .eq("project_name", projectName)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      setLinkedCutlistId(data?.id || null);
    };
    
    if (projectName) {
      checkExistingCutlist();
    }
  }, [projectName]);

  useEffect(() => {
    const loadPdf = async () => {
      if (!pdfPath) {
        setPdfUrl(null);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const url = await getSignedUrl(pdfPath);
        setPdfUrl(url);
      } catch (err) {
        console.error("Error loading PDF:", err);
        setError("לא ניתן לטעון את הקובץ");
      } finally {
        setIsLoading(false);
      }
    };

    loadPdf();
  }, [pdfPath]);

  const parsePdfToCutlist = async (file: File, storagePdfPath: string) => {
    setParsing(true);
    setParseProgress({ current: 0, total: 0, phase: "מנתח קובץ..." });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Step 1: Upload to cutlist-pdfs bucket for parsing
      const tempPath = `temp/${user.id}/${Date.now()}_${toSafeStorageFileName(file.name)}`;
      
      const { error: uploadError } = await supabase.storage
        .from("cutlist-pdfs")
        .upload(tempPath, file, { contentType: "application/pdf" });

      if (uploadError) throw uploadError;
      console.log("[production-file] Uploaded temp file for parsing:", tempPath);

      // Step 2: Get PDF info (page count)
      setParseProgress({ current: 0, total: 0, phase: "מזהה מספר עמודים..." });
      
      const { data: infoData, error: infoError } = await supabase.functions.invoke('parse-cutlist-pdf', {
        body: { storagePath: tempPath, mode: "info" },
      });

      if (infoError) throw infoError;
      if (!infoData.success) throw new Error(infoData.error || 'Failed to get PDF info');

      const { pageCount } = infoData.data;
      console.log(`[production-file] PDF has ${pageCount} pages`);

      // Step 3: Parse in chunks
      const allPages: ParsedPage[] = [];
      const numChunks = Math.ceil(pageCount / CHUNK_SIZE);
      
      for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
        const startPage = chunkIndex * CHUNK_SIZE + 1;
        const endPage = Math.min((chunkIndex + 1) * CHUNK_SIZE, pageCount);
        
        setParseProgress({ 
          current: startPage, 
          total: pageCount, 
          phase: `מעבד עמודים ${startPage}-${endPage}` 
        });
        
        const { data: chunkData, error: chunkError } = await supabase.functions.invoke('parse-cutlist-pdf', {
          body: { storagePath: tempPath, startPage, endPage, mode: "chunk" },
        });

        if (chunkError) throw chunkError;
        if (!chunkData.success) throw new Error(chunkData.error || `Failed to parse pages ${startPage}-${endPage}`);

        allPages.push(...chunkData.data.pages);
      }

      // Step 4: Save to cutlist tables
      setParseProgress({ current: pageCount, total: pageCount, phase: "שומר נתונים..." });

      // Copy file to permanent cutlist storage
      const permanentPdfPath = `${user.id}/${Date.now()}_${toSafeStorageFileName(file.name)}`;
      const { error: copyError } = await supabase.storage
        .from("cutlist-pdfs")
        .copy(tempPath, permanentPdfPath);

      if (copyError) {
        // If copy fails, upload again
        await supabase.storage.from("cutlist-pdfs").upload(permanentPdfPath, file, { contentType: "application/pdf" });
      }

      // Create cutlist upload record
      const { data: upload, error: insertError } = await supabase
        .from("cutlist_uploads")
        .insert({
          filename: `${projectName} - תיק יצור`,
          project_name: projectName,
          uploaded_by: user.id,
          pdf_path: permanentPdfPath,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Insert sections and rows
      for (let i = 0; i < allPages.length; i++) {
        const page = allPages[i];

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

        // Insert profile rows
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
          await supabase.from("cutlist_profile_rows").insert(profileRows);
        }

        // Insert misc rows
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
          await supabase.from("cutlist_misc_rows").insert(miscRows);
        }

        // Insert glass rows
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
          await supabase.from("cutlist_glass_rows").insert(glassRows);
        }
      }

      // Clean up temp file
      supabase.storage.from("cutlist-pdfs").remove([tempPath]).catch(console.error);

      setLinkedCutlistId(upload.id);
      toast.success(`נוצרו ${allPages.length} פריטים בפקודת היצור`);
      
    } catch (err: any) {
      console.error("Error parsing PDF:", err);
      toast.error(`שגיאה בעיבוד הקובץ: ${err.message}`);
    } finally {
      setParsing(false);
      setParseProgress({ current: 0, total: 0, phase: "" });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error("יש להעלות קובץ PDF בלבד");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error("גודל הקובץ חורג מ-50MB");
      return;
    }

    setUploading(true);
    try {
      // Delete old file if exists
      if (pdfPath) {
        await supabase.storage.from("production-files").remove([pdfPath]);
        signedUrlCache.delete(`production-files:${pdfPath}`);
      }

      const sanitizedName = file.name
        .replace(/[\u200F\u200E\u202A-\u202E]/g, '')
        .replace(/[^\w\s.-]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_');
      
      const filePath = `${projectId}/${Date.now()}_${sanitizedName}`;
      
      const { error: uploadError } = await supabase.storage
        .from("production-files")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Update project record
      const { error: updateError } = await supabase
        .from("projects")
        .update({ production_file_path: filePath })
        .eq("id", projectId);

      if (updateError) throw updateError;

      onPathChange(filePath);
      setCurrentPage(1);
      toast.success("תיק יצור הועלה בהצלחה");

      // Parse and create cutlist entries
      await parsePdfToCutlist(file, filePath);
      
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error(`שגיאה בהעלאה: ${err.message}`);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleDelete = async () => {
    if (!pdfPath) return;
    
    setDeleting(true);
    try {
      await supabase.storage.from("production-files").remove([pdfPath]);
      signedUrlCache.delete(`production-files:${pdfPath}`);

      const { error: updateError } = await supabase
        .from("projects")
        .update({ production_file_path: null })
        .eq("id", projectId);

      if (updateError) throw updateError;

      onPathChange(null);
      setPdfUrl(null);
      setCurrentPage(1);
      setNumPages(0);
      toast.success("תיק יצור נמחק בהצלחה");
    } catch (err: any) {
      console.error("Delete error:", err);
      toast.error(`שגיאה במחיקה: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const goToPrevPage = () => setCurrentPage(p => Math.max(1, p - 1));
  const goToNextPage = () => setCurrentPage(p => Math.min(numPages, p + 1));

  // No file uploaded yet - show upload prompt
  if (!pdfPath) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            תיק יצור
          </CardTitle>
        </CardHeader>
        <CardContent>
          <label htmlFor="production-file-upload" className="cursor-pointer">
            <div className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary transition-colors">
              {uploading || parsing ? (
                <>
                  <Loader2 className="h-12 w-12 mx-auto mb-4 text-primary animate-spin" />
                  <h3 className="text-lg font-semibold mb-2">
                    {parsing ? parseProgress.phase : "מעלה קובץ..."}
                  </h3>
                  {parsing && parseProgress.total > 0 && (
                    <div className="max-w-xs mx-auto space-y-2">
                      <Progress value={(parseProgress.current / parseProgress.total) * 100} className="h-2" />
                      <p className="text-sm text-muted-foreground">
                        {parseProgress.current} / {parseProgress.total}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">העלה תיק יצור</h3>
                  <p className="text-muted-foreground mb-4">הקובץ יעובד אוטומטית לפקודת יצור</p>
                  <Button variant="outline" type="button">בחר קובץ</Button>
                </>
              )}
            </div>
            <input
              id="production-file-upload"
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading || parsing}
            />
          </label>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            תיק יצור
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full h-[600px] rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            תיק יצור
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => onPathChange(pdfPath)}>נסה שוב</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            תיק יצור
            {linkedCutlistId && (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                מקושר לפקודת יצור
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {linkedCutlistId && (
              <Link to={`/cutlist/${linkedCutlistId}`}>
                <Button variant="outline" size="sm">
                  <ExternalLink className="h-4 w-4 ml-1" />
                  פתח פקודת יצור
                </Button>
              </Link>
            )}
            <label htmlFor="production-file-replace" className="cursor-pointer">
              <Button variant="outline" size="sm" asChild disabled={uploading || parsing}>
                <span>
                  {uploading || parsing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 ml-1" />}
                  החלף קובץ
                </span>
              </Button>
              <input
                id="production-file-replace"
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading || parsing}
              />
            </label>
            <Button 
              variant="destructive" 
              size="sm" 
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 ml-1" />}
              מחק
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Parsing Progress */}
        {parsing && (
          <div className="mb-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="font-medium">{parseProgress.phase}</span>
            </div>
            {parseProgress.total > 0 && (
              <div className="space-y-1">
                <Progress value={(parseProgress.current / parseProgress.total) * 100} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  {parseProgress.current} / {parseProgress.total}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Page Navigation */}
        <div className="flex items-center justify-center gap-4 mb-4">
          <Button
            variant="outline"
            size="icon"
            onClick={goToPrevPage}
            disabled={currentPage <= 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-[80px] text-center">
            עמוד {currentPage} מתוך {numPages || '?'}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={goToNextPage}
            disabled={currentPage >= numPages}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>

        {/* PDF Viewer */}
        <div className="flex justify-center bg-muted/30 rounded-lg p-4 overflow-auto">
          {pdfUrl && (
            <Document
              file={pdfUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={<Skeleton className="w-[600px] h-[800px]" />}
              error={
                <div className="text-center p-8 text-muted-foreground">
                  שגיאה בטעינת PDF
                </div>
              }
            >
              <Page
                pageNumber={currentPage}
                width={Math.min(800, window.innerWidth - 100)}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>
          )}
        </div>

        {/* Bottom Navigation */}
        {numPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={goToPrevPage}
              disabled={currentPage <= 1}
            >
              <ChevronRight className="h-4 w-4 ml-1" />
              הקודם
            </Button>
            <span className="text-sm text-muted-foreground">
              {currentPage} / {numPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={goToNextPage}
              disabled={currentPage >= numPages}
            >
              הבא
              <ChevronLeft className="h-4 w-4 mr-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
