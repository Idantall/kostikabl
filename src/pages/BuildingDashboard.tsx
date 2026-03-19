import { useNavigate, useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Building2, Package, Truck, Wrench, Clock, Layers } from "lucide-react";
import { useBuildingDashboardData } from "@/hooks/useBuildingDashboardData";

const STATUS_LABELS: Record<string, string> = {
  pre_contract: "טרום חוזה",
  blind_jambs: "משקופים",
  measurement: "במדידות",
  active: "פעיל",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pre_contract: "outline",
  blind_jambs: "secondary",
  measurement: "secondary",
  active: "default",
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "עכשיו";
  if (mins < 60) return `לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  return `לפני ${Math.floor(hours / 24)} ימים`;
}

const BuildingDashboard = () => {
  const { fatherId, buildingNum } = useParams();
  const navigate = useNavigate();
  const buildingNumber = buildingNum || undefined;

  const { father, projects, aggregated, recentActivity, isLoading, error } =
    useBuildingDashboardData(fatherId, buildingNumber);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  if (error || !father) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-destructive">שגיאה בטעינת בניין</p>
      </div>
    );
  }

  // Separate source projects (measurement/blind_jambs) from batches (active)
  const sourceProjects = projects.filter((p) => ["measurement", "blind_jambs", "pre_contract"].includes(p.status));
  const batchProjects = projects.filter((p) => p.status === "active");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted" dir="rtl">
      {/* Header */}
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(`/father-projects/${fatherId}`)}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">בניין {buildingNumber}</h1>
              <p className="text-sm text-muted-foreground">{father.name}</p>
            </div>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Layers className="h-3.5 w-3.5" />
            {projects.length} פרויקטים
          </Badge>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Aggregated Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <Package className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold">{aggregated.total_items}</p>
              <p className="text-sm text-muted-foreground">סה&quot;כ פריטים</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Truck className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p className="text-2xl font-bold">{aggregated.ready_items}</p>
              <p className="text-sm text-muted-foreground">מוכנים</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Wrench className="h-8 w-8 mx-auto mb-2 text-amber-500" />
              <p className="text-2xl font-bold">{aggregated.partial_items}</p>
              <p className="text-sm text-muted-foreground">חלקי</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-2xl font-bold">{aggregated.not_scanned_items}</p>
              <p className="text-sm text-muted-foreground">טרם נסרקו</p>
            </CardContent>
          </Card>
        </div>

        {/* Overall Progress */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">התקדמות כוללת</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Progress value={aggregated.completionPercent} className="flex-1" />
              <span className="text-lg font-bold min-w-[3rem] text-left">
                {aggregated.completionPercent}%
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {aggregated.ready_items} מתוך {aggregated.total_items} פריטים הושלמו
              {" • "}
              {aggregated.total_floors} קומות
              {" • "}
              {aggregated.total_apartments} דירות
            </p>
          </CardContent>
        </Card>

        {/* Source Projects (measurement/blind_jambs) */}
        {sourceProjects.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">פרויקטי מקור</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sourceProjects.map((proj) => (
                <Link key={proj.id} to={`/projects/${proj.id}`} className="block">
                  <div className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <Building2 className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{proj.name}</p>
                        <Badge variant={STATUS_VARIANTS[proj.status] || "outline"} className="text-xs">
                          {STATUS_LABELS[proj.status] || proj.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {proj.total_floors} קומות • {proj.total_apartments} דירות • {proj.total_items} פריטים
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Batch Projects (active/production) with progress */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">אצוות ייצור</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {batchProjects.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                אין אצוות ייצור עדיין
              </p>
            ) : (
              batchProjects.map((batch) => {
                const pct =
                  batch.total_items > 0
                    ? Math.round((batch.ready_items / batch.total_items) * 100)
                    : 0;
                return (
                  <Link key={batch.id} to={`/projects/${batch.id}`} className="block">
                    <div className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      <Building2 className="h-5 w-5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {batch.production_batch_label || batch.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Progress value={pct} className="flex-1 h-2" />
                          <span className="text-xs text-muted-foreground min-w-[3rem] text-left">
                            {pct}%
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {batch.ready_items}/{batch.total_items} פריטים • {batch.total_floors} קומות
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        {recentActivity.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">פעילות אחרונה</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentActivity.slice(0, 15).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between text-sm py-1.5 border-b last:border-b-0"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={a.mode === "loading" ? "secondary" : "default"}
                        className="text-xs"
                      >
                        {a.mode === "loading" ? "העמסה" : "התקנה"}
                      </Badge>
                      <span>{a.item_code}</span>
                      <span className="text-muted-foreground text-xs">({a.project_label})</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {timeAgo(a.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default BuildingDashboard;
