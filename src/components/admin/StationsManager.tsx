import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MapPin, Plus, Trash2, Pencil, X, Check } from 'lucide-react';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Station {
  id: string;
  name: string;
  created_at: string;
}

export function StationsManager() {
  const queryClient = useQueryClient();
  const [newStationName, setNewStationName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const { data: stations, isLoading } = useQuery({
    queryKey: ['stations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stations')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Station[];
    },
  });

  const addStation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from('stations').insert({ name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stations'] });
      setNewStationName('');
      toast.success('תחנה נוספה בהצלחה');
    },
    onError: (error: any) => {
      if (error.message?.includes('duplicate')) {
        toast.error('תחנה בשם זה כבר קיימת');
      } else {
        toast.error('שגיאה בהוספת תחנה');
      }
    },
  });

  const updateStation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('stations').update({ name: name.trim() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stations'] });
      queryClient.invalidateQueries({ queryKey: ['user-roles'] });
      setEditingId(null);
      toast.success('תחנה עודכנה בהצלחה');
    },
    onError: (error: any) => {
      if (error.message?.includes('duplicate')) {
        toast.error('תחנה בשם זה כבר קיימת');
      } else {
        toast.error('שגיאה בעדכון תחנה');
      }
    },
  });

  const deleteStation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('stations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stations'] });
      toast.success('תחנה נמחקה בהצלחה');
    },
    onError: () => {
      toast.error('שגיאה במחיקת תחנה');
    },
  });

  const handleAddStation = () => {
    if (!newStationName.trim()) {
      toast.error('יש להזין שם תחנה');
      return;
    }
    addStation.mutate(newStationName);
  };

  const startEdit = (station: Station) => {
    setEditingId(station.id);
    setEditingName(station.name);
  };

  const saveEdit = () => {
    if (!editingName.trim()) {
      toast.error('יש להזין שם תחנה');
      return;
    }
    if (editingId) {
      updateStation.mutate({ id: editingId, name: editingName });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          <CardTitle>ניהול תחנות</CardTitle>
        </div>
        <CardDescription>
          הגדר את תחנות העבודה במפעל
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add new station */}
        <div className="flex gap-2">
          <Input
            placeholder="שם תחנה חדשה..."
            value={newStationName}
            onChange={(e) => setNewStationName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddStation()}
            className="flex-1"
          />
          <Button onClick={handleAddStation} disabled={addStation.isPending} size="icon">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Stations list */}
        <div className="flex flex-wrap gap-2">
          {stations?.map((station) => (
            <div key={station.id} className="flex items-center gap-1">
              {editingId === station.id ? (
                <div className="flex items-center gap-1">
                  <Input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                    className="h-8 w-24 text-sm"
                    autoFocus
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={saveEdit}
                    disabled={updateStation.isPending}
                  >
                    <Check className="h-4 w-4 text-green-600" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setEditingId(null)}
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <Badge variant="secondary" className="py-1.5 px-3 text-sm gap-2">
                  {station.name}
                  <button
                    onClick={() => startEdit(station)}
                    className="hover:text-primary transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button className="hover:text-destructive transition-colors">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>מחק תחנה?</AlertDialogTitle>
                        <AlertDialogDescription>
                          האם למחוק את התחנה "{station.name}"? עובדים שמשויכים לתחנה זו יישארו ללא תחנה.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>ביטול</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteStation.mutate(station.id)}
                          className="bg-destructive text-destructive-foreground"
                        >
                          מחק
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </Badge>
              )}
            </div>
          ))}
          {(!stations || stations.length === 0) && (
            <p className="text-sm text-muted-foreground">אין תחנות. הוסף תחנה חדשה.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
