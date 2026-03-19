import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';

export type AppRole = 'owner' | 'manager' | 'worker' | 'viewer';

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  updated_at: string;
  email?: string;
  station?: string | null;
}

export interface RolePermissions {
  id: string;
  role: AppRole;
  can_view_projects: boolean;
  can_create_projects: boolean;
  can_edit_projects: boolean;
  can_delete_projects: boolean;
  can_access_cutlist: boolean;
  can_access_labels: boolean;
  can_access_scan_loading: boolean;
  can_access_scan_install: boolean;
  can_access_import: boolean;
  can_access_measurement: boolean;
  can_upload_files: boolean;
  can_edit_items: boolean;
  can_finalize_measurement: boolean;
  can_manage_users: boolean;
}

const OWNER_EMAILS = ['yossi@kostika.biz', 'idantal92@gmail.com'];

export function useIsOwner() {
  const [isOwner, setIsOwner] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkOwner = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsOwner(user?.email ? OWNER_EMAILS.includes(user.email) : false);
      setIsLoading(false);
    };
    checkOwner();
  }, []);

  return { isOwner, isLoading };
}

export function useCurrentUserRole() {
  return useQuery({
    queryKey: ['current-user-role'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 'viewer' as AppRole;

      // Check if owner email first
      if (OWNER_EMAILS.includes(user.email || '')) {
        return 'owner' as AppRole;
      }

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      if (error || !data) return 'viewer' as AppRole;
      return data.role as AppRole;
    },
  });
}

export function useUserPermissions() {
  const { data: role } = useCurrentUserRole();

  return useQuery({
    queryKey: ['user-permissions', role],
    queryFn: async () => {
      if (!role) return null;

      const { data, error } = await supabase
        .from('role_permissions')
        .select('*')
        .eq('role', role)
        .single();

      if (error) {
        console.error('Error fetching permissions:', error);
        return null;
      }

      return data as RolePermissions;
    },
    enabled: !!role,
  });
}

export function useAllUserRoles() {
  return useQuery({
    queryKey: ['all-user-roles'],
    queryFn: async () => {
      // Use edge function to get users with emails (since we can't query auth.users from client)
      const { data, error } = await supabase.functions.invoke('get-users-with-emails');
      
      if (error) {
        console.error('Error fetching users:', error);
        // Fallback to basic query
        const { data: roles } = await supabase
          .from('user_roles')
          .select('*')
          .order('created_at', { ascending: false });
        
        const { data: allowedEmails } = await supabase
          .from('allowed_emails')
          .select('email');
        
        return {
          roles: roles || [],
          allowedEmails: allowedEmails?.map(e => e.email) || [],
        };
      }

      return {
        roles: data?.roles || [],
        allowedEmails: data?.allowedEmails || [],
      };
    },
  });
}

export function useAllRolePermissions() {
  return useQuery({
    queryKey: ['all-role-permissions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('role_permissions')
        .select('*')
        .order('role');

      if (error) throw error;
      return data as RolePermissions[];
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role, station }: { userId: string; role: AppRole; station?: string | null }) => {
      const updateData: { user_id: string; role: AppRole; station?: string | null } = { user_id: userId, role };
      if (station !== undefined) {
        updateData.station = station;
      }
      const { error } = await supabase
        .from('user_roles')
        .upsert(updateData, { onConflict: 'user_id' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
    },
  });
}

export function useUpdateWorkerStation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, station }: { userId: string; station: string | null }) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ station })
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
    },
  });
}

export function useUpdateRolePermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ role, permission, value }: { role: AppRole; permission: string; value: boolean }) => {
      const { error } = await supabase
        .from('role_permissions')
        .update({ [permission]: value })
        .eq('role', role);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-role-permissions'] });
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
    },
  });
}

export function useDeleteUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
    },
  });
}

export function hasPermission(permissions: RolePermissions | null | undefined, permission: keyof RolePermissions): boolean {
  if (!permissions) return false;
  return permissions[permission] as boolean;
}
