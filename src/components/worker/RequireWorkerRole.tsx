import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { PageLoadingSkeleton } from '@/components/ui/loading-skeleton';

const OWNER_EMAILS = ['yossi@kostika.biz', 'idantal92@gmail.com'];

/**
 * Route guard that ensures the user has 'worker' role.
 * Owners and managers are redirected to dashboard.
 * Viewers are redirected to login.
 */
export function RequireWorkerRole({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate('/login', { replace: true });
        return;
      }

      // Owners go to dashboard
      if (OWNER_EMAILS.includes(user.email || '')) {
        navigate('/dashboard', { replace: true });
        return;
      }

      // Check user role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      const role = roleData?.role || 'viewer';

      // Workers stay here
      if (role === 'worker') {
        if (!cancelled) setReady(true);
        return;
      }

      // Managers go to dashboard
      if (role === 'manager') {
        navigate('/dashboard', { replace: true });
        return;
      }

      // Viewers go to login with message
      navigate('/login', { replace: true });
    };

    void checkRole();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (!ready) {
    return <PageLoadingSkeleton />;
  }

  return <>{children}</>;
}
