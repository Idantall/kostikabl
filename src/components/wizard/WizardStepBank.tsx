import { useState, useCallback, useRef } from 'react';
import { useWizard } from './WizardContext';
import { BankItem } from '@/lib/wizardTypes';
import { useTableKeyboardNav } from '@/hooks/useTableKeyboardNav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, Plus, Trash2, Upload, Download, AlertCircle, FileText, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';

interface ParsedItem {
  item_no: string;
  height: string;
  width: string;
}

interface ParseResultDialog {
  bankItems: ParsedItem[];
  warnings: string[];
  contractSummary?: any;
}

export function WizardStepBank() {
  const { state, dispatch } = useWizard();
  const { bankItems, projectType, draftId } = state;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { tableRef, onTableKeyDown } = useTableKeyboardNav();
  
  // Contract PDF upload state
  const [uploading, setUploading] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResultDialog | null>(null);
  const [showResultDialog, setShowResultDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validate item_no uniqueness
  const validateItems = useCallback((items: BankItem[]): Record<string, string> => {
    const errs: Record<string, string> = {};
    const seen = new Set<string>();
    
    items.forEach((item) => {
      if (!item.item_no.trim()) {
        errs[item.id] = 'מספר פרט חובה';
      } else if (seen.has(item.item_no.trim())) {
        errs[item.id] = 'מספר פרט כפול';
      } else {
        seen.add(item.item_no.trim());
      }
      
      if (!item.height.trim()) {
        errs[item.id] = (errs[item.id] || '') + ' גובה חובה';
      }
      if (!item.width.trim()) {
        errs[item.id] = (errs[item.id] || '') + ' רוחב חובה';
      }
    });
    
    return errs;
  }, []);

  const handleAddItem = () => {
    const newItem: BankItem = {
      id: crypto.randomUUID(),
      item_no: '',
      height: '',
      width: '',
      floor_height: '',
    };
    dispatch({ type: 'ADD_BANK_ITEM', payload: newItem });
  };

  const handleUpdateItem = (id: string, field: keyof BankItem, value: string) => {
    dispatch({ type: 'UPDATE_BANK_ITEM', payload: { id, field, value } });
    setErrors(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleDeleteItem = (id: string) => {
    dispatch({ type: 'DELETE_BANK_ITEM', payload: id });
  };

  // Contract PDF upload handler
  const handleContractPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('יש להעלות קובץ PDF בלבד');
      return;
    }

    setUploading(true);
    try {
      // Upload to storage
      const storagePath = `drafts/${draftId}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('project-contracts')
        .upload(storagePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Call edge function to parse
      const { data, error } = await supabase.functions.invoke('precontract-parse-contract', {
        body: { storage_path: storagePath, draft_id: draftId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Show results dialog
      setParseResult({
        bankItems: data.bankItems || [],
        warnings: data.warnings || [],
        contractSummary: data.contractSummary,
      });
      setShowResultDialog(true);

      // Store contract data in context
      dispatch({
        type: 'SET_CONTRACT_DATA',
        payload: {
          contractPdfPath: storagePath,
          contractParseResult: data,
        },
      });
    } catch (error: any) {
      console.error('Contract upload error:', error);
      toast.error(`שגיאה בניתוח החוזה: ${error.message}`);
    } finally {
      setUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  // Apply parsed items to bank
  const handleApplyParsedItems = () => {
    if (!parseResult) return;
    
    const newItems: BankItem[] = parseResult.bankItems.map(item => ({
      id: crypto.randomUUID(),
      item_no: item.item_no,
      height: item.height,
      width: item.width,
      floor_height: '',
    }));

    dispatch({ type: 'SET_BANK_ITEMS', payload: newItems });
    setShowResultDialog(false);
    toast.success(`נטענו ${newItems.length} פרטים מהחוזה`);
  };

  // Excel upload handler
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { header: 1 });
      
      if (rows.length < 2) {
        toast.error('הקובץ ריק או לא תקין');
        return;
      }

      const headerRow = rows[0] as string[];
      let itemNoCol = -1, heightCol = -1, widthCol = -1;
      
      headerRow.forEach((cell, idx) => {
        const val = String(cell || '').trim();
        if (val.includes('פרט') || val.includes('מספר')) itemNoCol = idx;
        else if (val.includes('גובה')) heightCol = idx;
        else if (val.includes('רוחב')) widthCol = idx;
      });

      if (itemNoCol === -1) itemNoCol = 0;
      if (heightCol === -1) heightCol = 1;
      if (widthCol === -1) widthCol = 2;

      const newItems: BankItem[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i] as any[];
        if (!row || row.length === 0) continue;
        
        const itemNo = String(row[itemNoCol] || '').trim();
        const height = String(row[heightCol] || '').trim();
        const width = String(row[widthCol] || '').trim();
        
        if (itemNo) {
          newItems.push({
            id: crypto.randomUUID(),
            item_no: itemNo,
            height,
            width,
          });
        }
      }

      if (newItems.length === 0) {
        toast.error('לא נמצאו פרטים בקובץ');
        return;
      }

      dispatch({ type: 'SET_BANK_ITEMS', payload: newItems });
      toast.success(`נטענו ${newItems.length} פרטים מהקובץ`);
    } catch (error) {
      console.error('Excel parse error:', error);
      toast.error('שגיאה בקריאת הקובץ');
    }
    
    e.target.value = '';
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['מספר פרט', 'גובה', 'רוחב'],
      ['ח-1', '120', '100'],
      ['ח-2', '150', '80'],
      ['D-1', '210', '90'],
    ]);
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'בנק פרטים');
    XLSX.writeFile(wb, 'תבנית_בנק_פרטים.xlsx');
    toast.success('התבנית הורדה');
  };

  const handleBack = () => {
    dispatch({ type: 'SET_STEP', payload: 0 });
  };

  const handleNext = () => {
    const errs = validateItems(bankItems);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      toast.error('יש לתקן שגיאות לפני המשך');
      return;
    }
    if (bankItems.length === 0) {
      toast.error('יש להוסיף לפחות פרט אחד לבנק');
      return;
    }
    dispatch({ type: 'SET_STEP', payload: 2 });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">בנק פרטים</CardTitle>
          <CardDescription>
            הגדר את רשימת הפרטים (מס' פרט, גובה, רוחב). ניתן להעלות מ-Excel או להזין ידנית.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Contract PDF upload - only for pre_contract */}
          {projectType === 'pre_contract' && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <span className="font-medium">חילוץ פרטים מחוזה</span>
              </div>
              <p className="text-sm text-muted-foreground">
                העלה קובץ חוזה PDF כדי לחלץ אוטומטית את בנק הפרטים עם מידות.
              </p>
              <input
                type="file"
                accept=".pdf"
                onChange={handleContractPdfUpload}
                className="hidden"
                ref={fileInputRef}
              />
              <Button
                variant="default"
                className="gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    מנתח חוזה...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    העלה חוזה PDF
                  </>
                )}
              </Button>
              {state.contractPdfPath && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  חוזה הועלה ונותח
                </p>
              )}
            </div>
          )}

          {/* Upload / Download buttons */}
          <div className="flex gap-3 flex-wrap">
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelUpload}
              className="hidden"
              id="bank-excel-upload"
            />
            <Button 
              variant="outline" 
              className="gap-2" 
              onClick={() => document.getElementById('bank-excel-upload')?.click()}
            >
              <Upload className="h-4 w-4" />
              העלה מ-Excel
            </Button>
            <Button variant="ghost" className="gap-2" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4" />
              הורד תבנית
            </Button>
          </div>

          {/* Items table */}
          <div className="border rounded-lg overflow-hidden" ref={tableRef} onKeyDown={onTableKeyDown}>
            <Table dir="rtl">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right w-1/3">מספר פרט</TableHead>
                  <TableHead className="text-right w-1/4">גובה</TableHead>
                  <TableHead className="text-right w-1/4">רוחב</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      אין פרטים בבנק. הוסף פרט או העלה קובץ Excel.
                    </TableCell>
                  </TableRow>
                ) : (
                  bankItems.map((item, rowIdx) => (
                    <TableRow key={item.id} className={errors[item.id] ? 'bg-destructive/10' : ''}>
                      <TableCell data-row={rowIdx} data-col={0}>
                        <Input
                          value={item.item_no}
                          onChange={(e) => handleUpdateItem(item.id, 'item_no', e.target.value)}
                          placeholder="ח-1"
                          dir="rtl"
                          className={errors[item.id]?.includes('פרט') ? 'border-destructive' : ''}
                        />
                      </TableCell>
                      <TableCell data-row={rowIdx} data-col={1}>
                        <Input
                          value={item.height}
                          onChange={(e) => handleUpdateItem(item.id, 'height', e.target.value)}
                          placeholder="120"
                          dir="ltr"
                          className={errors[item.id]?.includes('גובה') ? 'border-destructive' : ''}
                        />
                      </TableCell>
                      <TableCell data-row={rowIdx} data-col={2}>
                        <Input
                          value={item.width}
                          onChange={(e) => handleUpdateItem(item.id, 'width', e.target.value)}
                          placeholder="100"
                          dir="ltr"
                          className={errors[item.id]?.includes('רוחב') ? 'border-destructive' : ''}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteItem(item.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Error summary */}
          {Object.keys(errors).length > 0 && (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>יש {Object.keys(errors).length} שגיאות לתיקון</span>
            </div>
          )}

          {/* Add item button */}
          <Button variant="outline" onClick={handleAddItem} className="gap-2">
            <Plus className="h-4 w-4" />
            הוסף פרט
          </Button>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={handleBack} className="gap-2">
          <ArrowRight className="h-4 w-4" />
          חזור
        </Button>
        <Button onClick={handleNext} className="gap-2">
          המשך לקומות ודירות
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Parse results dialog */}
      <Dialog open={showResultDialog} onOpenChange={setShowResultDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>תוצאות ניתוח חוזה</DialogTitle>
            <DialogDescription>
              סקור את הפרטים שחולצו מהחוזה לפני טעינה לבנק הפרטים
            </DialogDescription>
          </DialogHeader>

          {parseResult && (
            <div className="space-y-4">
              {/* Summary badges */}
              <div className="flex gap-3">
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {parseResult.bankItems.length} פרטים חולצו
                </Badge>
                {parseResult.warnings.length > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {parseResult.warnings.length} אזהרות
                  </Badge>
                )}
              </div>

              {/* Contract summary */}
              {parseResult.contractSummary && (
                <div className="grid grid-cols-3 gap-3">
                  {parseResult.contractSummary.subtotal && (
                    <div className="bg-muted rounded-lg p-3 text-center">
                      <div className="text-xs text-muted-foreground">סה"כ</div>
                      <div className="font-bold">{parseResult.contractSummary.subtotal?.toLocaleString()} ₪</div>
                    </div>
                  )}
                  {parseResult.contractSummary.vat_amount && (
                    <div className="bg-muted rounded-lg p-3 text-center">
                      <div className="text-xs text-muted-foreground">מע"מ {parseResult.contractSummary.vat_percent}%</div>
                      <div className="font-bold">{parseResult.contractSummary.vat_amount?.toLocaleString()} ₪</div>
                    </div>
                  )}
                  {parseResult.contractSummary.total && (
                    <div className="bg-muted rounded-lg p-3 text-center">
                      <div className="text-xs text-muted-foreground">סה"כ כולל</div>
                      <div className="font-bold">{parseResult.contractSummary.total?.toLocaleString()} ₪</div>
                    </div>
                  )}
                </div>
              )}

              {/* Items preview table */}
              <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                <Table dir="rtl">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">מס' פרט</TableHead>
                      <TableHead className="text-right">גובה (ס"מ)</TableHead>
                      <TableHead className="text-right">רוחב (ס"מ)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parseResult.bankItems.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono">{item.item_no}</TableCell>
                        <TableCell>{item.height}</TableCell>
                        <TableCell>{item.width}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Warnings */}
              {parseResult.warnings.length > 0 && (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="font-medium text-sm">אזהרות</span>
                  </div>
                  <ul className="text-xs space-y-1 text-amber-700 dark:text-amber-400">
                    {parseResult.warnings.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Overwrite warning */}
              {bankItems.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 inline ml-1" />
                  שים לב: טעינת הפרטים תחליף את {bankItems.length} הפרטים הקיימים בבנק
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResultDialog(false)}>
              ביטול
            </Button>
            <Button onClick={handleApplyParsedItems} className="gap-2">
              <CheckCircle2 className="h-4 w-4" />
              טען לבנק פרטים
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
