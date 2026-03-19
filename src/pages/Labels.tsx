import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, Tag, Printer, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Floor {
  id: number;
  floor_code: string;
}

interface Apartment {
  id: number;
  apt_number: string;
  floor_id: number;
}

const SUBPARTS = [
  { code: '00', name: 'חלון מושלם' },
  { code: '01', name: 'משקוף' },
  { code: '02', name: 'כנפיים' },
  { code: '03', name: 'תריס גלילה' },
  { code: '04', name: 'מסילות' },
  { code: '05', name: 'ארגז' },
];

const Labels = () => {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [apartments, setApartments] = useState<Apartment[]>([]);
  
  // Filter state
  const [scope, setScope] = useState<'project' | 'floor' | 'apartment'>('project');
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [selectedApartment, setSelectedApartment] = useState<number | null>(null);
  const [autoDetect, setAutoDetect] = useState(true);
  const [selectedSubparts, setSelectedSubparts] = useState<string[]>([]);
  
  // Label mode (single selector)
  type LabelMode = 'load_roll_100x50' | 'load_a4_100x70' | 'install_a4_50x30' | 'install_two_up_roll' | 'apt_round_a4';
  const [mode, setMode] = useState<LabelMode>('load_roll_100x50');
  
  // Generated PDF URL and progress
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, percent: 0, status: 'idle' });
  const [currentJobId, setCurrentJobId] = useState<number | null>(null);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
      } else {
        loadData();
      }
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate, projectId]);

  const loadData = async () => {
    try {
      // Load floors
      const { data: floorsData, error: floorsError } = await supabase
        .from('floors')
        .select('id, floor_code')
        .eq('project_id', parseInt(projectId!))
        .order('floor_code');

      if (floorsError) throw floorsError;
      setFloors(floorsData || []);

      // Load apartments
      const { data: aptsData, error: aptsError } = await supabase
        .from('apartments')
        .select('id, apt_number, floor_id')
        .eq('project_id', parseInt(projectId!))
        .order('apt_number');

      if (aptsError) throw aptsError;
      setApartments(aptsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('שגיאה בטעינת נתונים');
    } finally {
      setLoading(false);
    }
  };

  const handleSubpartToggle = (code: string) => {
    setSelectedSubparts(prev =>
      prev.includes(code)
        ? prev.filter(c => c !== code)
        : [...prev, code]
    );
  };

  const handleGenerate = async () => {
    // Apartment sticker mode - separate flow
    if (mode === 'apt_round_a4') {
      await handleGenerateAptStickers();
      return;
    }

    if (!autoDetect && selectedSubparts.length === 0) {
      toast.error('יש לבחור לפחות חלק אחד או להשתמש בזיהוי אוטומטי');
      return;
    }

    let ids: number[] = [];
    
    if (scope === 'floor' && selectedFloor) {
      ids = [selectedFloor];
    } else if (scope === 'apartment' && selectedApartment) {
      ids = [selectedApartment];
    } else if (scope === 'project') {
      ids = [];
    } else {
      toast.error('יש לבחור קומה או דירה');
      return;
    }

    setGenerating(true);
    setPdfUrl(null);
    setProgress({ done: 0, total: 0, percent: 0, status: 'running' });
    setCurrentJobId(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      console.log('Starting label generation job...', { mode });
      const startResponse = await supabase.functions.invoke('labels-generate-start', {
        body: {
          projectId: parseInt(projectId!),
          scope,
          ids,
          subparts: autoDetect ? [] : selectedSubparts,
          clientOrigin: window.location.origin,
          mode,
        },
      });

      if (startResponse.error) throw startResponse.error;
      if (!startResponse.data?.success) {
        throw new Error(startResponse.data?.error || 'Failed to start job');
      }

      const { jobId, total, filePath } = startResponse.data;

      if (!jobId || total === 0) {
        toast.info(startResponse.data.message || 'לא נמצאו פריטים להדפסה');
        setGenerating(false);
        setProgress({ done: 0, total: 0, percent: 0, status: 'idle' });
        return;
      }

      setCurrentJobId(jobId);
      setProgress({ done: 0, total, percent: 0, status: 'running' });

      const channel = supabase
        .channel('label_jobs')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'label_jobs',
          filter: `id=eq.${jobId}`
        }, (payload) => {
          const { done, total: jobTotal } = payload.new as any;
          const percent = Math.round((done / jobTotal) * 100);
          setProgress({ done, total: jobTotal, percent, status: 'running' });
        })
        .subscribe();

      const chunkSize = 50;

      while (true) {
        const chunkResponse = await supabase.functions.invoke('labels-generate-chunk', {
          body: { jobId, chunkSize },
        });

        if (chunkResponse.error) throw chunkResponse.error;
        if (!chunkResponse.data?.success) {
          throw new Error(chunkResponse.data?.error || 'Chunk processing failed');
        }

        const { remaining, done, total: jobTotal, status } = chunkResponse.data;
        const percent = Math.round((done / jobTotal) * 100);
        setProgress({ done, total: jobTotal, percent, status });

        if (status === 'done' || remaining === 0) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }

      supabase.removeChannel(channel);

      const { data: jobData, error: jobDataError } = await supabase
        .from('label_jobs')
        .select('pdf_path, status')
        .eq('id', jobId)
        .single();

      if (jobDataError || !jobData?.pdf_path) {
        toast.error('שגיאה בטעינת נתוני העבודה');
        setGenerating(false);
        return;
      }

      const { data: signedData, error: signedError } = await supabase.storage
        .from('labels')
        .createSignedUrl(jobData.pdf_path, 3600);

      if (signedError || !signedData?.signedUrl) {
        toast.error('שגיאה ביצירת קישור להורדה');
        setGenerating(false);
        return;
      }

      setPdfUrl(signedData.signedUrl);
      toast.success(`נוצרו ${total} תוויות בהצלחה`);
      setGenerating(false);
      
    } catch (error) {
      if (currentJobId) {
        const channel = supabase.channel('label_jobs');
        supabase.removeChannel(channel);
      }
      console.error('Error generating labels:', error);
      toast.error('שגיאה ביצירת התוויות');
      setGenerating(false);
      setProgress({ done: 0, total: 0, percent: 0, status: 'error' });
    }
  };

  const handleGenerateAptStickers = async () => {
    setGenerating(true);
    setPdfUrl(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('apt-stickers-generate', {
        body: {
          projectId: parseInt(projectId!),
          scope: scope === 'floor' ? 'floor' : 'project',
          floorId: scope === 'floor' ? selectedFloor : undefined,
          clientOrigin: window.location.origin,
        },
      });

      if (response.error) throw response.error;
      if (!response.data?.success) {
        throw new Error(response.data?.error || response.data?.message || 'Failed');
      }

      if (response.data.total === 0) {
        toast.info(response.data.message || 'לא נמצאו דירות');
        setGenerating(false);
        return;
      }

      if (response.data.signedUrl) {
        setPdfUrl(response.data.signedUrl);
        toast.success(`נוצרו ${response.data.total} מדבקות דירה על ${response.data.pages} דפים`);
      } else {
        // Fetch signed URL
        const { data: signedData } = await supabase.storage
          .from('labels')
          .createSignedUrl(response.data.pdfPath, 3600);
        if (signedData?.signedUrl) {
          setPdfUrl(signedData.signedUrl);
          toast.success(`נוצרו ${response.data.total} מדבקות דירה`);
        }
      }
    } catch (error) {
      console.error('Error generating apt stickers:', error);
      toast.error('שגיאה ביצירת מדבקות דירה');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateCalibration = () => {
    // Generate calibration grid matching new label sizes
    const canvas = document.createElement('canvas');
    const dpi = 300; // 300 DPI for high quality print
    const mmToPx = (mm: number) => (mm / 25.4) * dpi;
    
    // A4 portrait
    canvas.width = mmToPx(210);
    canvas.height = mmToPx(297);
    const ctx = canvas.getContext('2d')!;
    
    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Big labels (100×70mm, 2×4 grid = 8 labels, margins: 5mm side, 8.5mm top/bottom)
    const bigW = mmToPx(100);
    const bigH = mmToPx(70);
    const bigCols = 2;
    const bigRows = 4;
    const bigMarginX = mmToPx(5);
    const bigMarginY = mmToPx(8.5);
    
    // Small labels (50×30mm, 3×9 grid = 27 labels, 5mm horizontal gutter, 2mm vertical gutter)
    const smallW = mmToPx(50);
    const smallH = mmToPx(30);
    const smallCols = 3;
    const smallRows = 9;
    const smallGutterX = mmToPx(5);
    const smallGutterY = mmToPx(2);
    
    // Select which grid to draw - skip calibration for roll format
    if (mode === 'load_roll_100x50' || mode === 'install_two_up_roll') {
      toast.info('כיול לא נדרש עבור מדפסת גליל');
      return;
    }
    const variant = mode === 'install_a4_50x30' ? 'small' : 'big';
    
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    
    if (variant === 'big') {
      // Big labels: exact positioning with no gutters
      const x0 = bigMarginX;
      const yTop = bigMarginY;
      
      for (let r = 0; r < bigRows; r++) {
        for (let c = 0; c < bigCols; c++) {
          const x = x0 + c * bigW;
          const y = yTop + r * bigH;
          
          ctx.strokeRect(x, y, bigW, bigH);
          
          // Add label number
          ctx.fillStyle = '#000000';
          ctx.font = '24px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${r * bigCols + c + 1}`, x + bigW / 2, y + bigH / 2);
        }
      }
    } else {
      // Small labels: centered grid with gutters
      const margin = mmToPx(5);
      const gridW = smallCols * smallW + (smallCols - 1) * smallGutterX;
      const gridH = smallRows * smallH + (smallRows - 1) * smallGutterY;
      const contentW = canvas.width - (margin * 2);
      const contentH = canvas.height - (margin * 2);
      const x0 = margin + Math.max(0, (contentW - gridW) / 2);
      const yTop = margin;
      
      for (let r = 0; r < smallRows; r++) {
        for (let c = 0; c < smallCols; c++) {
          const x = x0 + c * (smallW + smallGutterX);
          const y = yTop + r * (smallH + smallGutterY);
          
          ctx.strokeRect(x, y, smallW, smallH);
          
          // Add label number
          ctx.fillStyle = '#000000';
          ctx.font = '20px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${r * smallCols + c + 1}`, x + smallW / 2, y + smallH / 2);
        }
      }
    }
    
    // Convert to blob and download
    canvas.toBlob((blob) => {
      if (blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const cols = variant === 'big' ? bigCols : smallCols;
        const rows = variant === 'big' ? bigRows : smallRows;
        link.download = `calibration-${variant}-${cols}x${rows}.png`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success('דף כיול הורד בהצלחה');
      }
    });
  };

  const filteredApartments = selectedFloor
    ? apartments.filter(apt => apt.floor_id === selectedFloor)
    : apartments;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted" dir="rtl">
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link to={`/projects/${projectId}`}>
              <Button variant="ghost" size="sm">
                <ArrowRight className="h-4 w-4 ml-2" />
                חזרה לפרויקט
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-primary">יצירת תוויות</h1>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-3">
              <Tag className="h-6 w-6" />
              הגדרות תוויות
            </CardTitle>
            <CardDescription>
              בחר את הפריטים וחלקי המשנה שברצונך להדפיס
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Label Mode Selection */}
            <div className="space-y-2">
              <Label>סוג תוויות</Label>
              <Select value={mode} onValueChange={(v: LabelMode) => setMode(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="load_roll_100x50">העמסה — מדפסת תוויות 100×50 מ״מ (גלילה)</SelectItem>
                  <SelectItem value="load_a4_100x70">העמסה — A4 (100×70 מ״מ × 8 בדף)</SelectItem>
                  <SelectItem value="install_a4_50x30">התקנה — A4 (50×30 מ״מ)</SelectItem>
                  <SelectItem value="install_two_up_roll">התקנה — מדפסת תוויות 2×4" (זוגי)</SelectItem>
                  <SelectItem value="apt_round_a4">🏠 מדבקות דירה — A4 (עגולות 4 ס״מ × 35 בדף)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Scope Selection */}
            <div className="space-y-2">
              <Label>היקף יצירה</Label>
              <Select value={scope} onValueChange={(v: any) => {
                setScope(v);
                setSelectedFloor(null);
                setSelectedApartment(null);
              }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="project">פרויקט שלם</SelectItem>
                  <SelectItem value="floor">קומה</SelectItem>
                  <SelectItem value="apartment">דירה</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Floor Selection */}
            {scope === 'floor' && (
              <div className="space-y-2">
                <Label>בחר קומה</Label>
                <Select value={selectedFloor?.toString()} onValueChange={(v) => setSelectedFloor(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר קומה" />
                  </SelectTrigger>
                  <SelectContent>
                    {floors.map(floor => (
                      <SelectItem key={floor.id} value={floor.id.toString()}>
                        קומה {floor.floor_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Apartment Selection */}
            {scope === 'apartment' && (
              <>
                <div className="space-y-2">
                  <Label>סנן לפי קומה (אופציונלי)</Label>
                  <Select value={selectedFloor?.toString() || 'all'} onValueChange={(v) => setSelectedFloor(v === 'all' ? null : parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue placeholder="כל הקומות" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">כל הקומות</SelectItem>
                      {floors.map(floor => (
                        <SelectItem key={floor.id} value={floor.id.toString()}>
                          קומה {floor.floor_code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>בחר דירה</Label>
                  <Select value={selectedApartment?.toString() || ''} onValueChange={(v) => v && setSelectedApartment(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue placeholder="בחר דירה" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredApartments.map(apt => (
                        <SelectItem key={apt.id} value={apt.id.toString()}>
                          דירה {apt.apt_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Subpart Selection - hidden for apt stickers */}
            {mode !== 'apt_round_a4' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>חלקי משנה</Label>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="auto-detect"
                    checked={autoDetect}
                    onCheckedChange={(checked) => {
                      setAutoDetect(checked === true);
                      if (checked) setSelectedSubparts([]);
                    }}
                  />
                  <label htmlFor="auto-detect" className="text-sm font-medium cursor-pointer">
                    זיהוי אוטומטי (מומלץ)
                  </label>
                </div>
              </div>
              {autoDetect && (
                <p className="text-sm text-muted-foreground">
                  המערכת תזהה אוטומטית אילו חלקים נדרשים לכל פריט לפי הקוד והמיקום
                </p>
              )}
              {!autoDetect && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {SUBPARTS.map(subpart => (
                    <div key={subpart.code} className="flex items-center space-x-2 space-x-reverse">
                      <Checkbox
                        id={`subpart-${subpart.code}`}
                        checked={selectedSubparts.includes(subpart.code)}
                        onCheckedChange={() => handleSubpartToggle(subpart.code)}
                      />
                      <Label
                        htmlFor={`subpart-${subpart.code}`}
                        className="text-sm font-normal cursor-pointer"
                      >
                        {subpart.code} - {subpart.name}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Apt stickers info */}
            {mode === 'apt_round_a4' && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="text-sm font-medium">🏠 מדבקות דירה עגולות</p>
                <p className="text-sm text-muted-foreground">
                  מדבקה אחת לכל דירה עם לוגו, QR ומספר דירה. 35 מדבקות בדף A4.
                  סריקת ה-QR מאפשרת אישור התקנה של פריטים בדירה.
                </p>
              </div>
            )}

            {/* Generate Button */}
            <div className="space-y-4">
              {generating && progress.total > 0 && (
                <div className="space-y-2">
                  <Progress value={progress.percent} className="w-full" />
                  <p className="text-sm text-center text-muted-foreground">
                    {progress.done} / {progress.total} תוויות ({progress.percent}%)
                  </p>
                </div>
              )}
              <div className="flex justify-end">
                <Button
                  onClick={handleGenerate}
                  disabled={generating || (mode !== 'apt_round_a4' && !autoDetect && selectedSubparts.length === 0)}
                  size="lg"
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                      יוצר...
                    </>
                  ) : (
                    <>
                      <Printer className="h-4 w-4 ml-2" />
                      צור תוויות
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calibration PDF Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-3">
              <Tag className="h-5 w-5" />
              דף כיול למדפסת
            </CardTitle>
            <CardDescription>
              הדפס דף בדיקה לוודא שהמדפסת מכוונת נכון להדבקת התוויות
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={handleGenerateCalibration}>
              <Download className="h-4 w-4 ml-2" />
              הורד דף כיול
            </Button>
          </CardContent>
        </Card>

        {/* PDF Download Card */}
        {pdfUrl && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-3">
                <Download className="h-5 w-5" />
                תוויות מוכנות להורדה
              </CardTitle>
            </CardHeader>
            <CardContent className="flex gap-3">
              <Button asChild>
                <a href={pdfUrl} download target="_blank" rel="noopener noreferrer">
                  <Download className="h-4 w-4 ml-2" />
                  הורד PDF
                </a>
              </Button>
              <Button variant="outline" asChild>
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                  <Printer className="h-4 w-4 ml-2" />
                  פתח להדפסה
                </a>
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Labels;
