import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { 
  ClipboardList, 
  Home, 
  LogOut, 
  Menu, 
  X,
} from 'lucide-react';
import kostikaLogo from '@/assets/kostika-logo-new.png';
import { WorkerIdentityProvider, useWorkerIdentity } from './WorkerIdentityContext';
import { WorkerIdentityBadge } from './WorkerIdentityBadge';
import { WorkerIdentityModal } from './WorkerIdentityModal';
import { WorkerConfirmationModal } from './WorkerConfirmationModal';
import { CutlistLanguageProvider, useCutlistLanguage } from '@/contexts/CutlistLanguageContext';
import { CutlistLanguageSelector } from '@/components/cutlist/CutlistLanguageSelector';

interface WorkerLayoutProps {
  children: React.ReactNode;
}

function WorkerLayoutInner({ children }: WorkerLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useCutlistLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const { 
    needsIdentification, 
    isLoading, 
    hasPendingConfirmation, 
    pendingAssignments,
    refetchAssignments 
  } = useWorkerIdentity();
  const [identityModalOpen, setIdentityModalOpen] = useState(false);

  const navItems = [
    { href: '/worker', label: t('home'), icon: Home },
    { href: '/worker/cutlist', label: t('productionOrder'), icon: ClipboardList },
    { href: '/worker/optimization', label: t('optimization'), icon: ClipboardList },
  ];

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email || null);
    };
    void getUser();
  }, []);

  useEffect(() => {
    if (needsIdentification && !isLoading && !hasPendingConfirmation) {
      setIdentityModalOpen(true);
    }
  }, [needsIdentification, isLoading, hasPendingConfirmation]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  const handleConfirmationComplete = async () => {
    await refetchAssignments();
  };

  const isActive = (href: string) => {
    if (href === '/worker') {
      return location.pathname === '/worker';
    }
    return location.pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <WorkerConfirmationModal
        open={hasPendingConfirmation}
        assignments={pendingAssignments}
        onConfirmed={handleConfirmationComplete}
      />

      <WorkerIdentityModal 
        open={identityModalOpen && !hasPendingConfirmation} 
        onClose={() => setIdentityModalOpen(false)}
        required={needsIdentification}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center px-4 gap-4">
          <Link to="/worker" className="flex items-center gap-2 shrink-0">
            <img src={kostikaLogo} alt="Kostika" className="h-8 w-auto" />
            <span className="font-semibold text-lg hidden lg:inline">{t('workerPortalTitle')}</span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 flex-1 justify-center">
            {navItems.map((item) => (
              <Link key={item.href} to={item.href}>
                <Button
                  variant={isActive(item.href) ? 'default' : 'ghost'}
                  size="sm"
                  className="gap-2"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Button>
              </Link>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3 shrink-0 mr-auto">
            <CutlistLanguageSelector />
            <WorkerIdentityBadge />
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 ml-2" />
              {t('logout')}
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden mr-auto"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t bg-background">
            <nav className="container px-4 py-4 flex flex-col gap-2">
              <div className="pb-2 mb-2 border-b flex items-center justify-between">
                <WorkerIdentityBadge />
                <CutlistLanguageSelector />
              </div>

              {navItems.map((item) => (
                <Link 
                  key={item.href} 
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Button
                    variant={isActive(item.href) ? 'default' : 'ghost'}
                    className="w-full justify-start gap-2"
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Button>
                </Link>
              ))}
              <div className="border-t pt-4 mt-2">
                {userEmail && (
                  <p className="text-sm text-muted-foreground mb-2 px-3">
                    {userEmail}
                  </p>
                )}
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-2"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  {t('logout')}
                </Button>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main className="container px-4 py-6">
        {children}
      </main>
    </div>
  );
}

export function WorkerLayout({ children }: WorkerLayoutProps) {
  return (
    <CutlistLanguageProvider>
      <WorkerIdentityProvider>
        <WorkerLayoutInner>{children}</WorkerLayoutInner>
      </WorkerIdentityProvider>
    </CutlistLanguageProvider>
  );
}
