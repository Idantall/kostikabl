import { useState, useEffect } from 'react';
import { AdminPasswordGate } from './AdminPasswordGate';
import { UserRolesManager } from './UserRolesManager';
import { RolePermissionsManager } from './RolePermissionsManager';
import { StationsManager } from './StationsManager';
import { WorkersManager } from './WorkersManager';
import { UserWorkerAssignments } from './UserWorkerAssignments';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useIsOwner } from '@/hooks/useRBAC';
import { X, Shield, Users, Settings, MapPin, CreditCard, Link2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface AdminPanelProps {
  onClose: () => void;
}

export function AdminPanel({ onClose }: AdminPanelProps) {
  const { isOwner, isLoading: isCheckingOwner } = useIsOwner();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if already authenticated this session
    const sessionAuth = sessionStorage.getItem('admin-panel-auth');
    if (sessionAuth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  if (isCheckingOwner) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="p-6 text-center">
        <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-semibold mb-2">אין הרשאה</h2>
        <p className="text-muted-foreground mb-4">רק בעלים יכולים לגשת לפאנל זה</p>
        <Button variant="outline" onClick={onClose}>חזור</Button>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AdminPasswordGate onAuthenticated={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">פאנל ניהול הרשאות</h2>
            <p className="text-sm text-muted-foreground">ניהול משתמשים והרשאות במערכת</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="users" dir="rtl">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="users" className="gap-2 text-xs px-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">משתמשים</span>
          </TabsTrigger>
          <TabsTrigger value="workers" className="gap-2 text-xs px-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">עובדים</span>
          </TabsTrigger>
          <TabsTrigger value="assignments" className="gap-2 text-xs px-2">
            <Link2 className="h-4 w-4" />
            <span className="hidden sm:inline">הקצאות</span>
          </TabsTrigger>
          <TabsTrigger value="stations" className="gap-2 text-xs px-2">
            <MapPin className="h-4 w-4" />
            <span className="hidden sm:inline">תחנות</span>
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2 text-xs px-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">הרשאות</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-6">
          <UserRolesManager />
        </TabsContent>

        <TabsContent value="workers" className="mt-6">
          <WorkersManager />
        </TabsContent>

        <TabsContent value="assignments" className="mt-6">
          <UserWorkerAssignments />
        </TabsContent>

        <TabsContent value="stations" className="mt-6">
          <StationsManager />
        </TabsContent>

        <TabsContent value="permissions" className="mt-6">
          <RolePermissionsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
