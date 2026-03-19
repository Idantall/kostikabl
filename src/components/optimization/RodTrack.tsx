import React, { useEffect, useMemo, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle } from "lucide-react";

// Cut type definition with optional metadata
export type CutType = "straight" | "angled" | "unknown";

export interface CutInfo {
  type: CutType;
  angle_deg?: number | null;
  slope?: "in" | "out" | null;
}

export interface EnhancedSegment {
  length_mm: number;
  cut_left?: CutInfo | CutType;
  cut_right?: CutInfo | CutType;
  part_ids?: string[];  // Part IDs displayed under this segment
}

export interface Boundary {
  between: [number, number];
  cut_type: CutType;
  angle_deg?: number | null;
  slope?: "in" | "out" | null;
  part_ids: string[];
}

export interface SegmentsData {
  segments?: EnhancedSegment[];
  boundaries?: Boundary[];
}

interface RodTrackProps {
  segments: number[];
  enhancedData?: SegmentsData | EnhancedSegment[] | null;
  barLengthMm: number;
  remainderMm?: number;
  done?: boolean;
}

function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    const initialWidth = el.clientWidth;
    if (initialWidth > 0) setWidth(initialWidth);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

// Parse enhanced data from various formats
function parseEnhancedData(data?: SegmentsData | EnhancedSegment[] | null): SegmentsData | null {
  if (!data) return null;
  
  if ("segments" in data && Array.isArray(data.segments)) {
    return data as SegmentsData;
  }
  
  if (Array.isArray(data)) {
    return { segments: data, boundaries: [] };
  }
  
  return null;
}

// Normalize cut info to get the type
function getCutType(cut?: CutInfo | CutType): CutType {
  if (!cut) return "unknown";
  if (typeof cut === "string") return cut;
  return cut.type || "unknown";
}

// Get slope direction from cut info
function getCutSlope(cut?: CutInfo | CutType): "in" | "out" | null {
  if (!cut || typeof cut === "string") return null;
  return cut.slope || null;
}

// Distinct color palette (stable, not random)
const SEGMENT_COLORS = [
  "hsl(217, 91%, 60%)",  // Blue
  "hsl(160, 84%, 39%)",  // Green
  "hsl(271, 91%, 65%)",  // Purple
  "hsl(25, 95%, 53%)",   // Orange
  "hsl(339, 90%, 51%)",  // Pink
  "hsl(142, 76%, 36%)",  // Emerald
  "hsl(189, 94%, 43%)",  // Cyan
  "hsl(48, 96%, 53%)",   // Yellow
  "hsl(221, 83%, 53%)",  // Indigo
];

