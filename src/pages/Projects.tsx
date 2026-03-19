import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, LogOut, FolderOpen, Trash2, Pencil, LayoutDashboard, Search, Ruler, Building2, FolderInput, FileText, ChevronDown, ChevronUp, Layers, Unlink, AlertTriangle, FilePenLine } from "lucide-react";
import kostikaLogo from "@/assets/kostika-logo-new.png";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectFolders } from "@/components/projects/ProjectFolders";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useParentProjectGroupings, useAvailableParentProjects, useProjectStructureComparison } from "@/hooks/useParentProjectData";
import { Alert, AlertDescription } from "@/components/ui/alert";

const DELETE_CODE = "14477";
const Projects = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [projectToDelete, setProjectToDelete] = useState<number | null>(null);
  const [deleteCode, setDeleteCode] = useState("");
  const [projectToEdit, setProjectToEdit] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [editedName, setEditedName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"active" | "measurement" | "blind_jambs" | "archived" | "drafts" | "trash">("active");
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [projectToMove, setProjectToMove] = useState<{ id: number; name: string; folder_id: string | null } | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);
  const [projectToGroup, setProjectToGroup] = useState<{ id: number; name: string; parent_project_id: number | null } | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string>("new");
  const queryClient = useQueryClient();
  const {
    data: projects,
    isLoading: projectsLoading
  } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, building_code, status, folder_id, created_at, parent_project_id, production_batch_label, is_archived, deleted_at")
        .order("id", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  const { data: projectTotals } = useQuery({
    queryKey: ["project-totals"],
    queryFn: async () => {
      const { data, error } = await supabase.from("v_project_totals").select("*");
      if (error) throw error;
      return data;
    },
    enabled: !!user
  });

  const { data: drafts, isLoading: draftsLoading } = useQuery({
    queryKey: ["wizard-drafts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_wizard_drafts")
        .select("id, name, created_at, updated_at, project_type")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (draftId: string) => {
      const { error } = await supabase
        .from("project_wizard_drafts")
        .delete()
        .eq("id", draftId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wizard-drafts"] });
      toast.success("הטיוטה נמחקה בהצלחה");
    },
    onError: () => {
      toast.error("שגיאה במחיקת הטיוטה");
    },
  });

  const { data: folders } = useQuery({
    queryKey: ["project-folders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_folders")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Combine projects with totals
  const projectsWithTotals = useMemo(() => {
    if (!projects) return [];
    return projects.map(project => {
      const totals = projectTotals?.find(t => t.project_id === project.id);
      return {
        ...project,
        project_id: project.id,
        total_floors: totals?.total_floors || 0,
        total_apartments: totals?.total_apartments || 0,
        total_items: totals?.total_items || 0,
      };
    });
  }, [projects, projectTotals]);
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      // Soft-delete: set deleted_at timestamp instead of hard-deleting
      const { error } = await supabase
        .from("projects")
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq("id", projectId);
      if (error) throw error;
    },
    onMutate: async (projectId) => {
      await queryClient.cancelQueries({ queryKey: ["projects"] });
      const previous = queryClient.getQueryData(["projects"]);
      queryClient.setQueryData(["projects"], (old: any) => 
        old?.map((p: any) => p.id === projectId ? { ...p, deleted_at: new Date().toISOString() } : p) || []
      );
      return { previous };
    },
    onSuccess: () => {
      toast.success("הפרויקט הועבר לפח. ניתן לשחזר תוך 30 יום.");
    },
    onError: (error, _, context) => {
      console.error("Error deleting project:", error);
      toast.error("שגיאה במחיקת הפרויקט");
      if (context?.previous) {
        queryClient.setQueryData(["projects"], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setProjectToDelete(null);
      setDeleteCode("");
    }
  });

  const restoreProjectMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const { error } = await supabase
        .from("projects")
        .update({ deleted_at: null } as any)
        .eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("הפרויקט שוחזר בהצלחה!");
    },
    onError: () => {
      toast.error("שגיאה בשחזור הפרויקט");
    },
  });
  const updateProjectMutation = useMutation({
    mutationFn: async ({
      id,
      name
    }: {
      id: number;
      name: string;
    }) => {
      const {
        error
      } = await supabase.from("projects").update({
        name: name.trim()
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["projects"]
      });
      toast.success("שם הפרויקט עודכן בהצלחה");
      setProjectToEdit(null);
      setEditedName("");
    },
    onError: error => {
      console.error("Error updating project:", error);
      toast.error("שגיאה בעדכון שם הפרויקט");
    }
  });
  const handleDeleteClick = (e: React.MouseEvent, projectId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setProjectToDelete(projectId);
    setDeleteCode("");
  };
  const handleEditClick = (e: React.MouseEvent, project: {
    id: number;
    name: string;
  }) => {
    e.preventDefault();
    e.stopPropagation();
    setProjectToEdit(project);
    setEditedName(project.name);
  };
  const confirmDelete = () => {
    if (projectToDelete && deleteCode === DELETE_CODE) {
      deleteProjectMutation.mutate(projectToDelete);
    } else {
      toast.error("קוד מחיקה שגוי");
    }
  };
  const confirmEdit = () => {
    if (projectToEdit && editedName.trim()) {
      updateProjectMutation.mutate({
        id: projectToEdit.id,
        name: editedName
      });
    }
  };

  const handleMoveClick = (e: React.MouseEvent, project: { id: number; name: string; folder_id: string | null }) => {
    e.preventDefault();
    e.stopPropagation();
    setProjectToMove({ id: project.id, name: project.name, folder_id: project.folder_id || null });
    setTargetFolderId(project.folder_id || 'none');
  };

  const moveProjectMutation = useMutation({
    mutationFn: async ({ projectId, folderId }: { projectId: number; folderId: string | null }) => {
      const { error } = await supabase
        .from("projects")
        .update({ folder_id: folderId })
        .eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("הפרויקט הועבר בהצלחה");
      setProjectToMove(null);
    },
    onError: () => {
      toast.error("שגיאה בהעברת הפרויקט");
    },
  });

  const confirmMove = () => {
    if (projectToMove) {
      const folderId = targetFolderId === 'none' ? null : targetFolderId;
      moveProjectMutation.mutate({ projectId: projectToMove.id, folderId });
    }
  };

  const { data: availableParents } = useAvailableParentProjects();
  const { data: structureComparison } = useProjectStructureComparison(
    projectToGroup?.id,
    selectedParentId !== "new" ? Number(selectedParentId) : undefined
  );

  const handleGroupClick = (e: React.MouseEvent, project: { id: number; name: string; parent_project_id: number | null }) => {
    e.preventDefault();
    e.stopPropagation();
    setProjectToGroup(project);
    setSelectedParentId("new");
  };

  const handleUngroupClick = (e: React.MouseEvent, projectId: number) => {
    e.preventDefault();
    e.stopPropagation();
    ungroupMutation.mutate(projectId);
  };

  const groupMutation = useMutation({
    mutationFn: async ({ projectId, parentId }: { projectId: number; parentId: number }) => {
      // If "new group", set the project as its own parent
      if (parentId === projectId) {
        const { error } = await supabase
          .from("projects")
          .update({ parent_project_id: projectId })
          .eq("id", projectId);
        if (error) throw error;
      } else {
        // Assign to existing parent
        const { error } = await supabase
          .from("projects")
          .update({ parent_project_id: parentId })
          .eq("id", projectId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["available-parent-projects"] });
      queryClient.invalidateQueries({ queryKey: ["parent-project-groupings"] });
      toast.success("הפרויקט קובץ בהצלחה");
      setProjectToGroup(null);
    },
    onError: () => {
      toast.error("שגיאה בקיבוץ הפרויקט");
    },
  });

  const ungroupMutation = useMutation({
    mutationFn: async (projectId: number) => {
      const { error } = await supabase
        .from("projects")
        .update({ parent_project_id: null })
        .eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["available-parent-projects"] });
      queryClient.invalidateQueries({ queryKey: ["parent-project-groupings"] });
      toast.success("הפרויקט הוסר מהקבוצה");
    },
    onError: () => {
      toast.error("שגיאה בהסרת הפרויקט מהקבוצה");
    },
  });

  const confirmGroup = () => {
    if (!projectToGroup) return;
    if (selectedParentId === "new") {
      groupMutation.mutate({ projectId: projectToGroup.id, parentId: projectToGroup.id });
    } else {
      groupMutation.mutate({ projectId: projectToGroup.id, parentId: Number(selectedParentId) });
    }
  };

  const filteredProjects = useMemo(() => {
    if (!projectsWithTotals) return { active: [], measurement: [], blind_jambs: [], pre_contract: [], archived: [], trash: [] };
    
    // Separate deleted (trash) from non-deleted
    const notDeleted = projectsWithTotals.filter((p: any) => !p.deleted_at);
    const deleted = projectsWithTotals.filter((p: any) => !!p.deleted_at);
    
    let filtered = notDeleted.filter((project: any) =>
      project.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.building_code?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (selectedFolderIds.length > 0) {
      filtered = filtered.filter((p: any) => {
        if (selectedFolderIds.includes('uncategorized')) {
          if (!p.folder_id) return true;
        }
        return selectedFolderIds.includes(p.folder_id);
      });
    }
    
    const nonArchived = filtered.filter((p: any) => !p.is_archived);
    
    return {
      active: nonArchived.filter((p: any) => p.status === 'active'),
      measurement: nonArchived.filter((p: any) => p.status === 'measurement'),
      blind_jambs: nonArchived.filter((p: any) => p.status === 'blind_jambs'),
      pre_contract: nonArchived.filter((p: any) => p.status === 'pre_contract'),
      archived: filtered.filter((p: any) => p.is_archived),
      trash: deleted,
    };
  }, [projectsWithTotals, searchQuery, selectedFolderIds]);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
      } else {
        setUser(session.user);
        setLoading(false);
      }
    };
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/login");
      } else {
        setUser(session.user);
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate]);
  if (loading || projectsLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
      </div>;
  }
  return <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          
          <div className="flex gap-2">
            <Link to="/father-projects">
              <Button variant="ghost" size="sm">
                <Building2 className="h-4 w-4 ml-2" />
                פרויקטי אב
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button variant="ghost" size="sm">
                <LayoutDashboard className="h-4 w-4 ml-2" />
                דשבורד
              </Button>
            </Link>
            <Link to="/logout">
              <Button variant="ghost" size="sm">
                <LogOut className="h-4 w-4 ml-2" />
                התנתק
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold mb-2">פרויקטים</h2>
            <p className="text-muted-foreground">נהל את כל הפרויקטים שלך ממקום אחד</p>
          </div>
          <Link to="/import">
            <Button className="gap-2">
              <PlusCircle className="h-5 w-5" />
              פרויקט חדש
            </Button>
          </Link>
        </div>

        <div className="mb-4 flex flex-col sm:flex-row gap-4 justify-center items-center">
          <div className="relative w-full sm:w-64">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חפש פרויקט..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-10"
              dir="rtl"
            />
          </div>
        </div>

        <div className="mb-6">
          <ProjectFolders selectedFolderIds={selectedFolderIds} onFolderSelect={setSelectedFolderIds} />
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full max-w-4xl mx-auto grid-cols-7 mb-6">
            <TabsTrigger value="active" className="gap-1 text-xs sm:text-sm">
              <Building2 className="h-4 w-4" />
              פעילים ({filteredProjects.active.length})
            </TabsTrigger>
            <TabsTrigger value="measurement" className="gap-1 text-xs sm:text-sm">
              <Ruler className="h-4 w-4" />
              במדידות ({filteredProjects.measurement.length})
            </TabsTrigger>
            <TabsTrigger value="blind_jambs" className="gap-1 text-xs sm:text-sm">
              <Building2 className="h-4 w-4" />
              משקופים ({filteredProjects.blind_jambs.length})
            </TabsTrigger>
            <TabsTrigger value="pre_contract" className="gap-1 text-xs sm:text-sm">
              <FileText className="h-4 w-4" />
              טרום חוזה ({filteredProjects.pre_contract.length})
            </TabsTrigger>
            <TabsTrigger value="drafts" className="gap-1 text-xs sm:text-sm">
              <FilePenLine className="h-4 w-4" />
              טיוטות ({drafts?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="archived" className="gap-1 text-xs sm:text-sm">
              <FolderOpen className="h-4 w-4" />
              ארכיון ({filteredProjects.archived.length})
            </TabsTrigger>
            <TabsTrigger value="trash" className="gap-1 text-xs sm:text-sm">
              <Trash2 className="h-4 w-4" />
              פח ({filteredProjects.trash.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <ActiveProjectsGrouped
              projects={filteredProjects.active}
              projectTotals={projectTotals || []}
              onEdit={handleEditClick}
              onDelete={handleDeleteClick}
              onMove={handleMoveClick}
              onGroup={handleGroupClick}
              onUngroup={handleUngroupClick}
            />
          </TabsContent>

          <TabsContent value="measurement">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.measurement.length > 0 ? filteredProjects.measurement.map((project: any) => (
                <ProjectCard 
                  key={project.project_id} 
                  project={project} 
                  onEdit={handleEditClick} 
                  onDelete={handleDeleteClick}
                  onMove={handleMoveClick}
                />
              )) : (
                <div className="col-span-full text-center py-12">
                  <p className="text-muted-foreground mb-4">אין פרויקטים במדידות</p>
                  <Link to="/wizard">
                    <Button>
                      <PlusCircle className="h-5 w-5 ml-2" />
                      צור פרויקט חדש
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="blind_jambs">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.blind_jambs.length > 0 ? filteredProjects.blind_jambs.map((project: any) => (
                <ProjectCard 
                  key={project.project_id} 
                  project={project} 
                  onEdit={handleEditClick} 
                  onDelete={handleDeleteClick}
                  onMove={handleMoveClick}
                />
              )) : (
                <div className="col-span-full text-center py-12">
                  <p className="text-muted-foreground mb-4">אין פרויקטים בשלב משקופים</p>
                  <Link to="/wizard">
                    <Button>
                      <PlusCircle className="h-5 w-5 ml-2" />
                      צור פרויקט חדש
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="pre_contract">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.pre_contract.length > 0 ? filteredProjects.pre_contract.map((project: any) => (
                <ProjectCard 
                  key={project.project_id} 
                  project={project} 
                  onEdit={handleEditClick} 
                  onDelete={handleDeleteClick}
                  onMove={handleMoveClick}
                />
              )) : (
                <div className="col-span-full text-center py-12">
                  <p className="text-muted-foreground mb-4">אין פרויקטים בשלב טרום חוזה</p>
                  <Link to="/wizard">
                    <Button>
                      <PlusCircle className="h-5 w-5 ml-2" />
                      צור פרויקט חדש
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="drafts">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {drafts && drafts.length > 0 ? drafts.map((draft) => {
                const typeLabel = draft.project_type === 'measurement' ? 'מדידות' : draft.project_type === 'pre_contract' ? 'טרום חוזה' : 'משקופים עיוורים';
                return (
                  <Card key={draft.id} className="hover:shadow-md transition-shadow cursor-pointer" dir="rtl">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">
                            {draft.name || 'טיוטה ללא שם'}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {typeLabel}
                          </CardDescription>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteDraftMutation.mutate(draft.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground mb-3">
                        עודכן: {new Date(draft.updated_at).toLocaleDateString('he-IL')} {new Date(draft.updated_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <Link to={`/wizard?draft=${draft.id}`}>
                        <Button size="sm" className="w-full gap-2">
                          <FilePenLine className="h-4 w-4" />
                          המשך עריכה
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                );
              }) : (
                <div className="col-span-full text-center py-12">
                  <p className="text-muted-foreground mb-4">אין טיוטות פתוחות</p>
                  <Link to="/wizard">
                    <Button>
                      <PlusCircle className="h-5 w-5 ml-2" />
                      צור פרויקט חדש
                    </Button>
                  </Link>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="archived">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.archived.length > 0 ? filteredProjects.archived.map((project: any) => (
                <ProjectCard 
                  key={project.project_id} 
                  project={project} 
                  onEdit={handleEditClick} 
                  onDelete={handleDeleteClick}
                  onMove={handleMoveClick}
                />
              )) : (
                <div className="col-span-full text-center py-12">
                  <p className="text-muted-foreground">אין פרויקטים בארכיון</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="trash">
            <div className="mb-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  פרויקטים בפח יימחקו לצמיתות אחרי 30 יום. ניתן לשחזר לפני כן.
                </AlertDescription>
              </Alert>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.trash.length > 0 ? filteredProjects.trash.map((project: any) => {
                const deletedDate = new Date(project.deleted_at);
                const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - deletedDate.getTime()) / (1000 * 60 * 60 * 24)));
                return (
                  <Card key={project.id} className="opacity-75 hover:opacity-100 transition-opacity" dir="rtl">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">{project.name}</CardTitle>
                          <CardDescription className="mt-1">
                            נמחק: {deletedDate.toLocaleDateString('he-IL')} · נשאר {daysLeft} ימים
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 gap-2"
                        onClick={() => restoreProjectMutation.mutate(project.id)}
                        disabled={restoreProjectMutation.isPending}
                      >
                        שחזר
                      </Button>
                    </CardContent>
                  </Card>
                );
              }) : (
                <div className="col-span-full text-center py-12">
                  <Trash2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-muted-foreground">הפח ריק</p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <AlertDialog open={!!projectToDelete && !deleteProjectMutation.isPending} onOpenChange={() => { setProjectToDelete(null); setDeleteCode(""); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>האם אתה בטוח?</AlertDialogTitle>
              <AlertDialogDescription>
                הפרויקט יועבר לפח ויימחק לצמיתות אחרי 30 יום. ניתן לשחזר מתוך לשונית הפח.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <Label htmlFor="delete-code">הזן קוד מחיקה לאישור</Label>
              <Input 
                id="delete-code" 
                value={deleteCode} 
                onChange={(e) => setDeleteCode(e.target.value)} 
                placeholder="קוד מחיקה"
                className="mt-2"
                dir="ltr"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>ביטול</AlertDialogCancel>
              <Button 
                onClick={confirmDelete} 
                disabled={deleteCode !== DELETE_CODE}
                variant="destructive"
              >
                מחק
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {projectToEdit && <Dialog open={true} onOpenChange={() => setProjectToEdit(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>ערוך שם פרויקט</DialogTitle>
                <DialogDescription>
                  הזן את השם החדש לפרויקט
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="project-name">שם פרויקט</Label>
                  <Input id="project-name" value={editedName} onChange={e => setEditedName(e.target.value)} placeholder="הזן שם פרויקט" dir="rtl" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setProjectToEdit(null)}>
                  ביטול
                </Button>
                <Button onClick={confirmEdit} disabled={!editedName.trim() || updateProjectMutation.isPending}>
                  שמור
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>}

        {/* Move project dialog */}
        {projectToMove && (
          <Dialog open={true} onOpenChange={() => setProjectToMove(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>העבר לתיקייה</DialogTitle>
                <DialogDescription>
                  בחר תיקייה עבור "{projectToMove.name}"
                </DialogDescription>
              </DialogHeader>
              <Select value={targetFolderId || 'none'} onValueChange={setTargetFolderId}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר תיקייה" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ללא תיקייה</SelectItem>
                  {folders?.map(folder => (
                    <SelectItem key={folder.id} value={folder.id}>{folder.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button variant="outline" onClick={() => setProjectToMove(null)}>ביטול</Button>
                <Button onClick={confirmMove} disabled={moveProjectMutation.isPending}>העבר</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Group project dialog */}
        {projectToGroup && (
          <Dialog open={true} onOpenChange={() => setProjectToGroup(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>קבץ לפרויקט-אב</DialogTitle>
                <DialogDescription>
                  בחר פרויקט-אב עבור "{projectToGroup.name}" או צור קבוצה חדשה
                </DialogDescription>
              </DialogHeader>
              <Select value={selectedParentId} onValueChange={setSelectedParentId}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר פרויקט-אב" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">צור קבוצה חדשה (פרויקט זה יהפוך לאב)</SelectItem>
                  {availableParents
                    ?.filter((p) => p.id !== projectToGroup.id)
                    .map((parent) => (
                      <SelectItem key={parent.id} value={String(parent.id)}>
                        {parent.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {structureComparison?.hasMismatch && (
                <Alert className="border-orange-300 bg-orange-50 dark:bg-orange-950/30">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  <AlertDescription className="text-orange-700 dark:text-orange-300 text-sm">
                    שים לב: מבנה הפרויקט שונה מהפרויקטים האחרים בקבוצה ({structureComparison.details})
                  </AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setProjectToGroup(null)}>ביטול</Button>
                <Button onClick={confirmGroup} disabled={groupMutation.isPending}>קבץ</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </main>
    </div>;
};

// Active projects with parent grouping
const ActiveProjectsGrouped = ({ projects, projectTotals, onEdit, onDelete, onMove, onGroup, onUngroup }: {
  projects: any[];
  projectTotals: any[];
  onEdit: (e: React.MouseEvent, project: { id: number; name: string }) => void;
  onDelete: (e: React.MouseEvent, projectId: number) => void;
  onMove: (e: React.MouseEvent, project: { id: number; name: string; folder_id: string | null }) => void;
  onGroup: (e: React.MouseEvent, project: { id: number; name: string; parent_project_id: number | null }) => void;
  onUngroup: (e: React.MouseEvent, projectId: number) => void;
}) => {
  const [expandedParents, setExpandedParents] = useState<Set<number>>(new Set());

  // Group projects: parent groups vs standalone
  const { parentGroups, standalone } = useMemo(() => {
    const parentMap = new Map<number, { parent: any; children: any[] }>();
    const standalone: any[] = [];

    for (const project of projects) {
      const parentId = project.parent_project_id;
      if (parentId && parentId !== project.project_id) {
        // This is a child project
        if (!parentMap.has(parentId)) {
          parentMap.set(parentId, { parent: null, children: [] });
        }
        parentMap.get(parentId)!.children.push(project);
      } else if (parentId && parentId === project.project_id) {
        // This is a parent root — skip showing it as a card (it's the measurement project)
        if (!parentMap.has(parentId)) {
          parentMap.set(parentId, { parent: project, children: [] });
        } else {
          parentMap.get(parentId)!.parent = project;
        }
      } else {
        standalone.push(project);
      }
    }

    // Groups that have children
    const parentGroups: { parentId: number; parentName: string; children: any[]; totals: { total: number; ready: number } }[] = [];
    parentMap.forEach((group, parentId) => {
      if (group.children.length > 0) {
        const totals = group.children.reduce(
          (acc, c) => {
            const t = projectTotals.find((pt: any) => pt.project_id === c.project_id);
            return {
              total: acc.total + (t?.total_items || 0),
              ready: acc.ready + (t?.ready_items || 0),
            };
          },
          { total: 0, ready: 0 }
        );
        const parentName = group.parent?.name || group.children[0]?.name?.split(" – ")[0] || "פרויקט מקובץ";
        parentGroups.push({ parentId, parentName, children: group.children, totals });
      } else if (group.parent) {
        // Parent with no active children — show as standalone
        standalone.push(group.parent);
      }
    });

    return { parentGroups, standalone };
  }, [projects, projectTotals]);

  const toggleParent = (parentId: number) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  if (projects.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">אין פרויקטים פעילים</p>
        <Link to="/wizard">
          <Button>
            <PlusCircle className="h-5 w-5 ml-2" />
            צור פרויקט חדש
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Parent groups */}
      {parentGroups.map((group) => {
        const pct = group.totals.total > 0 ? Math.round((group.totals.ready / group.totals.total) * 100) : 0;
        const isExpanded = expandedParents.has(group.parentId);

        return (
          <Collapsible key={group.parentId} open={isExpanded} onOpenChange={() => toggleParent(group.parentId)}>
            <Card className="border-2 border-primary/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Layers className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <Link to={`/parent-project/${group.parentId}`}>
                        <CardTitle className="hover:text-primary transition-colors cursor-pointer">
                          {group.parentName}
                        </CardTitle>
                      </Link>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {group.children.length} שלבים • {group.totals.total} פריטים
                      </p>
                    </div>
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm">
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <Progress value={pct} className="flex-1 h-2" />
                  <span className="text-sm font-medium min-w-[3rem] text-left">{pct}%</span>
                </div>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.children.map((child: any) => (
                      <ProjectCard
                        key={child.project_id}
                        project={child}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onMove={onMove}
                        onGroup={onGroup}
                        onUngroup={onUngroup}
                      />
                    ))}
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        );
      })}

      {/* Standalone projects */}
      {standalone.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {standalone.map((project: any) => (
            <ProjectCard
              key={project.project_id}
              project={project}
              onEdit={onEdit}
              onDelete={onDelete}
              onMove={onMove}
              onGroup={onGroup}
              onUngroup={onUngroup}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Status display helper
const getStatusDisplay = (status: string) => {
  switch (status) {
    case 'pre_contract':
      return { label: 'טרום חוזה', color: 'bg-purple-500/10 text-purple-600', icon: FileText };
    case 'blind_jambs':
      return { label: 'משקופים', color: 'bg-amber-500/10 text-amber-600', icon: Building2 };
    case 'measurement':
      return { label: 'במדידות', color: 'bg-orange-500/10 text-orange-600', icon: Ruler };
    case 'active':
    default:
      return { label: 'פעיל', color: 'bg-green-500/10 text-green-600', icon: Building2 };
  }
};

// Project Card Component
const ProjectCard = ({ project, onEdit, onDelete, onMove, onGroup, onUngroup }: { 
  project: any; 
  onEdit: (e: React.MouseEvent, project: { id: number; name: string }) => void;
  onDelete: (e: React.MouseEvent, projectId: number) => void;
  onMove: (e: React.MouseEvent, project: { id: number; name: string; folder_id: string | null }) => void;
  onGroup?: (e: React.MouseEvent, project: { id: number; name: string; parent_project_id: number | null }) => void;
  onUngroup?: (e: React.MouseEvent, projectId: number) => void;
}) => {
  const statusDisplay = getStatusDisplay(project.status);
  const StatusIcon = statusDisplay.icon;
  const hasParent = project.parent_project_id && project.parent_project_id !== project.project_id;
  
  return (
    <div className="relative group">
      <Link to={`/projects/${project.project_id}`}>
        <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
            <div className={`p-3 rounded-lg ${project.status === 'pre_contract' ? 'bg-purple-500/10' : project.status === 'measurement' ? 'bg-orange-500/10' : project.status === 'blind_jambs' ? 'bg-amber-500/10' : 'bg-primary/10'}`}>
                {project.status === 'pre_contract' ? (
                  <FileText className="h-6 w-6 text-purple-500" />
                ) : project.status === 'measurement' ? (
                  <Ruler className="h-6 w-6 text-orange-500" />
                ) : project.status === 'blind_jambs' ? (
                  <Building2 className="h-6 w-6 text-amber-500" />
                ) : (
                  <Building2 className="h-6 w-6 text-primary" />
                )}
              </div>
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2 flex-wrap">
                  {project.name}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusDisplay.color}`}>
                    {statusDisplay.label}
                  </span>
                </CardTitle>
              </div>
            </div>
            {project.building_code && <CardDescription>קוד בניין: {project.building_code}</CardDescription>}
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              {project.status === 'measurement' ? (
                <span>פרויקט במצב מדידות</span>
              ) : project.status === 'blind_jambs' ? (
                <span>פרויקט בשלב תכנון</span>
              ) : (
                <>
                  <span>{project.total_floors || 0} קומות</span>
                  <span>•</span>
                  <span>{project.total_apartments || 0} דירות</span>
                  <span>•</span>
                  <span>{project.total_items || 0} פריטים</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
      <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onGroup && !hasParent && (
          <Button variant="outline" size="icon" className="h-8 w-8 bg-background/95 backdrop-blur" onClick={e => onGroup(e, { id: project.project_id, name: project.name, parent_project_id: project.parent_project_id })} title="קבץ לפרויקט-אב">
            <Layers className="h-4 w-4" />
          </Button>
        )}
        {onUngroup && hasParent && (
          <Button variant="outline" size="icon" className="h-8 w-8 bg-background/95 backdrop-blur" onClick={e => onUngroup(e, project.project_id)} title="הסר מקבוצה">
            <Unlink className="h-4 w-4" />
          </Button>
        )}
        <Button variant="outline" size="icon" className="h-8 w-8 bg-background/95 backdrop-blur" onClick={e => onMove(e, { id: project.project_id, name: project.name, folder_id: project.folder_id })}>
          <FolderInput className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8 bg-background/95 backdrop-blur" onClick={e => onEdit(e, { id: project.project_id, name: project.name })}>
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="destructive" size="icon" className="h-8 w-8" onClick={e => onDelete(e, project.project_id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default Projects;