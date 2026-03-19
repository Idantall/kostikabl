import { useCutlistLanguage } from "@/contexts/CutlistLanguageContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe } from "lucide-react";

export function CutlistLanguageSelector() {
  const { language, setLanguage, t } = useCutlistLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Globe className="h-4 w-4" />
          {language === "he" ? "עברית" : "ไทย"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setLanguage("he")}
          className={language === "he" ? "bg-muted" : ""}
        >
          🇮🇱 עברית (Hebrew)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLanguage("th")}
          className={language === "th" ? "bg-muted" : ""}
        >
          🇹🇭 ไทย (Thai)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
