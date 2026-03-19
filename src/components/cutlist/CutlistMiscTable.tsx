import { useCutlistLanguage } from "@/contexts/CutlistLanguageContext";
import type { CutlistMiscRow } from "@/lib/cutlistTypes";

interface CutlistMiscTableProps {
  rows: CutlistMiscRow[];
}

export function CutlistMiscTable({ rows }: CutlistMiscTableProps) {
  const { t, isRtl } = useCutlistLanguage();

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-2">{t("noAccessories")}</p>;
  }

  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <table className="w-full text-sm table-fixed" dir={isRtl ? "rtl" : "ltr"}>
        <colgroup>
          <col className="w-[20%]" /><col className="w-auto" /><col className="w-20" />
        </colgroup>
        <thead>
          <tr className="border-b bg-muted/50">
            <th className={`p-2 ${isRtl ? 'text-right' : 'text-left'} font-medium text-xs`}>{t("sku")}</th>
            <th className={`p-2 ${isRtl ? 'text-right' : 'text-left'} font-medium text-xs`}>{t("description")}</th>
            <th className="p-2 text-center font-medium text-xs">{t("qty")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="p-2 font-mono text-xs truncate">{row.sku_code || "-"}</td>
              <td className="p-2 text-xs truncate">{row.description}</td>
              <td className="p-2 text-center font-bold text-xs">{row.qty} {row.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
