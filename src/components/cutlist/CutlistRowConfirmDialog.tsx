import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { useCutlistLanguage } from "@/contexts/CutlistLanguageContext";

export type RowType = "profile" | "misc" | "glass";

interface RowSummary { type: RowType; id: string; description: string; }

interface CutlistRowConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rowSummary: RowSummary | null;
  onMarkDone: (rowId: string, type: RowType) => Promise<void>;
  onReportIssue: (rowId: string, type: RowType, issueText: string) => Promise<void>;
}

export function CutlistRowConfirmDialog({ open, onOpenChange, rowSummary, onMarkDone, onReportIssue }: CutlistRowConfirmDialogProps) {
  const { t, isRtl } = useCutlistLanguage();
  const [mode, setMode] = useState<"choose" | "issue">("choose");
  const [issueText, setIssueText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => { setMode("choose"); setIssueText(""); setIsSubmitting(false); onOpenChange(false); };

  const handleMarkDone = async () => {
    if (!rowSummary) return;
    setIsSubmitting(true);
    try { await onMarkDone(rowSummary.id, rowSummary.type); handleClose(); } finally { setIsSubmitting(false); }
  };

  const handleSubmitIssue = async () => {
    if (!rowSummary || !issueText.trim()) return;
    setIsSubmitting(true);
    try { await onReportIssue(rowSummary.id, rowSummary.type, issueText.trim()); handleClose(); } finally { setIsSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="sm:max-w-md" dir={isRtl ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle>{t("confirmRow")}</DialogTitle>
          {rowSummary && <DialogDescription className={isRtl ? "text-right" : "text-left"}>{rowSummary.description}</DialogDescription>}
        </DialogHeader>
        {mode === "choose" ? (
          <div className="flex flex-col gap-3 py-4">
            <Button onClick={handleMarkDone} disabled={isSubmitting} className="w-full justify-start gap-2" variant="default">
              <CheckCircle2 className="h-4 w-4" />{t("markDone")}
            </Button>
            <Button onClick={() => setMode("issue")} disabled={isSubmitting} variant="outline" className="w-full justify-start gap-2 text-orange-600 border-orange-300 hover:bg-orange-50">
              <AlertTriangle className="h-4 w-4" />{t("reportIssue")}
            </Button>
          </div>
        ) : (
          <div className="py-4 space-y-3">
            <Textarea value={issueText} onChange={(e) => setIssueText(e.target.value)} placeholder={t("describeIssue")} className="min-h-24" dir={isRtl ? "rtl" : "ltr"} />
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          {mode === "issue" ? (
            <>
              <Button variant="ghost" onClick={() => setMode("choose")} disabled={isSubmitting}>{t("goBack")}</Button>
              <Button onClick={handleSubmitIssue} disabled={isSubmitting || !issueText.trim()} variant="destructive">{t("saveIssue")}</Button>
            </>
          ) : (
            <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}><X className="h-4 w-4 ml-1" />{t("cancel")}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
