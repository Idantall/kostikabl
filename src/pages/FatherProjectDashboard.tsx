import { useState, useMemo, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowRight, Building2, PlusCircle, Package, Layers, Truck, Clock,
  Trash2, Search, GripVertical, Pencil, Check, X, HardHat,
} from "lucide-react";
import {
  useFatherProjectDetail, useAddBuilding, useRemoveBuilding,
  useUpdateBuildingNumber, useSwapBuildingNumbers, useUpdateFatherProject,
} from "@/hooks/useFatherProjectData";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STATUS_LABELS: Record<string, string> = {
  pre_contract: "טרום חוזה",
  blind_jambs: "משקופים",
  purchasing: "רכש",
  measurement: "במדידות",
  active: "פעיל",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pre_contract: "outline",
  blind_jambs: "secondary",
  measurement: "secondary",
  active: "default",
};

// Father Project Dashboard component
const FatherProjectDashboard = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { father, buildings, metrics, batches, isLoading, error } = useFatherProjectDetail(id);
  const addBuildingMut = useAddBuilding();
  const removeBuildingMut = useRemoveBuilding();
  const updateBuildingNumberMut = useUpdateBuildingNumber();
  const swapBuildingNumbersMut = useSwapBuildingNumbers();
  const updateFatherMut = useUpdateFatherProject();
  const queryClient = useQueryClient();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [buildingNumber, setBuildingNumber] = useState<string>("");
  const [buildingMode, setBuildingMode] = useState<"existing" | "new">("new");

  // Editing building number state
  const [editingBuildingNum, setEditingBuildingNum] = useState<string | null>(null);
  const [editBuildingValue, setEditBuildingValue] = useState<string>("");

  // Editing father project name
  const [editingFatherName, setEditingFatherName] = useState(false);
  const [fatherNameValue, setFatherNameValue] = useState("");

  // Editing sub-project name
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [editProjectNameValue, setEditProjectNameValue] = useState("");

  const updateProjectNameMut = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const { error } = await supabase.from("projects").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["father-project-buildings", fatherId] });
      toast.success("שם הפרויקט עודכן");
      setEditingProjectId(null);
    },
    onError: () => toast.error("שגיאה בעדכון שם"),
  });

  const fatherId = id;

  // Drag state
  const dragBuildingNum = useRef<string | null>(null);
  const [dragOverBuildingNum, setDragOverBuildingNum] = useState<string | null>(null);

  // Fetch all projects for the "add building" dialog
  const { data: allProjects } = useQuery({
    queryKey: ["all-projects-for-father"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, status")
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: showAddDialog,
  });

  // Projects already in any father project
  const { data: usedProjectIds } = useQuery({
    queryKey: ["used-building-project-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("father_project_buildings")
        .select("building_project_id");
      if (error) throw error;
      return new Set(data?.map((d) => d.building_project_id) || []);
    },
    enabled: showAddDialog,
  });

  const availableProjects = useMemo(() => {
    if (!allProjects || !usedProjectIds) return [];
    return allProjects.filter(
      (p) => !usedProjectIds.has(p.id) && p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [allProjects, usedProjectIds, searchQuery]);

  // Existing building numbers in this father project
  const existingBuildingNumbers = useMemo(() => {
    const nums = [...new Set(buildings.map((b) => b.building_number))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return nums;
  }, [buildings]);

  const nextBuildingNumber = useMemo(() => {
    if (buildings.length === 0) return "1";
    const maxNum = Math.max(...buildings.map((b) => parseInt(b.building_number) || 0));
    return String(maxNum + 1);
  }, [buildings]);

  // Group buildings by building_number
  const buildingGroups = useMemo(() => {
    const groups = new Map<string, typeof buildings>();
    for (const b of buildings) {
      const arr = groups.get(b.building_number) || [];
      arr.push(b);
      groups.set(b.building_number, arr);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  }, [buildings]);

  const openAddDialog = (presetBuildingNumber?: string) => {
    setShowAddDialog(true);
    setSelectedProjectId("");
    setSearchQuery("");
    if (presetBuildingNumber !== undefined) {
      setBuildingMode("existing");
      setBuildingNumber(presetBuildingNumber);
    } else {
      setBuildingMode("new");
      setBuildingNumber(nextBuildingNumber);
    }
  };

  const handleAddBuilding = async () => {
    if (!selectedProjectId || !buildingNumber || !id) return;
    try {
      await addBuildingMut.mutateAsync({
        fatherId: id,
        buildingProjectId: Number(selectedProjectId),
        buildingNumber: buildingNumber,
      });
      toast.success("הפרויקט נוסף לבניין בהצלחה");
      setShowAddDialog(false);
      setSelectedProjectId("");
      setBuildingNumber("");
      setSearchQuery("");
    } catch (err: any) {
      if (err?.message?.includes("unique")) {
        toast.error("הפרויקט כבר משויך לפרויקט אב אחר");
      } else {
        toast.error("שגיאה בהוספת פרויקט לבניין");
      }
    }
  };

  const handleRemoveBuilding = async (buildingProjectId: number) => {
    if (!id) return;
    try {
      await removeBuildingMut.mutateAsync({ fatherId: id, buildingProjectId });
      toast.success("הפרויקט הוסר מהבניין");
    } catch {
      toast.error("שגיאה בהסרת פרויקט");
    }
  };

  // Edit building number
  const startEditBuildingNumber = (buildingNum: string) => {
    setEditingBuildingNum(buildingNum);
    setEditBuildingValue(String(buildingNum));
  };

  const confirmEditBuildingNumber = async (oldNumber: string) => {
    const newNumber = editBuildingValue.trim();
    if (!id || !newNumber || newNumber === oldNumber) {
      setEditingBuildingNum(null);
      return;
    }
    const existing = buildings.filter(b => b.building_number === newNumber);
    if (existing.length > 0) {
      toast.error(`בניין ${newNumber} כבר קיים`);
      setEditingBuildingNum(null);
      return;
    }
    try {
      const buildingsToUpdate = buildings.filter(b => b.building_number === oldNumber);
      for (const b of buildingsToUpdate) {
        await updateBuildingNumberMut.mutateAsync({
          fatherId: id,
          buildingProjectId: b.building_project_id,
          newBuildingNumber: newNumber,
        });
      }
      toast.success(`בניין ${oldNumber} שונה ל-${newNumber}`);
    } catch {
      toast.error("שגיאה בעדכון מספר בניין");
    }
    setEditingBuildingNum(null);
  };

  // Drag and drop handlers
  const handleDragStart = (buildingNum: string) => {
    dragBuildingNum.current = buildingNum;
  };

  const handleDragOver = (e: React.DragEvent, buildingNum: string) => {
    e.preventDefault();
    setDragOverBuildingNum(buildingNum);
  };

  const handleDragLeave = () => {
    setDragOverBuildingNum(null);
  };

  const handleDrop = async (targetBuildingNum: string) => {
    setDragOverBuildingNum(null);
    const sourceBuildingNum = dragBuildingNum.current;
    dragBuildingNum.current = null;
    if (!id || sourceBuildingNum === null || sourceBuildingNum === targetBuildingNum) return;
    try {
      await swapBuildingNumbersMut.mutateAsync({
        fatherId: id,
        fromNumber: sourceBuildingNum,
        toNumber: targetBuildingNum,
      });
      toast.success(`בניין ${sourceBuildingNum} ובניין ${targetBuildingNum} הוחלפו`);
    } catch {
      toast.error("שגיאה בהחלפת סדר בניינים");
    }
  };


  const pipeline = useMemo(() => {
    const stages: Record<string, number> = {};
    let totalBatches = 0;
    let totalExportedFloors = 0;
    let totalRemainingFloors = 0;

    for (const b of buildings) {
      const status = b.project_status || "unknown";
      stages[status] = (stages[status] || 0) + 1;
      const m = metrics.get(b.building_project_id);
      if (m) {
        totalBatches += m.batches;
        totalExportedFloors += m.exportedFloors;
        totalRemainingFloors += m.totalFloors - m.exportedFloors;
      }
    }
    return { stages, totalBatches, totalExportedFloors, totalRemainingFloors };
  }, [buildings, metrics]);

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
        <p className="text-destructive">שגיאה בטעינת פרויקט אב</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted" dir="rtl">
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/father-projects")}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            {editingFatherName ? (
              <div className="flex items-center gap-1">
                <Input
                  value={fatherNameValue}
                  onChange={(e) => setFatherNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && fatherNameValue.trim()) {
                      updateFatherMut.mutateAsync({ id: father.id, name: fatherNameValue.trim() });
                      setEditingFatherName(false);
                    }
                    if (e.key === "Escape") setEditingFatherName(false);
                  }}
                  className="w-48 h-8"
                  autoFocus
                  dir="rtl"
                />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => {
                  if (fatherNameValue.trim()) updateFatherMut.mutateAsync({ id: father.id, name: fatherNameValue.trim() });
                  setEditingFatherName(false);
                }}>
                  <Check className="h-3.5 w-3.5 text-green-600" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingFatherName(false)}>
                  <X className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold">{father.name}</h1>
                {father.contractor && (
                  <Badge variant="outline" className="gap-1">
                    <HardHat className="h-3 w-3" />
                    {father.contractor}
                  </Badge>
                )}
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingFatherName(true); setFatherNameValue(father.name); }}>
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </div>
            )}
          </div>
          <Button onClick={() => openAddDialog()} className="gap-2">
            <PlusCircle className="h-4 w-4" />
            הוסף בניין
          </Button>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Pipeline Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <Building2 className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="text-2xl font-bold">{buildingGroups.length}</p>
              <p className="text-sm text-muted-foreground">בניינים</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Truck className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p className="text-2xl font-bold">{pipeline.totalBatches}</p>
              <p className="text-sm text-muted-foreground">אצוות ייצור</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Layers className="h-8 w-8 mx-auto mb-2 text-accent" />
              <p className="text-2xl font-bold">{pipeline.totalExportedFloors}</p>
              <p className="text-sm text-muted-foreground">קומות יוצאו</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-2xl font-bold">{pipeline.totalRemainingFloors}</p>
              <p className="text-sm text-muted-foreground">קומות נותרות</p>
            </CardContent>
          </Card>
        </div>

        {/* Stage breakdown */}
        {Object.keys(pipeline.stages).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(pipeline.stages).map(([status, count]) => (
              <Badge key={status} variant={STATUS_VARIANTS[status] || "outline"} className="text-sm px-3 py-1">
                {STATUS_LABELS[status] || status}: {count}
              </Badge>
            ))}
          </div>
        )}

        {/* Buildings grouped by building_number */}
        {buildingGroups.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">
                עדיין לא נוספו בניינים. לחץ על &quot;הוסף בניין&quot; למעלה.
              </p>
            </CardContent>
          </Card>
        ) : (
          buildingGroups.map(([buildingNum, groupBuildings]) => {
            // Aggregate metrics for the group
            const groupApartments = groupBuildings.reduce((sum, b) => sum + (metrics.get(b.building_project_id)?.apartments ?? 0), 0);
            const groupItems = groupBuildings.reduce((sum, b) => sum + (metrics.get(b.building_project_id)?.items ?? 0), 0);
            const groupTotalFloors = groupBuildings.reduce((sum, b) => sum + (metrics.get(b.building_project_id)?.totalFloors ?? 0), 0);
            const groupExportedFloors = groupBuildings.reduce((sum, b) => sum + (metrics.get(b.building_project_id)?.exportedFloors ?? 0), 0);
            const groupBatches = groupBuildings.reduce((sum, b) => sum + (metrics.get(b.building_project_id)?.batches ?? 0), 0);

            return (
              <Card
                key={buildingNum}
                draggable
                onDragStart={() => handleDragStart(buildingNum)}
                onDragOver={(e) => handleDragOver(e, buildingNum)}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDrop(buildingNum)}
                onDragEnd={() => setDragOverBuildingNum(null)}
                className={`transition-all ${
                  dragOverBuildingNum === buildingNum ? "ring-2 ring-primary ring-offset-2" : ""
                }`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab active:cursor-grabbing" />
                      {editingBuildingNum === buildingNum ? (
                        <div className="flex items-center gap-1">
                          <Building2 className="h-5 w-5 text-primary" />
                          <span className="text-lg font-semibold">בניין</span>
                          <Input
                            type="text"
                            maxLength={10}
                            value={editBuildingValue}
                            onChange={(e) => setEditBuildingValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmEditBuildingNumber(buildingNum);
                              if (e.key === "Escape") setEditingBuildingNum(null);
                            }}
                            dir="ltr"
                            className="w-24 h-8 text-center"
                            autoFocus
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => confirmEditBuildingNumber(buildingNum)}>
                            <Check className="h-3.5 w-3.5 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingBuildingNum(null)}>
                            <X className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      ) : (
                        <Link to={`/father-projects/${id}/building/${buildingNum}`}>
                          <CardTitle className="text-lg flex items-center gap-2 hover:text-primary transition-colors cursor-pointer">
                            <Building2 className="h-5 w-5 text-primary" />
                            בניין {buildingNum}
                            <span className="text-sm font-normal text-muted-foreground">
                              ({groupBuildings.length} פרויקטים)
                            </span>
                          </CardTitle>
                        </Link>
                      )}
                      {editingBuildingNum !== buildingNum && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditBuildingNumber(buildingNum)}>
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => openAddDialog(buildingNum)}
                    >
                      <PlusCircle className="h-3.5 w-3.5" />
                      הוסף פרויקט
                    </Button>
                  </div>
                  {/* Aggregated metrics */}
                  <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                    <span>דירות: {groupApartments}</span>
                    <span>פריטים: {groupItems}</span>
                    <span>קומות: {groupExportedFloors}/{groupTotalFloors}</span>
                    <span>אצוות: {groupBatches}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">שם פרויקט</TableHead>
                          <TableHead className="text-right">שלב</TableHead>
                          <TableHead className="text-right">דירות</TableHead>
                          <TableHead className="text-right">פריטים</TableHead>
                          <TableHead className="text-right">קומות (יוצאו/סה&quot;כ)</TableHead>
                          <TableHead className="text-right">אצוות</TableHead>
                          <TableHead className="text-right"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupBuildings.map((b) => {
                          const m = metrics.get(b.building_project_id);
                          return (
                            <TableRow key={b.building_project_id}>
                              <TableCell>
                                {editingProjectId === b.building_project_id ? (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      value={editProjectNameValue}
                                      onChange={(e) => setEditProjectNameValue(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" && editProjectNameValue.trim()) {
                                          updateProjectNameMut.mutate({ id: b.building_project_id, name: editProjectNameValue.trim() });
                                        }
                                        if (e.key === "Escape") setEditingProjectId(null);
                                      }}
                                      className="w-40 h-7 text-sm"
                                      autoFocus
                                      dir="rtl"
                                    />
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                      if (editProjectNameValue.trim()) updateProjectNameMut.mutate({ id: b.building_project_id, name: editProjectNameValue.trim() });
                                    }}>
                                      <Check className="h-3 w-3 text-green-600" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingProjectId(null)}>
                                      <X className="h-3 w-3 text-destructive" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <Link
                                      to={`/projects/${b.building_project_id}`}
                                      className="text-primary hover:underline font-medium"
                                    >
                                      {b.project_name}
                                    </Link>
                                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingProjectId(b.building_project_id); setEditProjectNameValue(b.project_name || ""); }}>
                                      <Pencil className="h-3 w-3 text-muted-foreground" />
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant={STATUS_VARIANTS[b.project_status || ""] || "outline"}>
                                  {STATUS_LABELS[b.project_status || ""] || b.project_status}
                                </Badge>
                              </TableCell>
                              <TableCell>{m?.apartments ?? "-"}</TableCell>
                              <TableCell>{m?.items ?? "-"}</TableCell>
                              <TableCell>
                                {m ? `${m.exportedFloors}/${m.totalFloors}` : "-"}
                              </TableCell>
                              <TableCell>{m?.batches ?? 0}</TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveBuilding(b.building_project_id)}
                                  disabled={removeBuildingMut.isPending}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}

        {/* Production Feed */}
        {batches.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">אצוות ייצור</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {buildingGroups.map(([buildingNum, groupBuildings]) => {
                const buildingBatches = batches.filter((batch) =>
                  groupBuildings.some((b) => batch.source_measurement_project_id === b.building_project_id)
                );
                if (buildingBatches.length === 0) return null;
                return (
                  <div key={buildingNum} className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground">
                      בניין {buildingNum}
                    </p>
                    {buildingBatches.map((batch) => (
                      <Link
                        key={batch.id}
                        to={`/projects/${batch.id}`}
                        className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-sm font-medium">
                          {batch.production_batch_label || batch.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(batch.created_at).toLocaleDateString("he-IL")}
                        </span>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </main>

      {/* Add Building Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>הוסף פרויקט לבניין</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">בניין</label>
              {existingBuildingNumbers.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      variant={buildingMode === "existing" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setBuildingMode("existing");
                        setBuildingNumber(String(existingBuildingNumbers[0]));
                      }}
                    >
                      בניין קיים
                    </Button>
                    <Button
                      variant={buildingMode === "new" ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        setBuildingMode("new");
                        setBuildingNumber(String(nextBuildingNumber));
                      }}
                    >
                      בניין חדש
                    </Button>
                  </div>
                  {buildingMode === "existing" ? (
                    <Select value={buildingNumber} onValueChange={setBuildingNumber}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="בחר בניין" />
                      </SelectTrigger>
                      <SelectContent>
                        {existingBuildingNumbers.map((num) => {
                          const names = buildings
                            .filter((b) => b.building_number === num)
                            .map((b) => b.project_name)
                            .join(", ");
                          return (
                            <SelectItem key={num} value={String(num)}>
                              בניין {num} ({names})
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type="number"
                      min={1}
                      value={buildingNumber}
                      onChange={(e) => setBuildingNumber(e.target.value)}
                      dir="ltr"
                      className="w-24"
                    />
                  )}
                </div>
              ) : (
                <Input
                  type="number"
                  min={1}
                  value={buildingNumber}
                  onChange={(e) => setBuildingNumber(e.target.value)}
                  dir="ltr"
                  className="w-24"
                />
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">חפש פרויקט</label>
              <div className="relative mb-2">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="חפש..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10"
                  dir="rtl"
                />
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-md">
                {availableProjects.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3 text-center">
                    אין פרויקטים זמינים
                  </p>
                ) : (
                  availableProjects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProjectId(String(p.id))}
                      className={`w-full text-right px-3 py-2 text-sm hover:bg-muted/50 transition-colors flex items-center justify-between ${
                        selectedProjectId === String(p.id) ? "bg-primary/10 font-medium" : ""
                      }`}
                    >
                      <span>{p.name}</span>
                      <Badge variant={STATUS_VARIANTS[p.status] || "outline"} className="text-xs">
                        {STATUS_LABELS[p.status] || p.status}
                      </Badge>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={handleAddBuilding}
              disabled={!selectedProjectId || !buildingNumber || addBuildingMut.isPending}
            >
              {addBuildingMut.isPending ? "מוסיף..." : "הוסף"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FatherProjectDashboard;

