import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Building2, PlusCircle, ArrowRight, LayoutDashboard, Trash2, HardHat, Package } from "lucide-react";
import { useFatherProjects, useCreateFatherProject, useDeleteFatherProject } from "@/hooks/useFatherProjectData";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
  pre_contract: "טרום חוזה",
  blind_jambs: "משקופים",
  purchasing: "רכש",
  measurement: "במדידות",
  active: "פעיל",
};

const FatherProjects = () => {
  const navigate = useNavigate();
  const { data: fatherProjects, isLoading } = useFatherProjects();
  const createMutation = useCreateFatherProject();
  const deleteMutation = useDeleteFatherProject();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContractor, setNewContractor] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [selectedContractorFilter, setSelectedContractorFilter] = useState<string>("all");

  // Fetch building counts and status summary per father project
  const fatherIds = useMemo(() => fatherProjects?.map(fp => fp.id) || [], [fatherProjects]);
  
  const { data: buildingSummaries } = useQuery({
    queryKey: ["father-project-summaries", fatherIds],
    queryFn: async () => {
      if (fatherIds.length === 0) return new Map();
      
      const { data: links, error } = await supabase
        .from("father_project_buildings")
        .select("father_project_id, building_project_id, building_number")
        .in("father_project_id", fatherIds);
      if (error) throw error;
      
      const projectIds = [...new Set(links?.map(l => l.building_project_id) || [])];
      const { data: projects } = await supabase
        .from("projects")
        .select("id, status")
        .in("id", projectIds);
      const projectStatusMap = new Map(projects?.map(p => [p.id, p.status]) || []);
      
      const summaryMap = new Map<string, { 
        buildingCount: number; 
        projectCount: number;
        statusCounts: Record<string, number>;
      }>();
      
      for (const fId of fatherIds) {
        const fLinks = links?.filter(l => l.father_project_id === fId) || [];
        const buildingNums = new Set(fLinks.map(l => l.building_number));
        const statusCounts: Record<string, number> = {};
        for (const link of fLinks) {
          const status = projectStatusMap.get(link.building_project_id) || "unknown";
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        }
        summaryMap.set(fId, {
          buildingCount: buildingNums.size,
          projectCount: fLinks.length,
          statusCounts,
        });
      }
      return summaryMap;
    },
    enabled: fatherIds.length > 0,
  });

  // Unique contractors for filtering
  const contractors = useMemo(() => {
    if (!fatherProjects) return [];
    const set = new Set(fatherProjects.map(fp => fp.contractor).filter(Boolean) as string[]);
    return [...set].sort();
  }, [fatherProjects]);

  const filteredProjects = useMemo(() => {
    if (!fatherProjects) return [];
    if (selectedContractorFilter === "all") return fatherProjects;
    if (selectedContractorFilter === "none") return fatherProjects.filter(fp => !fp.contractor);
    return fatherProjects.filter(fp => fp.contractor === selectedContractorFilter);
  }, [fatherProjects, selectedContractorFilter]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const result = await createMutation.mutateAsync({ name: newName.trim(), contractor: newContractor.trim() || undefined });
      toast.success("פרויקט אב נוצר בהצלחה");
      setShowCreate(false);
      setNewName("");
      setNewContractor("");
      navigate(`/father-projects/${result.id}`);
    } catch {
      toast.error("שגיאה ביצירת פרויקט אב");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      toast.success("פרויקט אב נמחק בהצלחה");
      setDeleteTarget(null);
    } catch {
      toast.error("שגיאה במחיקת פרויקט אב");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted" dir="rtl">
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/projects")}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold">פרויקטי אב</h1>
          </div>
          <div className="flex gap-2">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm">
                <LayoutDashboard className="h-4 w-4 ml-2" />
                דשבורד
              </Button>
            </Link>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <PlusCircle className="h-4 w-4" />
              פרויקט אב חדש
            </Button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        {/* Contractor filter */}
        {contractors.length > 0 && (
          <div className="mb-4 flex items-center gap-2">
            <HardHat className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedContractorFilter} onValueChange={setSelectedContractorFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="סנן לפי קבלן" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הקבלנים</SelectItem>
                <SelectItem value="none">ללא קבלן</SelectItem>
                {contractors.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {(!filteredProjects || filteredProjects.length === 0) ? (
          <Card className="text-center py-12">
            <CardContent>
              <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-4">עדיין אין פרויקטי אב</p>
              <Button onClick={() => setShowCreate(true)} className="gap-2">
                <PlusCircle className="h-4 w-4" />
                צור פרויקט אב ראשון
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((fp) => {
              const summary = buildingSummaries?.get(fp.id);
              return (
                <div key={fp.id} className="relative group">
                  <Link to={`/father-projects/${fp.id}`}>
                    <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Building2 className="h-5 w-5 text-primary" />
                          {fp.name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {fp.contractor && (
                          <Badge variant="outline" className="gap-1">
                            <HardHat className="h-3 w-3" />
                            {fp.contractor}
                          </Badge>
                        )}
                        
                        {/* Building & project counts */}
                        {summary && (
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5" />
                              {summary.buildingCount} בניינים
                            </span>
                            <span className="flex items-center gap-1">
                              <Package className="h-3.5 w-3.5" />
                              {summary.projectCount} פרויקטים
                            </span>
                          </div>
                        )}
                        
                        {/* Status breakdown */}
                        {summary && Object.keys(summary.statusCounts).length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(summary.statusCounts).map(([status, count]: [string, number]) => (
                              <Badge key={status} variant="secondary" className="text-[10px] px-1.5 py-0">
                                {STATUS_LABELS[status] || status}: {count}
                              </Badge>
                            ))}
                          </div>
                        )}
                        
                        <p className="text-xs text-muted-foreground">
                          נוצר {new Date(fp.created_at).toLocaleDateString("he-IL")}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 left-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteTarget({ id: fp.id, name: fp.name });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>פרויקט אב חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="שם הפרויקט"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              dir="rtl"
            />
            <Input
              placeholder="שם קבלן (אופציונלי)"
              value={newContractor}
              onChange={(e) => setNewContractor(e.target.value)}
              dir="rtl"
            />
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={!newName.trim() || createMutation.isPending}>
              {createMutation.isPending ? "יוצר..." : "צור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת פרויקט אב</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את "{deleteTarget?.name}"? פעולה זו תסיר את כל שיוכי הבניינים.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "מוחק..." : "מחק"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FatherProjects;