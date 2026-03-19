import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import kostikaLogo from "@/assets/kostika-logo-new.png";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Helper to get redirect path based on user role
  const getRedirectPath = async (userId: string): Promise<string> => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching user role:', error);
        return '/dashboard';
      }
      
      // Workers go to worker portal, everyone else goes to dashboard
      if (data?.role === 'worker') {
        return '/worker';
      }
      return '/dashboard';
    } catch (err) {
      console.error('Error in getRedirectPath:', err);
      return '/dashboard';
    }
  };

  useEffect(() => {
    let cancelled = false;

    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Validate server-side session (handles "Session not found" cases)
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        await supabase.auth.signOut({ scope: 'local' });
        if (!cancelled) {
          setMessage("פג תוקף ההתחברות. אנא התחבר/י מחדש.");
        }
        return;
      }

      if (!cancelled) {
        const redirectPath = await getRedirectPath(user.id);
        navigate(redirectPath, { replace: true });
      }
    };

    void checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const redirectPath = await getRedirectPath(session.user.id);
        navigate(redirectPath, { replace: true });
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    const emailLower = email.trim().toLowerCase();

    try {
      // Check if email is in allowed_emails table
      const { data: allowedData, error: allowedError } = await supabase
        .from('allowed_emails')
        .select('email')
        .eq('email', emailLower)
        .maybeSingle();

      if (allowedError) {
        console.error('Error checking allowed emails:', allowedError);
        throw new Error("שגיאה בבדיקת הרשאות");
      }

      if (!allowedData) {
        setMessage("האימייל אינו מורשה למערכת. אנא פנה למנהל לקבלת גישה.");
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: emailLower,
        password,
      });

      if (error) throw error;
      toast.success("התחברת בהצלחה");
    } catch (error: any) {
      setMessage(error.message || "ההתחברות נכשלה");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4" dir="rtl">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="flex items-center justify-center py-8">
          <img src={kostikaLogo} alt="Kostika" className="h-16 w-auto" />
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">אימייל</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="text-right"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">סיסמה</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="text-right"
              />
            </div>

            {message && (
              <Alert variant="destructive">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "מתחבר..." : "התחבר/י"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
