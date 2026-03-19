import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MessageSquare, AlertTriangle, CheckCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Load issue codes mapping (shared with PublicScan and scan-confirm)
export const LOAD_ISSUE_CODES: Record<string, string> = {
  'LACK_SHUTTER': 'חסר תריס',
  'LACK_WINGS': 'חסר כנפיים',
  'BROKEN_GLASS': 'זכוכית שבורה',
  'ANGLES': 'זוויות',
  'SHUTTER_RAILS': 'מסילות תריס'
};

interface LoadIssue {
  id?: number;
  issue_codes: string[];
  free_text: string | null;
  created_at: string;
  item_id?: number;
}

interface LoadIssueViewerProps {
  loadIssue: LoadIssue | null;
  itemCode?: string;
  variant?: 'badge' | 'button' | 'icon';
  onClear?: () => void;
  showClearButton?: boolean;
}

export function LoadIssueViewer({ loadIssue, itemCode, variant = 'icon', onClear, showClearButton = false }: LoadIssueViewerProps) {
  const [open, setOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  if (!loadIssue) return null;

  const hasIssueCodes = loadIssue.issue_codes && loadIssue.issue_codes.length > 0;
  const hasFreeText = loadIssue.free_text && loadIssue.free_text.trim().length > 0;
  
  if (!hasIssueCodes && !hasFreeText) return null;

  const previewText = hasFreeText 
    ? loadIssue.free_text!.substring(0, 80) + (loadIssue.free_text!.length > 80 ? '...' : '')
    : hasIssueCodes 
      ? loadIssue.issue_codes.map(c => LOAD_ISSUE_CODES[c] || c).join(', ')
      : '';

  const handleClearIssue = async () => {
    if (!loadIssue.id) {
      toast.error('לא ניתן למחוק את הבעיה');
      return;
    }

    setClearing(true);
    try {
      const { error } = await supabase
        .from('load_issues')
        .delete()
        .eq('id', loadIssue.id);
      
      if (error) throw error;
      
      toast.success('הבעיה נמחקה בהצלחה');
      setOpen(false);
      onClear?.();
    } catch (error) {
      console.error('Error clearing load issue:', error);
      toast.error('שגיאה במחיקת הבעיה');
    } finally {
      setClearing(false);
    }
  };

  const renderTrigger = () => {
    if (variant === 'badge') {
      return (
        <button 
          type="button" 
          onClick={() => setOpen(true)}
          className="inline-flex"
        >
          <Badge 
            variant="secondary" 
            className="cursor-pointer hover:opacity-80 gap-1 bg-amber-100 text-amber-800 border-amber-300"
          >
            <MessageSquare className="h-3 w-3" />
            הועמס — בעיה
          </Badge>
        </button>
      );
    }
    if (variant === 'button') {
      return (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setOpen(true)}
          className="h-7 px-2 gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          <span className="text-xs">הערות</span>
        </Button>
      );
    }
    // Default: icon with tooltip
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <button 
              onClick={() => setOpen(true)}
              className="text-amber-600 hover:text-amber-700 p-1 rounded hover:bg-amber-50 transition-colors"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-right" dir="rtl">
            <p className="text-xs">{previewText}</p>
            <p className="text-xs text-muted-foreground mt-1">לחץ לצפייה מלאה</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <>
      {renderTrigger()}
      
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              {itemCode ? `בעיות בהעמסה - ${itemCode}` : 'בעיות בהעמסה'}
            </DialogTitle>
            <DialogDescription className="text-right">
              פרטי הבעיה שדווחה במהלך ההעמסה
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {hasIssueCodes && (
              <div>
                <h4 className="text-sm font-medium mb-2 text-muted-foreground">סוג הבעיה:</h4>
                <div className="flex flex-wrap gap-2">
                  {loadIssue.issue_codes.map((code) => (
                    <Badge key={code} variant="secondary" className="text-sm">
                      {LOAD_ISSUE_CODES[code] || code}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {hasFreeText && (
              <div>
                <h4 className="text-sm font-medium mb-2 text-muted-foreground">הערות:</h4>
                <div className="bg-muted/50 rounded-lg p-3 text-right whitespace-pre-wrap">
                  {loadIssue.free_text}
                </div>
              </div>
            )}
            
            {loadIssue.created_at && (
              <p className="text-xs text-muted-foreground text-left">
                תאריך דיווח: {new Date(loadIssue.created_at).toLocaleString('he-IL')}
              </p>
            )}
          </div>

          {showClearButton && (
            <DialogFooter className="sm:justify-start mt-4">
              <Button 
                onClick={handleClearIssue} 
                disabled={clearing}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4" />
                {clearing ? 'מוחק...' : 'סמן כתקין (מחק בעיה)'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
