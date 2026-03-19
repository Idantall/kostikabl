import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Ruler, PlayCircle, Factory, Lock, ArrowRight, CheckCircle2, AlertCircle, ExternalLink, FileText, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

interface ProjectStatusActionsProps {
  project: {
    id: number;
    name: string;
    status: string;
    measurement_rule?: string | null;
    source_measurement_project_id?: number | null;
    production_batch_label?: string | null;
  };
  onStatusChange?: () => void;
}

interface FloorExport {
  floor_label: string;
  running_project_id: number;
  exported_at: string;
}

interface FloorInfo {
  label: string;
  isLocked: boolean;
  exportedTo?: number;
}

export function ProjectStatusActions({ project, onStatusChange }: ProjectStatusActionsProps) {
  const navigate = useNavigate();
  
  // Convert to Measurement dialog
  const [showConvertDialog, setShowConvertDialog] = useState(false);
  const [measurementRule, setMeasurementRule] = useState<'baranovitz' | 'conventional'>('conventional');
  const [converting, setConverting] = useState(false);
  
  // Export to Production dialog (measurement projects)
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [availableFloors, setAvailableFloors] = useState<FloorInfo[]>([]);
  const [startFloor, setStartFloor] = useState<string>('');
  const [endFloor, setEndFloor] = useState<string>('');
  const [loadingFloors, setLoadingFloors] = useState(false);

  // Export to Purchasing dialog (blind_jambs projects)
  const [showPurchasingExportDialog, setShowPurchasingExportDialog] = useState(false);
  const [purchasingExporting, setPurchasingExporting] = useState(false);
  const [purchasingFloors, setPurchasingFloors] = useState<FloorInfo[]>([]);
  const [purchasingStartFloor, setPurchasingStartFloor] = useState<string>('');
  const [purchasingEndFloor, setPurchasingEndFloor] = useState<string>('');
  const [loadingPurchasingFloors, setLoadingPurchasingFloors] = useState(false);
  
  // Result dialog
  const [showResultDialog, setShowResultDialog] = useState(false);
  const [exportResult, setExportResult] = useState<{ id: number; name: string } | null>(null);

  // Load floor info when export dialog opens (measurement)
  useEffect(() => {
    if (showExportDialog && project.status === 'measurement') {
      loadFloorInfo();
    }
  }, [showExportDialog, project.id]);

  // Load floor info when purchasing export dialog opens (blind_jambs)
  useEffect(() => {
    if ((showPurchasingExportDialog || project.status === 'blind_jambs') && (project.status === 'blind_jambs')) {
      loadPurchasingFloorInfo();
    }
  }, [showPurchasingExportDialog, project.id, project.status]);

  const loadFloorInfo = async () => {
    setLoadingFloors(true);
    try {
      // Get all unique floor labels from measurement_rows
      const { data: rows, error: rowsError } = await supabase
        .from('measurement_rows')
        .select('floor_label')
        .eq('project_id', project.id);

      if (rowsError) throw rowsError;

      const uniqueFloors = [...new Set((rows || []).map(r => r.floor_label).filter(Boolean) as string[])];
      
      // Get existing exports
      const { data: exports, error: exportsError } = await supabase
        .from('measurement_floor_exports')
        .select('floor_label, running_project_id')
        .eq('measurement_project_id', project.id);

      if (exportsError) throw exportsError;

      const exportMap = new Map<string, number>();
      (exports || []).forEach(e => {
        exportMap.set(e.floor_label, e.running_project_id);
      });

      // Sort floors: קרקע/לובי come first (as floor 0), then numeric order
      // Handles Hebrew-style negative floors like "1-", "2-", "3-" (minus suffix)
      const getFloorSortOrder = (label: string): number => {
        const lower = label.toLowerCase();
        // Ground floor / lobby should come before floor 1
        if (lower.includes('קרקע') || lower.includes('לובי') || lower.includes('lobby') || lower.includes('ground')) {
          return 0;
        }
        // Check for Hebrew-style negative: "1-", "2-", "3-" (number followed by minus)
        const negMatch = label.match(/^(\d+)\s*-$/);
        if (negMatch) {
          return -parseInt(negMatch[1]);
        }
        // Standard negative: "-1", "-2", "-3"
        const match = label.match(/(-?\d+)/);
        return match ? parseInt(match[1]) : 999;
      };

      const sortedFloors = uniqueFloors
        .map(label => {
          const num = getFloorSortOrder(label);
          return { label, num, isLocked: exportMap.has(label), exportedTo: exportMap.get(label) };
        })
        .sort((a, b) => a.num - b.num);

      setAvailableFloors(sortedFloors);
      
      // Set default selection to first non-locked floor
      const firstUnlocked = sortedFloors.find(f => !f.isLocked);
      if (firstUnlocked) {
        setStartFloor(firstUnlocked.label);
        setEndFloor(firstUnlocked.label);
      }
    } catch (error: any) {
      console.error('Error loading floor info:', error);
      toast.error('שגיאה בטעינת נתוני קומות');
    } finally {
      setLoadingFloors(false);
    }
  };

  const loadPurchasingFloorInfo = async () => {
    setLoadingPurchasingFloors(true);
    try {
      const { data: rows, error: rowsError } = await supabase
        .from('measurement_rows')
        .select('floor_label')
        .eq('project_id', project.id);

      if (rowsError) throw rowsError;

      const uniqueFloors = [...new Set((rows || []).map(r => r.floor_label).filter(Boolean) as string[])];
      
      const { data: exports, error: exportsError } = await supabase
        .from('measurement_floor_exports')
        .select('floor_label, running_project_id')
        .eq('measurement_project_id', project.id);

      if (exportsError) throw exportsError;

      const exportMap = new Map<string, number>();
      (exports || []).forEach(e => {
        exportMap.set(e.floor_label, e.running_project_id);
      });

      const getFloorSortOrder = (label: string): number => {
        const lower = label.toLowerCase();
        if (lower.includes('קרקע') || lower.includes('לובי') || lower.includes('lobby') || lower.includes('ground')) return 0;
        const negMatch = label.match(/^(\d+)\s*-$/);
        if (negMatch) return -parseInt(negMatch[1]);
        const match = label.match(/(-?\d+)/);
        return match ? parseInt(match[1]) : 999;
      };

      const sortedFloors = uniqueFloors
        .map(label => ({
          label,
          num: getFloorSortOrder(label),
          isLocked: exportMap.has(label),
          exportedTo: exportMap.get(label),
        }))
        .sort((a, b) => a.num - b.num);

      setPurchasingFloors(sortedFloors);
      
      const firstUnlocked = sortedFloors.find(f => !f.isLocked);
      if (firstUnlocked) {
        setPurchasingStartFloor(firstUnlocked.label);
        setPurchasingEndFloor(firstUnlocked.label);
      }
    } catch (error: any) {
      console.error('Error loading floor info:', error);
      toast.error('שגיאה בטעינת נתוני קומות');
    } finally {
      setLoadingPurchasingFloors(false);
    }
  };

  const handleConvertToMeasurement = async () => {
    setConverting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('לא מחובר');

      const response = await supabase.functions.invoke('blind-to-measurement', {
        body: { project_id: project.id, rule: measurementRule },
      });

      if (response.error) {
        throw new Error(response.error.message || 'שגיאה בהמרה');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      const { warnings } = response.data;
      
      if (warnings && warnings.length > 0) {
        toast.warning(`ההמרה הושלמה עם ${warnings.length} אזהרות`);
        console.log('Conversion warnings:', warnings);
      } else {
        toast.success('הפרויקט הומר למדידות בהצלחה!');
      }

      setShowConvertDialog(false);
      onStatusChange?.();
    } catch (error: any) {
      console.error('Convert error:', error);
      toast.error(`שגיאה בהמרה: ${error.message}`);
    } finally {
      setConverting(false);
    }
  };

  const handleExportToProduction = async () => {
    if (!startFloor || !endFloor) {
      toast.error('יש לבחור טווח קומות');
      return;
    }

    // Validate no locked floors in range
    const startIdx = availableFloors.findIndex(f => f.label === startFloor);
    const endIdx = availableFloors.findIndex(f => f.label === endFloor);
    
    if (startIdx > endIdx) {
      toast.error('קומת התחלה חייבת להיות לפני קומת סיום');
      return;
    }

    const floorsInRange = availableFloors.slice(startIdx, endIdx + 1);
    const lockedInRange = floorsInRange.filter(f => f.isLocked);
    
    if (lockedInRange.length > 0) {
      toast.error(`קומות אלו כבר נשלחו לייצור: ${lockedInRange.map(f => f.label).join(', ')}`);
      return;
    }

    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('לא מחובר');

      const response = await supabase.functions.invoke('measurement-export-to-running', {
        body: { 
          measurement_project_id: project.id, 
          start_floor_label: startFloor,
          end_floor_label: endFloor,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'שגיאה בייצוא');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      const { running_project_id, running_project_name } = response.data;
      
      toast.success('הקומות נשלחו לייצור בהצלחה!');
      setShowExportDialog(false);
      setExportResult({ id: running_project_id, name: running_project_name });
      setShowResultDialog(true);
      onStatusChange?.();
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error(`שגיאה בייצוא: ${error.message}`);
    } finally {
      setExporting(false);
    }
  };

  const handleExportToPurchasing = async () => {
    if (!purchasingStartFloor || !purchasingEndFloor) {
      toast.error('יש לבחור טווח קומות');
      return;
    }

    const startIdx = purchasingFloors.findIndex(f => f.label === purchasingStartFloor);
    const endIdx = purchasingFloors.findIndex(f => f.label === purchasingEndFloor);
    
    if (startIdx > endIdx) {
      toast.error('קומת התחלה חייבת להיות לפני קומת סיום');
      return;
    }

    const floorsInRange = purchasingFloors.slice(startIdx, endIdx + 1);
    const lockedInRange = floorsInRange.filter(f => f.isLocked);
    
    if (lockedInRange.length > 0) {
      toast.error(`קומות אלו כבר נשלחו לרכש: ${lockedInRange.map(f => f.label).join(', ')}`);
      return;
    }

    setPurchasingExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('לא מחובר');

      const response = await supabase.functions.invoke('blind-jambs-export-to-purchasing', {
        body: { 
          project_id: project.id, 
          start_floor_label: purchasingStartFloor,
          end_floor_label: purchasingEndFloor,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'שגיאה בייצוא');
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      const { purchasing_project_id, purchasing_project_name } = response.data;
      
      toast.success('הקומות נשלחו לרכש בהצלחה!');
      setShowPurchasingExportDialog(false);
      setExportResult({ id: purchasing_project_id, name: purchasing_project_name });
      setShowResultDialog(true);
      onStatusChange?.();
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error(`שגיאה בייצוא: ${error.message}`);
    } finally {
      setPurchasingExporting(false);
    }
  };


  const [convertingToBlindJambs, setConvertingToBlindJambs] = useState(false);

  const handleConvertToBlindJambs = async () => {
    setConvertingToBlindJambs(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({ status: 'blind_jambs' })
        .eq('id', project.id);
      if (error) throw error;
      toast.success('הפרויקט הומר למשקופים עיוורים בהצלחה!');
      onStatusChange?.();
    } catch (error: any) {
      console.error('Convert to blind_jambs error:', error);
      toast.error(`שגיאה בהמרה: ${error.message}`);
    } finally {
      setConvertingToBlindJambs(false);
    }
  };

  const getStatusInfo = () => {
    switch (project.status) {
      case 'pre_contract':
        return {
          label: 'טרום חוזה',
          variant: 'default' as const,
          icon: FileText,
          color: 'text-purple-600',
        };
      case 'blind_jambs':
        return {
          label: 'משקופים עיוורים',
          variant: 'secondary' as const,
          icon: Factory,
          color: 'text-amber-600',
        };
      case 'measurement':
        return {
          label: 'במדידות',
          variant: 'default' as const,
          icon: Ruler,
          color: 'text-blue-600',
        };
      case 'active':
        return {
          label: project.source_measurement_project_id ? 'פרויקט ריצה' : 'פעיל',
          variant: 'default' as const,
          icon: PlayCircle,
          color: 'text-green-600',
        };
      case 'purchasing':
        return {
          label: 'רכש',
          variant: 'default' as const,
          icon: ShoppingCart,
          color: 'text-orange-600',
        };
      default:
        return {
          label: project.status,
          variant: 'outline' as const,
          icon: CheckCircle2,
          color: 'text-muted-foreground',
        };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  // Determine available actions
  const unlockedFloors = availableFloors.filter(f => !f.isLocked);
  const lockedFloors = availableFloors.filter(f => f.isLocked);
  const unlockedPurchasingFloors = purchasingFloors.filter(f => !f.isLocked);
  const lockedPurchasingFloors = purchasingFloors.filter(f => f.isLocked);

  return (
    <>
      {/* Status Card */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <StatusIcon className={`h-5 w-5 ${statusInfo.color}`} />
              <div>
                <CardTitle className="text-lg">סטטוס פרויקט</CardTitle>
                <CardDescription>
                  {project.source_measurement_project_id && (
                    <span className="text-xs">
                      {project.production_batch_label}
                    </span>
                  )}
                </CardDescription>
              </div>
            </div>
            <Badge variant={statusInfo.variant} className="text-sm">
              {statusInfo.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {/* Pre-contract actions */}
          {project.status === 'pre_contract' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                הפרויקט בשלב טרום חוזה. לאחר סיום התכנון, המר למשקופים עיוורים.
              </p>
              <Button onClick={handleConvertToBlindJambs} disabled={convertingToBlindJambs} className="gap-2">
                {convertingToBlindJambs ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    ממיר...
                  </>
                ) : (
                  <>
                    <Factory className="h-4 w-4" />
                    המר למשקופים עיוורים
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Blind Jambs actions */}
          {project.status === 'blind_jambs' && (
            <div className="space-y-4">
              {/* Floor status overview */}
              {purchasingFloors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">סטטוס קומות</p>
                  <div className="flex flex-wrap gap-1.5">
                    {purchasingFloors.map(floor => (
                      <Badge 
                        key={floor.label} 
                        variant={floor.isLocked ? "default" : "outline"}
                        className={`text-xs ${floor.isLocked ? 'bg-green-600 hover:bg-green-600' : ''}`}
                      >
                        {floor.isLocked ? '✓' : '⏳'} {floor.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {lockedPurchasingFloors.length > 0 && (
                <Alert>
                  <Lock className="h-4 w-4" />
                  <AlertDescription>
                    קומות נעולות (נשלחו לרכש): {lockedPurchasingFloors.map(f => f.label).join(', ')}
                  </AlertDescription>
                </Alert>
              )}

              {/* Primary action: Send to purchasing */}
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  שלח קומות לרכש משקופים עיוורים.
                </p>
                <Button onClick={() => setShowPurchasingExportDialog(true)} className="gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  שלח לרכש (בחר קומות)
                </Button>
              </div>

              {/* Separator */}
              <div className="border-t pt-4 mt-4">
                <p className="text-sm text-muted-foreground mb-2">
                  לאחר סיום שלב המשקופים, המר את הפרויקט למדידות אלומיניום.
                  {lockedPurchasingFloors.length > 0 && (
                    <span className="block text-xs mt-1">
                      רק קומות שנשלחו לרכש יועברו למדידות.
                    </span>
                  )}
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => setShowConvertDialog(true)} 
                  className="gap-2"
                  disabled={lockedPurchasingFloors.length === 0}
                >
                  <Ruler className="h-4 w-4" />
                  המר למדידות אלומיניום
                </Button>
                {lockedPurchasingFloors.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    יש לשלוח לפחות קומה אחת לרכש לפני ההמרה
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Purchasing project info */}
          {project.status === 'purchasing' && project.source_measurement_project_id && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                זהו פרויקט רכש שנוצר מפרויקט משקופים.
              </p>
              <Button
                variant="outline"
                onClick={() => navigate(`/projects/${project.source_measurement_project_id}`)}
                className="gap-2"
              >
                <ArrowRight className="h-4 w-4" />
                עבור לפרויקט המשקופים המקורי
              </Button>
            </div>
          )}

          {/* Measurement actions */}
          {project.status === 'measurement' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                הפרויקט במצב מדידות. ניתן לשלוח קומות לייצור.
                {project.measurement_rule && (
                  <span className="block mt-1">
                    כלל מדידה: {project.measurement_rule === 'baranovitz' ? 'ברנוביץ' : 'קונבנציונלי'}
                  </span>
                )}
              </p>
              
              {lockedFloors.length > 0 && (
                <Alert>
                  <Lock className="h-4 w-4" />
                  <AlertDescription>
                    קומות נעולות (נשלחו לייצור): {lockedFloors.map(f => f.label).join(', ')}
                  </AlertDescription>
                </Alert>
              )}

              <Button onClick={() => setShowExportDialog(true)} className="gap-2">
                <Factory className="h-4 w-4" />
                שלח לייצור (בחר קומות)
              </Button>
            </div>
          )}

          {/* Active/Running project info */}
          {project.status === 'active' && project.source_measurement_project_id && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                זהו פרויקט ריצה שנוצר מפרויקט מדידות.
              </p>
              <Button
                variant="outline"
                onClick={() => navigate(`/projects/${project.source_measurement_project_id}`)}
                className="gap-2"
              >
                <ArrowRight className="h-4 w-4" />
                עבור לפרויקט המדידות המקורי
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Convert to Measurement Dialog */}
      <Dialog open={showConvertDialog} onOpenChange={setShowConvertDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>המרה למדידות אלומיניום</DialogTitle>
            <DialogDescription>
              בחר את כלל המדידה שיופעל על נתוני הפרויקט
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <RadioGroup
              value={measurementRule}
              onValueChange={(v) => setMeasurementRule(v as 'baranovitz' | 'conventional')}
              className="space-y-3"
            >
              <Label
                htmlFor="rule-baranovitz"
                className={`flex items-start gap-3 border rounded-lg p-4 cursor-pointer transition-colors ${
                  measurementRule === 'baranovitz' ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                }`}
              >
                <RadioGroupItem value="baranovitz" id="rule-baranovitz" className="mt-1" />
                <div>
                  <div className="font-medium">ברנוביץ</div>
                  <p className="text-sm text-muted-foreground">
                    דלתות: גובה = ריק
                    <br />
                    חלונות: ללא שינוי
                  </p>
                </div>
              </Label>

              <Label
                htmlFor="rule-conventional"
                className={`flex items-start gap-3 border rounded-lg p-4 cursor-pointer transition-colors ${
                  measurementRule === 'conventional' ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                }`}
              >
                <RadioGroupItem value="conventional" id="rule-conventional" className="mt-1" />
                <div>
                  <div className="font-medium">קונבנציונלי</div>
                  <p className="text-sm text-muted-foreground">
                    דלתות: גובה = ריק, רוחב -3 ס"מ
                    <br />
                    חלונות: גובה -3 ס"מ, רוחב -3 ס"מ
                  </p>
                </div>
              </Label>
            </RadioGroup>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvertDialog(false)}>
              ביטול
            </Button>
            <Button onClick={handleConvertToMeasurement} disabled={converting} className="gap-2">
              {converting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  ממיר...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  המר למדידות אלומיניום
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export to Production Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>שליחה לייצור</DialogTitle>
            <DialogDescription>
              בחר טווח קומות רציף לשליחה לייצור
            </DialogDescription>
          </DialogHeader>
          
          {loadingFloors ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {unlockedFloors.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    כל הקומות כבר נשלחו לייצור
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>מקומה</Label>
                      <Select value={startFloor} onValueChange={setStartFloor}>
                        <SelectTrigger>
                          <SelectValue placeholder="בחר קומה" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {availableFloors.map(floor => (
                            <SelectItem 
                              key={floor.label} 
                              value={floor.label}
                              disabled={floor.isLocked}
                            >
                              {floor.label}
                              {floor.isLocked && ' 🔒'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>עד קומה</Label>
                      <Select value={endFloor} onValueChange={setEndFloor}>
                        <SelectTrigger>
                          <SelectValue placeholder="בחר קומה" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {availableFloors.map(floor => (
                            <SelectItem 
                              key={floor.label} 
                              value={floor.label}
                              disabled={floor.isLocked}
                            >
                              {floor.label}
                              {floor.isLocked && ' 🔒'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {lockedFloors.length > 0 && (
                    <Alert>
                      <Lock className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        קומות נעולות: {lockedFloors.map(f => f.label).join(', ')}
                      </AlertDescription>
                    </Alert>
                  )}

                  <p className="text-sm text-muted-foreground">
                    ייווצר פרויקט ריצה חדש עם הקומות שנבחרו. הקומות יינעלו בפרויקט המדידות.
                  </p>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>
              ביטול
            </Button>
            <Button 
              onClick={handleExportToProduction} 
              disabled={exporting || unlockedFloors.length === 0}
              className="gap-2"
            >
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  שולח...
                </>
              ) : (
                <>
                  <Factory className="h-4 w-4" />
                  שלח לייצור
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export to Purchasing Dialog (blind_jambs) */}
      <Dialog open={showPurchasingExportDialog} onOpenChange={setShowPurchasingExportDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>שליחה לרכש</DialogTitle>
            <DialogDescription>
              בחר טווח קומות רציף לשליחה לרכש
            </DialogDescription>
          </DialogHeader>
          
          {loadingPurchasingFloors ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-4 py-4">
              {unlockedPurchasingFloors.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    כל הקומות כבר נשלחו לרכש
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>מקומה</Label>
                      <Select value={purchasingStartFloor} onValueChange={setPurchasingStartFloor}>
                        <SelectTrigger>
                          <SelectValue placeholder="בחר קומה" />
                        </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                          {purchasingFloors.map(floor => (
                            <SelectItem 
                              key={floor.label} 
                              value={floor.label}
                              disabled={floor.isLocked}
                            >
                              {floor.label}
                              {floor.isLocked && ' 🔒'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>עד קומה</Label>
                      <Select value={purchasingEndFloor} onValueChange={setPurchasingEndFloor}>
                        <SelectTrigger>
                          <SelectValue placeholder="בחר קומה" />
                        </SelectTrigger>
                        <SelectContent className="max-h-60 overflow-y-auto">
                          {purchasingFloors.map(floor => (
                            <SelectItem 
                              key={floor.label} 
                              value={floor.label}
                              disabled={floor.isLocked}
                            >
                              {floor.label}
                              {floor.isLocked && ' 🔒'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {lockedPurchasingFloors.length > 0 && (
                    <Alert>
                      <Lock className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        קומות נעולות: {lockedPurchasingFloors.map(f => f.label).join(', ')}
                      </AlertDescription>
                    </Alert>
                  )}

                  <p className="text-sm text-muted-foreground">
                    ייווצר פרויקט רכש חדש עם הקומות שנבחרו. הקומות יינעלו בפרויקט המשקופים.
                  </p>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPurchasingExportDialog(false)}>
              ביטול
            </Button>
            <Button 
              onClick={handleExportToPurchasing} 
              disabled={purchasingExporting || unlockedPurchasingFloors.length === 0}
              className="gap-2"
            >
              {purchasingExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  שולח...
                </>
              ) : (
                <>
                  <ShoppingCart className="h-4 w-4" />
                  שלח לרכש
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Result Dialog */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              הייצוא הושלם
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              נוצר פרויקט חדש:
            </p>
            <p className="font-medium">{exportResult?.name}</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResultDialog(false)}>
              הישאר כאן
            </Button>
            <Button 
              onClick={() => {
                setShowResultDialog(false);
                if (exportResult) {
                  navigate(`/projects/${exportResult.id}`);
                }
              }}
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              פתח פרויקט
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
