import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { WorkerLayout } from '@/components/worker/WorkerLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, Search, ChevronLeft } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

interface CutlistUpload {
  id: string;
  filename: string;
  project_name: string | null;
  created_at: string;
  status: string;
  sections_count?: number;
  completed_sections?: number;
}

export default function WorkerCutlistList() {
  const [cutlists, setCutlists] = useState<CutlistUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchCutlists = async () => {
      // Fetch all active cutlist uploads
      const { data: uploads, error } = await supabase
        .from('cutlist_uploads')
        .select('id, filename, project_name, created_at, status')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching cutlists:', error);
        setLoading(false);
        return;
      }

      // For each upload, get section counts
      const uploadsWithCounts = await Promise.all(
        (uploads || []).map(async (upload) => {
          const { count: totalSections } = await supabase
            .from('cutlist_sections')
            .select('*', { count: 'exact', head: true })
            .eq('upload_id', upload.id);

          const { count: doneSections } = await supabase
            .from('cutlist_sections')
            .select('*', { count: 'exact', head: true })
            .eq('upload_id', upload.id)
            .eq('status', 'done');

          return {
            ...upload,
            sections_count: totalSections || 0,
            completed_sections: doneSections || 0,
          };
        })
      );

      setCutlists(uploadsWithCounts);
      setLoading(false);
    };

    void fetchCutlists();
  }, []);

  const filteredCutlists = cutlists.filter((cutlist) => {
    const query = searchQuery.toLowerCase();
    return (
      cutlist.filename.toLowerCase().includes(query) ||
      (cutlist.project_name?.toLowerCase().includes(query) ?? false)
    );
  });

  const getProgressPercent = (completed: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  };

  return (
    <WorkerLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">רשימות חיתוך</h1>
            <p className="text-muted-foreground">בחר רשימה לעבוד עליה</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2 mt-2" />
                </CardHeader>
                <CardContent>
                  <div className="h-4 bg-muted rounded w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredCutlists.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                {searchQuery ? 'לא נמצאו רשימות מתאימות' : 'אין רשימות חיתוך פעילות'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCutlists.map((cutlist) => {
              const progress = getProgressPercent(
                cutlist.completed_sections || 0,
                cutlist.sections_count || 0
              );
              const isComplete = progress === 100;

              return (
                <Link key={cutlist.id} to={`/worker/cutlist/${cutlist.id}`}>
                  <Card className="h-full hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-lg line-clamp-1">
                            {cutlist.project_name || cutlist.filename}
                          </CardTitle>
                          <CardDescription className="line-clamp-1">
                            {cutlist.filename}
                          </CardDescription>
                        </div>
                        <ChevronLeft className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">התקדמות</span>
                        <Badge variant={isComplete ? 'default' : 'secondary'}>
                          {cutlist.completed_sections || 0} / {cutlist.sections_count || 0}
                        </Badge>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            isComplete ? 'bg-green-500' : 'bg-primary'
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(cutlist.created_at), 'dd/MM/yyyy', { locale: he })}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </WorkerLayout>
  );
}
