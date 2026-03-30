import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let redirected = false;

    const goToLogin = () => {
      if (cancelled || redirected) return;
      redirected = true;
      setReady(false);
      navigate('/login', { replace: true });
    };

    const signOutAndRedirect = async () => {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // ignore
      }
      goToLogin();
    };

    const validateSession = async () => {
      if (cancelled || redirected) return;

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        goToLogin();
        return;
      }

      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        await signOutAndRedirect();
        return;
      }

      if (!cancelled) setReady(true);
    };

    void validateSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        goToLogin();
        return;
      }
      if (!redirected && !cancelled) {
        setTimeout(() => void validateSession(), 0);
      }
    });

    const onFocus = () => {
      if (!redirected) void validateSession();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      subscription.unsubscribe();
    };
  }, [navigate]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">טוען...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
