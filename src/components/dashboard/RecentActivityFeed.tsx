import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Truck, Wrench } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";

interface RecentActivity {
  id: number;
  project_id: number;
  project_name: string;
  item_code: string;
  mode: string;
  created_at: string;
  subpart_code: string;
}

interface RecentActivityFeedProps {
  activities: RecentActivity[];
  isLoading?: boolean;
}

export function RecentActivityFeed({ activities, isLoading }: RecentActivityFeedProps) {
  return (
    <Card className="col-span-1 lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-lg">פעילות אחרונה</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="h-[250px] flex items-center justify-center text-muted-foreground">
            אין פעילות אחרונה
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className={`p-2 rounded-full ${
                    activity.mode === "loading" 
                      ? "bg-orange-100 text-orange-600" 
                      : "bg-green-100 text-green-600"
                  }`}>
                    {activity.mode === "loading" ? (
                      <Truck className="h-4 w-4" />
                    ) : (
                      <Wrench className="h-4 w-4" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">
                        {activity.item_code}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {activity.subpart_code}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground truncate">
                      {activity.project_name}
                    </div>
                  </div>
                  
                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(activity.created_at), {
                      addSuffix: true,
                      locale: he,
                    })}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
