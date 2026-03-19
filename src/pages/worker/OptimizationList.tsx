import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { WorkerLayout } from '@/components/worker/WorkerLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { FileText, Calendar, ChevronLeft, Package, Upload, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { toast } from 'sonner';
import { useCurrentUserRole } from '@/hooks/useRBAC';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface Project {
  id: number;
  name: string;
}

interface OptimizationPdf {
  id: string;
  file_name: string;
  file_path: string;
  page_count: number | null;
  status: string;
  created_at: string;
  project_id: number;
  project_name?: string;
  done_count?: number;
}

export default function OptimizationList() {
  const navigate = useNavigate();
  const { data: userRole, isLoading: roleLoading } = useCurrentUserRole();
  const canUpload = userRole === 'owner' || userRole === 'manager';
  const [pdfs, setPdfs] = useState<OptimizationPdf[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchPdfs();
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .order('name');
      if (error) throw error;
      setProjects(data || []);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const fetchPdfs = async () => {
    try {
      // Fetch PDFs with project names
      const { data: pdfsData, error: pdfsError } = await supabase
        .from('optimization_pdf_uploads')
        .select(`
          id,
          file_name,
          file_path,
          page_count,
          status,
          created_at,
          project_id,
          projects!inner(name)
        `)
        .order('created_at', { ascending: false });

      if (pdfsError) throw pdfsError;

      // Fetch progress for each PDF
      const pdfsWithStats = await Promise.all(
        (pdfsData || []).map(async (pdf: any) => {
          const { data: progressRows } = await supabase
            .from('optimization_pdf_progress')
            .select('status')
            .eq('pdf_id', pdf.id);

          const doneCount = (progressRows || []).filter((p: { status: string }) => p.status === 'done').length;

          return {
            ...pdf,
            project_name: pdf.projects?.name,
            done_count: doneCount,
          };
        })
      );

      setPdfs(pdfsWithStats);
    } catch (error) {
      console.error('Error fetching optimization PDFs:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadClick = () => {
    setUploadDialogOpen(true);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedProjectId) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('נא להעלות קובץ PDF בלבד');
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Sanitize filename - replace Hebrew/non-ASCII chars with underscores
      const sanitizedName = file.name.replace(/[^\x00-\x7F]/g, '_').replace(/_+/g, '_');
      const filePath = `${selectedProjectId}/${Date.now()}_${sanitizedName}`;
      
      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('optimization-pdfs')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Create database record (no parsing - just store for annotation)
      const { error: insertError } = await supabase
        .from('optimization_pdf_uploads')
        .insert({
          project_id: parseInt(selectedProjectId),
          file_name: file.name,
          file_path: filePath,
          page_count: 1, // Will be updated when opened in viewer
          status: 'uploaded',
          created_by: user.id,
        });

      if (insertError) throw insertError;

      toast.success('קובץ הועלה בהצלחה');
      
      setUploadDialogOpen(false);
      setSelectedProjectId('');
      fetchPdfs();

    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || 'שגיאה בהעלאת הקובץ');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const getStatusBadge = (pdf: OptimizationPdf) => {
    const pageCount = pdf.page_count || 0;
    const done = pdf.done_count || 0;

    if (pageCount === 0) {
      return <Badge variant="secondary">הועלה</Badge>;
    }
    if (done === pageCount) {
      return <Badge className="bg-primary text-primary-foreground">הושלם</Badge>;
    }
    if (done > 0) {
      return <Badge variant="secondary">בתהליך</Badge>;
    }
    return <Badge variant="outline">פתוח</Badge>;
  };

  return (
    <WorkerLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/worker')}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">אופטימיזציה</h1>
              <p className="text-muted-foreground">סימון על גבי PDF</p>
            </div>
          </div>
          {canUpload && (
            <Button onClick={handleUploadClick}>
              <Upload className="h-4 w-4 ml-2" />
              העלאת PDF
            </Button>
          )}
        </div>

        {/* Upload Dialog */}
        <Dialog open={uploadDialogOpen} onOpenChange={(open) => {
          if (!uploading) {
            setUploadDialogOpen(open);
          }
        }}>
          <DialogContent dir="rtl" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>העלאת קובץ אופטימיזציה</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">בחר פרויקט</label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר פרויקט..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id.toString()}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                className="hidden"
                disabled={uploading || !selectedProjectId}
              />
            </div>
            <DialogFooter className="flex-row-reverse sm:flex-row-reverse gap-2">
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !selectedProjectId}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    מעלה...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 ml-2" />
                    בחר קובץ PDF
                  </>
                )}
              </Button>
              <Button variant="outline" onClick={() => setUploadDialogOpen(false)} disabled={uploading}>
                ביטול
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-16 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : pdfs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">אין קבצי אופטימיזציה</h3>
              <p className="text-muted-foreground">לא נמצאו קבצי PDF לסימון</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pdfs.map((pdf) => {
              const progressPercent = pdf.page_count && pdf.page_count > 0
                ? Math.round(((pdf.done_count || 0) / pdf.page_count) * 100)
                : 0;

              return (
                <Card
                  key={pdf.id}
                  className="cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => navigate(`/worker/optimization-pdf/${pdf.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="bg-primary/10 p-3 rounded-lg">
                          <FileText className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold truncate">{pdf.file_name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {pdf.project_name}
                          </p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(pdf.created_at), 'dd/MM/yyyy HH:mm', { locale: he })}
                            {pdf.page_count && pdf.page_count > 0 && (
                              <>
                                <span>•</span>
                                <span>{pdf.page_count} עמודים</span>
                              </>
                            )}
                          </div>
                        {pdf.page_count && pdf.page_count > 0 && (
                          <div className="flex items-center gap-2 mt-2 max-w-[200px]">
                            <Progress value={progressPercent} className="h-1.5 flex-1" />
                            <Badge variant="secondary" className="text-xs">{progressPercent}%</Badge>
                          </div>
                        )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {pdf.page_count && pdf.page_count > 0 && (
                          <div className="text-left">
                            <p className="text-sm font-medium">
                              {pdf.done_count || 0}/{pdf.page_count}
                            </p>
                            <p className="text-xs text-muted-foreground">עמודים</p>
                          </div>
                        )}
                        {getStatusBadge(pdf)}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </WorkerLayout>
  );
}
