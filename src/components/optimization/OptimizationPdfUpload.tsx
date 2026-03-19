import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Upload, FileText, Loader2, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface OptimizationPdf {
  id: string;
  file_name: string;
  file_path: string;
  page_count: number;
  status: string;
  created_at: string;
}

interface OptimizationPdfUploadProps {
  projectId: number;
}

export function OptimizationPdfUpload({ projectId }: OptimizationPdfUploadProps) {
  const [pdfs, setPdfs] = useState<OptimizationPdf[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progressData, setProgressData] = useState<Record<string, { done: number; total: number }>>({});

  useEffect(() => {
    fetchPdfs();
  }, [projectId]);

  const fetchPdfs = async () => {
    try {
      const { data, error } = await supabase
        .from("optimization_pdf_uploads")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPdfs((data || []) as OptimizationPdf[]);

      // Fetch progress for each PDF
      if (data && data.length > 0) {
        const progressPromises = data.map(async (pdf: OptimizationPdf) => {
          const { data: progressRows } = await supabase
            .from("optimization_pdf_progress")
            .select("status")
            .eq("pdf_id", pdf.id);

          const done = (progressRows || []).filter((p: { status: string }) => p.status === "done").length;
          return { id: pdf.id, done, total: pdf.page_count };
        });

        const progressResults = await Promise.all(progressPromises);
        const progressMap: Record<string, { done: number; total: number }> = {};
        progressResults.forEach((p) => {
          progressMap[p.id] = { done: p.done, total: p.total };
        });
        setProgressData(progressMap);
      }
    } catch (error) {
      console.error("Error fetching optimization PDFs:", error);
      toast.error("שגיאה בטעינת קבצי אופטימיזציה");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== "application/pdf") {
      toast.error("יש לבחור קובץ PDF");
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Upload to storage - sanitize filename to avoid storage errors with Hebrew chars
      const sanitizedName = file.name.replace(/[^\x00-\x7F]/g, '_').replace(/_+/g, '_');
      const filePath = `${projectId}/${Date.now()}_${sanitizedName}`;
      const { error: uploadError } = await supabase.storage
        .from("optimization-pdfs")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create database record
      const { data: insertData, error: insertError } = await supabase
        .from("optimization_pdf_uploads")
        .insert({
          project_id: projectId,
          file_name: file.name,
          file_path: filePath,
          page_count: 1, // Will be updated when opened
          status: "uploaded",
          created_by: user.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast.success("קובץ הועלה בהצלחה");
      fetchPdfs();
    } catch (error) {
      console.error("Error uploading PDF:", error);
      toast.error("שגיאה בהעלאת הקובץ");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (pdfId: string, filePath: string) => {
    try {
      // Delete from storage
      await supabase.storage.from("optimization-pdfs").remove([filePath]);

      // Delete from database (cascade will handle annotations and progress)
      const { error } = await supabase
        .from("optimization_pdf_uploads")
        .delete()
        .eq("id", pdfId);

      if (error) throw error;

      toast.success("הקובץ נמחק בהצלחה");
      fetchPdfs();
    } catch (error) {
      console.error("Error deleting PDF:", error);
      toast.error("שגיאה במחיקת הקובץ");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "uploaded":
        return <Badge variant="secondary">הועלה</Badge>;
      case "active":
        return <Badge variant="default">בעבודה</Badge>;
      case "archived":
        return <Badge variant="outline">בארכיון</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upload Button */}
      <Card>
        <CardContent className="pt-6">
          <label className="cursor-pointer">
            <div className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors">
              {uploading ? (
                <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
              ) : (
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              )}
              <h3 className="font-semibold mb-1">העלה קובץ אופטימיזציה PDF</h3>
              <p className="text-sm text-muted-foreground">
                לחץ לבחירת קובץ או גרור לכאן
              </p>
            </div>
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        </CardContent>
      </Card>

      {/* PDF List */}
      {pdfs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">אין קבצי אופטימיזציה</h3>
            <p className="text-muted-foreground">
              העלה קובץ PDF להתחלת עבודה
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pdfs.map((pdf) => {
            const progress = progressData[pdf.id];
            const progressPercent = progress
              ? Math.round((progress.done / progress.total) * 100)
              : 0;

            return (
              <Card key={pdf.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <FileText className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">{pdf.file_name}</h4>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          {getStatusBadge(pdf.status)}
                          <span>•</span>
                          <span>{pdf.page_count} עמודים</span>
                          {progress && (
                            <>
                              <span>•</span>
                              <span>{progress.done}/{progress.total} הושלמו</span>
                            </>
                          )}
                        </div>
                        {progress && progress.total > 0 && (
                          <div className="mt-2">
                            <Progress value={progressPercent} className="h-2" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button asChild size="sm" variant="default">
                        <Link to={`/worker/optimization-pdf/${pdf.id}`}>
                          <ExternalLink className="h-4 w-4 ml-1" />
                          פתח
                        </Link>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>מחק קובץ אופטימיזציה</AlertDialogTitle>
                            <AlertDialogDescription>
                              האם אתה בטוח שברצונך למחוק את הקובץ "{pdf.file_name}"?
                              <br />
                              כל ההערות וההתקדמות ימחקו לצמיתות.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>ביטול</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(pdf.id, pdf.file_path)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              מחק
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
