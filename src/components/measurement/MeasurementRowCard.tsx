import { memo, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { WingPositionSelector, WingPositionValue } from "@/components/WingPositionSelector";

export interface MeasurementRowData {
  id: string;
  floor_label: string | null;
  apartment_label: string | null;
  location_in_apartment: string | null;
  opening_no: string | null;
  contract_item: string | null;
  blind_jamb_item?: string | null;
  item_code: string | null;
  height: string | null;
  width: string | null;
  notes: string | null;
  field_notes: string | null;
  wall_thickness: string | null;
  glyph: string | null;
  jamb_height: string | null;
  engine_side: string | null;
  mamad: string | null;
  depth: string | null;
  is_manual: boolean;
  internal_wing: string | null;
  wing_position: string | null;
  wing_position_out: string | null;
}

interface MeasurementRowCardProps {
  row: MeasurementRowData;
  projectStatus?: string;
  connectionStatus: "online" | "offline" | "syncing" | "error";
  onFieldChange: (id: string, field: keyof MeasurementRowData, value: string | boolean | null) => void;
  onDelete: (id: string) => void;
  onLabelChange?: (id: string, field: 'floor_label' | 'apartment_label', oldValue: string | null, newValue: string | null) => void;
}

const getUserNotes = (notes: string | null): string => {
  if (!notes) return "";
  return notes
    .replace(/זווית1:[^;]*;?/g, "")
    .replace(/זווית2:[^;]*;?/g, "")
    .trim();
};

const mergeUserNotes = (newUserNotes: string, existingNotes: string | null): string | null => {
  const angle1Match = existingNotes?.match(/זווית1:[^;]*/)?.[0] || "";
  const angle2Match = existingNotes?.match(/זווית2:[^;]*/)?.[0] || "";
  const parts = [angle1Match, angle2Match, newUserNotes.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(";") : null;
};

export const MeasurementRowCard = memo(function MeasurementRowCard({
  row,
  projectStatus,
  connectionStatus,
  onFieldChange,
  onDelete,
}: MeasurementRowCardProps) {
  const updateField = useCallback(
    (field: keyof MeasurementRowData, value: string | boolean | null) => {
      onFieldChange(row.id, field, value);
    },
    [onFieldChange, row.id]
  );

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground mb-2">
          קומה {row.floor_label || "—"} | דירה {row.apartment_label || "—"}
        </div>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="w-20">
            <label className="text-[11px] text-muted-foreground block text-center">מיקום</label>
            <Input
              value={row.location_in_apartment || ""}
              onChange={(e) => updateField("location_in_apartment", e.target.value || null)}
              className="h-10 text-lg font-medium px-2 text-center"
              dir="rtl"
            />
          </div>

          <div className="w-16">
            <label className="text-[11px] text-muted-foreground block text-center">פתח</label>
            <Input
              value={row.opening_no || ""}
              onChange={(e) => updateField("opening_no", e.target.value || null)}
              className="h-10 text-lg font-medium px-2 text-center"
              dir="rtl"
            />
          </div>

          <div className="w-16">
            <label className="text-[11px] text-muted-foreground block text-center">חוזה</label>
            <Input
              value={row.contract_item || ""}
              onChange={(e) => updateField("contract_item", e.target.value || null)}
              className="h-10 text-lg font-medium px-2 text-center"
              dir="rtl"
            />
          </div>

          {projectStatus !== "pre_contract" && (
            <div className="w-20">
              <label className="text-[11px] text-muted-foreground block text-center">משקופים</label>
              <Input
                value={row.blind_jamb_item || ""}
                onChange={(e) => updateField("blind_jamb_item", e.target.value || null)}
                className="h-10 text-lg font-medium px-2 text-center"
                dir="rtl"
              />
            </div>
          )}

          {projectStatus !== "pre_contract" && projectStatus !== "blind_jambs" && (
            <div className="w-20">
              <label className="text-[11px] text-muted-foreground block text-center">פרט יצור</label>
              <Input
                value={row.item_code || ""}
                onChange={(e) => updateField("item_code", e.target.value || null)}
                className="h-10 text-lg font-medium px-2 text-center"
                dir="rtl"
              />
            </div>
          )}

          <div className="w-28">
            <label className="text-[11px] text-muted-foreground block text-center">גובה</label>
            <Input
              value={row.height || ""}
              onChange={(e) => updateField("height", e.target.value || null)}
              className="h-10 text-lg font-medium px-2 text-center bg-primary/5"
              inputMode="tel"
              pattern="[0-9+.]*"
              dir="ltr"
            />
          </div>

          <div className="w-20">
            <label className="text-[11px] text-muted-foreground block text-center">רוחב</label>
            <Input
              value={row.width || ""}
              onChange={(e) => updateField("width", e.target.value || null)}
              className="h-10 text-lg font-medium px-2 text-center bg-primary/5"
              inputMode="tel"
              pattern="[0-9+.]*"
              dir="ltr"
            />
          </div>

          <div className="w-28">
            <label className="text-[11px] text-muted-foreground block text-center">גובה מהריצוף</label>
            <Input
              value={getUserNotes(row.notes)}
              onChange={(e) => updateField("notes", mergeUserNotes(e.target.value, row.notes))}
              className="h-10 text-base px-2"
              dir="rtl"
            />
          </div>

          <div className="w-20">
            <label className="text-[11px] text-muted-foreground block text-center">ממד כיס בצד</label>
            <Select
              value={row.mamad || "none"}
              onValueChange={(value) => updateField("mamad", value === "none" ? null : value)}
            >
              <SelectTrigger className="h-10 text-sm px-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-</SelectItem>
                <SelectItem value="☒☐">☒☐ שמאל</SelectItem>
                <SelectItem value="☐☒">☐☒ ימין</SelectItem>
                <SelectItem value="☒☐☒">☒☐☒ כפול</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-16">
            <label className="text-[11px] text-muted-foreground block text-center">מנוע</label>
            <Select
              value={row.engine_side || "none"}
              onValueChange={(value) => updateField("engine_side", value === "none" ? null : value)}
            >
              <SelectTrigger className="h-10 text-base px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-</SelectItem>
                <SelectItem value="L">L</SelectItem>
                <SelectItem value="R">R</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-20">
            <label className="text-[11px] text-muted-foreground block text-center">כנף פנימית</label>
            <Select
              value={row.internal_wing || "none"}
              onValueChange={(value) => updateField("internal_wing", value === "none" ? null : value)}
            >
              <SelectTrigger className="h-10 text-base px-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-</SelectItem>
                <SelectItem value="R">ימין</SelectItem>
                <SelectItem value="L">שמאל</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-24">
            <label className="text-[11px] text-muted-foreground block text-center">פתיחה פנימה</label>
            <WingPositionSelector
              value={(row.wing_position as WingPositionValue) || null}
              onChange={(value) => updateField("wing_position", value)}
              size="sm"
            />
          </div>

          <div className="w-24">
            <label className="text-[11px] text-muted-foreground block text-center">פתיחה החוצה</label>
            <WingPositionSelector
              value={(row.wing_position_out as WingPositionValue) || null}
              onChange={(value) => updateField("wing_position_out", value)}
              size="sm"
            />
          </div>

          <div className="w-16">
            <label className="text-[11px] text-muted-foreground block text-center">גליף</label>
            <Input
              value={row.glyph || ""}
              onChange={(e) => updateField("glyph", e.target.value || null)}
              className="h-10 text-lg font-medium px-2 text-center"
              dir="ltr"
            />
          </div>

          <div className="w-16">
            <label className="text-[11px] text-muted-foreground block text-center">עובי קיר</label>
            <Input
              value={row.wall_thickness || ""}
              onChange={(e) => updateField("wall_thickness", e.target.value || null)}
              className="h-10 text-lg font-medium px-2 text-center"
              inputMode="tel"
              dir="ltr"
            />
          </div>

          <div className="w-16">
            <label className="text-[11px] text-muted-foreground block text-center">עומק עד הפריקסט</label>
            <Input
              value={row.depth || ""}
              onChange={(e) => updateField("depth", e.target.value || null)}
              className="h-10 text-lg font-medium px-2 text-center"
              inputMode="tel"
              dir="ltr"
            />
          </div>

          <div className="w-20">
            <label className="text-[11px] text-muted-foreground block text-center">מדרגה בשיש</label>
            <Select
              value={row.jamb_height || "none"}
              onValueChange={(value) => updateField("jamb_height", value === "none" ? null : value)}
            >
              <SelectTrigger className="h-10 text-sm font-medium px-2 text-center">
                <SelectValue placeholder="-" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-</SelectItem>
                <SelectItem value="יש">יש</SelectItem>
                <SelectItem value="אין">אין</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-14">
            <label className="text-[11px] text-muted-foreground block text-center">מנואלה</label>
            <div className="h-10 flex items-center justify-center">
              <input
                type="checkbox"
                checked={row.is_manual || false}
                onChange={(e) => updateField("is_manual", e.target.checked)}
                className="h-5 w-5 rounded border-border"
              />
            </div>
          </div>

          <div className="w-28">
            <label className="text-[11px] text-muted-foreground block text-center">הערות</label>
            <Input
              value={row.field_notes || ""}
              onChange={(e) => updateField("field_notes", e.target.value || null)}
              className="h-10 text-base px-2"
              dir="rtl"
            />
          </div>

          <div className="w-10 flex items-end">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(row.id)}
              disabled={connectionStatus === "offline"}
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
