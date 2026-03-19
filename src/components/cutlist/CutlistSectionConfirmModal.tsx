import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { useCutlistLanguage } from "@/contexts/CutlistLanguageContext";

interface CutlistSectionConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionRef: string;
  sectionStatus: "open" | "done" | "issue" | "packed";
  existingIssueText: string | null;
  onMarkDone: () => void;
  onReportIssue: (issueText: string) => void;
}

export function CutlistSectionConfirmModal({ open, onOpenChange, sectionRef, sectionStatus, existingIssueText, onMarkDone, onReportIssue }: CutlistSectionConfirmModalProps) {
  const { t, isRtl } = useCutlistLanguage();
  const [mode, setMode] = useState<"choose" | "issue">("choose");
  const [issueText, setIssueText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => { setMode("choose"); setIssueText(""); onOpenChange(false); };
  const handleMarkDone = async () => { setIsSubmitting(true); await onMarkDone(); setIsSubmitting(false); handleClose(); };
  const handleSubmitIssue = async () => { if (!issueText.trim()) return; setIsSubmitting(true); await onReportIssue(issueText.trim()); setIsSubmitting(false); handleClose(); };

  if (sectionStatus !== "open") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent dir={isRtl ? "rtl" : "ltr"} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t("itemRef")}: {sectionRef}
              <Badge variant={sectionStatus === "done" ? "default" : "destructive"} className={sectionStatus === "done" ? "bg-green-600" : ""}>
                {sectionStatus === "done" ? t("completed") : t("problem")}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          {sectionStatus === "issue" && existingIssueText && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">{t("issueDescription")}:</p>
              <p className="text-sm text-red-700 dark:text-red-300">{existingIssueText}</p>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={handleClose}>{t("close")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={isRtl ? "rtl" : "ltr"} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("finishItem")}: {sectionRef}</DialogTitle>
          {mode === "choose" && <DialogDescription>{t("chooseFinishStatus")}</DialogDescription>}
        </DialogHeader>
        {mode === "choose" ? (
          <div className="flex flex-col gap-3 py-4">
            <Button size="lg" className="h-auto py-4 flex flex-col items-center gap-2 bg-green-600 hover:bg-green-700" onClick={handleMarkDone} disabled={isSubmitting}>
              <CheckCircle2 className="h-6 w-6" /><span className="text-lg font-medium">{t("markAsCompleted")}</span><span className="text-sm opacity-80">{t("allItemsWillBeMarked")}</span>
            </Button>
            <Button size="lg" variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/30" onClick={() => setMode("issue")} disabled={isSubmitting}>
              <AlertTriangle className="h-6 w-6 text-orange-500" /><span className="text-lg font-medium">{t("reportProblem")}</span><span className="text-sm text-muted-foreground">{t("specifyWhatsWrong")}</span>
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <Button variant="ghost" size="sm" onClick={() => setMode("choose")} className="mb-2"><ArrowLeft className="h-4 w-4 ml-1" />{t("goBack")}</Button>
            <div>
              <label className="text-sm font-medium mb-2 block">{t("issueDescription")} <span className="text-red-500">{t("required")}</span></label>
              <Textarea value={issueText} onChange={(e) => setIssueText(e.target.value)} placeholder={t("describeTheProblem")} rows={4} dir={isRtl ? "rtl" : "ltr"} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={handleClose}>{t("cancel")}</Button>
              <Button variant="destructive" onClick={handleSubmitIssue} disabled={!issueText.trim() || isSubmitting}>{isSubmitting ? t("sending") : t("sendReport")}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
