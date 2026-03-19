import { useState } from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useAllUserRoles, useUpdateUserRole, useDeleteUserRole, useUpdateWorkerStation, AppRole } from '@/hooks/useRBAC';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2, UserPlus, Users, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
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

const ROLE_LABELS: Record<AppRole, string> = {
  owner: 'בעלים',
  manager: 'מנהל',
  worker: 'עובד',
  viewer: 'צופה',
};

const ROLE_COLORS: Record<AppRole, string> = {
  owner: 'bg-destructive text-destructive-foreground',
  manager: 'bg-primary text-primary-foreground',
  worker: 'bg-accent text-accent-foreground',
  viewer: 'bg-muted text-muted-foreground',
};

const OWNER_EMAILS = ['yossi@kostika.biz', 'idantal92@gmail.com'];
export function UserRolesManager() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useAllUserRoles();
  const updateRole = useUpdateUserRole();
  const deleteRole = useDeleteUserRole();
  const updateStation = useUpdateWorkerStation();
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<AppRole>('viewer');
  const [isAddingUser, setIsAddingUser] = useState(false);

  // Fetch stations from database
  const { data: stations } = useQuery({
    queryKey: ['stations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stations')
        .select('id, name')
        .order('name', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const handleAddUser = async () => {
    if (!newUserEmail.trim()) {
      toast.error('יש להזין כתובת אימייל');
      return;
    }

    const email = newUserEmail.toLowerCase().trim();
    
    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('כתובת אימייל לא תקינה');
      return;
    }

    setIsAddingUser(true);
    try {
      // Call the edge function to create the user with default password
      const { data, error } = await supabase.functions.invoke('seed-allowed-users', {
        body: { email, role: newUserRole }
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        if (data.status === 'created') {
          toast.success('משתמש נוצר בהצלחה');
          toast.info(data.message || 'סיסמה נוצרה', { duration: 15000 });
        } else if (data.status === 'existing') {
          toast.info(data.message || 'משתמש קיים, התפקיד עודכן');
        }
        setNewUserEmail('');
        // Refresh the users list
        refetch();
      } else {
        toast.error(data?.error || 'שגיאה ביצירת משתמש');
      }
    } catch (error) {
      console.error('Error adding user:', error);
      toast.error('שגיאה בהוספת משתמש');
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleRoleChange = async (userId: string, email: string, newRole: AppRole) => {
    if (OWNER_EMAILS.includes(email)) {
      toast.error('לא ניתן לשנות תפקיד של בעלים');
      return;
    }

    try {
      await updateRole.mutateAsync({ userId, role: newRole });
      toast.success('התפקיד עודכן בהצלחה');
    } catch (error) {
      toast.error('שגיאה בעדכון התפקיד');
    }
  };

  const handleStationChange = async (userId: string, station: string | null) => {
    try {
      await updateStation.mutateAsync({ userId, station });
      toast.success('התחנה עודכנה בהצלחה');
    } catch (error) {
      toast.error('שגיאה בעדכון התחנה');
    }
  };

  const handleDeleteRole = async (userId: string, email: string) => {
    if (OWNER_EMAILS.includes(email)) {
      toast.error('לא ניתן למחוק בעלים');
      return;
    }

    try {
      await deleteRole.mutateAsync(userId);
      toast.success('המשתמש הוסר');
    } catch (error) {
      toast.error('שגיאה במחיקת המשתמש');
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <CardTitle>ניהול משתמשים</CardTitle>
        </div>
        <CardDescription>
          הקצה תפקידים למשתמשים במערכת
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Add new user */}
        <div className="flex flex-col sm:flex-row gap-2 p-4 bg-muted/50 rounded-lg">
          <Input
            placeholder="אימייל משתמש חדש..."
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            className="flex-1"
          />
          <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as AppRole)}>
            <SelectTrigger className="w-full sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manager">מנהל</SelectItem>
              <SelectItem value="worker">עובד</SelectItem>
              <SelectItem value="viewer">צופה</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleAddUser} disabled={isAddingUser} className="gap-2">
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">הוסף</span>
          </Button>
        </div>

        {/* Users table */}
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>משתמש</TableHead>
                <TableHead>תפקיד</TableHead>
                <TableHead>תחנה</TableHead>
                <TableHead className="w-16">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Show owner emails first */}
              {OWNER_EMAILS.map((email) => (
                <TableRow key={email}>
                  <TableCell className="font-medium">{email}</TableCell>
                  <TableCell>
                    <Badge className={ROLE_COLORS.owner}>
                      {ROLE_LABELS.owner}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">-</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">מוגן</span>
                  </TableCell>
                </TableRow>
              ))}

              {/* Show other users with roles */}
              {data?.roles?.filter(r => !OWNER_EMAILS.includes(r.email || '')).map((userRole) => (
                  <TableRow key={userRole.id}>
                    <TableCell className="font-medium">
                      {userRole.email || `${userRole.user_id.slice(0, 8)}...`}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={userRole.role}
                        onValueChange={(v) => handleRoleChange(userRole.user_id, userRole.email || '', v as AppRole)}
                      >
                        <SelectTrigger className="w-28">
                          <Badge className={ROLE_COLORS[userRole.role]}>
                            {ROLE_LABELS[userRole.role]}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manager">מנהל</SelectItem>
                          <SelectItem value="worker">עובד</SelectItem>
                          <SelectItem value="viewer">צופה</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {userRole.role === 'worker' ? (
                        <Select
                          value={userRole.station || 'none'}
                          onValueChange={(v) => handleStationChange(userRole.user_id, v === 'none' ? null : v)}
                        >
                          <SelectTrigger className="w-28">
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3 text-muted-foreground" />
                              <span className="text-xs">{userRole.station || 'לא הוגדר'}</span>
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">ללא תחנה</SelectItem>
                            {stations?.map(station => (
                              <SelectItem key={station.id} value={station.name}>{station.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>האם למחוק משתמש זה?</AlertDialogTitle>
                            <AlertDialogDescription>
                              פעולה זו תסיר את התפקיד מהמשתמש. הוא יקבל הרשאות צופה כברירת מחדל.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>ביטול</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteRole(userRole.user_id, userRole.email || '')}
                              className="bg-destructive text-destructive-foreground"
                            >
                              מחק
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}

              {(!data?.roles || data.roles.filter(r => !OWNER_EMAILS.includes(r.email || '')).length === 0) && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    אין משתמשים נוספים עם תפקידים
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Allowed emails info */}
        {data?.allowedEmails && data.allowedEmails.length > 0 && (
          <div className="text-sm text-muted-foreground">
            <p className="font-medium mb-2">משתמשים מורשים ({data.allowedEmails.length}):</p>
            <div className="flex flex-wrap gap-1">
              {data.allowedEmails.map((email) => (
                <Badge key={email} variant="outline" className="text-xs">
                  {email}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
