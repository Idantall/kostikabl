import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { MessageSquare, AlertTriangle, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const INSTALL_ISSUE_CODES: Record<string, string> = {
  'GLASS_BROKEN': 'זכוכית שבורה',
  'MOTOR_FAULT': 'תקלה במנוע',
  'SHUTTER_DAMAGED': 'תריס פגום',
  'RAILS_MISSING': 'מסילות חסרות',
  'ANGLES_MISSING': 'זוויות חסרות',
  'BOX_SILL_MISSING': 'ארגז/אדן חסר'
};

interface InstallIssue {
  issue_code: string | null;
  issue_note: string | null;
}

interface InstallIssueViewerProps {
  installIssue: InstallIssue;
  itemId: number;
  itemCode: string;
  showClearButton?: boolean;
  onClear?: () => void;
}

export function InstallIssueViewer({ 
  installIssue, 
  itemId,
  itemCode,
  showClearButton = false,
  onClear
}: InstallIssueViewerProps) {
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const issueText = installIssue.issue_code 
    ? INSTALL_ISSUE_CODES[installIssue.issue_code] || installIssue.issue_code 
    : 'בעיה לא ידועה';

  const handleClear = async () => {
    setClearing(true);
    try {
      // Update item's install_status_cached to INSTALLED
      const { data, error } = await supabase
        .from('items')
        .update({ install_status_cached: 'INSTALLED' })
        .eq('id', itemId)
        .select('id');

      if (error) throw error;
      
      // Check if any rows were actually updated (RLS may silently block)
      if (!data || data.length === 0) {
        throw new Error('אין הרשאה לעדכן פריט זה');
      }

      toast.success('סטטוס ההתקנה עודכן ל"הותקן"');
      setOpen(false);
      onClear?.();
    } catch (error: any) {
      console.error('Error clearing install issue:', error);
      toast.error(error.message || 'שגיאה בעדכון הסטטוס');
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <button 
        type="button" 
        onClick={() => setOpen(true)}
        className="inline-flex"
      >
        <Badge 
          variant="destructive" 
          className="cursor-pointer hover:opacity-80 gap-1"
        >
          <AlertTriangle className="h-3 w-3" />
          בעיה
        </Badge>
      </button>
      
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              בעיית התקנה - {itemCode}
            </DialogTitle>
            <DialogDescription className="text-right">
              פרטי הבעיה שדווחה במהלך ההתקנה
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <h4 className="font-medium mb-2 text-right">סוג הבעיה:</h4>
              <Badge variant="destructive" className="text-sm">
                {issueText}
              </Badge>
            </div>
            
            {installIssue.issue_note && (
              <div>
                <h4 className="font-medium mb-2 text-right">הערות:</h4>
                <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md text-right whitespace-pre-wrap">
                  {installIssue.issue_note}
                </p>
              </div>
            )}
          </div>

          {showClearButton && (
            <DialogFooter className="flex-row-reverse gap-2 sm:flex-row-reverse">
              <Button
                variant="default"
                onClick={handleClear}
                disabled={clearing}
                className="gap-2"
              >
                {clearing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                סמן כהותקן תקין
              </Button>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={clearing}
              >
                סגור
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
