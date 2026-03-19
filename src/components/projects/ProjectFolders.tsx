import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Folder, FolderPlus, Pencil, Trash2, Check, X, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ProjectFolder {
  id: string;
  name: string;
  created_at: string;
}

interface ProjectFoldersProps {
  selectedFolderIds: string[];
  onFolderSelect: (folderIds: string[]) => void;
}

export function ProjectFolders({ selectedFolderIds, onFolderSelect }: ProjectFoldersProps) {
  const queryClient = useQueryClient();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState<ProjectFolder | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteDialogFolder, setDeleteDialogFolder] = useState<ProjectFolder | null>(null);

  const { data: folders, isLoading } = useQuery({
    queryKey: ['project-folders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_folders')
        .select('*')
        .order('name', { ascending: true });
      if (error) throw error;
      return data as ProjectFolder[];
    },
  });

  const addFolder = useMutation({
    mutationFn: async (name: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('project_folders').insert({ 
        name: name.trim(),
        created_by: user?.id 
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-folders'] });
      setNewFolderName('');
      setIsAddDialogOpen(false);
      toast.success('תיקייה נוצרה בהצלחה');
    },
    onError: () => {
      toast.error('שגיאה ביצירת תיקייה');
    },
  });

  const updateFolder = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('project_folders').update({ name: name.trim() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-folders'] });
      setEditingFolder(null);
      toast.success('תיקייה עודכנה בהצלחה');
    },
    onError: () => {
      toast.error('שגיאה בעדכון תיקייה');
    },
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('projects').update({ folder_id: null }).eq('folder_id', id);
      const { error } = await supabase.from('project_folders').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-folders'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      // Remove from selection if was selected
      if (deleteDialogFolder && selectedFolderIds.includes(deleteDialogFolder.id)) {
        onFolderSelect(selectedFolderIds.filter(id => id !== deleteDialogFolder.id));
      }
      setDeleteDialogFolder(null);
      toast.success('תיקייה נמחקה בהצלחה');
    },
    onError: () => {
      toast.error('שגיאה במחיקת תיקייה');
    },
  });

  const handleAddFolder = () => {
    if (!newFolderName.trim()) {
      toast.error('יש להזין שם תיקייה');
      return;
    }
    addFolder.mutate(newFolderName);
  };

  const saveEdit = () => {
    if (!editingName.trim()) {
      toast.error('יש להזין שם תיקייה');
      return;
    }
    if (editingFolder) {
      updateFolder.mutate({ id: editingFolder.id, name: editingName });
    }
  };

  const toggleFolder = (folderId: string) => {
    if (selectedFolderIds.includes(folderId)) {
      onFolderSelect(selectedFolderIds.filter(id => id !== folderId));
    } else {
      onFolderSelect([...selectedFolderIds, folderId]);
    }
  };

  const selectAll = () => {
    onFolderSelect([]);
  };

  const isAllSelected = selectedFolderIds.length === 0;

  const getDropdownLabel = () => {
    if (isAllSelected) return 'הכל';
    if (selectedFolderIds.length === 1) {
      if (selectedFolderIds[0] === 'uncategorized') return 'ללא תיקייה';
      const folder = folders?.find(f => f.id === selectedFolderIds[0]);
      return folder?.name || 'תיקייה';
    }
    return `${selectedFolderIds.length} תיקיות`;
  };

  return (
    <div className="flex items-center justify-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2 min-w-[140px]">
            <Folder className="h-4 w-4" />
            {isLoading ? 'טוען...' : getDropdownLabel()}
            <ChevronDown className="h-4 w-4 mr-auto" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="w-56 bg-background z-50">
          <DropdownMenuCheckboxItem
            checked={isAllSelected}
            onCheckedChange={selectAll}
          >
            הכל
          </DropdownMenuCheckboxItem>
          
          <DropdownMenuCheckboxItem
            checked={selectedFolderIds.includes('uncategorized')}
            onCheckedChange={() => toggleFolder('uncategorized')}
          >
            ללא תיקייה
          </DropdownMenuCheckboxItem>

          {folders && folders.length > 0 && <DropdownMenuSeparator />}

          {folders?.map((folder) => (
            <div key={folder.id} className="relative group">
              {editingFolder?.id === folder.id ? (
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') saveEdit();
                      if (e.key === 'Escape') setEditingFolder(null);
                    }}
                    className="h-7 text-sm flex-1"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); saveEdit(); }}
                  >
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); setEditingFolder(null); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <DropdownMenuCheckboxItem
                  checked={selectedFolderIds.includes(folder.id)}
                  onCheckedChange={() => toggleFolder(folder.id)}
                  className="pr-8"
                >
                  <span className="flex-1">{folder.name}</span>
                  <div className="hidden group-hover:flex items-center gap-0.5 mr-2">
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setEditingFolder(folder);
                        setEditingName(folder.name);
                      }}
                      className="p-0.5 hover:text-primary"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteDialogFolder(folder);
                      }}
                      className="p-0.5 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </DropdownMenuCheckboxItem>
              )}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button 
        variant="outline" 
        size="icon"
        className="h-9 w-9"
        onClick={() => setIsAddDialogOpen(true)}
      >
        <FolderPlus className="h-4 w-4" />
      </Button>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!deleteDialogFolder} onOpenChange={(open) => !open && setDeleteDialogFolder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחק תיקייה?</AlertDialogTitle>
            <AlertDialogDescription>
              האם למחוק את התיקייה "{deleteDialogFolder?.name}"? הפרויקטים בתיקייה לא יימחקו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialogFolder && deleteFolder.mutate(deleteDialogFolder.id)}
              className="bg-destructive text-destructive-foreground"
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add folder dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>תיקייה חדשה</DialogTitle>
            <DialogDescription>
              הזן שם לתיקייה החדשה
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="שם תיקייה..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddFolder()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              ביטול
            </Button>
            <Button onClick={handleAddFolder} disabled={addFolder.isPending}>
              צור תיקייה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
