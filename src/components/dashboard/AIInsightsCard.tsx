import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, RefreshCw, Loader2, AlertTriangle, CheckCircle, TrendingUp, Lightbulb, Clock, Target, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Insight {
  type: "warning" | "success" | "info" | "tip" | "trend" | "prediction";
  text: string;
  priority?: number;
}

interface AIInsightsCardProps {
  isLoading: boolean;
}

const ISSUE_CODES: Record<string, string> = {
  "GLASS_BROKEN": "זכוכית שבורה",
  "MOTOR_FAULT": "תקלה במנוע",
  "SHUTTER_DAMAGED": "תריס פגום",
  "RAILS_MISSING": "מסילות חסרות",
  "ANGLES_MISSING": "זוויות חסרות",
  "BOX_SILL_MISSING": "ארגז/אדן חסר"
};

export function AIInsightsCard({ isLoading: parentLoading }: AIInsightsCardProps) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchInsights = async () => {
    try {
      const newInsights: Insight[] = [];

      // Get active projects
      const { data: projects } = await supabase
        .from("v_project_totals")
        .select("*")
        .eq("status", "active");

      // Get recent scan events for trend analysis (last 14 days)
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const { data: recentEvents } = await supabase
        .from("scan_events")
        .select("created_at, mode, loading_mark, project_id")
        .gte("created_at", fourteenDaysAgo.toISOString())
        .order("created_at", { ascending: true });

      // Get recent issues (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data: recentIssues } = await supabase
        .from("scan_events")
        .select("issue_code, project_id, created_at")
        .not("issue_code", "is", null)
        .gte("created_at", thirtyDaysAgo.toISOString());

      // === PRODUCTIVITY TREND ANALYSIS ===
      if (recentEvents && recentEvents.length > 0) {
        // Split events into first week and second week
        const firstWeekEvents = recentEvents.filter(e => 
          new Date(e.created_at) < sevenDaysAgo
        );
        const secondWeekEvents = recentEvents.filter(e => 
          new Date(e.created_at) >= sevenDaysAgo
        );
        
        if (firstWeekEvents.length > 0 && secondWeekEvents.length > 0) {
          const trendPercent = Math.round(
            ((secondWeekEvents.length - firstWeekEvents.length) / firstWeekEvents.length) * 100
          );
          
          if (trendPercent > 20) {
            newInsights.push({
              type: "trend",
              text: `מגמה חיובית: פעילות עלתה ב-${trendPercent}% בשבוע האחרון`,
              priority: 2
            });
          } else if (trendPercent < -20) {
            newInsights.push({
              type: "warning",
              text: `האטה בפעילות: ירידה של ${Math.abs(trendPercent)}% בשבוע האחרון`,
              priority: 1
            });
          }
        }
        
        // Calculate daily average
        const daysWithActivity = new Set(
          recentEvents.map(e => new Date(e.created_at).toDateString())
        ).size;
        const avgPerDay = Math.round(recentEvents.length / daysWithActivity);
        
        newInsights.push({
          type: "info",
          text: `ממוצע יומי: ${avgPerDay} פעולות (${recentEvents.length} ב-${daysWithActivity} ימים)`,
          priority: 5
        });
        
        // Find peak hours
        const hourCounts: Record<number, number> = {};
        recentEvents.forEach(e => {
          const hour = new Date(e.created_at).getHours();
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });
        const peakHour = Object.entries(hourCounts)
          .sort(([, a], [, b]) => b - a)[0];
        if (peakHour) {
          newInsights.push({
            type: "tip",
            text: `שעת השיא: ${peakHour[0]}:00 - הזמן הפרודוקטיבי ביותר`,
            priority: 6
          });
        }
      }

      // === PROJECT PROGRESS & VELOCITY ===
      if (projects && projects.length > 0) {
        // Calculate velocity for each project
        const projectVelocities = await Promise.all(
          projects.map(async (p) => {
            const { data: events } = await supabase
              .from("scan_events")
              .select("created_at")
              .eq("project_id", p.project_id)
              .eq("mode", "loading")
              .eq("loading_mark", true)
              .gte("created_at", sevenDaysAgo.toISOString());
            
            const completedLast7Days = events?.length || 0;
            const velocityPerDay = completedLast7Days / 7;
            const remaining = p.not_scanned_items || 0;
            const daysToComplete = velocityPerDay > 0 ? Math.ceil(remaining / velocityPerDay) : null;
            
            return {
              ...p,
              velocityPerDay,
              daysToComplete
            };
          })
        );

        // Find project needing attention (most unscanned items)
        const sortedByUnscanned = [...projects]
          .filter(p => p.not_scanned_items && p.not_scanned_items > 0)
          .sort((a, b) => (b.not_scanned_items || 0) - (a.not_scanned_items || 0));

        if (sortedByUnscanned.length > 0) {
          const top = sortedByUnscanned[0];
          newInsights.push({
            type: "warning",
            text: `"${top.name}" דורש תשומת לב - ${top.not_scanned_items} פריטים טרם נסרקו`,
            priority: 1
          });
        }

        // Find projects nearing completion with ETA
        const nearCompletion = projectVelocities
          .filter(p => p.total_items && p.total_items > 0)
          .map(p => ({
            ...p,
            progress: ((p.ready_items || 0) / (p.total_items || 1)) * 100
          }))
          .filter(p => p.progress >= 70 && p.progress < 100)
          .sort((a, b) => b.progress - a.progress);

        if (nearCompletion.length > 0) {
          const top = nearCompletion[0];
          const etaText = top.daysToComplete 
            ? ` - סיום משוער: ${top.daysToComplete} ימים`
            : '';
          newInsights.push({
            type: "success",
            text: `"${top.name}" קרוב לסיום (${Math.round(top.progress)}%)${etaText}`,
            priority: 2
          });
        }

        // Find stalled projects (have items but no activity)
        const stalledProjects = projectVelocities.filter(
          p => p.not_scanned_items && p.not_scanned_items > 10 && p.velocityPerDay === 0
        );
        if (stalledProjects.length > 0) {
          newInsights.push({
            type: "warning",
            text: `${stalledProjects.length} פרויקטים ללא פעילות בשבוע האחרון`,
            priority: 1
          });
        }

        // Overall stats with prediction
        const totalItems = projects.reduce((sum, p) => sum + (p.total_items || 0), 0);
        const readyItems = projects.reduce((sum, p) => sum + (p.ready_items || 0), 0);
        const totalVelocity = projectVelocities.reduce((sum, p) => sum + p.velocityPerDay, 0);
        const remainingItems = totalItems - readyItems;
        const overallEta = totalVelocity > 0 ? Math.ceil(remainingItems / totalVelocity) : null;
        
        if (totalItems > 0) {
          const overallProgress = Math.round((readyItems / totalItems) * 100);
          const etaText = overallEta ? ` (סיום ב-${overallEta} ימים לפי קצב נוכחי)` : '';
          newInsights.push({
            type: "prediction",
            text: `התקדמות כוללת: ${overallProgress}% (${readyItems}/${totalItems})${etaText}`,
            priority: 3
          });
        }
      }

      // === ISSUE TREND ANALYSIS ===
      if (recentIssues && recentIssues.length > 0) {
        // Split issues into periods for trend
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
        
        const oldIssues = recentIssues.filter(i => new Date(i.created_at) < fifteenDaysAgo);
        const newIssues = recentIssues.filter(i => new Date(i.created_at) >= fifteenDaysAgo);
        
        if (oldIssues.length > 0 && newIssues.length > oldIssues.length * 1.5) {
          newInsights.push({
            type: "warning",
            text: `עלייה בתקלות: ${newIssues.length} תקלות ב-15 ימים אחרונים לעומת ${oldIssues.length} קודם`,
            priority: 1
          });
        } else if (newIssues.length < oldIssues.length * 0.5 && oldIssues.length > 5) {
          newInsights.push({
            type: "success",
            text: `ירידה בתקלות: שיפור של ${Math.round((1 - newIssues.length / oldIssues.length) * 100)}% בחודש האחרון`,
            priority: 2
          });
        }

        // Find most common issue
        const issueCounts: Record<string, number> = {};
        recentIssues.forEach(issue => {
          issueCounts[issue.issue_code] = (issueCounts[issue.issue_code] || 0) + 1;
        });

        const sorted = Object.entries(issueCounts).sort(([, a], [, b]) => b - a);
        if (sorted.length > 0) {
          const [topIssue, count] = sorted[0];
          const issueName = ISSUE_CODES[topIssue] || topIssue;
          const percent = Math.round((count / recentIssues.length) * 100);
          newInsights.push({
            type: "tip",
            text: `התקלה הנפוצה: ${issueName} (${percent}% מהתקלות) - שווה לבדוק את הגורם`,
            priority: 4
          });
        }
      } else {
        newInsights.push({
          type: "success",
          text: "לא דווחו תקלות ב-30 הימים האחרונים",
          priority: 3
        });
      }

      // Sort by priority and take top insights
      newInsights.sort((a, b) => (a.priority || 10) - (b.priority || 10));
      setInsights(newInsights.slice(0, 6));
    } catch (error) {
      console.error("Error fetching AI insights:", error);
      setInsights([{
        type: "info",
        text: "לא ניתן לטעון תובנות כרגע"
      }]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!parentLoading) {
      fetchInsights();
    }
  }, [parentLoading]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchInsights();
  };

  const getIcon = (type: Insight["type"]) => {
    switch (type) {
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "success":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "info":
        return <TrendingUp className="h-4 w-4 text-blue-500" />;
      case "tip":
        return <Lightbulb className="h-4 w-4 text-purple-500" />;
      case "trend":
        return <Zap className="h-4 w-4 text-emerald-500" />;
      case "prediction":
        return <Target className="h-4 w-4 text-indigo-500" />;
    }
  };

  const getBackground = (type: Insight["type"]) => {
    switch (type) {
      case "warning":
        return "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800";
      case "success":
        return "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800";
      case "info":
        return "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800";
      case "tip":
        return "bg-purple-50 border-purple-200 dark:bg-purple-950/30 dark:border-purple-800";
      case "trend":
        return "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800";
      case "prediction":
        return "bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800";
    }
  };

  if (loading || parentLoading) {
    return (
      <Card className="lg:col-span-3">
        <CardHeader className="flex flex-row items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">תובנות AI</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-3">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">תובנות AI</CardTitle>
        </div>
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleRefresh}
          disabled={refreshing}
          className="h-8 w-8"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {insights.map((insight, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 p-3 rounded-lg border ${getBackground(insight.type)}`}
            >
              <div className="mt-0.5 shrink-0">{getIcon(insight.type)}</div>
              <p className="text-sm text-foreground leading-relaxed">{insight.text}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}