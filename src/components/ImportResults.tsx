import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, Building, Home, Package, Download, XCircle } from "lucide-react";
import { ParsedApartment, ParseError } from "@/lib/excelParser";

interface ImportResultsProps {
  apartments: ParsedApartment[];
  errors: ParseError[];
  warnings: string[];
}

const ImportResults = ({ apartments, errors, warnings }: ImportResultsProps) => {
  const totalItems = apartments.reduce((sum, apt) => sum + apt.items.length, 0);
  const floors = new Set(apartments.map(apt => apt.floor_code)).size;
  
  const downloadErrorsCSV = () => {
    const csvContent = [
      'גיליון,שורה,מס\' פרט,הערות,שגיאה',
      ...errors.map((err) => {
        const details = err.details || err.reason;
        const itemCode = err.itemCode || '';
        const notesRaw = err.notesRaw || '';
        return `"${err.sheet}",${err.rowNumber},"${itemCode}","${notesRaw.replace(/"/g, '""')}","${details.replace(/"/g, '""')}"`;
      })
    ].join('\n');
    
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `import-errors-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };
  
  const downloadWarningsCSV = () => {
    const csvContent = [
      'שורה,אזהרה',
      ...warnings.map((warning, idx) => `${idx + 1},"${warning.replace(/"/g, '""')}"`)
    ].join('\n');
    
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `import-warnings-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };
  
  return (
    <div className="space-y-4">
      {/* Errors */}
      {errors.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 text-destructive" />
                שגיאות ({errors.length})
              </div>
              <Button onClick={downloadErrorsCSV} variant="outline" size="sm">
                <Download className="h-4 w-4 ml-2" />
                הורד CSV
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>לא ניתן לייבא</AlertTitle>
              <AlertDescription>
                נמצאו ערכים לא מזוהים בעמודת 'הערות'. יש לתקן את הערכים הבאים או להסירם מהקובץ ולנסות שוב.
              </AlertDescription>
            </Alert>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {errors.map((error, idx) => (
                <Alert key={idx} variant="destructive">
                  <AlertDescription>
                    <div className="font-medium">
                      גיליון "{error.sheet}"
                      {error.rowNumber > 0 && `, שורה ${error.rowNumber}`}
                    </div>
                    {error.itemCode && (
                      <div className="text-sm mt-1">
                        מס' פרט: <strong>{error.itemCode}</strong>
                        {error.notesRaw && ` | הערות: ${error.notesRaw}`}
                      </div>
                    )}
                    <div className="text-xs mt-1 opacity-80">
                      {error.details || (() => {
                        switch (error.reason) {
                          case "unknown-name":
                            return `הערך "${error.notesRaw}" לא מזוהה. ערכים תקינים: דלת, דלת מונובלוק, חלון, ממד, קיפ, חלון מונובלוק`;
                          case "no-subparts-detected":
                            return "לא זוהו חלקי משנה עבור פריט זה";
                          case "missing-required":
                            return "שדות חובה חסרים בשורה";
                          case "no-headers-found":
                            return "לא נמצאו כותרות תואמות בתבנית הקובץ";
                          default:
                            return error.reason;
                        }
                      })()}
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            סיכום ייבוא
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <Building className="h-8 w-8 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{floors}</div>
              <div className="text-sm text-muted-foreground">קומות</div>
            </div>
            <div className="text-center">
              <Home className="h-8 w-8 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{apartments.length}</div>
              <div className="text-sm text-muted-foreground">דירות</div>
            </div>
            <div className="text-center">
              <Package className="h-8 w-8 mx-auto mb-2 text-primary" />
              <div className="text-2xl font-bold">{totalItems}</div>
              <div className="text-sm text-muted-foreground">פריטים</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Warnings */}
      {warnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                אזהרות ({warnings.length})
              </div>
              <Button onClick={downloadWarningsCSV} variant="outline" size="sm">
                <Download className="h-4 w-4 ml-2" />
                הורד CSV
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {warnings.map((warning, idx) => (
                <Alert key={idx} variant="destructive">
                  <AlertDescription>{warning}</AlertDescription>
                </Alert>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Apartment Details */}
      <div className="space-y-3">
        {apartments.map((apt, idx) => (
          <Card key={idx}>
            <CardHeader>
              <CardTitle className="text-lg">
                קומה {apt.floor_code === '0' ? 'קרקע' : apt.floor_code}, דירה {apt.apt_number}
              </CardTitle>
              <CardDescription>{apt.items.length} פריטים</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {apt.items.slice(0, 5).map((item, itemIdx) => (
                  <div key={itemIdx} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div className="flex-1">
                      <div className="font-medium">{item.item_code}</div>
                      <div className="text-sm text-muted-foreground">
                        {item.location} {item.opening_no && `| פתח ${item.opening_no}`}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {item.subpart_codes.map(code => (
                        <Badge key={code} variant="secondary" className="text-xs">
                          {code}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
                {apt.items.length > 5 && (
                  <div className="text-sm text-muted-foreground text-center pt-2">
                    ועוד {apt.items.length - 5} פריטים...
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ImportResults;
