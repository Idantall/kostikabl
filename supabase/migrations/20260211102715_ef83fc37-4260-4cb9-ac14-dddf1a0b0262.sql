
-- Explicitly set security invoker on the new view
ALTER VIEW public.v_parent_project_totals SET (security_invoker = on);
