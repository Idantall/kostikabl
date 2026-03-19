// ProjectWizard page
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { WizardProvider, useWizard } from '@/components/wizard/WizardContext';
import { WizardShell } from '@/components/wizard/WizardShell';
import { WizardStepName } from '@/components/wizard/WizardStepName';
import { WizardStepBank } from '@/components/wizard/WizardStepBank';
import { WizardStepFloors } from '@/components/wizard/WizardStepFloors';
import { WizardStepApartments } from '@/components/wizard/WizardStepApartments';
import { WizardStepReview } from '@/components/wizard/WizardStepReview';
import { Button } from '@/components/ui/button';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useUserPermissions } from '@/hooks/useRBAC';

function WizardContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, loadDraft, createNewDraft } = useWizard();
  const [loading, setLoading] = useState(true);
  const { data: permissions, isLoading: permissionsLoading } = useUserPermissions();

  useEffect(() => {
    const init = async () => {
      // Check auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login');
        return;
      }

      // Check permission - owners always have access, otherwise check can_create_projects
      if (!permissionsLoading && permissions && !permissions.can_create_projects) {
        navigate('/projects');
        return;
      }

      // Load existing draft or create new
      const draftId = searchParams.get('draft');
      if (draftId) {
        await loadDraft(draftId);
      } else if (!state.draftId) {
        const newDraftId = await createNewDraft();
        if (newDraftId) {
          navigate(`/wizard?draft=${newDraftId}`, { replace: true });
        }
      }

      setLoading(false);
    };

    if (!permissionsLoading) {
      init();
    }
  }, [permissionsLoading, permissions]);

  if (loading || permissionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>טוען...</span>
        </div>
      </div>
    );
  }

  const renderStep = () => {
    switch (state.currentStep) {
      case 0:
        return <WizardStepName />;
      case 1:
        return <WizardStepBank />;
      case 2:
        return <WizardStepFloors />;
      case 3:
        return <WizardStepApartments />;
      case 4:
        return <WizardStepReview />;
      default:
        return <WizardStepName />;
    }
  };

  return (
    <WizardShell>
      {/* Back to projects link */}
      <div className="mb-6">
        <Link to="/projects">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowRight className="h-4 w-4" />
            חזרה לפרויקטים
          </Button>
        </Link>
      </div>
      
      {renderStep()}
    </WizardShell>
  );
}

export default function ProjectWizard() {
  return (
    <WizardProvider>
      <WizardContent />
    </WizardProvider>
  );
}
