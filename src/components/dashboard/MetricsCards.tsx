import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Package, Truck, Wrench, TrendingUp } from "lucide-react";

interface MetricsCardsProps {
  metrics: {
    activeProjects: number;
    totalItems: number;
    todayLoading: number;
    todayInstall: number;
    completionPercent: number;
  };
  isLoading?: boolean;
}

export function MetricsCards({ metrics, isLoading }: MetricsCardsProps) {
  const cards = [
    {
      title: "פרויקטים פעילים",
      value: metrics.activeProjects,
      icon: Building2,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
    },
    {
      title: "פריטים בעבודה",
      value: metrics.totalItems.toLocaleString(),
      icon: Package,
      color: "text-purple-600",
      bgColor: "bg-purple-100",
    },
    {
      title: "נטענו היום",
      value: metrics.todayLoading,
      icon: Truck,
      color: "text-orange-600",
      bgColor: "bg-orange-100",
    },
    {
      title: "הותקנו היום",
      value: metrics.todayInstall,
      icon: Wrench,
      color: "text-green-600",
      bgColor: "bg-green-100",
    },
    {
      title: "אחוז השלמה",
      value: `${metrics.completionPercent}%`,
      icon: TrendingUp,
      color: "text-emerald-600",
      bgColor: "bg-emerald-100",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <Card key={card.title} className="relative overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
            <div className={`p-2 rounded-lg ${card.bgColor}`}>
              <card.icon className={`h-4 w-4 ${card.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-8 w-20 bg-muted animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold">{card.value}</div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
