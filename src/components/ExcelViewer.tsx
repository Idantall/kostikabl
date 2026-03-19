import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Loader2, FileSpreadsheet, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import * as XLSX from 'xlsx';

interface ExcelViewerProps {
  projectId: number;
  sourceFilePath?: string | null;
}

interface SheetData {
  name: string;
  data: any[][];
  maxCols: number;
}

export const ExcelViewer = ({ projectId, sourceFilePath }: ExcelViewerProps) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState<string>("");

  useEffect(() => {
    fetchExcelFile();
  }, [projectId, sourceFilePath]);

  const fetchExcelFile = async () => {
    setLoading(true);
    setError(null);
    
    try {
      let filePath = sourceFilePath;
      
      // If no explicit path, try to find file by project ID prefix
      if (!filePath) {
        const { data: files, error: listError } = await supabase.storage
          .from('measurement-excels')
          .list(String(projectId), { limit: 10 });
        
        if (listError) throw listError;
        
        if (!files || files.length === 0) {
          setError("לא נמצא קובץ מקור לפרויקט זה");
          setLoading(false);
          return;
        }
        
        // Get the first Excel file
        const excelFile = files.find(f => f.name.match(/\.(xlsx|xls)$/i));
        if (!excelFile) {
          setError("לא נמצא קובץ Excel בתיקיית הפרויקט");
          setLoading(false);
          return;
        }
        
        filePath = `${projectId}/${excelFile.name}`;
      }
      
      // Download the file
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('measurement-excels')
        .download(filePath);
      
      if (downloadError) throw downloadError;
      if (!fileData) throw new Error("קובץ ריק");
      
      // Parse the Excel file
      const arrayBuffer = await fileData.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      const parsedSheets: SheetData[] = [];
      
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1, 
          defval: "" 
        }) as any[][];
        
        // Calculate max columns
        const maxCols = jsonData.reduce((max, row) => Math.max(max, row.length), 0);
        
        // Filter out completely empty rows at the end
        let lastNonEmptyRow = jsonData.length - 1;
        while (lastNonEmptyRow >= 0 && jsonData[lastNonEmptyRow].every(cell => cell === "")) {
          lastNonEmptyRow--;
        }
        
        const trimmedData = jsonData.slice(0, lastNonEmptyRow + 1);
        
        if (trimmedData.length > 0) {
          parsedSheets.push({
            name: sheetName,
            data: trimmedData,
            maxCols
          });
        }
      }
      
      setSheets(parsedSheets);
      if (parsedSheets.length > 0) {
        setActiveSheet(parsedSheets[0].name);
      }
      
    } catch (err: any) {
      console.error("Error fetching Excel file:", err);
      setError(err.message || "שגיאה בטעינת הקובץ");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary ml-3" />
          <span className="text-muted-foreground">טוען קובץ Excel...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (sheets.length === 0) {
    return (
      <Alert>
        <FileSpreadsheet className="h-4 w-4" />
        <AlertDescription>לא נמצאו גיליונות בקובץ</AlertDescription>
      </Alert>
    );
  }

  // Extract header text from rows 1 and 3 for the active sheet
  const activeSheetData = sheets.find(s => s.name === activeSheet);
  const headerRow1 = activeSheetData?.data[0]?.filter(cell => cell !== "").join(" ") || "";
  const headerRow3 = activeSheetData?.data[2]?.filter(cell => cell !== "").join(" ") || "";
  
  // Get table data starting from row 4 (index 3)
  const getTableData = (sheet: SheetData) => {
    return sheet.data.slice(3); // Skip first 3 rows (0, 1, 2)
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileSpreadsheet className="h-5 w-5" />
          דפי מדידה מקוריים
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeSheet} onValueChange={setActiveSheet} dir="rtl">
          {/* Centered sheet selector */}
          <div className="flex justify-center w-full mb-4">
            <ScrollArea className="max-w-full">
              <TabsList className="flex-wrap h-auto gap-1 p-1">
                {sheets.map((sheet) => (
                  <TabsTrigger 
                    key={sheet.name} 
                    value={sheet.name}
                    className="text-xs px-3 py-1.5"
                  >
                    {sheet.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
          
          {sheets.map((sheet) => {
            const tableData = getTableData(sheet);
            // Reverse columns for RTL display
            const reversedColIndices = Array.from({ length: sheet.maxCols }, (_, i) => sheet.maxCols - 1 - i);
            
            return (
              <TabsContent key={sheet.name} value={sheet.name} className="mt-0">
                {/* Header rows displayed as text */}
                {sheet.name === activeSheet && (
                  <div className="mb-4 space-y-1 text-right">
                    {headerRow1 && (
                      <p className="text-sm font-medium text-foreground">{headerRow1}</p>
                    )}
                    {headerRow3 && (
                      <p className="text-xs text-muted-foreground">{headerRow3}</p>
                    )}
                  </div>
                )}
                
                <ScrollArea className="w-full border rounded-lg">
                  <div className="min-w-max">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-center text-xs font-bold w-10 border-l">#</TableHead>
                          {reversedColIndices.map((colIndex) => (
                            <TableHead 
                              key={colIndex} 
                              className="text-center text-xs font-medium min-w-[80px] border-l"
                            >
                              {String.fromCharCode(65 + (colIndex % 26))}{colIndex >= 26 ? Math.floor(colIndex / 26) : ''}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tableData.map((row, rowIndex) => (
                          <TableRow key={rowIndex} className="hover:bg-muted/30">
                            <TableCell className="text-center text-xs font-medium text-muted-foreground border-l bg-muted/20">
                              {rowIndex + 4} {/* Start from row 4 since we skip first 3 */}
                            </TableCell>
                            {reversedColIndices.map((colIndex) => (
                              <TableCell 
                                key={colIndex} 
                                className="text-xs py-1.5 px-2 border-l whitespace-nowrap"
                                dir="auto"
                              >
                                {row[colIndex] !== undefined && row[colIndex] !== "" 
                                  ? String(row[colIndex]) 
                                  : ""}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  {tableData.length} שורות × {sheet.maxCols} עמודות
                </p>
              </TabsContent>
            );
          })}
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default ExcelViewer;
