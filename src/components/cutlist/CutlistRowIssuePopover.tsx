import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

interface CutlistRowIssuePopoverProps {
  issueText: string;
}

export function CutlistRowIssuePopover({ issueText }: CutlistRowIssuePopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant="destructive"
          className="cursor-pointer gap-1"
        >
          <AlertTriangle className="h-3 w-3" />
          תקלה
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-64" dir="rtl">
        <div className="space-y-2">
          <p className="font-medium text-sm">פרטי תקלה:</p>
          <p className="text-sm text-muted-foreground">{issueText}</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
