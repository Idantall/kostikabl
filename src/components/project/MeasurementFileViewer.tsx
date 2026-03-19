import { useState, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight, Upload, Loader2, FileSpreadsheet, Trash2, FileText, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ExcelViewer } from "@/components/ExcelViewer";
import { MeasurementDataViewer, MeasurementDataViewerHandle } from "@/components/MeasurementDataViewer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface MeasurementFileViewerProps {
  projectId: number;
  filePath: string | null;
  onPathChange: (newPath: string | null) => void;
}

// Cache for signed URLs
const signedUrlCache = new Map<string, { url: string; expires: number }>();

async function getSignedUrl(filePath: string): Promise<string> {
  const now = Date.now();
  const cached = signedUrlCache.get(filePath);
  
  if (cached && cached.expires > now + 300000) {
    return cached.url;
  }
  
  const { data, error } = await supabase.storage
    .from("measurement-excels")
    .createSignedUrl(filePath, 3600);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("No signed URL returned");
  
  signedUrlCache.set(filePath, {
    url: data.signedUrl,
    expires: now + 3600000,
  });
  
  return data.signedUrl;
}

function isPdfFile(path: string | null): boolean {
  return path?.toLowerCase().endsWith('.pdf') || false;
}

export function MeasurementFileViewer({
  projectId,
  filePath,
  onPathChange,
}: MeasurementFileViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<string>("data");
  
  const measurementViewerRef = useRef<MeasurementDataViewerHandle>(null);

  const isPdf = isPdfFile(filePath);

  useEffect(() => {
    const loadPdf = async () => {
      if (!filePath || !isPdf) {
        setPdfUrl(null);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const url = await getSignedUrl(filePath);
        setPdfUrl(url);
      } catch (err) {
        console.error("Error loading PDF:", err);
        setError("לא ניתן לטעון את הקובץ");
      } finally {
        setIsLoading(false);
      }
    };

    loadPdf();
  }, [filePath, isPdf]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const isValidFile = file.name.toLowerCase().endsWith('.pdf') || 
                        file.name.toLowerCase().endsWith('.xlsx') || 
                        file.name.toLowerCase().endsWith('.xls');

    if (!isValidFile) {
      toast.error("יש להעלות קובץ PDF או Excel בלבד");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error("גודל הקובץ חורג מ-50MB");
      return;
    }

    setUploading(true);
    try {
      // Delete old file if exists
      if (filePath) {
        await supabase.storage.from("measurement-excels").remove([filePath]);
        signedUrlCache.delete(filePath);
      }

      const sanitizedName = file.name
        .replace(/[\u200F\u200E\u202A-\u202E]/g, '')
        .replace(/[^\w\s.-]/g, '_')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_');
      
      const newFilePath = `${projectId}/${Date.now()}_${sanitizedName}`;
      
      const { error: uploadError } = await supabase.storage
        .from("measurement-excels")
        .upload(newFilePath, file);

      if (uploadError) throw uploadError;

      // Update project record
      const { error: updateError } = await supabase
        .from("projects")
        .update({ source_file_path: newFilePath })
        .eq("id", projectId);

      if (updateError) throw updateError;

      onPathChange(newFilePath);
      setCurrentPage(1);
      toast.success("קובץ מדידות הועלה בהצלחה");
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error(`שגיאה בהעלאה: ${err.message}`);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleDelete = async () => {
    if (!filePath) return;
    
    setDeleting(true);
    try {
      await supabase.storage.from("measurement-excels").remove([filePath]);
      signedUrlCache.delete(filePath);

      const { error: updateError } = await supabase
        .from("projects")
        .update({ source_file_path: null })
        .eq("id", projectId);

      if (updateError) throw updateError;

      onPathChange(null);
      setPdfUrl(null);
      setCurrentPage(1);
      setNumPages(0);
      toast.success("קובץ מדידות נמחק בהצלחה");
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
  if (!filePath) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            דפי מדידה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">העלאת קובץ</TabsTrigger>
              <TabsTrigger value="data">נתוני מדידה</TabsTrigger>
            </TabsList>
            
            <TabsContent value="upload">
              <label htmlFor="measurement-file-upload" className="cursor-pointer">
                <div className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary transition-colors">
                  {uploading ? (
                    <>
                      <Loader2 className="h-12 w-12 mx-auto mb-4 text-primary animate-spin" />
                      <h3 className="text-lg font-semibold mb-2">מעלה קובץ...</h3>
                    </>
                  ) : (
                    <>
                      <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-semibold mb-2">העלה דפי מדידה</h3>
                      <p className="text-muted-foreground mb-4">לחץ לבחירת קובץ PDF או Excel</p>
                      <Button variant="outline" type="button">בחר קובץ</Button>
                    </>
                  )}
                </div>
                <input
                  id="measurement-file-upload"
                  type="file"
                  accept=".pdf,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
            </TabsContent>
            
            <TabsContent value="data">
              <MeasurementDataViewer projectId={projectId} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    );
  }

  // For Excel files, use ExcelViewer
  if (!isPdf) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              דפי מדידה
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="measurement-file-replace" className="cursor-pointer">
                <Button variant="outline" size="sm" asChild disabled={uploading}>
                  <span>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 ml-1" />}
                    החלף קובץ
                  </span>
                </Button>
                <input
                  id="measurement-file-replace"
                  type="file"
                  accept=".pdf,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading}
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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex items-center justify-between mb-2">
              <TabsList className="grid grid-cols-2 w-auto">
                <TabsTrigger value="excel">קובץ מקור</TabsTrigger>
                <TabsTrigger value="data">נתוני מדידה</TabsTrigger>
              </TabsList>
              {activeTab === "excel" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setActiveTab("data");
                    setTimeout(() => measurementViewerRef.current?.enableEditMode(), 100);
                  }}
                >
                  <Pencil className="h-4 w-4 ml-1" />
                  עריכת נתונים
                </Button>
              )}
            </div>
            
            <TabsContent value="excel">
              <ExcelViewer projectId={projectId} sourceFilePath={filePath} />
            </TabsContent>
            
            <TabsContent value="data">
              <MeasurementDataViewer ref={measurementViewerRef} projectId={projectId} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    );
  }

  // For PDF files
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            דפי מדידה
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
            דפי מדידה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => onPathChange(filePath)}>נסה שוב</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            דפי מדידה
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="measurement-pdf-replace" className="cursor-pointer">
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <span>
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 ml-1" />}
                  החלף קובץ
                </span>
              </Button>
              <input
                id="measurement-pdf-replace"
                type="file"
                accept=".pdf,.xlsx,.xls"
                className="hidden"
                onChange={handleFileUpload}
                disabled={uploading}
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between mb-2">
            <TabsList className="grid grid-cols-2 w-auto">
              <TabsTrigger value="pdf">קובץ מקור</TabsTrigger>
              <TabsTrigger value="data">נתוני מדידה</TabsTrigger>
            </TabsList>
            {activeTab === "pdf" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActiveTab("data");
                  setTimeout(() => measurementViewerRef.current?.enableEditMode(), 100);
                }}
              >
                <Pencil className="h-4 w-4 ml-1" />
                עריכת נתונים
              </Button>
            )}
          </div>
          
          <TabsContent value="pdf">
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
          </TabsContent>
          
          <TabsContent value="data">
            <MeasurementDataViewer ref={measurementViewerRef} projectId={projectId} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
