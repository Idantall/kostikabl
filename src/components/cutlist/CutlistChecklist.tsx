import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface CutlistItemDisplay {
  id?: string;
  profile_code: string;
  description: string;
  dimensions: string;
  quantity: number;
  is_checked?: boolean;
}

export interface CutlistSectionDisplay {
  section_ref: string;
  section_name: string | null;
  notes: string | null;
  items: CutlistItemDisplay[];
}

interface CutlistChecklistProps {
  sections: CutlistSectionDisplay[];
  isPreview?: boolean;
  onToggleItem?: (itemId: string, isChecked: boolean) => void;
}

export function CutlistChecklist({
  sections,
  isPreview = false,
  onToggleItem,
}: CutlistChecklistProps) {
  // Track which sections are open - default to all open
  const [openSections, setOpenSections] = useState<string[]>(
    sections.map((s) => s.section_ref)
  );

  if (sections.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">אין פריטים להצגה</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Accordion
      type="multiple"
      value={openSections}
      onValueChange={setOpenSections}
      className="space-y-3"
    >
      {sections.map((section) => {
        const checkedCount = section.items.filter((i) => i.is_checked).length;
        const totalCount = section.items.length;
        const isComplete = checkedCount === totalCount && totalCount > 0;

        return (
          <AccordionItem
            key={section.section_ref}
            value={section.section_ref}
            className={cn(
              "border rounded-lg overflow-hidden",
              isComplete && "border-green-500 bg-green-50/50 dark:bg-green-950/20"
            )}
          >
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50">
              <div className="flex items-center gap-3 w-full">
                <span className="font-bold text-lg">חלון {section.section_ref}</span>
                {section.section_name && (
                  <span className="text-muted-foreground">- {section.section_name}</span>
                )}
                <Badge
                  variant={isComplete ? "default" : "secondary"}
                  className={cn(
                    "mr-auto",
                    isComplete && "bg-green-600"
                  )}
                >
                  {checkedCount}/{totalCount}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              {section.notes && (
                <p className="text-sm text-muted-foreground mb-3 p-2 bg-muted rounded">
                  {section.notes}
                </p>
              )}
              
              {/* Table header */}
              <div className="grid grid-cols-12 gap-2 mb-2 px-2 text-sm font-medium text-muted-foreground border-b pb-2">
                <div className="col-span-1"></div>
                <div className="col-span-2">פרופיל</div>
                <div className="col-span-4">תיאור</div>
                <div className="col-span-3">מידות</div>
                <div className="col-span-2 text-center">כמות</div>
              </div>

              {/* Items */}
              <div className="space-y-1">
                {section.items.map((item, index) => (
                  <div
                    key={item.id || `${section.section_ref}-${index}`}
                    className={cn(
                      "grid grid-cols-12 gap-2 px-2 py-2 rounded hover:bg-muted/50 transition-colors items-center",
                      item.is_checked && "bg-green-50 dark:bg-green-950/30 opacity-70"
                    )}
                  >
                    <div className="col-span-1">
                      {!isPreview && item.id && (
                        <Checkbox
                          checked={item.is_checked}
                          onCheckedChange={(checked) => {
                            onToggleItem?.(item.id!, !!checked);
                          }}
                        />
                      )}
                    </div>
                    <div className={cn(
                      "col-span-2 font-mono font-medium",
                      item.is_checked && "line-through"
                    )}>
                      {item.profile_code}
                    </div>
                    <div className={cn(
                      "col-span-4 text-sm",
                      item.is_checked && "line-through"
                    )}>
                      {item.description || "-"}
                    </div>
                    <div className={cn(
                      "col-span-3 text-sm font-mono",
                      item.is_checked && "line-through"
                    )}>
                      {item.dimensions || "-"}
                    </div>
                    <div className={cn(
                      "col-span-2 text-center font-bold",
                      item.is_checked && "line-through"
                    )}>
                      {item.quantity}
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}
