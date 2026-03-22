import { cn } from '@/lib/utils';

// Inline SVG wing icons — a door frame with a filled triangle marking the hinge corner
function WingIcon({ position, className }: { position: 'TL' | 'TR' | 'BL' | 'BR'; className?: string }) {
  // Triangle points for each corner position
  const triangles: Record<string, string> = {
    TL: '4,4 4,20 20,4',
    TR: '44,4 44,20 28,4',
    BL: '4,44 4,28 20,44',
    BR: '44,44 44,28 28,44',
  };

  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      {/* Door frame */}
      <rect x="3" y="3" width="42" height="42" rx="1" stroke="currentColor" strokeWidth="2.5" fill="none" />
      {/* Hinge triangle */}
      <polygon points={triangles[position]} fill="currentColor" />
    </svg>
  );
}

const WING_OPTIONS = [
  { value: 'TL' as const, label: 'שמאל עליון', position: 'TL' as const },
  { value: 'TR' as const, label: 'ימין עליון', position: 'TR' as const },
  { value: 'BL' as const, label: 'שמאל תחתון', position: 'BL' as const },
  { value: 'BR' as const, label: 'ימין תחתון', position: 'BR' as const },
];

export type WingPositionValue = 'TL' | 'TR' | 'BL' | 'BR' | null;

interface WingPositionSelectorProps {
  value: WingPositionValue;
  onChange: (value: WingPositionValue) => void;
  size?: 'sm' | 'md';
}

export function WingPositionSelector({ value, onChange, size = 'sm' }: WingPositionSelectorProps) {
  const iconSize = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';

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

// Generate a small PNG data URL from canvas for Excel embedding
export function wingPositionToPngBase64(position: string): string | null {
  if (!['TL', 'TR', 'BL', 'BR'].includes(position)) return null;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Door frame
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, size - 8, size - 8);

  // Hinge triangle
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  const s = 18; // triangle size
  switch (position) {
    case 'TL':
      ctx.moveTo(4, 4); ctx.lineTo(4, 4 + s); ctx.lineTo(4 + s, 4);
      break;
    case 'TR':
      ctx.moveTo(size - 4, 4); ctx.lineTo(size - 4, 4 + s); ctx.lineTo(size - 4 - s, 4);
      break;
    case 'BL':
      ctx.moveTo(4, size - 4); ctx.lineTo(4, size - 4 - s); ctx.lineTo(4 + s, size - 4);
      break;
    case 'BR':
      ctx.moveTo(size - 4, size - 4); ctx.lineTo(size - 4, size - 4 - s); ctx.lineTo(size - 4 - s, size - 4);
      break;
  }
  ctx.closePath();
  ctx.fill();

  // Return base64 without prefix
  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}
