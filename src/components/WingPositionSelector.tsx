import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Door swing diagrams matching architectural standards
function WingIcon({ position, className }: { position: 'TL' | 'TR' | 'BL' | 'BR' | 'TP'; className?: string }) {
  const renderDiagram = () => {
    switch (position) {
      case 'TL':
        return (
          <>
            <rect x="3" y="3" width="42" height="58" rx="1" stroke="currentColor" strokeWidth="2" fill="none" />
            <line x1="24" y1="3" x2="24" y2="61" stroke="currentColor" strokeWidth="1.5" />
            <line x1="24" y1="3" x2="45" y2="32" stroke="currentColor" strokeWidth="1.5" />
            <line x1="24" y1="61" x2="45" y2="32" stroke="currentColor" strokeWidth="1.5" />
          </>
        );
      case 'TR':
        return (
          <>
            <rect x="3" y="3" width="42" height="58" rx="1" stroke="currentColor" strokeWidth="2" fill="none" />
            <line x1="3" y1="3" x2="45" y2="32" stroke="currentColor" strokeWidth="1.5" />
            <line x1="3" y1="61" x2="45" y2="32" stroke="currentColor" strokeWidth="1.5" />
          </>
        );
      case 'BL':
        return (
          <>
            <rect x="3" y="3" width="42" height="58" rx="1" stroke="currentColor" strokeWidth="2" fill="none" />
            <line x1="24" y1="3" x2="24" y2="61" stroke="currentColor" strokeWidth="1.5" />
            <line x1="24" y1="3" x2="3" y2="32" stroke="currentColor" strokeWidth="1.5" />
            <line x1="24" y1="61" x2="3" y2="32" stroke="currentColor" strokeWidth="1.5" />
          </>
        );
      case 'BR':
        return (
          <>
            <rect x="3" y="3" width="42" height="58" rx="1" stroke="currentColor" strokeWidth="2" fill="none" />
            <line x1="45" y1="3" x2="3" y2="32" stroke="currentColor" strokeWidth="1.5" />
            <line x1="45" y1="61" x2="3" y2="32" stroke="currentColor" strokeWidth="1.5" />
          </>
        );
      case 'TP':
        return (
          <>
            {/* Outer frame */}
            <rect x="2" y="2" width="44" height="60" stroke="currentColor" strokeWidth="1.5" fill="none" />
            {/* Vertical dividers for 3 panels */}
            <line x1="16" y1="2" x2="16" y2="62" stroke="currentColor" strokeWidth="1" />
            <line x1="32" y1="2" x2="32" y2="62" stroke="currentColor" strokeWidth="1" />
            {/* Horizontal dividers in side panels */}
            <line x1="2" y1="38" x2="16" y2="38" stroke="currentColor" strokeWidth="1" />
            <line x1="32" y1="38" x2="46" y2="38" stroke="currentColor" strokeWidth="1" />
            {/* Left upper panel: V pointing right */}
            <line x1="2" y1="2" x2="16" y2="20" stroke="currentColor" strokeWidth="1" />
            <line x1="2" y1="38" x2="16" y2="20" stroke="currentColor" strokeWidth="1" />
            {/* Right upper panel: V pointing left */}
            <line x1="46" y1="2" x2="32" y2="20" stroke="currentColor" strokeWidth="1" />
            <line x1="46" y1="38" x2="32" y2="20" stroke="currentColor" strokeWidth="1" />
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
  { value: 'TP' as const, label: 'חלון תלת-כנפי', position: 'TP' as const },
];

export type WingPositionValue = 'TL' | 'TR' | 'BL' | 'BR' | 'TP' | null;

interface WingPositionSelectorProps {
  value: WingPositionValue;
  onChange: (value: WingPositionValue) => void;
  size?: 'sm' | 'md';
}

export function WingPositionSelector({ value, onChange, size = 'sm' }: WingPositionSelectorProps) {
  const [open, setOpen] = useState(false);
  const iconSize = size === 'sm' ? 'h-8 w-6' : 'h-10 w-7';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1 rounded border px-1.5 py-1 transition-all min-w-[40px] justify-center',
            value
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-input bg-background text-muted-foreground hover:border-muted-foreground'
          )}
        >
          {value ? (
            <WingIcon position={value} className={iconSize} />
          ) : (
            <span className="text-xs">—</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-1" align="center" sideOffset={4}>
        <div className="grid grid-cols-2 gap-1">
          {WING_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(value === opt.value ? null : opt.value);
                setOpen(false);
              }}
              className={cn(
                'rounded border p-1 flex items-center justify-center transition-all',
                value === opt.value
                  ? 'border-primary bg-primary/10 ring-1 ring-primary text-primary'
                  : 'border-border hover:border-muted-foreground text-foreground',
                opt.value === 'TP' ? 'col-span-2' : ''
              )}
            >
              <WingIcon position={opt.position} className="h-10 w-7" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
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
  if (!['TL', 'TR', 'BL', 'BR', 'TP'].includes(position)) return null;

  const w = 48;
  const h = 64;
  const canvas = document.createElement('canvas');
  canvas.width = w * 2;
  canvas.height = h * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.scale(2, 2);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;

  switch (position) {
    case 'TL':
      ctx.strokeRect(3, 3, 42, 58);
      ctx.beginPath(); ctx.moveTo(24, 3); ctx.lineTo(24, 61); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(24, 3); ctx.lineTo(45, 32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(24, 61); ctx.lineTo(45, 32); ctx.stroke();
      break;
    case 'TR':
      ctx.strokeRect(3, 3, 42, 58);
      ctx.beginPath(); ctx.moveTo(3, 3); ctx.lineTo(45, 32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(3, 61); ctx.lineTo(45, 32); ctx.stroke();
      break;
    case 'BL':
      ctx.strokeRect(3, 3, 42, 58);
      ctx.beginPath(); ctx.moveTo(24, 3); ctx.lineTo(24, 61); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(24, 3); ctx.lineTo(3, 32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(24, 61); ctx.lineTo(3, 32); ctx.stroke();
      break;
    case 'BR':
      ctx.strokeRect(3, 3, 42, 58);
      ctx.beginPath(); ctx.moveTo(45, 3); ctx.lineTo(3, 32); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(45, 61); ctx.lineTo(3, 32); ctx.stroke();
      break;
    case 'TP':
      ctx.lineWidth = 1;
      // Outer frame
      ctx.strokeRect(2, 2, 44, 60);
      // Vertical dividers
      ctx.beginPath(); ctx.moveTo(16, 2); ctx.lineTo(16, 62); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(32, 2); ctx.lineTo(32, 62); ctx.stroke();
      // Horizontal dividers in side panels
      ctx.beginPath(); ctx.moveTo(2, 38); ctx.lineTo(16, 38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(32, 38); ctx.lineTo(46, 38); ctx.stroke();
      // Left upper: V pointing right
      ctx.beginPath(); ctx.moveTo(2, 2); ctx.lineTo(16, 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(2, 38); ctx.lineTo(16, 20); ctx.stroke();
      // Right upper: V pointing left
      ctx.beginPath(); ctx.moveTo(46, 2); ctx.lineTo(32, 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(46, 38); ctx.lineTo(32, 20); ctx.stroke();
      break;
  }

  const dataUrl = canvas.toDataURL('image/png');
  return dataUrl.split(',')[1];
}
