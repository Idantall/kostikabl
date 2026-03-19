import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Wrench, Package, GlassWater, StickyNote, Bug, CheckCircle2, AlertTriangle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { LazyPdfPreview } from "./LazyPdfPreview";
import { CutlistProfileTable } from "./CutlistProfileTable";
import { CutlistMiscTable } from "./CutlistMiscTable";
import { CutlistGlassTable } from "./CutlistGlassTable";
import { useCutlistLanguage } from "@/contexts/CutlistLanguageContext";
import type { CutlistSectionWithRows, CutlistProfileRow, CutlistGlassRow } from "@/lib/cutlistTypes";

interface CutlistItemCardProps {
  section: CutlistSectionWithRows;
  /** @deprecated No longer used - PDF URL now comes from CutlistPdfContext */
  pdfPath?: string | null;
  isPreview?: boolean;
  showDebug?: boolean;
  onProfileRowClick?: (row: CutlistProfileRow) => void;
  onGlassRowClick?: (row: CutlistGlassRow) => void;
  onConfirmSection?: () => void;
  onPackSection?: () => void;
}

export function CutlistItemCard({
  section,
  pdfPath,
  isPreview = false,
  showDebug = false,
  onProfileRowClick,
  onGlassRowClick,
  onConfirmSection,
  onPackSection,
}: CutlistItemCardProps) {
  const { t, tf, isRtl } = useCutlistLanguage();
  const [isOpen, setIsOpen] = useState(true);
  const [showRawText, setShowRawText] = useState(false);

  const profileDone = section.profile_rows.filter((r) => r.status === "done").length;
  const miscDone = section.misc_rows.filter((r) => r.status === "done").length;
  const glassDone = section.glass_rows.filter((r) => r.status === "done").length;
  
  const profileIssue = section.profile_rows.filter((r) => r.status === "issue").length;
  const glassIssue = section.glass_rows.filter((r) => r.status === "issue").length;
  
  // Total rows for display badge (includes misc)
  const totalRows = section.profile_rows.length + section.misc_rows.length + section.glass_rows.length;
  const totalDone = profileDone + miscDone + glassDone;
  
  // For finalization: only profiles and glass count (misc doesn't need to be marked)
  const finalizableRows = section.profile_rows.length + section.glass_rows.length;
  const finalizableDone = profileDone + glassDone;
  const finalizableIssues = profileIssue + glassIssue;
  const openFinalizableRows = finalizableRows - finalizableDone - finalizableIssues;
  
  const hasGlass = section.glass_rows.length > 0;
  const sectionStatus = section.status || "open";
  const issueText = section.issue_text;
  const canFinalize = finalizableRows > 0 && finalizableDone === finalizableRows && finalizableIssues === 0;
  const isComplete = sectionStatus === "done" || sectionStatus === "packed";
  const isPacked = sectionStatus === "packed";

  const defaultTab = section.profile_rows.length > 0 ? "profiles" : 
                     section.misc_rows.length > 0 ? "misc" : 
                     hasGlass ? "glass" : "profiles";

  const getDisabledReason = () => {
    if (finalizableRows === 0) return t("noItemsInSection");
    if (finalizableIssues > 0) return tf("openIssuesExist", { count: finalizableIssues });
    if (openFinalizableRows > 0) return tf("markAllRowsDone", { count: openFinalizableRows });
    return "";
  };

  return (
    <Card className={cn(
      "overflow-hidden transition-all",
      isPacked && "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20",
      !isPacked && isComplete && "border-green-500 bg-green-50/50 dark:bg-green-950/20",
      sectionStatus === "issue" && "border-orange-500 bg-orange-50/50 dark:bg-orange-950/20"
    )}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold">{t("itemRef")}: {section.section_ref}</span>
                {section.title && <span className="text-muted-foreground text-sm">{section.title}</span>}
                {sectionStatus === "packed" && (
                  <Badge className="bg-blue-600 text-white">
                    <Package className="h-3 w-3 ml-1" />{t("itemPacked")}
                  </Badge>
                )}
                {sectionStatus === "done" && (
                  <Badge className="bg-green-600 text-white">
                    <CheckCircle2 className="h-3 w-3 ml-1" />{t("completed")}
                  </Badge>
                )}
                {sectionStatus === "issue" && (
                  <Badge variant="destructive" className="cursor-pointer" title={issueText || undefined}>
                    <AlertTriangle className="h-3 w-3 ml-1" />{t("problem")}
                  </Badge>
                )}
                {finalizableIssues > 0 && sectionStatus !== "issue" && (
                  <Badge variant="outline" className="text-orange-600 border-orange-300">
                    <AlertTriangle className="h-3 w-3 ml-1" />{finalizableIssues} {t("issues")}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={isComplete ? "default" : "secondary"} className={cn(isComplete && "bg-green-600")}>
                  {totalDone}/{totalRows}
                </Badge>
                {isOpen ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="lg:w-72 flex-shrink-0 space-y-3">
                <LazyPdfPreview pageNumber={section.page_number || 1} width={280} className="mx-auto lg:mx-0" />
                {section.technical_text && (
                  <div className="p-3 bg-muted/50 rounded-lg text-sm">
                    <p className="font-medium text-muted-foreground mb-1">{t("technicalInfo")}:</p>
                    <p>{section.technical_text}</p>
                  </div>
                )}
                {section.quantity_total && (
                  <div className="text-center lg:text-right">
                    <Badge variant="outline" className="text-base">{t("quantity")}: {section.quantity_total}</Badge>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                {section.notes && (
                  <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <div className="flex items-center gap-2 mb-1">
                      <StickyNote className="h-4 w-4 text-amber-600" />
                      <span className="font-medium text-amber-800 dark:text-amber-200">{t("notes")}</span>
                    </div>
                    <p className="text-sm text-amber-900 dark:text-amber-100">{section.notes}</p>
                  </div>
                )}

                <Tabs defaultValue={defaultTab} className="w-full">
                  <TabsList className="w-full mb-3 flex overflow-x-auto overflow-y-hidden">
                    <TabsTrigger value="profiles" className="flex items-center gap-1.5">
                      <Wrench className="h-4 w-4" />{t("profiles")}
                      <Badge variant="secondary" className="mr-1 text-xs">{profileDone}/{section.profile_rows.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="misc" className="flex items-center gap-1.5">
                      <Package className="h-4 w-4" />{t("accessories")}
                      <Badge variant="secondary" className="mr-1 text-xs">{section.misc_rows.length}</Badge>
                    </TabsTrigger>
                    {hasGlass && (
                      <TabsTrigger value="glass" className="flex items-center gap-1.5">
                        <GlassWater className="h-4 w-4" />{t("glass")}
                        <Badge variant="secondary" className="mr-1 text-xs">{glassDone}/{section.glass_rows.length}</Badge>
                      </TabsTrigger>
                    )}
                  </TabsList>

                  <TabsContent value="profiles" className="mt-0">
                    <CutlistProfileTable rows={section.profile_rows} isPreview={isPreview} onRowClick={onProfileRowClick} />
                  </TabsContent>
                  <TabsContent value="misc" className="mt-0">
                    <CutlistMiscTable rows={section.misc_rows} />
                  </TabsContent>
                  {hasGlass && (
                    <TabsContent value="glass" className="mt-0">
                      <CutlistGlassTable rows={section.glass_rows} isPreview={isPreview} onRowClick={onGlassRowClick} />
                    </TabsContent>
                  )}
                </Tabs>

                {!isPreview && onConfirmSection && sectionStatus !== "done" && sectionStatus !== "packed" && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="flex flex-col items-end gap-2">
                      <Button onClick={(e) => { e.stopPropagation(); onConfirmSection(); }} disabled={!canFinalize} variant="default" size="sm" className={cn(!canFinalize && "opacity-50")}>
                        {!canFinalize && <Lock className="h-4 w-4 ml-1" />}
                        <CheckCircle2 className="h-4 w-4 ml-1" />{t("confirmItemCompletion")}
                      </Button>
                      {!canFinalize && <p className="text-sm text-muted-foreground text-right">{getDisabledReason()}</p>}
                    </div>
                  </div>
                )}

                {!isPreview && sectionStatus === "done" && onPackSection && (
                  <div className="mt-4 pt-4 border-t flex justify-end gap-2">
                    <Badge className="bg-green-600 text-white"><CheckCircle2 className="h-4 w-4 ml-1" />{t("itemCompleted")}</Badge>
                    <Button onClick={(e) => { e.stopPropagation(); onPackSection(); }} variant="default" size="sm" className="bg-blue-600 hover:bg-blue-700">
                      <Package className="h-4 w-4 ml-1" />{t("packItem")}
                    </Button>
                  </div>
                )}

                {!isPreview && sectionStatus === "done" && !onPackSection && (
                  <div className="mt-4 pt-4 border-t flex justify-end">
                    <Badge className="bg-green-600 text-white"><CheckCircle2 className="h-4 w-4 ml-1" />{t("itemCompleted")}</Badge>
                  </div>
                )}

                {!isPreview && sectionStatus === "packed" && (
                  <div className="mt-4 pt-4 border-t flex justify-end">
                    <Badge className="bg-blue-600 text-white"><Package className="h-4 w-4 ml-1" />{t("itemPacked")}</Badge>
                  </div>
                )}

                {showDebug && section.raw_page_text && (
                  <div className="mt-4 border-t pt-4">
                    <Button variant="ghost" size="sm" onClick={() => setShowRawText(!showRawText)} className="text-muted-foreground">
                      <Bug className="h-4 w-4 ml-1" />{showRawText ? t("hideRawText") : t("showRawText")}
                    </Button>
                    {showRawText && <pre className="mt-2 p-3 bg-muted rounded-lg text-xs overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">{section.raw_page_text}</pre>}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
