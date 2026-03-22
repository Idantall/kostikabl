import { cn } from '@/lib/utils';

// Door swing diagrams matching architectural standards
function WingIcon({ position, className }: { position: 'TL' | 'TR' | 'BL' | 'BR'; className?: string }) {
  // Each position renders a distinct door swing diagram
  const renderDiagram = () => {
    switch (position) {
      case 'TL':
        // Double door, right leaf active: rect + center divider + two triangles in right half
        return (
          <>
            <rect x="3" y="3" width="42" height="58" rx="1" stroke="currentColor" strokeWidth="2" fill="none" />
            <line x1="24" y1="3" x2="24" y2="61" stroke="currentColor" strokeWidth="1.5" />
            <line x1="24" y1="3" x2="45" y2="32" stroke="currentColor" strokeWidth="1.5" />
            <line x1="24" y1="61" x2="45" y2="32" stroke="currentColor" strokeWidth="1.5" />
          </>
        );
      case 'TR':
        // Single door, left-hinged opening right: two triangles forming ">" arrow
        return (
          <>
            <rect x="3" y="3" width="42" height="58" rx="1" stroke="currentColor" strokeWidth="2" fill="none" />
            <line x1="3" y1="3" x2="45" y2="32" stroke="currentColor" strokeWidth="1.5" />
            <line x1="3" y1="61" x2="45" y2="32" stroke="currentColor" strokeWidth="1.5" />
          </>
        );
      case 'BL':
        // Double door, left leaf active: rect + center divider + two triangles in left half
        return (
          <>
            <rect x="3" y="3" width="42" height="58" rx="1" stroke="currentColor" strokeWidth="2" fill="none" />
            <line x1="24" y1="3" x2="24" y2="61" stroke="currentColor" strokeWidth="1.5" />
            <line x1="24" y1="3" x2="3" y2="32" stroke="currentColor" strokeWidth="1.5" />
            <line x1="24" y1="61" x2="3" y2="32" stroke="currentColor" strokeWidth="1.5" />
          </>
        );
      case 'BR':
        // Single door, right-hinged opening left: two triangles forming "<" arrow
        return (
          <>
            <rect x="3" y="3" width="42" height="58" rx="1" stroke="currentColor" strokeWidth="2" fill="none" />
            <line x1="45" y1="3" x2="3" y2="32" stroke="currentColor" strokeWidth="1.5" />
            <line x1="45" y1="61" x2="3" y2="32" stroke="currentColor" strokeWidth="1.5" />
          </>
        );
    }
  };

  return (
    <svg viewBox="0 0 48 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {renderDiagram()}
    </svg>
  );
}

const WING_OPTIONS = [
  { value: 'TL' as const, label: 'דלת כפולה ימין', position: 'TL' as const },
  { value: 'TR' as const, label: 'דלת בודדת ימין', position: 'TR' as const },
  { value: 'BL' as const, label: 'דלת כפולה שמאל', position: 'BL' as const },
  { value: 'BR' as const, label: 'דלת בודדת שמאל', position: 'BR' as const },
];

export type WingPositionValue = 'TL' | 'TR' | 'BL' | 'BR' | null;

interface WingPositionSelectorProps {
  value: WingPositionValue;
  onChange: (value: WingPositionValue) => void;
  size?: 'sm' | 'md';
}

export function WingPositionSelector({ value, onChange, size = 'sm' }: WingPositionSelectorProps) {
  const iconSize = size === 'sm' ? 'h-10 w-7' : 'h-12 w-9';

  return (
    <div className="grid grid-cols-2 gap-1">
      {WING_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.label}
          onClick={() => onChange(value === opt.value ? null : opt.value)}
          className={cn(
            'rounded border p-0.5 transition-all flex items-center justify-center',
            value === opt.value
              ? 'border-primary bg-primary/10 ring-1 ring-primary text-primary'
              : 'border-border hover:border-muted-foreground text-foreground'
          )}
        >
          <WingIcon position={opt.position} className={iconSize} />
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

// Generate a PNG data URL from canvas for Excel embedding
export function wingPositionToPngBase64(position: string): string | null {
  if (!['TL', 'TR', 'BL', 'BR'].includes(position)) return null;

  const w = 48;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w * 2; // 2x for clarity
  canvas.height = h * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(2, 2);

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;

  // Outer rect
  ctx.strokeRect(3, 3, 42, 58);

  switch (position) {
    case 'TL': // Double door, right leaf
      // Center divider
      ctx.beginPath(); ctx.moveTo(24, 3); ctx.lineTo(24, 61); ctx.stroke();
      // Top diagonal
      ctx.beginPath(); ctx.moveTo(24, 3); ctx.lineTo(45, 32); ctx.stroke();
      // Bottom diagonal
      ctx.beginPath(); ctx.moveTo(24, 61); ctx.lineTo(45, 32); ctx.stroke();
      break;
    case 'TR': // Single door, opens right
      ctx.beginPath(); ctx.moveTo(3, 3); ctx.lineTo(45, 32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, 61); ctx.lineTo(45, 32); ctx.stroke();
      break;
    case 'BL': // Double door, left leaf
      ctx.beginPath(); ctx.moveTo(24, 3); ctx.lineTo(24, 61); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(24, 3); ctx.lineTo(3, 32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(24, 61); ctx.lineTo(3, 32); ctx.stroke();
      break;
    case 'BR': // Single door, opens left
      ctx.beginPath(); ctx.moveTo(45, 3); ctx.lineTo(3, 32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(45, 61); ctx.lineTo(3, 32); ctx.stroke();
      break;
  }

  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}
