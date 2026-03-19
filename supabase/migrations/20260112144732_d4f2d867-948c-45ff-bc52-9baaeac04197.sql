-- Create app_role enum with 4 tiers
CREATE TYPE public.app_role AS ENUM ('owner', 'manager', 'worker', 'viewer');

-- Create user_roles table (as per security guidelines - separate from profiles)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'viewer',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- Create permissions configuration table
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role app_role NOT NULL UNIQUE,
  -- Project permissions
  can_view_projects boolean NOT NULL DEFAULT true,
  can_create_projects boolean NOT NULL DEFAULT false,
  can_edit_projects boolean NOT NULL DEFAULT false,
  can_delete_projects boolean NOT NULL DEFAULT false,
  -- Feature access
  can_access_cutlist boolean NOT NULL DEFAULT false,
  can_access_labels boolean NOT NULL DEFAULT false,
  can_access_scan_loading boolean NOT NULL DEFAULT false,
  can_access_scan_install boolean NOT NULL DEFAULT false,
  can_access_import boolean NOT NULL DEFAULT false,
  can_access_measurement boolean NOT NULL DEFAULT false,
  -- Action permissions
  can_upload_files boolean NOT NULL DEFAULT false,
  can_edit_items boolean NOT NULL DEFAULT false,
  can_finalize_measurement boolean NOT NULL DEFAULT false,
  can_manage_users boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.user_roles WHERE user_id = _user_id),
    'viewer'::app_role
  )
$$;

-- Security definer function to check if user has specific role or higher
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN _role = 'viewer' THEN true
    WHEN _role = 'worker' THEN public.get_user_role(_user_id) IN ('worker', 'manager', 'owner')
    WHEN _role = 'manager' THEN public.get_user_role(_user_id) IN ('manager', 'owner')
    WHEN _role = 'owner' THEN public.get_user_role(_user_id) = 'owner'
    ELSE false
  END
$$;

-- Function to check specific permission for current user
CREATE OR REPLACE FUNCTION public.has_permission(_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role app_role;
  result boolean;
BEGIN
  -- Owners always have all permissions
  IF is_app_owner() THEN
    RETURN true;
  END IF;
  
  user_role := get_user_role(auth.uid());
  
  EXECUTE format(
    'SELECT %I FROM public.role_permissions WHERE role = $1',
    _permission
  ) INTO result USING user_role;
  
  RETURN COALESCE(result, false);
END;
$$;

-- RLS Policies for user_roles
CREATE POLICY "Owners can view all user roles"
ON public.user_roles FOR SELECT
USING (is_app_owner() OR user_id = auth.uid());

CREATE POLICY "Owners can insert user roles"
ON public.user_roles FOR INSERT
WITH CHECK (is_app_owner());

CREATE POLICY "Owners can update user roles"
ON public.user_roles FOR UPDATE
USING (is_app_owner());

CREATE POLICY "Owners can delete user roles"
ON public.user_roles FOR DELETE
USING (is_app_owner());

-- RLS Policies for role_permissions
CREATE POLICY "Anyone authenticated can view role permissions"
ON public.role_permissions FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Owners can update role permissions"
ON public.role_permissions FOR UPDATE
USING (is_app_owner());

-- Insert default permissions for each role
INSERT INTO public.role_permissions (role, can_view_projects, can_create_projects, can_edit_projects, can_delete_projects, can_access_cutlist, can_access_labels, can_access_scan_loading, can_access_scan_install, can_access_import, can_access_measurement, can_upload_files, can_edit_items, can_finalize_measurement, can_manage_users)
VALUES 
  ('owner', true, true, true, true, true, true, true, true, true, true, true, true, true, true),
  ('manager', true, true, true, false, true, true, true, true, true, true, true, true, true, false),
  ('worker', true, false, false, false, true, true, true, true, false, false, false, true, false, false),
  ('viewer', true, false, false, false, false, false, false, false, false, false, false, false, false, false);

-- Assign owner role to designated app owners
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'owner'::app_role FROM auth.users WHERE email IN ('yossi@kostika.biz', 'idantal92@gmail.com')
ON CONFLICT (user_id) DO UPDATE SET role = 'owner';

-- Trigger for updated_at
CREATE TRIGGER update_user_roles_updated_at
BEFORE UPDATE ON public.user_roles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_role_permissions_updated_at
BEFORE UPDATE ON public.role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();