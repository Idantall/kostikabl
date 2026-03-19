import { useState, useEffect, useRef, memo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFPageProxy } from "pdfjs-dist";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Maximize2, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCutlistPdf } from "./CutlistPdfContext";

// Configure PDF.js worker - use local worker for faster loading
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * Optimized crop config - lower scale for faster rendering
 */
const CROP_CONFIG = {
  xPct: 0.02,
  yPct: 0.0,
  wPct: 0.55,
  hPct: 0.60,
  renderScale: 1.5, // Reduced from 2.0 for faster rendering
};

interface LazyPdfPreviewProps {
  pageNumber: number;
  className?: string;
  width?: number;
  mode?: "full" | "drawingLeft";
}

/**
 * Lazy-loaded PDF preview that only renders when visible in viewport.
 * Uses shared PDF URL from CutlistPdfContext to avoid multiple signed URL requests.
 */
function LazyPdfPreviewInner({
  pageNumber,
  className,
  width = 280,
  mode = "drawingLeft",
}: LazyPdfPreviewProps) {
  const { pdfUrl, isLoading: urlLoading, error: urlError } = useCutlistPdf();
  const [isVisible, setIsVisible] = useState(false);
  const [showFullPage, setShowFullPage] = useState(false);
  const [pageViewport, setPageViewport] = useState<{ width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect(); // Stop observing once visible
        }
      },
      {
        rootMargin: "200px", // Start loading 200px before visible
        threshold: 0,
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const isDrawingMode = mode === "drawingLeft";
  const pageRatioFallback = 1.414;

  // Reset viewport when switching page/mode
  useEffect(() => {
    setPageViewport(null);
  }, [pdfUrl, pageNumber, mode]);

  const basePageWidth = isDrawingMode
    ? pageViewport?.width ?? width * CROP_CONFIG.renderScale
    : width;

  const basePageHeight = isDrawingMode
    ? pageViewport?.height ?? basePageWidth * pageRatioFallback
    : width * pageRatioFallback;

  const cropWidth = isDrawingMode ? basePageWidth * CROP_CONFIG.wPct : width;
  const cropHeight = isDrawingMode ? basePageHeight * CROP_CONFIG.hPct : width * pageRatioFallback;

  const offsetX = isDrawingMode ? basePageWidth * CROP_CONFIG.xPct : 0;
  const offsetY = isDrawingMode ? basePageHeight * CROP_CONFIG.yPct : 0;

  const containerWidth = width;
  const containerHeight = isDrawingMode ? width * (cropHeight / cropWidth) : width * pageRatioFallback;

  const displayScale = isDrawingMode ? containerWidth / cropWidth : 1;

  // Error state
  if (urlError) {
    return (
      <div
        ref={containerRef}
        className={cn(
          "flex flex-col items-center justify-center bg-muted rounded-lg border gap-2",
          className
        )}
        style={{ width: containerWidth, height: containerHeight }}
      >
        <FileWarning className="h-8 w-8 text-muted-foreground" />
        <p className="text-xs text-muted-foreground text-center px-2">{urlError}</p>
      </div>
    );
  }

  // Loading state or not yet visible
  if (urlLoading || !isVisible || !pdfUrl) {
    return (
      <div ref={containerRef}>
        <Skeleton
          className={cn("rounded-lg", className)}
          style={{ width: containerWidth, height: containerHeight }}
        />
      </div>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        className={cn(
          "relative rounded-lg border bg-white shadow-sm group",
          className
        )}
        style={{
          width: containerWidth,
          height: containerHeight,
          overflow: "hidden",
        }}
      >
        {/* PDF page - positioned absolutely for crop mode */}
        <div
          style={{
            position: isDrawingMode ? "absolute" : "relative",
            left: isDrawingMode ? -offsetX * displayScale : 0,
            top: isDrawingMode ? -offsetY * displayScale : 0,
            transformOrigin: "top left",
            transform: isDrawingMode ? `scale(${displayScale})` : undefined,
          }}
        >
          <Document
            file={pdfUrl}
            loading={null}
            error={
              <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                שגיאה בטעינת PDF
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              width={isDrawingMode ? undefined : width}
              scale={isDrawingMode ? CROP_CONFIG.renderScale : undefined}
              onLoadSuccess={(page: PDFPageProxy) => {
                if (!isDrawingMode) return;
                const vp = page.getViewport({ scale: CROP_CONFIG.renderScale });
                setPageViewport({ width: vp.width, height: vp.height });
              }}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              loading={null}
            />
          </Document>
        </div>

        {/* Expand button */}
        <Button
          variant="secondary"
          size="icon"
          className="absolute bottom-2 left-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shadow-md z-10"
          onClick={() => setShowFullPage(true)}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Full page dialog */}
      <Dialog open={showFullPage} onOpenChange={setShowFullPage}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>עמוד {pageNumber}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center">
            <Document
              file={pdfUrl}
              loading={<Skeleton className="w-full h-[600px]" />}
              error={
                <div className="text-center p-8 text-muted-foreground">
                  שגיאה בטעינת PDF
                </div>
              }
            >
              <Page
                pageNumber={pageNumber}
                width={700}
                renderTextLayer={false}
                renderAnnotationLayer={false}
              />
            </Document>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Memoize to prevent unnecessary re-renders
export const LazyPdfPreview = memo(LazyPdfPreviewInner);
