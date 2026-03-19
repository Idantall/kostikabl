import { useAllRolePermissions, useUpdateRolePermission, AppRole, RolePermissions } from '@/hooks/useRBAC';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, Lock } from 'lucide-react';
import { toast } from 'sonner';

const ROLE_LABELS: Record<AppRole, string> = {
  owner: 'בעלים',
  manager: 'מנהל',
  worker: 'עובד',
  viewer: 'צופה',
};

const PERMISSION_GROUPS = [
  {
    label: 'פרויקטים',
    permissions: [
      { key: 'can_view_projects', label: 'צפייה בפרויקטים' },
      { key: 'can_create_projects', label: 'יצירת פרויקטים' },
      { key: 'can_edit_projects', label: 'עריכת פרויקטים' },
      { key: 'can_delete_projects', label: 'מחיקת פרויקטים' },
    ],
  },
  {
    label: 'תכונות',
    permissions: [
      { key: 'can_access_cutlist', label: 'פקודת יצור' },
      { key: 'can_access_labels', label: 'תוויות' },
      { key: 'can_access_scan_loading', label: 'סריקה - העמסה' },
      { key: 'can_access_scan_install', label: 'סריקה - התקנה' },
      { key: 'can_access_import', label: 'ייבוא נתונים' },
      { key: 'can_access_measurement', label: 'דפי מדידה' },
    ],
  },
  {
    label: 'פעולות',
    permissions: [
      { key: 'can_upload_files', label: 'העלאת קבצים' },
      { key: 'can_edit_items', label: 'עריכת פריטים' },
      { key: 'can_finalize_measurement', label: 'סיום מדידות' },
      { key: 'can_manage_users', label: 'ניהול משתמשים' },
    ],
  },
];

export function RolePermissionsManager() {
  const { data: permissions, isLoading } = useAllRolePermissions();
  const updatePermission = useUpdateRolePermission();

  const handlePermissionChange = async (role: AppRole, permission: string, value: boolean) => {
    if (role === 'owner') {
      toast.error('לא ניתן לשנות הרשאות של בעלים');
      return;
    }

    try {
      await updatePermission.mutateAsync({ role, permission, value });
      toast.success('ההרשאה עודכנה');
    } catch (error) {
      toast.error('שגיאה בעדכון ההרשאה');
    }
  };

  const getPermissionValue = (role: AppRole, permission: string): boolean => {
    const rolePerms = permissions?.find(p => p.role === role);
    if (!rolePerms) return false;
    return rolePerms[permission as keyof RolePermissions] as boolean;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  }

  const roles: AppRole[] = ['owner', 'manager', 'worker', 'viewer'];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle>הגדרת הרשאות לפי תפקיד</CardTitle>
        </div>
        <CardDescription>
          קבע אילו הרשאות יש לכל תפקיד במערכת
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky right-0 bg-background min-w-[180px]">הרשאה</TableHead>
                {roles.map((role) => (
                  <TableHead key={role} className="text-center min-w-[100px]">
                    <Badge variant={role === 'owner' ? 'default' : 'outline'}>
                      {ROLE_LABELS[role]}
                    </Badge>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSION_GROUPS.map((group) => (
                <>
                  <TableRow key={group.label} className="bg-muted/30">
                    <TableCell colSpan={5} className="font-semibold text-sm">
                      {group.label}
                    </TableCell>
                  </TableRow>
                  {group.permissions.map((perm) => (
                    <TableRow key={perm.key}>
                      <TableCell className="sticky right-0 bg-background text-sm">
                        {perm.label}
                      </TableCell>
                      {roles.map((role) => (
                        <TableCell key={`${role}-${perm.key}`} className="text-center">
                          {role === 'owner' ? (
                            <div className="flex justify-center">
                              <Lock className="h-4 w-4 text-muted-foreground" />
                            </div>
                          ) : (
                            <Switch
                              checked={getPermissionValue(role, perm.key)}
                              onCheckedChange={(checked) => handlePermissionChange(role, perm.key, checked)}
                              disabled={updatePermission.isPending}
                            />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
