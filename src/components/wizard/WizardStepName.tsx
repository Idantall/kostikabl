import { useWizard } from './WizardContext';
import { ProjectType } from '@/lib/wizardTypes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ArrowLeft, FileText, Building2 } from 'lucide-react';

export function WizardStepName() {
  const { state, dispatch } = useWizard();
  const { name, projectType } = state;

  const handleNext = () => {
    if (!name.trim()) return;
    dispatch({ type: 'SET_STEP', payload: 1 });
  };

  const handleTypeChange = (type: ProjectType) => {
    dispatch({ type: 'SET_PROJECT_TYPE', payload: type });
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">שם הפרויקט</CardTitle>
          <CardDescription>
            הכנס שם לפרויקט החדש. השם יופיע ברשימת הפרויקטים.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="project-name">שם הפרויקט</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => dispatch({ type: 'SET_NAME', payload: e.target.value })}
              placeholder="לדוגמה: בניין המגדל - תל אביב"
              dir="rtl"
              className="text-lg"
              autoFocus
            />
          </div>

          {/* Project type selection */}
          <div className="space-y-3">
            <Label>סוג פרויקט</Label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleTypeChange('pre_contract')}
                className={`flex flex-col items-center gap-2 border rounded-lg p-4 cursor-pointer transition-colors ${
                  projectType === 'pre_contract'
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'hover:bg-muted'
                }`}
              >
                <FileText className={`h-8 w-8 ${projectType === 'pre_contract' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`font-medium text-sm ${projectType === 'pre_contract' ? 'text-primary' : ''}`}>
                  טרום חוזה
                </span>
                <span className="text-xs text-muted-foreground text-center">
                  העלה חוזה PDF לחילוץ פרטים אוטומטי
                </span>
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('blind_jambs')}
                className={`flex flex-col items-center gap-2 border rounded-lg p-4 cursor-pointer transition-colors ${
                  projectType === 'blind_jambs'
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'hover:bg-muted'
                }`}
              >
                <Building2 className={`h-8 w-8 ${projectType === 'blind_jambs' ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`font-medium text-sm ${projectType === 'blind_jambs' ? 'text-primary' : ''}`}>
                  משקופים עיוורים
                </span>
                <span className="text-xs text-muted-foreground text-center">
                  הזנה ידנית של בנק פרטים
                </span>
              </button>
            </div>
          </div>

          <div className="flex justify-start">
            <Button
              onClick={handleNext}
              disabled={!name.trim()}
              className="gap-2"
            >
              המשך לבנק פרטים
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
