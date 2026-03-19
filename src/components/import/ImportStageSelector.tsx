import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { FileText, Building2, Ruler, Factory } from 'lucide-react';

export type ImportStage = 'pre_contract' | 'blind_jambs' | 'measurement' | 'active';

interface ImportStageSelectorProps {
  value: ImportStage;
  onChange: (stage: ImportStage) => void;
}

const stages: { value: ImportStage; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'pre_contract', label: 'טרום חוזה', description: 'שלב תכנון ראשוני עם חוזה', icon: <FileText className="h-5 w-5" /> },
  { value: 'blind_jambs', label: 'משקופים עיוורים', description: 'שלב משקופים עיוורים', icon: <Building2 className="h-5 w-5" /> },
  { value: 'measurement', label: 'מדידות', description: 'תיק מדידות לעריכה בשטח', icon: <Ruler className="h-5 w-5" /> },
  { value: 'active', label: 'פעיל', description: 'פרויקט מוכן לייצור', icon: <Factory className="h-5 w-5" /> },
];

export function ImportStageSelector({ value, onChange }: ImportStageSelectorProps) {
  return (
    <div className="space-y-3">
      <Label className="text-base font-semibold">שלב הפרויקט</Label>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as ImportStage)} className="grid grid-cols-2 gap-3">
        {stages.map(stage => (
          <label
            key={stage.value}
            className={`flex items-start gap-3 border rounded-lg p-4 cursor-pointer transition-colors ${
              value === stage.value
                ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                : 'hover:bg-muted'
            }`}
          >
            <RadioGroupItem value={stage.value} className="mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={value === stage.value ? 'text-primary' : 'text-muted-foreground'}>{stage.icon}</span>
                <span className={`font-medium text-sm ${value === stage.value ? 'text-primary' : ''}`}>{stage.label}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{stage.description}</p>
            </div>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
