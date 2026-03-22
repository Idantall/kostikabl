import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Upload, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { parseMeasurementExcel, MeasurementRow as ParsedMeasurementRow } from "@/lib/measurementParser";
import { useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ImportMeasurement = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<{
    rows: ParsedMeasurementRow[];
    warnings: string[];
    errors: string[];
  } | null>(null);
  const [projectName, setProjectName] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
      } else {
        setUserId(session.user.id);
        setLoading(false);
      }
    };
    checkUser();
  }, [navigate]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
      toast.error("יש להעלות קובץ Excel בלבד (.xlsx או .xls)");
      return;
    }

    if (selectedFile.size > 20 * 1024 * 1024) {
      toast.error("גודל הקובץ חורג מ-20MB");
      return;
    }

    setFile(selectedFile);
    setUploading(true);

    try {
      const result = await parseMeasurementExcel(selectedFile);
      setParseResult(result);
      
      // Auto-set project name from file name
      const baseName = selectedFile.name.replace(/\.(xlsx|xls)$/i, '');
      setProjectName(baseName);

      if (result.rows.length === 0 && result.errors.length === 0) {
        toast.error("לא נמצאו נתונים תקינים בקובץ");
      } else if (result.errors.length > 0) {
        toast.error(`נמצאו ${result.errors.length} שגיאות`);
      } else {
        toast.success(`נמצאו ${result.rows.length} שורות מדידה`);
      }
    } catch (error: any) {
      toast.error(`שגיאה בעיבוד הקובץ: ${error.message}`);
      setParseResult(null);
    } finally {
      setUploading(false);
    }
  };

  const handleImport = async () => {
    if (!parseResult || !userId || !projectName.trim()) return;

    setImporting(true);
    try {
      // Create project with measurement status
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          name: projectName.trim(),
          created_by: userId,
          status: 'measurement'
        })
        .select()
        .single();

      if (projectError) throw projectError;

      // Upload original Excel to storage and update source_file_path
      let sourceFilePath: string | null = null;
      if (file) {
        // Sanitize filename: remove RTL markers, replace Hebrew with transliteration, keep only safe chars
        const sanitizedName = file.name
          .replace(/[\u200F\u200E\u202A-\u202E]/g, '') // Remove RTL/LTR markers
          .replace(/[^\w\s.-]/g, '_') // Replace non-ASCII with underscore
          .replace(/\s+/g, '_') // Replace spaces with underscore
          .replace(/_+/g, '_'); // Collapse multiple underscores
        const filePath = `${project.id}/${Date.now()}_${sanitizedName}`;
        const { error: uploadError } = await supabase.storage
          .from('measurement-excels')
          .upload(filePath, file);
        
        if (uploadError) {
          console.error("Failed to upload Excel:", uploadError);
          // Continue anyway, this is not critical
        } else {
          sourceFilePath = filePath;
          // Update project with source file path
          await supabase
            .from('projects')
            .update({ source_file_path: sourceFilePath })
            .eq('id', project.id);
        }
      }

      // Insert measurement rows
      const rowsToInsert = parseResult.rows.map(row => ({
        project_id: project.id,
        floor_label: row.floor_label,
        apartment_label: row.apartment_label,
        sheet_name: row.sheet_name,
        location_in_apartment: row.location_in_apartment,
        opening_no: row.opening_no,
        item_code: row.item_code,
        height: row.height,
        width: row.width,
        notes: row.notes,
        field_notes: row.field_notes,
        wall_thickness: row.wall_thickness,
        glyph: row.glyph,
        jamb_height: row.jamb_height,
        engine_side: row.engine_side,
        internal_wing: row.internal_wing,
      }));

      // Insert in batches of 100
      for (let i = 0; i < rowsToInsert.length; i += 100) {
        const batch = rowsToInsert.slice(i, i + 100);
        const { error: insertError } = await supabase
          .from('measurement_rows')
          .insert(batch);
        
        if (insertError) throw insertError;
      }

      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('הפרויקט נוצר בהצלחה במצב מדידות');
      
      setTimeout(() => {
        navigate(`/projects/${project.id}`);
      }, 1000);

    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(`שגיאה בייבוא: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted" dir="rtl">
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/import">
            <Button variant="ghost" size="sm">
              <ArrowRight className="h-4 w-4 ml-2" />
              חזרה
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-primary">ייבוא פרויקט מדידות</h1>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {!parseResult ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">העלאת תיק מדידות</CardTitle>
              <CardDescription>
                העלה קובץ Excel עם נתוני מדידות ראשוניים. ניתן יהיה לערוך את הנתונים באפליקציה.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <label htmlFor="measurement-file-upload" className="cursor-pointer">
                <div className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary transition-colors">
                  {uploading ? (
                    <>
                      <Loader2 className="h-12 w-12 mx-auto mb-4 text-primary animate-spin" />
                      <h3 className="text-lg font-semibold mb-2">מעבד קובץ...</h3>
                    </>
                  ) : (
                    <>
                      <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-semibold mb-2">גרור קובץ לכאן</h3>
                      <p className="text-muted-foreground mb-4">או לחץ לבחירה מהמחשב</p>
                      <Button variant="outline" type="button">בחר קובץ</Button>
                    </>
                  )}
                </div>
                <input
                  id="measurement-file-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>

              <div className="mt-6 p-4 bg-muted rounded-lg">
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5" />
                  מבנה קובץ מדידות
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  <li>כל גיליון מייצג דירה</li>
                  <li>שורת כותרת חייבת להכיל "מיקום בדירה"</li>
                  <li>עמודות נתמכות: מיקום בדירה, מס' פתח, מס' פרט, גובה, רוחב, הערות, הערות מהשטח, צד מנוע</li>
                  <li>פרטי קומה ודירה נשלפים מהשורות הראשונות או משם הגיליון</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Errors */}
            {parseResult.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>שגיאות</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside">
                    {parseResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Warnings */}
            {parseResult.warnings.length > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>אזהרות</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside">
                    {parseResult.warnings.map((warn, i) => (
                      <li key={i}>{warn}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  סיכום נתונים
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-3xl font-bold text-primary">{parseResult.rows.length}</div>
                    <div className="text-sm text-muted-foreground">שורות</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-primary">
                      {new Set(parseResult.rows.map(r => r.floor_label).filter(Boolean)).size}
                    </div>
                    <div className="text-sm text-muted-foreground">קומות</div>
                  </div>
                  <div>
                    <div className="text-3xl font-bold text-primary">
                      {new Set(parseResult.rows.map(r => r.apartment_label).filter(Boolean)).size}
                    </div>
                    <div className="text-sm text-muted-foreground">דירות</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Project Name */}
            <Card>
              <CardHeader>
                <CardTitle>שם הפרויקט</CardTitle>
              </CardHeader>
              <CardContent>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full p-3 border rounded-lg text-lg"
                  placeholder="הזן שם לפרויקט"
                  dir="rtl"
                />
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                className="flex-1"
                onClick={handleImport}
                disabled={importing || parseResult.rows.length === 0 || !projectName.trim() || parseResult.errors.length > 0}
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    יוצר פרויקט...
                  </>
                ) : (
                  'צור פרויקט במצב מדידות'
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setParseResult(null);
                  setFile(null);
                  setProjectName("");
                }}
                disabled={importing}
              >
                בטל
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ImportMeasurement;
