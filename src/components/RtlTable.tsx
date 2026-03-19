import * as React from "react";
import { cn } from "@/lib/utils";

// Generic RTL table with column width locking via <colgroup>
type Col = { key: string; width?: number | string; align?: "right" | "left" | "center" };

interface RtlTableProps {
  columns: Col[];                 // in visual RTL order (rightmost first)
  className?: string;
  children: React.ReactNode;      // <thead> + <tbody>
}

export function RtlTable({ columns, className, children }: RtlTableProps) {
  return (
    <div className="overflow-x-auto">
      <table
        dir="rtl"
        className={cn(
          "w-full table-fixed border-collapse",     // fixed layout
          "text-sm leading-6",                     // consistent typography
          "data-table",                            // for tabular numerals
          className
        )}
      >
        <colgroup>
          {columns.map((c, i) => (
            <col
              key={c.key || i}
              style={{
                width: typeof c.width === "number" ? `${c.width}px` : c.width,
              }}
            />
          ))}
        </colgroup>
        {children}
      </table>
    </div>
  );
}
