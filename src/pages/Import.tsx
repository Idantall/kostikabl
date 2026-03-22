import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Upload, FileSpreadsheet, Loader2, Download, CheckCircle2, AlertCircle, Building2, Home, Package } from "lucide-react";
import { toast } from "sonner";
import { parseMeasurementExcel, MeasurementRow } from "@/lib/measurementParser";
import { parseExcelFile, ParsedApartment } from "@/lib/excelParser";
import { measurementRowsToBuildings, parsedApartmentsToBuildings } from "@/lib/excelToWizardState";
import { WizardBuilding } from "@/lib/wizardTypes";
import { ImportStageSelector, ImportStage } from "@/components/import/ImportStageSelector";
import { ImportStructureEditor } from "@/components/import/ImportStructureEditor";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from 'xlsx';

const Import = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  // Parsed data
  const [measurementRows, setMeasurementRows] = useState<MeasurementRow[] | null>(null);
  const [parsedApartments, setParsedApartments] = useState<ParsedApartment[] | null>(null);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  // Configuration
  const [projectName, setProjectName] = useState("");
  const [stage, setStage] = useState<ImportStage>('measurement');
  const [buildings, setBuildings] = useState<WizardBuilding[]>([]);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/login"); } else { setUserId(session.user.id); setLoading(false); }
    };
    checkUser();
  }, [navigate]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) { toast.error("יש להעלות קובץ Excel בלבד (.xlsx או .xls)"); return; }
    if (selectedFile.size > 20 * 1024 * 1024) { toast.error("גודל הקובץ חורג מ-20MB"); return; }

    setFile(selectedFile);
    setUploading(true);

    try {
      // Run both parsers in parallel
      const [measResult, excelResult] = await Promise.all([
        parseMeasurementExcel(selectedFile),
        parseExcelFile(selectedFile),
      ]);

      setMeasurementRows(measResult.rows);
      setParsedApartments(excelResult.apartments);
      setParseWarnings([...measResult.warnings, ...excelResult.warnings]);
      setParseErrors([...measResult.errors, ...excelResult.errors.map(e => e.details || e.reason)]);

      // Auto-set project name from file
      const baseName = selectedFile.name.replace(/\.(xlsx|xls)$/i, '');
      setProjectName(baseName);

      // Convert to building structure using measurement parser (richer data)
      if (measResult.rows.length > 0) {
        setBuildings(measurementRowsToBuildings(measResult.rows));
      } else if (excelResult.apartments.length > 0) {
        setBuildings(parsedApartmentsToBuildings(excelResult.apartments));
      }

      const totalRows = measResult.rows.length || excelResult.apartments.reduce((s, a) => s + a.items.length, 0);
      if (totalRows > 0) {
        toast.success(`נמצאו ${totalRows} שורות נתונים`);
      } else {
        toast.error("לא נמצאו נתונים תקינים בקובץ");
      }
    } catch (error: any) {
      toast.error(`שגיאה בעיבוד הקובץ: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setMeasurementRows(null);
    setParsedApartments(null);
    setParseWarnings([]);
    setParseErrors([]);
    setProjectName("");
    setBuildings([]);
  };

  // Statistics
  const totalFloors = buildings.reduce((s, b) => s + b.floors.length, 0);
  const totalApartments = buildings.reduce((s, b) => s + b.floors.reduce((fs, f) => fs + f.apartments.length, 0), 0);
  const totalRows = buildings.reduce((s, b) => s + b.floors.reduce((fs, f) => fs + f.apartments.reduce((as2, a) => as2 + a.rows.length, 0), 0), 0);
  const isMultiBuilding = buildings.length > 1;

  const canCreate = projectName.trim() && totalFloors > 0 && totalApartments > 0 && parseErrors.length === 0;

  const handleCreate = async () => {
    if (!canCreate || !userId) return;
    setCreating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('לא מחובר');

      // Upload Excel file to storage
      let sourceFilePath: string | null = null;
      if (file) {
        const sanitizedName = file.name
          .replace(/[\u200F\u200E\u202A-\u202E]/g, '')
          .replace(/[^\w\s.-]/g, '_')
          .replace(/\s+/g, '_')
          .replace(/_+/g, '_');

        // We'll set the path after we have a project ID — upload for first project
        sourceFilePath = `temp/${Date.now()}_${sanitizedName}`;
      }

      if (stage === 'active') {
        // Active stage: write to floors + apartments + items + labels
        await createActiveProject(session.user.id, sourceFilePath);
      } else {
        // Early stages: write to measurement_rows
        await createMeasurementProject(session.user.id, stage, sourceFilePath);
      }

      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['father-projects'] });
    } catch (error: any) {
      console.error('Create project error:', error);
      toast.error(`שגיאה ביצירת הפרויקט: ${error.message}`);
    } finally {
      setCreating(false);
    }
  };

  const uploadExcelToStorage = async (projectId: number) => {
    if (!file) return;
    const sanitizedName = file.name
      .replace(/[\u200F\u200E\u202A-\u202E]/g, '')
      .replace(/[^\w\s.-]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_');
    const filePath = `${projectId}/${Date.now()}_${sanitizedName}`;
    const { error } = await supabase.storage.from('measurement-excels').upload(filePath, file);
    if (!error) {
      await supabase.from('projects').update({ source_file_path: filePath }).eq('id', projectId);
    }
  };

  const createMeasurementProject = async (createdBy: string, projectStatus: string, _sourceFilePath: string | null) => {
    if (isMultiBuilding) {
      // Create father project
      const { data: father, error: fatherError } = await supabase
        .from('father_projects')
        .insert({ name: projectName, created_by: createdBy })
        .select().single();
      if (fatherError) throw fatherError;

      for (let bIdx = 0; bIdx < buildings.length; bIdx++) {
        const building = buildings[bIdx];
        const buildingName = `${projectName} - ${building.label}`;
        const { data: project, error: projectError } = await supabase
          .from('projects')
          .insert({ name: buildingName, created_by: createdBy, status: projectStatus })
          .select().single();
        if (projectError) throw projectError;

        const { error: linkError } = await supabase
          .from('father_project_buildings')
          .insert({ father_project_id: father.id, building_project_id: project.id, building_number: String(bIdx + 1) });
        if (linkError) throw linkError;

        await insertMeasurementRows(project.id, building.floors);
        await uploadExcelToStorage(project.id);
      }

      toast.success(`פרויקט אב "${projectName}" נוצר עם ${buildings.length} בניינים!`);
      navigate(`/father-projects/${father.id}`);
    } else {
      const building = buildings[0];
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({ name: projectName, created_by: createdBy, status: projectStatus })
        .select().single();
      if (projectError) throw projectError;

      await insertMeasurementRows(project.id, building.floors);
      await uploadExcelToStorage(project.id);

      toast.success('הפרויקט נוצר בהצלחה!');
      navigate(`/projects/${project.id}`);
    }
  };

  const createActiveProject = async (createdBy: string, _sourceFilePath: string | null) => {
    if (!parsedApartments || parsedApartments.length === 0) {
      throw new Error('אין נתוני דירות לייבוא פרויקט פעיל');
    }

    // For active projects, use the excelParser output directly (it has subpart_codes)
    // but structure from buildings (which user may have edited)
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({ name: projectName, created_by: createdBy, status: 'active' })
      .select().single();
    if (projectError) throw projectError;

    await uploadExcelToStorage(project.id);

    // Build from parsedApartments (which has subpart_codes for labels)
    for (const apt of parsedApartments) {
      let floor = await supabase.from('floors').select('id').eq('project_id', project.id).eq('floor_code', apt.floor_code).maybeSingle();
      if (!floor.data) {
        const { data: newFloor, error: floorError } = await supabase.from('floors').insert({ project_id: project.id, floor_code: apt.floor_code }).select().single();
        if (floorError) throw floorError;
        floor.data = newFloor;
      }

      let apartment = await supabase.from('apartments').select('id').eq('project_id', project.id).eq('floor_id', floor.data.id).eq('apt_number', apt.apt_number).maybeSingle();
      if (!apartment.data) {
        const { data: newApt, error: aptError } = await supabase.from('apartments').insert({ project_id: project.id, floor_id: floor.data.id, apt_number: apt.apt_number }).select().single();
        if (aptError) throw aptError;
        apartment.data = newApt;
      }

      const items = apt.items.map(item => ({
        project_id: project.id,
        floor_id: floor.data!.id,
        apt_id: apartment.data!.id,
        item_code: item.item_code,
        location: item.location || null,
        opening_no: item.opening_no || null,
        width: item.width || null,
        height: item.height || null,
        notes: item.notes || null,
        side_rl: item.side_rl,
        motor_side: item.motor_side,
        item_type: item.item_type || null,
        required_codes: item.subpart_codes.map(c => c === '0' ? '00' : c),
        status_cached: 'NOT_SCANNED',
      }));
      const { error: itemsError } = await supabase.from('items').insert(items);
      if (itemsError) throw itemsError;

      const { data: createdItems } = await supabase.from('items').select('id, item_code').eq('apt_id', apartment.data.id);
      if (createdItems) {
        for (const ci of createdItems) {
          const orig = apt.items.find(i => i.item_code === ci.item_code);
          if (!orig) continue;
          const labels = orig.subpart_codes.map(code => ({
            item_id: ci.id,
            subpart_code: code,
            qr_token_hash: `temp_${ci.id}_${code}_${Date.now()}`,
          }));
          await supabase.from('labels').insert(labels);
        }
      }
    }

    toast.success(`הפרויקט יובא בהצלחה!`);
    navigate(`/projects/${project.id}`);
  };

  const handleDownloadTemplate = () => {
    const exampleData = [
      ["פרויקט לדוגמה", "", "", "", "", "", ""],
      ["קומה: 2  דירה: 5", "", "", "", "", "", ""],
      ["", "", "", "", "", "", ""],
      ["מיקום בדירה", "מס' פתח", "מס' פרט", "גובה", "רוחב", "הערות", "צד"],
      ["סלון", "1", "ח-1", "120", "100", "חלון", "ימין"],
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(exampleData);
    XLSX.utils.book_append_sheet(wb, ws, "דירה 5");
    XLSX.writeFile(wb, "תבנית_ייבוא_פרויקט.xlsx");
    toast.success("התבנית הורדה בהצלחה");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const hasData = buildings.length > 0 && totalRows > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted" dir="rtl">
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link to="/projects">
              <Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4 ml-2" />חזרה לפרויקטים</Button>
            </Link>
            <h1 className="text-2xl font-bold text-primary">ייבוא פרויקט</h1>
          </div>
          {hasData && (
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="gap-2">
              <Download className="h-4 w-4" />הורד תבנית
            </Button>
          )}
        </div>
      </nav>

      <main className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
        {!hasData ? (
          <>
            {/* Mode cards */}
            <div className="grid md:grid-cols-2 gap-6">
              <Link to="/wizard">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full border-2 border-green-500/50 hover:border-green-500">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileSpreadsheet className="h-6 w-6 text-green-500" />
                      אשף יצירת פרויקט
                    </CardTitle>
                    <CardDescription>יצירת פרויקט ידנית ללא קובץ Excel</CardDescription>
                  </CardHeader>
                </Card>
              </Link>
              <label htmlFor="file-upload" className="cursor-pointer block">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full border-2 border-primary hover:border-primary/80">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Upload className="h-6 w-6 text-primary" />
                      ייבוא מ-Excel
                    </CardTitle>
                    <CardDescription>העלה קובץ Excel ובחר שלב פרויקט</CardDescription>
                  </CardHeader>
                </Card>
              </label>
            </div>

            {/* Upload area */}
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">העלאת קובץ Excel</CardTitle>
                    <CardDescription>העלה קובץ Excel עם נתוני פרויקט. ניתן יהיה לבחור שלב ולערוך את המבנה לפני יצירה.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="gap-2">
                    <Download className="h-4 w-4" />הורד תבנית
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <label htmlFor="file-upload" className="cursor-pointer">
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
                  <input id="file-upload" type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                </label>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            {/* Warnings */}
            {parseWarnings.length > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc list-inside text-sm">
                    {parseWarnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                    {parseWarnings.length > 5 && <li>ועוד {parseWarnings.length - 5} אזהרות...</li>}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {parseErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <ul className="list-disc list-inside text-sm">
                    {parseErrors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Project name */}
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label className="text-base font-semibold">שם הפרויקט</Label>
                  <Input
                    value={projectName}
                    onChange={e => setProjectName(e.target.value)}
                    className="text-lg"
                    placeholder="הזן שם לפרויקט"
                    dir="rtl"
                  />
                </div>

                <ImportStageSelector value={stage} onChange={setStage} />
              </CardContent>
            </Card>

            {/* Summary stats */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {isMultiBuilding && (
                    <div className="bg-muted rounded-lg p-4 text-center">
                      <Building2 className="h-5 w-5 mx-auto mb-1 text-primary" />
                      <div className="text-2xl font-bold">{buildings.length}</div>
                      <div className="text-xs text-muted-foreground">בניינים</div>
                    </div>
                  )}
                  <div className="bg-muted rounded-lg p-4 text-center">
                    <Building2 className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <div className="text-2xl font-bold">{totalFloors}</div>
                    <div className="text-xs text-muted-foreground">קומות</div>
                  </div>
                  <div className="bg-muted rounded-lg p-4 text-center">
                    <Home className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <div className="text-2xl font-bold">{totalApartments}</div>
                    <div className="text-xs text-muted-foreground">דירות</div>
                  </div>
                  <div className="bg-muted rounded-lg p-4 text-center">
                    <Package className="h-5 w-5 mx-auto mb-1 text-primary" />
                    <div className="text-2xl font-bold">{totalRows}</div>
                    <div className="text-xs text-muted-foreground">שורות</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Structure editor */}
            <ImportStructureEditor buildings={buildings} onBuildingsChange={setBuildings} />

            {/* Actions */}
            <div className="flex gap-3 sticky bottom-4 bg-card/95 backdrop-blur rounded-lg p-4 border shadow-lg">
              <Button
                className="flex-1"
                size="lg"
                onClick={handleCreate}
                disabled={!canCreate || creating}
              >
                {creating ? (
                  <><Loader2 className="h-4 w-4 ml-2 animate-spin" />יוצר פרויקט...</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 ml-2" />{isMultiBuilding ? 'צור פרויקט אב' : 'צור פרויקט'}</>
                )}
              </Button>
              <Button variant="outline" onClick={handleReset} disabled={creating}>
                התחל מחדש
              </Button>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

// Helper to insert measurement rows for a set of floors into a project
async function insertMeasurementRows(projectId: number, floors: any[]) {
  const rows: any[] = [];
  floors.forEach(floor => {
    floor.apartments.forEach((apt: any) => {
      apt.rows.forEach((row: any) => {
        rows.push({
          project_id: projectId,
          floor_label: floor.label.replace('קומה ', ''),
          apartment_label: apt.label.replace('דירה ', ''),
          sheet_name: `${floor.label}_${apt.label}`,
          location_in_apartment: row.location_in_apartment,
          opening_no: String(row.opening_no),
          item_code: row.item_code,
          height: row.height,
          width: row.width,
          notes: row.notes,
          contract_item: row.contract_item,
          hinge_direction: row.hinge_direction,
          mamad: row.mamad,
          glyph: row.glyph,
          jamb_height: row.jamb_height,
          depth: row.depth,
          is_manual: row.is_manual || false,
          engine_side: row.engine_side === 'ימין' ? 'R' : row.engine_side === 'שמאל' ? 'L' : row.engine_side || null,
          field_notes: row.field_notes || null,
          internal_wing: row.internal_wing || null,
        });
      });
    });
  });

  if (rows.length > 0) {
    // Insert in batches of 100
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const { error } = await supabase.from('measurement_rows').insert(batch);
      if (error) throw error;
    }
  }
}

export default Import;
