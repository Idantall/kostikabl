import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const Logout = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const handleLogout = async () => {
      try {
        // Use local scope to avoid 403 when session already expired on server
        await supabase.auth.signOut({ scope: 'local' });
        toast.success("התנתקת בהצלחה");
      } catch (error: any) {
        // Even if signout fails, clear local state and redirect
        console.log("Logout error (ignored):", error.message);
      } finally {
        navigate("/login");
      }
    };

    handleLogout();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">מתנתק...</h1>
        <p className="text-muted-foreground">אנא המתן</p>
      </div>
    </div>
  );
};

export default Logout;
