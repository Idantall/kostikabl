import wingTL from '@/assets/wing_tl.png';
import wingTR from '@/assets/wing_tr.png';
import wingBL from '@/assets/wing_bl.png';
import wingBR from '@/assets/wing_br.png';
import { cn } from '@/lib/utils';

const WING_OPTIONS = [
  { value: 'TL', img: wingTL, label: 'שמאל עליון' },
  { value: 'TR', img: wingTR, label: 'ימין עליון' },
  { value: 'BL', img: wingBL, label: 'שמאל תחתון' },
  { value: 'BR', img: wingBR, label: 'ימין תחתון' },
] as const;

export type WingPositionValue = 'TL' | 'TR' | 'BL' | 'BR' | null;

interface WingPositionSelectorProps {
  value: WingPositionValue;
  onChange: (value: WingPositionValue) => void;
  size?: 'sm' | 'md';
}

export function WingPositionSelector({ value, onChange, size = 'sm' }: WingPositionSelectorProps) {
  const imgSize = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  
  return (
    <div className="grid grid-cols-2 gap-1">
      {WING_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.label}
          onClick={() => onChange(value === opt.value ? null : opt.value)}
          className={cn(
            'rounded border p-0.5 transition-all',
            value === opt.value
              ? 'border-primary bg-primary/10 ring-1 ring-primary'
              : 'border-border hover:border-muted-foreground'
          )}
        >
          <img src={opt.img} alt={opt.label} className={cn(imgSize, 'object-contain mx-auto')} />
        </button>
      ))}
    </div>
  );
}

// Map wing_position value to display label for exports
export function wingPositionLabel(value: string | null): string {
  if (!value) return '';
  const opt = WING_OPTIONS.find(o => o.value === value);
  return opt?.label || value;
}
