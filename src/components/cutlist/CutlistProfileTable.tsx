import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import { CutlistRowIssuePopover } from "./CutlistRowIssuePopover";
import { useCutlistLanguage } from "@/contexts/CutlistLanguageContext";
import type { CutlistProfileRow } from "@/lib/cutlistTypes";

interface CutlistProfileTableProps {
  rows: CutlistProfileRow[];
  isPreview?: boolean;
  onRowClick?: (row: CutlistProfileRow) => void;
}

export function CutlistProfileTable({ rows, isPreview = false, onRowClick }: CutlistProfileTableProps) {
  const { t, isRtl } = useCutlistLanguage();

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-2">{t("noProfiles")}</p>;
  }

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <table className="w-full text-sm" dir={isRtl ? "rtl" : "ltr"}>
        <colgroup>
          {!isPreview && <col className="w-10" />}
          <col /><col /><col /><col className="w-12" /><col className="w-12" />
          {!isPreview && <col className="w-12" />}
        </colgroup>
        <thead>
          <tr className="border-b bg-muted/50">
            {!isPreview && <th className="p-2 text-center"></th>}
            <th className={`p-2 ${isRtl ? 'text-right' : 'text-left'} font-medium text-xs`}>{t("profile")}</th>
            <th className={`p-2 ${isRtl ? 'text-right' : 'text-left'} font-medium text-xs`}>{t("role")}</th>
            <th className={`p-2 ${isRtl ? 'text-right' : 'text-left'} font-medium text-xs`}>{t("length")}</th>
            <th className="p-2 text-center font-medium text-xs">{t("direction")}</th>
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
                <td className={cn("p-2 font-mono text-xs truncate", isDone && "line-through")}>{row.profile_code}</td>
                <td className={cn("p-2 text-xs truncate", isDone && "line-through")}>{row.role || "-"}</td>
                <td className={cn("p-2 font-mono text-xs truncate", isDone && "line-through")}>{row.cut_length || "-"}</td>
                <td className={cn("p-2 text-center font-mono text-xs", isDone && "line-through")}>{row.orientation || "-"}</td>
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
