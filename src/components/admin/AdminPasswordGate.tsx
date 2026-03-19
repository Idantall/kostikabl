import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock, Shield } from 'lucide-react';
import { toast } from 'sonner';

interface AdminPasswordGateProps {
  onAuthenticated: () => void;
}

const ADMIN_PASSWORD = '1234';

export function AdminPasswordGate({ onAuthenticated }: AdminPasswordGateProps) {
  const [password, setPassword] = useState('');
  const [attempts, setAttempts] = useState(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem('admin-panel-auth', 'true');
      onAuthenticated();
      toast.success('גישה אושרה');
    } else {
      setAttempts(prev => prev + 1);
      toast.error('סיסמה שגויה');
      setPassword('');
      
      if (attempts >= 2) {
        toast.error('יותר מדי ניסיונות כושלים');
      }
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-xl">פאנל ניהול הרשאות</CardTitle>
          <CardDescription>
            הזן סיסמה כדי לגשת לפאנל הניהול
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="סיסמה"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full">
              כניסה
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
