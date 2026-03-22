import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWizard } from './WizardContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, CheckCircle2, AlertCircle, Building2, Home, Package, Loader2, FileSpreadsheet, Factory, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

export function WizardStepReview() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state, dispatch, deleteDraft } = useWizard();
  const { name, bankItems, buildings, draftId, projectType, contractPdfPath, contractParseResult } = state;
  
  const [isCreating, setIsCreating] = useState(false);

  const isMultiBuilding = buildings.length > 1;

  // Calculate statistics
  const totalFloors = buildings.reduce((sum, b) => sum + b.floors.length, 0);
  const totalApartments = buildings.reduce(
    (sum, b) => sum + b.floors.reduce((fSum, f) => fSum + f.apartments.length, 0), 0
  );
  const totalRows = buildings.reduce(
    (sum, b) => sum + b.floors.reduce(
      (fSum, f) => fSum + f.apartments.reduce((aSum, a) => aSum + a.rows.length, 0), 0
    ), 0
  );

  // Validation
  const issues: string[] = [];
  if (!name.trim()) issues.push('שם הפרויקט חסר');
  if (bankItems.length === 0) issues.push('בנק הפרטים ריק');
  if (totalFloors === 0) issues.push('אין קומות');
  if (totalApartments === 0) issues.push('אין דירות');

  let incompleteRows = 0;
  buildings.forEach(b => {
    b.floors.forEach(floor => {
      floor.apartments.forEach(apt => {
        apt.rows.forEach(row => {
          if (!row.item_code) incompleteRows++;
        });
      });
    });
  });
  if (incompleteRows > 0) issues.push(`${incompleteRows} שורות ללא פרט נבחר`);

  const handleBack = () => { dispatch({ type: 'SET_STEP', payload: 3 }); };

  const handleExportExcel = () => {
    const wb = XLSX.utils.book_new();
    buildings.forEach(building => {
      building.floors.forEach(floor => {
        floor.apartments.forEach(apt => {
          const prefix = isMultiBuilding ? `${building.label}_` : '';
          const sheetName = `${prefix}${floor.label}_${apt.label}`.substring(0, 31);
          const data = [
            [`פרויקט: ${name}${isMultiBuilding ? ` - ${building.label}` : ''}`],
            [`קומה: ${floor.label}  דירה: ${apt.label}`],
            [],
            ['מס\' פתח', 'מיקום בדירה', 'פרט חוזה', 'פרט משקופים', 'פרט יצור', 'גובה', 'רוחב', 'גובה מהריצוף', 'ממד כיס בצד', 'עומק עד הפריקסט', 'גליף', 'מדרגה בשיש', 'מנואלה', 'צד מנוע', 'הערות', 'כנף פנימית מבט פנים', 'ציר מבט פנים פתיחה פנימה', 'ציר מבט פנים פתיחה החוצה'],
            ...apt.rows.map(row => [
              row.opening_no, row.location_in_apartment || '', row.contract_item || '',
              '', row.item_code || '', row.height || '', row.width || '', row.notes || '',
              row.mamad || '', row.depth || '',
              row.glyph || '', row.jamb_height || '', row.is_manual ? 'מנואלה' : '',
              row.engine_side || '', row.field_notes || '', row.internal_wing || '',
              row.wing_position || '', row.wing_position_out || '',
            ]),
          ];
          const ws = XLSX.utils.aoa_to_sheet(data);
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });
      });
    });
    XLSX.writeFile(wb, `${name || 'project'}.xlsx`);
    toast.success('הקובץ הורד');
  };

  const handleCreate = async () => {
    if (issues.length > 0) { toast.error('יש לתקן את כל הבעיות לפני יצירת הפרויקט'); return; }
    setIsCreating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('לא מחובר');

      const projectStatus = projectType === 'pre_contract' ? 'pre_contract' : 'blind_jambs';

      if (isMultiBuilding) {
        // Create father project
        const { data: father, error: fatherError } = await supabase
          .from('father_projects')
          .insert({ name, created_by: session.user.id })
          .select()
          .single();
        if (fatherError) throw fatherError;

        // Create a project for each building
        for (let bIdx = 0; bIdx < buildings.length; bIdx++) {
          const building = buildings[bIdx];
          const buildingName = `${name} - ${building.label}`;

          const insertPayload: any = {
            name: buildingName,
            created_by: session.user.id,
            status: projectStatus,
          };

          if (projectType === 'pre_contract' && contractPdfPath) {
            insertPayload.contract_pdf_path = contractPdfPath;
            insertPayload.contract_uploaded_at = new Date().toISOString();
            if (contractParseResult) {
              insertPayload.contract_parsed_at = new Date().toISOString();
              insertPayload.contract_parse_method = contractParseResult.parse_method || 'ocr';
              insertPayload.contract_parse_result = contractParseResult;
              insertPayload.contract_parse_warnings = contractParseResult.warnings || [];
              insertPayload.contract_totals = contractParseResult.contractSummary || null;
            }
          }

          const { data: project, error: projectError } = await supabase
            .from('projects')
            .insert(insertPayload)
            .select()
            .single();
          if (projectError) throw projectError;

          // Link to father project
          const { error: linkError } = await supabase
            .from('father_project_buildings')
            .insert({
              father_project_id: father.id,
              building_project_id: project.id,
              building_number: String(bIdx + 1),
            });
          if (linkError) throw linkError;

          // Create measurement rows for this building
          await insertMeasurementRows(project.id, building.floors);
        }

        // Delete draft and navigate to father project
        if (draftId) await deleteDraft(draftId);
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        queryClient.invalidateQueries({ queryKey: ['father-projects'] });
        toast.success(`פרויקט אב "${name}" נוצר עם ${buildings.length} בניינים!`);
        navigate(`/father-projects/${father.id}`);

      } else {
        // Single building — create regular project (existing logic)
        const building = buildings[0];
        const insertPayload: any = {
          name,
          created_by: session.user.id,
          status: projectStatus,
        };

        if (projectType === 'pre_contract' && contractPdfPath) {
          insertPayload.contract_pdf_path = contractPdfPath;
          insertPayload.contract_uploaded_at = new Date().toISOString();
          if (contractParseResult) {
            insertPayload.contract_parsed_at = new Date().toISOString();
            insertPayload.contract_parse_method = contractParseResult.parse_method || 'ocr';
            insertPayload.contract_parse_result = contractParseResult;
            insertPayload.contract_parse_warnings = contractParseResult.warnings || [];
            insertPayload.contract_totals = contractParseResult.contractSummary || null;
          }
        }

        const { data: project, error: projectError } = await supabase
          .from('projects')
          .insert(insertPayload)
          .select()
          .single();
        if (projectError) throw projectError;

        await insertMeasurementRows(project.id, building.floors);

        if (draftId) await deleteDraft(draftId);
        queryClient.invalidateQueries({ queryKey: ['projects'] });
        toast.success('הפרויקט נוצר בהצלחה!');
        navigate(`/projects/${project.id}`);
      }
    } catch (error: any) {
      console.error('Create project error:', error);
      toast.error(`שגיאה ביצירת הפרויקט: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const isPreContract = projectType === 'pre_contract';

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">סיכום ויצירת פרויקט</CardTitle>
          <CardDescription>
            {isMultiBuilding
              ? `ייווצר פרויקט אב עם ${buildings.length} בניינים. כל בניין יהפוך לפרויקט עצמאי תחת פרויקט האב.`
              : isPreContract
                ? 'סקור את פרטי הפרויקט. הפרויקט ייוצר בשלב "טרום חוזה".'
                : 'סקור את פרטי הפרויקט. הפרויקט ייוצר בשלב "משקופים עיוורים".'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label className="text-muted-foreground">שם הפרויקט</Label>
              <p className="text-xl font-semibold">{name || '(לא הוזן)'}</p>
            </div>
            <div className="flex gap-2">
              {isMultiBuilding && <Badge variant="default">פרויקט אב</Badge>}
              <Badge variant={isPreContract ? 'default' : 'secondary'}>
                {isPreContract ? 'טרום חוזה' : 'משקופים עיוורים'}
              </Badge>
            </div>
          </div>

          {/* Per-building stats */}
          {isMultiBuilding && (
            <div className="space-y-2">
              <Label className="text-muted-foreground">בניינים</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {buildings.map(b => {
                  const bFloors = b.floors.length;
                  const bApts = b.floors.reduce((s, f) => s + f.apartments.length, 0);
                  const bRows = b.floors.reduce((s, f) => s + f.apartments.reduce((as2, a) => as2 + a.rows.length, 0), 0);
                  return (
                    <div key={b.id} className="bg-muted rounded-lg p-3 flex items-center justify-between">
                      <span className="font-medium">{b.label}</span>
                      <span className="text-sm text-muted-foreground">{bFloors} קומות · {bApts} דירות · {bRows} שורות</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {isMultiBuilding && (
              <div className="bg-muted rounded-lg p-4 text-center">
                <Building2 className="h-6 w-6 mx-auto mb-2 text-primary" />
                <div className="text-2xl font-bold">{buildings.length}</div>
                <div className="text-sm text-muted-foreground">בניינים</div>
              </div>
            )}
            <div className="bg-muted rounded-lg p-4 text-center">
              <Package className="h-6 w-6 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{bankItems.length}</div>
              <div className="text-sm text-muted-foreground">פרטים בבנק</div>
            </div>
            <div className="bg-muted rounded-lg p-4 text-center">
              <Building2 className="h-6 w-6 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{totalFloors}</div>
              <div className="text-sm text-muted-foreground">קומות</div>
            </div>
            <div className="bg-muted rounded-lg p-4 text-center">
              <Home className="h-6 w-6 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{totalApartments}</div>
              <div className="text-sm text-muted-foreground">דירות</div>
            </div>
            <div className="bg-muted rounded-lg p-4 text-center">
              <FileSpreadsheet className="h-6 w-6 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{totalRows}</div>
              <div className="text-sm text-muted-foreground">שורות</div>
            </div>
          </div>

          {isPreContract && contractPdfPath && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <span className="font-medium">חוזה PDF הועלה</span>
                <span className="text-sm text-muted-foreground mr-2">
                  ({contractParseResult?.bankItems?.length || 0} פרטים חולצו)
                </span>
              </div>
            </div>
          )}

          {issues.length > 0 ? (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-destructive mb-2">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">יש בעיות לתיקון:</span>
              </div>
              <ul className="list-disc list-inside text-sm text-destructive">
                {issues.map((issue, i) => <li key={i}>{issue}</li>)}
              </ul>
            </div>
          ) : (
            <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-5 w-5" />
              <span>הכל תקין! ניתן ליצור את הפרויקט</span>
            </div>
          )}

          <div className="bg-muted/50 border rounded-lg p-4">
            <div className="flex items-center gap-2 text-foreground mb-2">
              <Factory className="h-5 w-5" />
              <span className="font-medium">מחזור חיי הפרויקט</span>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              {isPreContract && <p>0. <strong>טרום חוזה</strong> - שלב תכנון עם חוזה (הנוכחי)</p>}
              <p>1. <strong>משקופים עיוורים</strong> - שלב תכנון ראשוני{!isPreContract && ' (הנוכחי)'}</p>
              <p>2. <strong>מדידות</strong> - עריכת נתונים לפי כלל ברנוביץ/קונבנציונלי</p>
              <p>3. <strong>ייצור</strong> - שליחת קומות לפרויקטי ריצה פעילים</p>
            </div>
          </div>

          <Button variant="outline" onClick={handleExportExcel} className="gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            ייצא ל-Excel
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={handleBack} className="gap-2">
          <ArrowRight className="h-4 w-4" />
          חזור
        </Button>
        <Button onClick={handleCreate} disabled={issues.length > 0 || isCreating} className="gap-2" size="lg">
          {isCreating ? (
            <><Loader2 className="h-4 w-4 animate-spin" />יוצר פרויקט...</>
          ) : (
            <><CheckCircle2 className="h-4 w-4" />{isMultiBuilding ? 'צור פרויקט אב' : 'צור פרויקט'}</>
          )}
        </Button>
      </div>
    </div>
  );
}

// Helper to insert measurement rows for a set of floors into a project
async function insertMeasurementRows(projectId: number, floors: any[]) {
  const measurementRows: any[] = [];
  floors.forEach(floor => {
    floor.apartments.forEach((apt: any) => {
      apt.rows.forEach((row: any) => {
        measurementRows.push({
          project_id: projectId,
          floor_label: floor.sourceFloorTypeName
            ? `${floor.label.replace('קומה ', '')} (טיפוס ${floor.sourceFloorTypeName})`
            : floor.label.replace('קומה ', ''),
          apartment_label: apt.label.replace('דירה ', ''),
          sheet_name: `${floor.label}_${apt.label}`,
          location_in_apartment: row.location_in_apartment,
          opening_no: String(row.opening_no),
          contract_item: row.contract_item,
          item_code: row.item_code,
          height: row.height,
          width: row.width,
          notes: row.notes,
          hinge_direction: row.hinge_direction,
          mamad: row.mamad,
          glyph: row.glyph,
          jamb_height: row.jamb_height,
          depth: row.depth,
          is_manual: row.is_manual || false,
          engine_side: row.engine_side === 'ימין' ? 'R' : row.engine_side === 'שמאל' ? 'L' : null,
          field_notes: row.field_notes,
          internal_wing: row.internal_wing,
          wing_position: row.wing_position,
          wing_position_out: row.wing_position_out,
        });
      });
    });
  });

  if (measurementRows.length > 0) {
    const { error } = await supabase.from('measurement_rows').insert(measurementRows);
    if (error) throw error;
  }
}
