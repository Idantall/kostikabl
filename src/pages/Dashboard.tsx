import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, FolderOpen, LayoutDashboard, Plus, Scissors, Shield } from "lucide-react";
import { useDashboardData, buildAIContext } from "@/hooks/useDashboardData";
import { MetricsCards } from "@/components/dashboard/MetricsCards";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { ProjectProgressChart } from "@/components/dashboard/ProjectProgressChart";
import { StatusPieChart } from "@/components/dashboard/StatusPieChart";
import { RecentActivityFeed } from "@/components/dashboard/RecentActivityFeed";
import { AIInsightsCard } from "@/components/dashboard/AIInsightsCard";
import { WorkerMetricsCard } from "@/components/dashboard/WorkerMetricsCard";
import { StationPerformanceChart } from "@/components/dashboard/StationPerformanceChart";
import { ProjectManufacturingOverview } from "@/components/dashboard/ProjectManufacturingOverview";
import { AIChatAssistant } from "@/components/AIChatAssistant";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { useIsOwner } from "@/hooks/useRBAC";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import kostikaLogo from "@/assets/kostika-logo-new.jpg";

export default function Dashboard() {
  const dashboardData = useDashboardData();
  const { projects, metrics, activityChart, recentActivity, isLoading } = dashboardData;
  const { isOwner } = useIsOwner();
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);

  const aiContext = buildAIContext(dashboardData);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Navigation */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            <img src={kostikaLogo} alt="Kostika" className="h-6 sm:h-8 w-auto shrink-0" />
            <div className="flex items-center gap-1">
              {isOwner && (
                <Sheet open={adminPanelOpen} onOpenChange={setAdminPanelOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3 text-xs sm:text-sm gap-1">
                      <Shield className="h-4 w-4" />
                      <span className="hidden sm:inline">הרשאות</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
                    <AdminPanel onClose={() => setAdminPanelOpen(false)} />
                  </SheetContent>
                </Sheet>
              )}
              <Button variant="outline" size="sm" asChild className="h-8 px-2 sm:px-3 text-xs sm:text-sm">
                <Link to="/import">
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline mr-1">פרויקט חדש</span>
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild className="h-8 px-2">
                <Link to="/logout" className="flex items-center gap-1">
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">התנתק</span>
                </Link>
              </Button>
            </div>
          </div>
          <nav className="flex items-center gap-1 mt-2 overflow-x-auto pb-1 -mb-1">
            <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs shrink-0">
              <Link to="/dashboard" className="flex items-center gap-1">
                <LayoutDashboard className="h-3.5 w-3.5" />
                <span>לוח בקרה</span>
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs shrink-0">
              <Link to="/projects" className="flex items-center gap-1">
                <FolderOpen className="h-3.5 w-3.5" />
                <span>פרויקטים</span>
              </Link>
            </Button>
            <Button variant="ghost" size="sm" asChild className="h-7 px-2 text-xs shrink-0">
              <Link to="/worker" className="flex items-center gap-1">
                <Scissors className="h-3.5 w-3.5" />
                <span>פורטל עובדים</span>
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Page title */}
        <div>
          <h2 className="text-2xl font-bold">לוח בקרה מנהלים</h2>
          <p className="text-muted-foreground">סקירה כללית של כל הפרויקטים והפעילות</p>
        </div>

        {/* AI Insights - NEW */}
        <div className="grid grid-cols-1 gap-6">
          <AIInsightsCard isLoading={isLoading} />
        </div>

        {/* Metrics cards */}
        <MetricsCards metrics={metrics} isLoading={isLoading} />

        {/* Charts row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ActivityChart data={activityChart} isLoading={isLoading} />
          <ProjectProgressChart projects={projects} isLoading={isLoading} />
        </div>

        {/* Charts row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <StatusPieChart metrics={metrics} isLoading={isLoading} />
          <RecentActivityFeed activities={recentActivity} isLoading={isLoading} />
        </div>

        {/* Station Performance Chart - visible to owners/managers */}
        {isOwner && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <StationPerformanceChart />
            <StatusPieChart metrics={metrics} isLoading={isLoading} />
          </div>
        )}

        {/* Project Manufacturing Overview - NEW */}
        {isOwner && (
          <ProjectManufacturingOverview />
        )}

        {/* Worker Metrics - NEW */}
        {isOwner && (
          <WorkerMetricsCard />
        )}
      </main>

      {/* AI Chat Assistant */}
      <AIChatAssistant context={aiContext} />
    </div>
  );
}
