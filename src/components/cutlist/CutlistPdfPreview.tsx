import { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFPageProxy } from "pdfjs-dist";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * Crop constants for drawingLeft mode (tuneable).
 * Targets the TOP-LEFT drawing area with technical drawing + numbered circle.
 * PDF coordinate system: Y=0 is at BOTTOM, so "top" in visual terms = higher Y values
 * But react-pdf renders Y=0 at TOP of the rendered canvas.
 */
export const DRAWING_CROP_CONFIG = {
  xPct: 0.02,   // Slight left margin
  yPct: 0.0,    // Start from very top (page header + drawing area)
  wPct: 0.55,   // Capture left ~55% of page (drawing area, not tables on right)
  hPct: 0.60,   // Capture top ~60% of page (drawing, not accessories below)
  xPx: 0,
  yPx: 0,
  renderScale: 2.0,  // Lower scale for faster rendering
};

interface CutlistPdfPreviewProps {
  pdfPath: string | null;
  pageNumber: number;
  className?: string;
  width?: number;
  /** 'full' shows entire page, 'drawingLeft' crops to show top-left drawing area */
  mode?: "full" | "drawingLeft";
}

// Cache for signed URLs to avoid repeated generation
const signedUrlCache = new Map<string, { url: string; expires: number }>();

async function getSignedUrl(pdfPath: string): Promise<string> {
  const now = Date.now();
  const cached = signedUrlCache.get(pdfPath);
  
  // Return cached URL if still valid (with 5 min buffer)
  if (cached && cached.expires > now + 300000) {
    return cached.url;
  }
  
  const { data, error } = await supabase.storage
    .from("cutlist-pdfs")
    .createSignedUrl(pdfPath, 3600); // 1 hour expiry

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("No signed URL returned");
  
  // Cache the URL
  signedUrlCache.set(pdfPath, {
    url: data.signedUrl,
    expires: now + 3600000, // 1 hour from now
  });
  
  return data.signedUrl;
}

export function CutlistPdfPreview({
  pdfPath,
  pageNumber,
  className,
  width = 280,
  mode = "drawingLeft",
}: CutlistPdfPreviewProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFullPage, setShowFullPage] = useState(false);
  const [pageViewport, setPageViewport] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const loadPdf = async () => {
      if (!pdfPath) {
        setError("PDF path not available");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const url = await getSignedUrl(pdfPath);
        setPdfUrl(url);
      } catch (err) {
        console.error("Error loading PDF:", err);
        setError("לא ניתן לטעון את הציור");
      } finally {
        setIsLoading(false);
      }
    };

    loadPdf();
  }, [pdfPath]);

  // For drawingLeft mode: render at higher scale, then crop to a top-left rectangle (percent-based)
  const isDrawingMode = mode === "drawingLeft";

  // Fallback ratio used only for skeleton/error sizing (full rendering stays unchanged)
  const pageRatioFallback = 1.414;

  // Reset viewport when switching page/mode
  useEffect(() => {
    setPageViewport(null);
  }, [pdfUrl, pageNumber, mode]);

  // Use real PDF viewport size when available (prevents crop drift between PDFs)
  const basePageWidth = isDrawingMode
    ? pageViewport?.width ?? width * DRAWING_CROP_CONFIG.renderScale
    : width;

  const basePageHeight = isDrawingMode
    ? pageViewport?.height ?? basePageWidth * pageRatioFallback
    : width * pageRatioFallback;

  const cropWidth = isDrawingMode ? basePageWidth * DRAWING_CROP_CONFIG.wPct : width;
  const cropHeight = isDrawingMode ? basePageHeight * DRAWING_CROP_CONFIG.hPct : width * pageRatioFallback;

  const offsetX = isDrawingMode ? basePageWidth * DRAWING_CROP_CONFIG.xPct + DRAWING_CROP_CONFIG.xPx : 0;
  const offsetY = isDrawingMode ? basePageHeight * DRAWING_CROP_CONFIG.yPct + DRAWING_CROP_CONFIG.yPx : 0;

  // Container renders at requested preview width
  const containerWidth = width;
  const containerHeight = isDrawingMode ? width * (cropHeight / cropWidth) : width * pageRatioFallback;

  if (error) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted rounded-lg border",
          className
        )}
        style={{ width: containerWidth, height: containerHeight }}
      >
        <p className="text-sm text-muted-foreground text-center p-4">{error}</p>
      </div>
    );
  }

  if (isLoading || !pdfUrl) {
    return (
      <Skeleton
        className={cn("rounded-lg", className)}
        style={{ width: containerWidth, height: containerHeight }}
      />
    );
  }
  
  // Scale factor to fit crop window into container
  const displayScale = isDrawingMode ? containerWidth / cropWidth : 1;

  return (
    <>
      <div
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
            loading={
              <Skeleton style={{ width: containerWidth, height: containerHeight }} />
            }
            error={
              <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                שגיאה בטעינת PDF
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              width={isDrawingMode ? undefined : width}
              scale={isDrawingMode ? DRAWING_CROP_CONFIG.renderScale : undefined}
              onLoadSuccess={(page: PDFPageProxy) => {
                if (!isDrawingMode) return;
                const vp = page.getViewport({ scale: DRAWING_CROP_CONFIG.renderScale });
                setPageViewport({ width: vp.width, height: vp.height });
              }}
              renderTextLayer={false}
              renderAnnotationLayer={false}
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
