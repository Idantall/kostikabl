import { useWizard } from './WizardContext';
import { cn } from '@/lib/utils';
import { Check, Loader2 } from 'lucide-react';

const STEPS = [
  { id: 0, label: 'שם הפרויקט' },
  { id: 1, label: 'בנק פרטים' },
  { id: 2, label: 'קומות ודירות' },
  { id: 3, label: 'טבלאות דירות' },
  { id: 4, label: 'סיכום ויצירה' },
];

interface WizardShellProps {
  children: React.ReactNode;
}

export function WizardShell({ children }: WizardShellProps) {
  const { state } = useWizard();
  const { currentStep, isSaving, lastSaved } = state;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      {/* Progress header */}
      <div className="sticky top-0 z-20 bg-card/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-primary">אשף יצירת פרויקט</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>שומר...</span>
                </>
              ) : lastSaved ? (
                <>
                  <Check className="h-4 w-4 text-green-500" />
                  <span>נשמר {lastSaved.toLocaleTimeString('he-IL')}</span>
                </>
              ) : null}
            </div>
          </div>
          
          {/* Step indicators */}
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                      currentStep === step.id
                        ? 'bg-primary text-primary-foreground'
                        : currentStep > step.id
                        ? 'bg-green-500 text-white'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {currentStep > step.id ? <Check className="h-4 w-4" /> : step.id + 1}
                  </div>
                  <span
                    className={cn(
                      'text-xs mt-1 text-center whitespace-nowrap',
                      currentStep === step.id ? 'text-primary font-medium' : 'text-muted-foreground'
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'h-0.5 flex-1 mx-2',
                      currentStep > step.id ? 'bg-green-500' : 'bg-muted'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="container mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}