export function RodTrack({
  segments,
  enhancedData,
  barLengthMm,
  remainderMm,
  done = false,
}: RodTrackProps) {
  const { ref, width: containerWidth } = useContainerWidth<HTMLDivElement>();
  
  // Parse enhanced data
  const parsed = useMemo(() => parseEnhancedData(enhancedData), [enhancedData]);
  
  // Calculate totals
  const segSum = useMemo(() => segments.reduce((a, b) => a + b, 0), [segments]);
  const wasteMm = remainderMm ?? Math.max(0, barLengthMm - segSum);
  const totalMm = Math.max(barLengthMm > 0 ? barLengthMm : segSum + wasteMm, segSum + wasteMm);
  
  // Build boundary map for quick lookup
  const boundaryMap = useMemo(() => {
    const map = new Map<number, Boundary>();
    for (const b of parsed?.boundaries || []) {
      map.set(b.between[0], b);
    }
    return map;
  }, [parsed]);
  
  // Layout constants
  const heightPx = 52;
  const paddingPx = 4;
  const bevelPx = 12;
  const labelMinWidthPx = 44;
  const labelFontPx = 14;
  const smallLabelFontPx = 11;
  const trackRadius = 8;
  
  // Compute track width and pixel-per-mm ratio
  const trackWidthPx = containerWidth > 0 ? containerWidth : 300;
  const usableWidthPx = Math.max(0, trackWidthPx - paddingPx * 2);
  const pxPerMm = totalMm > 0 ? usableWidthPx / totalMm : 0;
  
  // Build segment layout with pixel positions
  const layout = useMemo(() => {
    if (pxPerMm === 0) return { segs: [], wasteW: 0, outsideLabels: [] };
    
    let x = paddingPx;
    const segs: Array<{
      idx: number;
      length_mm: number;
      left: number;
      right: number;
      w: number;
      cutLeft: CutType;
      cutRight: CutType;
      slopeLeft: "in" | "out" | null;
      slopeRight: "in" | "out" | null;
      partIds: string[];  // Part IDs for this segment
    }> = [];
    
    const outsideLabels: Array<{ x: number; text: string }> = [];
    
    for (let i = 0; i < segments.length; i++) {
      const length = segments[i];
      const enhanced = parsed?.segments?.[i];
      
      const w = length * pxPerMm;
      const left = x;
      const right = x + w;
      
      const cutLeft = getCutType(enhanced?.cut_left);
      const cutRight = getCutType(enhanced?.cut_right);
      const slopeLeft = getCutSlope(enhanced?.cut_left);
      const slopeRight = getCutSlope(enhanced?.cut_right);
      const partIds = enhanced?.part_ids || [];
      
      segs.push({
        idx: i,
        length_mm: length,
        left,
        right,
        w,
        cutLeft,
        cutRight,
        slopeLeft,
        slopeRight,
        partIds,
      });
      
      // If segment is too narrow, add to outside labels
      if (w < labelMinWidthPx) {
        outsideLabels.push({ x: (left + right) / 2, text: String(Math.round(length)) });
      }
      
      x = right;
    }
    
    const wasteW = wasteMm * pxPerMm;
    
    return { segs, wasteW, outsideLabels };
  }, [segments, parsed, pxPerMm, paddingPx, wasteMm, labelMinWidthPx]);
  
  // Check if any boundaries have unknown cuts
  const hasUnknownCuts = useMemo(() => {
    if (parsed?.boundaries) {
      return parsed.boundaries.some(b => b.cut_type === "unknown");
    }
    if (parsed?.segments) {
      return parsed.segments.some(s => 
        getCutType(s.cut_left) === "unknown" || getCutType(s.cut_right) === "unknown"
      );
    }
    return false;
  }, [parsed]);
  
  // Build polygon points for a segment
  function buildPolygon(
    left: number,
    right: number,
    cutL: CutType,
    cutR: CutType,
    slopeL: "in" | "out" | null,
    slopeR: "in" | "out" | null,
    isFirst: boolean,
    isLast: boolean
  ): string {
    const top = 0;
    const bot = heightPx;
    
    // Left edge
    let lTopX = left;
    let lBotX = left;
    
    if (!isFirst && cutL === "angled") {
      // Apply bevel based on slope direction
      if (slopeL === "in") {
        lTopX = left + bevelPx;
      } else {
        lBotX = left + bevelPx;
      }
    }
    
    // Right edge
    let rTopX = right;
    let rBotX = right;
    
    if (!isLast && cutR === "angled") {
      if (slopeR === "out") {
        rTopX = right - bevelPx;
      } else {
        rBotX = right - bevelPx;
      }
    }
    
    return `${lTopX},${top} ${rTopX},${top} ${rBotX},${bot} ${lBotX},${bot}`;
  }
  
  // No segments case
  if (segments.length === 0) {
    return (
      <div 
        ref={ref} 
        className="w-full h-12 bg-muted/30 rounded flex items-center justify-center text-muted-foreground text-sm"
        style={{ minWidth: 0 }}
      >
        אין נתונים
      </div>
    );
  }
  
  // Wait for container width measurement
  if (containerWidth < 50) {
    return (
      <div ref={ref} className="w-full" style={{ minWidth: 0 }}>
        <div className="h-14 bg-muted/30 rounded animate-pulse" />
      </div>
    );
  }
  
  // Check if any segments have part IDs
  const hasSegmentPartIds = layout.segs.some(s => s.partIds.length > 0);
  const maxPartIdsInSegment = Math.max(0, ...layout.segs.map(s => s.partIds.length));
  const hasBoundaryPartIds = Array.from(boundaryMap.values()).some(b => b.part_ids?.length > 0);
  const hasOutsideLabels = layout.outsideLabels.length > 0;
  
  // Calculate extra height for part IDs row(s) - show ALL IDs, each line is ~14px + 4px spacing
  const partIdsRowHeight = hasSegmentPartIds ? maxPartIdsInSegment * 14 + 6 : 0;
  const extraHeight = partIdsRowHeight + (hasOutsideLabels && !hasSegmentPartIds ? 22 : 0);
  const svgHeight = heightPx + extraHeight;
  
  return (
    <TooltipProvider>
      <div 
        ref={ref} 
        className="w-full overflow-hidden relative"
        style={{ minWidth: 0, maxWidth: "100%" }}
      >
        {/* Unknown cuts warning indicator */}
        {hasUnknownCuts && (
          <div className="absolute -top-1 -right-1 z-10">
            <Tooltip>
              <TooltipTrigger>
                <div className="w-5 h-5 bg-warning rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-3 h-3 text-warning-foreground" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">יש חתכים שלא ניתן לזהות את הזווית שלהם</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        
        <svg
          width={trackWidthPx}
          height={svgHeight}
          viewBox={`0 0 ${trackWidthPx} ${svgHeight}`}
          style={{ display: "block", direction: "ltr" }}
        >
          {/* Definitions */}
          <defs>
            <pattern id="wasteHatch" patternUnits="userSpaceOnUse" width="6" height="6">
              <path d="M0,6 l6,-6 M-2,2 l4,-4 M4,8 l4,-4" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" opacity="0.4" />
            </pattern>
          </defs>
          
          {/* Track background */}
          <rect 
            x={0} 
            y={0} 
            width={trackWidthPx} 
            height={heightPx} 
            rx={trackRadius} 
            ry={trackRadius} 
            fill="hsl(var(--muted) / 0.5)" 
          />
          
          {/* Segments */}
          <g>
            {layout.segs.map((s, index) => {
              const isFirst = index === 0;
              const isLast = index === layout.segs.length - 1;
              const fill = done ? "hsl(var(--muted-foreground) / 0.5)" : SEGMENT_COLORS[s.idx % SEGMENT_COLORS.length];
              const showInside = s.w >= labelMinWidthPx;
              const labelText = String(Math.round(s.length_mm));
              const cx = (s.left + s.right) / 2;
              
              return (
                <g key={s.idx}>
                  <polygon
                    points={buildPolygon(s.left, s.right, s.cutLeft, s.cutRight, s.slopeLeft, s.slopeRight, isFirst, isLast)}
                    fill={fill}
                    stroke="white"
                    strokeWidth={2}
                  />
                  
                  {/* Angled cut indicator lines */}
                  {!isFirst && s.cutLeft === "angled" && (
                    <line
                      x1={s.slopeLeft === "in" ? s.left + bevelPx : s.left}
                      y1={0}
                      x2={s.slopeLeft === "in" ? s.left : s.left + bevelPx}
                      y2={heightPx}
                      stroke="hsl(0, 84%, 60%)"
                      strokeWidth={2}
                    />
                  )}
                  {!isLast && s.cutRight === "angled" && (
                    <line
                      x1={s.slopeRight === "out" ? s.right - bevelPx : s.right}
                      y1={0}
                      x2={s.slopeRight === "out" ? s.right : s.right - bevelPx}
                      y2={heightPx}
                      stroke="hsl(0, 84%, 60%)"
                      strokeWidth={2}
                    />
                  )}
                  
                  {/* Unknown cut indicator (dashed line) */}
                  {!isFirst && s.cutLeft === "unknown" && (
                    <line
                      x1={s.left}
                      y1={0}
                      x2={s.left}
                      y2={heightPx}
                      stroke="hsl(38, 92%, 50%)"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                    />
                  )}
                  {!isLast && s.cutRight === "unknown" && (
                    <line
                      x1={s.right}
                      y1={0}
                      x2={s.right}
                      y2={heightPx}
                      stroke="hsl(38, 92%, 50%)"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                    />
                  )}
                  
                  {/* Inside label */}
                  {showInside && (
                    <text
                      x={cx}
                      y={heightPx / 2 + 5}
                      textAnchor="middle"
                      fontSize={labelFontPx}
                      fontWeight={700}
                      fill="white"
                      style={{ userSelect: "none" }}
                    >
                      {labelText}
                    </text>
                  )}
                </g>
              );
            })}
            
            {/* Waste segment */}
            {layout.wasteW > 1 && layout.segs.length > 0 && (
              <rect
                x={layout.segs[layout.segs.length - 1].right}
                y={0}
                width={layout.wasteW}
                height={heightPx}
                fill="url(#wasteHatch)"
                stroke="white"
                strokeWidth={2}
              />
            )}
          </g>
          
          {/* Segment part IDs (centered under each segment box) - show ALL */}
          {layout.segs.map((s) => {
            if (s.partIds.length === 0) return null;
            
            const cx = (s.left + s.right) / 2;
            
            return (
              <g key={`seg-parts-${s.idx}`}>
                {s.partIds.map((partId, lineIdx) => (
                  <text
                    key={`sp-${s.idx}-${lineIdx}`}
                    x={cx}
                    y={heightPx + 14 + lineIdx * 14}
                    textAnchor="middle"
                    fontSize={smallLabelFontPx}
                    fontWeight={500}
                    fill="hsl(var(--foreground))"
                    style={{ direction: "rtl" }}
                  >
                    {partId}
                  </text>
                ))}
              </g>
            );
          })}
          
          {/* Outside labels for narrow segments (only if no segment part IDs) */}
          {!hasSegmentPartIds && layout.outsideLabels.map((l, idx) => (
            <text
              key={`ol-${idx}`}
              x={l.x}
              y={heightPx + 16}
              textAnchor="middle"
              fontSize={smallLabelFontPx}
              fontWeight={700}
              fill="hsl(var(--foreground))"
            >
              {l.text}
            </text>
          ))}
        </svg>
      </div>
    </TooltipProvider>
  );
}
