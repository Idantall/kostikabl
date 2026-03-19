import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wifi, WifiOff, Loader2, AlertTriangle, RefreshCw, Check } from "lucide-react";
import { ConnectionStatus } from "@/hooks/useOfflineSync";
import { cn } from "@/lib/utils";

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus;
  pendingCount: number;
  lastError: string | null;
  onRetry?: () => void;
  className?: string;
}

export function ConnectionStatusBadge({
  status,
  pendingCount,
  lastError,
  onRetry,
  className,
}: ConnectionStatusBadgeProps) {
  if (status === 'online' && pendingCount === 0) {
    return (
      <Badge variant="outline" className={cn("gap-1 text-green-600 border-green-600", className)}>
        <Check className="h-3 w-3" />
        נשמר
      </Badge>
    );
  }

  if (status === 'syncing') {
    return (
      <Badge variant="secondary" className={cn("gap-1", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        מסנכרן... {pendingCount > 0 && `(${pendingCount})`}
      </Badge>
    );
  }

  if (status === 'offline') {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <Badge variant="destructive" className="gap-1">
          <WifiOff className="h-3 w-3" />
          אופליין
          {pendingCount > 0 && ` (${pendingCount})`}
        </Badge>
        {onRetry && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRetry}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={cn("flex items-center gap-1", className)}>
        <Badge variant="destructive" className="gap-1">
          <AlertTriangle className="h-3 w-3" />
          שגיאה
          {pendingCount > 0 && ` (${pendingCount})`}
        </Badge>
        {onRetry && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRetry}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        )}
      </div>
    );
  }

  // Pending updates but connected
  if (pendingCount > 0) {
    return (
      <Badge variant="secondary" className={cn("gap-1", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        ממתין ({pendingCount})
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={cn("gap-1 text-green-600 border-green-600", className)}>
      <Wifi className="h-3 w-3" />
      מחובר
    </Badge>
  );
}
