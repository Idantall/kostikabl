import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import { CutlistRowIssuePopover } from "./CutlistRowIssuePopover";
import { useCutlistLanguage } from "@/contexts/CutlistLanguageContext";
import type { CutlistGlassRow } from "@/lib/cutlistTypes";

interface CutlistGlassTableProps {
  rows: CutlistGlassRow[];
  isPreview?: boolean;
  onRowClick?: (row: CutlistGlassRow) => void;
}

export function CutlistGlassTable({ rows, isPreview = false, onRowClick }: CutlistGlassTableProps) {
  const { t, isRtl } = useCutlistLanguage();

  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <table className="w-full text-sm table-fixed" dir={isRtl ? "rtl" : "ltr"}>
        <colgroup>
          {!isPreview && <col className="w-12" />}
          <col className="w-[25%]" /><col className="w-[25%]" /><col className="w-auto" /><col className="w-16" />
          {!isPreview && <col className="w-16" />}
        </colgroup>
        <thead>
          <tr className="border-b bg-blue-50 dark:bg-blue-950/30">
            {!isPreview && <th className="p-2 text-center"></th>}
            <th className={`p-2 ${isRtl ? 'text-right' : 'text-left'} font-medium text-xs`}>{t("code")}</th>
            <th className={`p-2 ${isRtl ? 'text-right' : 'text-left'} font-medium text-xs`}>{t("dimensions")}</th>
            <th className={`p-2 ${isRtl ? 'text-right' : 'text-left'} font-medium text-xs`}>{t("description")}</th>
            <th className="p-2 text-center font-medium text-xs">{t("qty")}</th>
            {!isPreview && <th className="p-2 text-center text-xs"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isDone = row.status === "done";
            const hasIssue = row.status === "issue";
            return (
              <tr key={row.id} className={cn("border-b transition-colors", !isPreview && "cursor-pointer active:bg-muted/50", isDone && "bg-green-50 dark:bg-green-950/30 opacity-70", hasIssue && "bg-orange-50 dark:bg-orange-950/30")} onClick={() => !isPreview && onRowClick?.(row)}>
                {!isPreview && (
                  <td className="p-2 text-center">
                    <div className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center mx-auto", isDone ? "bg-green-600 border-green-600" : "border-muted-foreground/40")}>
                      {isDone && <CheckCircle2 className="h-4 w-4 text-white" />}
                    </div>
                  </td>
                )}
                <td className={cn("p-2 font-mono text-xs truncate", isDone && "line-through")}>{row.code || "-"}</td>
                <td className={cn("p-2 font-mono text-xs truncate", isDone && "line-through")}>{row.size_text || "-"}</td>
                <td className={cn("p-2 text-xs truncate", isDone && "line-through")}>{row.description || row.sku_name || "-"}</td>
                <td className={cn("p-2 text-center font-bold text-xs", isDone && "line-through")}>{row.qty}</td>
                {!isPreview && (
                  <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                    {hasIssue && row.issue_text && <CutlistRowIssuePopover issueText={row.issue_text} />}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
