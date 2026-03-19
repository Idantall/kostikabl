import { useState, useRef, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Pencil,
  Eraser,
  Undo2,
  Trash2,
  Download,
  MousePointer,
  Circle,
  Square,
  Type,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
  ZoomIn,
  ZoomOut,
  Highlighter,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Tool = "select" | "pen" | "marker" | "rectangle" | "circle" | "text" | "eraser" | "checkmark" | "issue";

interface AnnotationData {
  points?: { x: number; y: number }[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  text?: string;
  color: string;
  strokeWidth: number;
  opacity?: number;
}

interface Annotation {
  id: string;
  pdf_id: string;
  page: number;
  annotation_type: string;
  annotation_data: AnnotationData;
  profile_code: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface PageProgress {
  id: string;
  pdf_id: string;
  page: number;
  status: string;
  worker_id: string | null;
  completed_at: string | null;
}

const COLORS = ["#22c55e", "#ef4444", "#f97316", "#eab308", "#3b82f6", "#8b5cf6", "#000000"];
const STROKE_WIDTHS = [2, 4, 6, 10, 16];
interface OptimizationPdfViewerProps {
  pdfId: string;
  pdfPath: string;
}

export function OptimizationPdfViewer({ pdfId, pdfPath }: OptimizationPdfViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);

  // Drawing state
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#22c55e");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentElement, setCurrentElement] = useState<AnnotationData | null>(null);
  const [textInput, setTextInput] = useState("");
  const [textPosition, setTextPosition] = useState<{ x: number; y: number } | null>(null);
  const [pageProgress, setPageProgress] = useState<PageProgress[]>([]);

  // Sync state - use counter instead of boolean to handle concurrent saves
  const [pendingSaveCount, setPendingSaveCount] = useState(0);
  const [lastSaved, setLastSaved] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const lastSyncRef = useRef<string>("");
  const channelRef = useRef<RealtimeChannel | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  // Fetch PDF URL from storage
  useEffect(() => {
    const fetchPdfUrl = async () => {
      const { data } = await supabase.storage
        .from("optimization-pdfs")
        .createSignedUrl(pdfPath, 3600);
      if (data) {
        setPdfUrl(data.signedUrl);
      }
    };
    fetchPdfUrl();
  }, [pdfPath]);

  // Fetch annotations from database - paginated to avoid 1000-row limit
  const fetchAnnotations = useCallback(async () => {
    console.log("[Annotations] Fetching for pdfId:", pdfId);
    
    let allData: Annotation[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from("optimization_pdf_annotations")
        .select("*")
        .eq("pdf_id", pdfId)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error("[Annotations] Error fetching:", error);
        return;
      }

      const mapped = (data || []).map((row) => ({
        id: row.id,
        pdf_id: row.pdf_id,
        page: row.page,
        annotation_type: row.annotation_type,
        annotation_data: row.annotation_data as unknown as AnnotationData,
        profile_code: row.profile_code,
        created_by: row.created_by,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })) as Annotation[];
      
      allData = [...allData, ...mapped];
      
      if ((data || []).length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    
    console.log("[Annotations] Fetched", allData.length, "total annotations");
    console.log("[Annotations] Pages with annotations:", [...new Set(allData.map(a => a.page))]);
    setAnnotations(allData);
  }, [pdfId]);

  // Fetch page progress
  const fetchProgress = useCallback(async () => {
    const { data } = await supabase
      .from("optimization_pdf_progress")
      .select("*")
      .eq("pdf_id", pdfId);

    setPageProgress((data || []) as PageProgress[]);
  }, [pdfId]);

  // Initial data fetch
  useEffect(() => {
    fetchAnnotations();
    fetchProgress();
  }, [fetchAnnotations, fetchProgress]);

  // Real-time subscription for annotations
  useEffect(() => {
    const channel = supabase
      .channel(`pdf-annotations:${pdfId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "optimization_pdf_annotations",
          filter: `pdf_id=eq.${pdfId}`,
        },
        (payload) => {
          // Ignore our own changes during the debounce window
          const changeId = `${payload.eventType}-${(payload.new as Annotation)?.id || (payload.old as { id: string })?.id}`;
          if (changeId === lastSyncRef.current) return;

          if (payload.eventType === "INSERT") {
            const newAnnotation = payload.new as Annotation;
            setAnnotations((prev) => {
              // Prevent duplicates (might already have optimistic version)
              if (prev.some(a => a.id === newAnnotation.id)) return prev;
              return [...prev, newAnnotation];
            });
          } else if (payload.eventType === "UPDATE") {
            setAnnotations((prev) =>
              prev.map((a) => (a.id === (payload.new as Annotation).id ? (payload.new as Annotation) : a))
            );
          } else if (payload.eventType === "DELETE") {
            setAnnotations((prev) => prev.filter((a) => a.id !== (payload.old as { id: string }).id));
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [pdfId]);

  const showSavedIndicator = useCallback(() => {
    setLastSaved(true);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setLastSaved(false), 2000);
  }, []);

  // Immediate save (no debounce) - saves right after drawing ends
  const saveAnnotation = useCallback(
    async (newAnnotation: Omit<Annotation, "id" | "created_at" | "updated_at">, optimisticId: string) => {
      setPendingSaveCount(c => c + 1);
      try {
        // Convert to database format
        const dbRecord = {
          pdf_id: newAnnotation.pdf_id,
          page: newAnnotation.page,
          annotation_type: newAnnotation.annotation_type,
          annotation_data: newAnnotation.annotation_data as unknown as Json,
          profile_code: newAnnotation.profile_code,
          created_by: newAnnotation.created_by,
        };
        
        const { data, error } = await supabase
          .from("optimization_pdf_annotations")
          .insert(dbRecord)
          .select()
          .single();

        if (error) throw error;

        // Replace optimistic entry with real DB entry
        setAnnotations((prev) =>
          prev.map((a) => (a.id === optimisticId ? { ...a, id: data.id } : a))
        );
        lastSyncRef.current = `INSERT-${data.id}`;
        showSavedIndicator();
      } catch (error) {
        console.error("Error saving annotation:", error);
        toast.error("שגיאה בשמירת ההערה");
        // Remove optimistic entry on error
        setAnnotations((prev) => prev.filter((a) => a.id !== optimisticId));
      } finally {
        setPendingSaveCount(c => Math.max(0, c - 1));
      }
    },
    [showSavedIndicator]
  );

  // Periodic sync every 3 seconds to catch any missed updates from other users
  // Real-time subscription handles sync - no polling needed

  // Handle PDF load success
  const onDocumentLoadSuccess = async ({ numPages: pages }: { numPages: number }) => {
    setNumPages(pages);
    setIsLoading(false);

    // Update page count in database
    await supabase
      .from("optimization_pdf_uploads")
      .update({ page_count: pages, status: "active" })
      .eq("id", pdfId);
  };

  // Handle page render success - resize canvas to match PDF
  const onPageLoadSuccess = (page: { getViewport: (options: { scale: number }) => { width: number; height: number } }) => {
    const viewport = page.getViewport({ scale });
    console.log("[Canvas] Page loaded, setting canvas size:", viewport.width, "x", viewport.height);
    setCanvasSize({ width: viewport.width, height: viewport.height });
  };

  // Redraw canvas when annotations change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      console.log("[Canvas] canvasRef is null, skipping draw. annotations:", annotations.length, "canvasSize:", canvasSize.width, "x", canvasSize.height);
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all annotations for current page
    const pageAnnotations = annotations.filter((a) => a.page === currentPage);
    
    if (pageAnnotations.length > 0) {
      console.log("[Canvas] Drawing", pageAnnotations.length, "annotations for page", currentPage, "canvas:", canvas.width, "x", canvas.height);
    }

    pageAnnotations.forEach((annotation) => {
      const data = annotation.annotation_data;
      ctx.strokeStyle = data.color;
      ctx.fillStyle = data.color;
      ctx.lineWidth = data.strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.globalAlpha = data.opacity ?? 1;

      switch (annotation.annotation_type) {
        case "path":
        case "marker":
          if (data.points && data.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(data.points[0].x * canvas.width, data.points[0].y * canvas.height);
            data.points.forEach((point, i) => {
              if (i > 0) ctx.lineTo(point.x * canvas.width, point.y * canvas.height);
            });
            ctx.stroke();
          }
          break;
        case "rectangle":
          if (data.x !== undefined && data.y !== undefined && data.width !== undefined && data.height !== undefined) {
            ctx.strokeRect(
              data.x * canvas.width,
              data.y * canvas.height,
              data.width * canvas.width,
              data.height * canvas.height
            );
          }
          break;
        case "circle":
          if (data.x !== undefined && data.y !== undefined && data.radius !== undefined) {
            ctx.beginPath();
            ctx.arc(
              data.x * canvas.width,
              data.y * canvas.height,
              data.radius * Math.min(canvas.width, canvas.height),
              0,
              Math.PI * 2
            );
            ctx.stroke();
          }
          break;
        case "text":
          if (data.x !== undefined && data.y !== undefined && data.text) {
            ctx.font = `${data.strokeWidth * 6}px Arial`;
            ctx.fillText(data.text, data.x * canvas.width, data.y * canvas.height);
          }
          break;
        case "checkmark":
          if (data.x !== undefined && data.y !== undefined) {
            const size = 20;
            const x = data.x * canvas.width;
            const y = data.y * canvas.height;
            ctx.strokeStyle = "#22c55e";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(x - size / 2, y);
            ctx.lineTo(x - size / 6, y + size / 2);
            ctx.lineTo(x + size / 2, y - size / 2);
            ctx.stroke();
          }
          break;
        case "issue":
          if (data.x !== undefined && data.y !== undefined) {
            const size = 16;
            const x = data.x * canvas.width;
            const y = data.y * canvas.height;
            ctx.strokeStyle = "#ef4444";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(x - size / 2, y - size / 2);
            ctx.lineTo(x + size / 2, y + size / 2);
            ctx.moveTo(x + size / 2, y - size / 2);
            ctx.lineTo(x - size / 2, y + size / 2);
            ctx.stroke();
          }
          break;
      }
      ctx.globalAlpha = 1; // Reset alpha
    });

    // Draw current element being drawn
    if (currentElement) {
      ctx.strokeStyle = currentElement.color;
      ctx.fillStyle = currentElement.color;
      ctx.lineWidth = currentElement.strokeWidth;
      ctx.globalAlpha = currentElement.opacity ?? 1;

      if (currentElement.points && currentElement.points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(currentElement.points[0].x * canvas.width, currentElement.points[0].y * canvas.height);
        currentElement.points.forEach((point, i) => {
          if (i > 0) ctx.lineTo(point.x * canvas.width, point.y * canvas.height);
        });
        ctx.stroke();
      } else if (currentElement.x !== undefined && currentElement.y !== undefined) {
        if (currentElement.width !== undefined && currentElement.height !== undefined) {
          ctx.strokeRect(
            currentElement.x * canvas.width,
            currentElement.y * canvas.height,
            currentElement.width * canvas.width,
            currentElement.height * canvas.height
          );
        } else if (currentElement.radius !== undefined) {
          ctx.beginPath();
          ctx.arc(
            currentElement.x * canvas.width,
            currentElement.y * canvas.height,
            currentElement.radius * Math.min(canvas.width, canvas.height),
            0,
            Math.PI * 2
          );
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1; // Reset alpha
    }
  }, [annotations, currentElement, currentPage, canvasSize]);

  // Get pointer position relative to canvas (normalized 0-1)
  // Handles both mouse and touch events
  const getPointerPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    let clientX: number, clientY: number;
    if ("touches" in e && e.touches.length > 0) {
      // Touch event with active touches
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ("changedTouches" in e && e.changedTouches.length > 0) {
      // Touch end event - use changedTouches
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else if ("clientX" in e) {
      // Mouse event
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return { x: 0, y: 0 };
    }

    return {
      x: (clientX - rect.left) / canvas.width,
      y: (clientY - rect.top) / canvas.height,
    };
  };

  // Mouse/Touch event handlers
  const handlePointerDown = async (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (tool === "select") return;

    // Prevent default touch behavior (scrolling, zooming)
    if ("touches" in e) {
      e.preventDefault();
    }

    const pos = getPointerPos(e);
    setIsDrawing(true);

    if (tool === "text") {
      setTextPosition({ x: pos.x, y: pos.y });
      return;
    }

    if (tool === "checkmark" || tool === "issue") {
      const optimisticId = `temp-${Date.now()}`;
      const newAnnotation: Omit<Annotation, "id" | "created_at" | "updated_at"> = {
        pdf_id: pdfId,
        page: currentPage,
        annotation_type: tool,
        annotation_data: { x: pos.x, y: pos.y, color: tool === "checkmark" ? "#22c55e" : "#ef4444", strokeWidth },
        profile_code: null,
        created_by: userId,
      };
      setAnnotations((prev) => [
        ...prev,
        { ...newAnnotation, id: optimisticId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Annotation,
      ]);
      saveAnnotation(newAnnotation, optimisticId);
      setIsDrawing(false);
      return;
    }

    if (tool === "eraser") {
      // Find and remove annotation at this position
      const pageAnnotations = annotations.filter((a) => a.page === currentPage);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const hitAnnotation = pageAnnotations.find((a) => {
        const data = a.annotation_data;
        if (a.annotation_type === "path" && data.points) {
          return data.points.some(
            (p) => Math.abs(p.x - pos.x) < 0.02 && Math.abs(p.y - pos.y) < 0.02
          );
        }
        if (data.x !== undefined && data.y !== undefined) {
          return Math.abs(data.x - pos.x) < 0.03 && Math.abs(data.y - pos.y) < 0.03;
        }
        return false;
      });

      if (hitAnnotation) {
        // Optimistic UI update first
        setAnnotations((prev) => prev.filter((a) => a.id !== hitAnnotation.id));
        
        // Actually delete from database and await result
        const { error } = await supabase
          .from("optimization_pdf_annotations")
          .delete()
          .eq("id", hitAnnotation.id);
        
        if (error) {
          console.error("Error deleting annotation:", error);
          toast.error("שגיאה במחיקת ההערה");
          // Restore annotations on error
          fetchAnnotations();
        } else {
          lastSyncRef.current = `DELETE-${hitAnnotation.id}`;
        }
      }
      return;
    }

    const newElement: AnnotationData = {
      color,
      strokeWidth: tool === "marker" ? 16 : strokeWidth,
      opacity: tool === "marker" ? 0.4 : 1,
    };

    if (tool === "pen" || tool === "marker") {
      newElement.points = [pos];
    } else {
      newElement.x = pos.x;
      newElement.y = pos.y;
      newElement.width = 0;
      newElement.height = 0;
      newElement.radius = 0;
    }

    setCurrentElement(newElement);
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentElement) return;

    // Prevent default touch behavior (scrolling, zooming)
    if ("touches" in e) {
      e.preventDefault();
    }

    const pos = getPointerPos(e);

    if (currentElement.points) {
      setCurrentElement((prev) =>
        prev ? { ...prev, points: [...(prev.points || []), pos] } : null
      );
    } else if (tool === "rectangle") {
      const startX = currentElement.x || 0;
      const startY = currentElement.y || 0;
      setCurrentElement((prev) =>
        prev ? { ...prev, width: pos.x - startX, height: pos.y - startY } : null
      );
    } else if (tool === "circle") {
      const startX = currentElement.x || 0;
      const startY = currentElement.y || 0;
      const radius = Math.sqrt((pos.x - startX) ** 2 + (pos.y - startY) ** 2);
      setCurrentElement((prev) => (prev ? { ...prev, radius } : null));
    }
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    if (currentElement && (
      (currentElement.points && currentElement.points.length > 0) ||
      (currentElement.width !== undefined && currentElement.width !== null) ||
      (currentElement.radius !== undefined && currentElement.radius !== null)
    )) {
      const optimisticId = `temp-${Date.now()}`;
      const annotationType = currentElement.points 
        ? "path"
        : currentElement.radius ? "circle" : "rectangle";
      const newAnnotation: Omit<Annotation, "id" | "created_at" | "updated_at"> = {
        pdf_id: pdfId,
        page: currentPage,
        annotation_type: annotationType,
        annotation_data: currentElement,
        profile_code: null,
        created_by: userId,
      };
      setAnnotations((prev) => [
        ...prev,
        { ...newAnnotation, id: optimisticId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Annotation,
      ]);
      saveAnnotation(newAnnotation, optimisticId);
    }
    setCurrentElement(null);
    setIsDrawing(false);
  };

  // Add text annotation
  const handleAddText = () => {
    if (!textPosition || !textInput.trim()) return;

    const optimisticId = `temp-${Date.now()}`;
    const newAnnotation: Omit<Annotation, "id" | "created_at" | "updated_at"> = {
      pdf_id: pdfId,
      page: currentPage,
      annotation_type: "text",
      annotation_data: { x: textPosition.x, y: textPosition.y, text: textInput, color, strokeWidth },
      profile_code: null,
      created_by: userId,
    };
    setAnnotations((prev) => [
      ...prev,
      { ...newAnnotation, id: optimisticId, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Annotation,
    ]);
    saveAnnotation(newAnnotation, optimisticId);
    setTextInput("");
    setTextPosition(null);
  };

  // Undo last annotation on current page
  const handleUndo = async () => {
    const pageAnnotations = annotations.filter((a) => a.page === currentPage);
    const lastAnnotation = pageAnnotations[pageAnnotations.length - 1];
    if (lastAnnotation) {
      await supabase.from("optimization_pdf_annotations").delete().eq("id", lastAnnotation.id);
      setAnnotations((prev) => prev.filter((a) => a.id !== lastAnnotation.id));
    }
  };

  // Clear all annotations for current page
  const handleClearPage = async () => {
    const pageAnnotationIds = annotations.filter((a) => a.page === currentPage).map((a) => a.id);
    if (pageAnnotationIds.length === 0) return;

    await supabase.from("optimization_pdf_annotations").delete().in("id", pageAnnotationIds);
    setAnnotations((prev) => prev.filter((a) => a.page !== currentPage));
    toast.success("ההערות נמחקו");
  };

  // Mark page as done
  const handleMarkPageDone = async () => {
    setPendingSaveCount(c => c + 1);
    try {
      const existing = pageProgress.find((p) => p.page === currentPage);
      if (existing) {
        const { error } = await supabase
          .from("optimization_pdf_progress")
          .update({ status: "done", completed_at: new Date().toISOString(), worker_id: userId })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("optimization_pdf_progress").insert({
          pdf_id: pdfId,
          page: currentPage,
          status: "done",
          completed_at: new Date().toISOString(),
          worker_id: userId,
        });
        if (error) throw error;
      }
      await fetchProgress();
      showSavedIndicator();
      toast.success("העמוד סומן כהושלם");
    } catch (error) {
      console.error("Error marking page done:", error);
      toast.error("שגיאה בסימון העמוד");
    } finally {
      setPendingSaveCount(c => Math.max(0, c - 1));
    }
  };

  // Export annotations report
  const handleExportReport = () => {
    const textAnnotations = annotations.filter((a) => a.annotation_type === "text");
    const issueAnnotations = annotations.filter((a) => a.annotation_type === "issue");
    const checkAnnotations = annotations.filter((a) => a.annotation_type === "checkmark");

    const BOM = "\uFEFF";
    const headers = ["עמוד", "סוג", "טקסט", "תאריך"];
    let csv = BOM + headers.join(",") + "\n";

    [...textAnnotations, ...issueAnnotations, ...checkAnnotations].forEach((a) => {
      const type = a.annotation_type === "text" ? "הערה" : a.annotation_type === "issue" ? "בעיה" : "הושלם";
      const text = a.annotation_data.text || "-";
      const date = new Date(a.created_at).toLocaleString("he-IL");
      csv += `"${a.page}","${type}","${text}","${date}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `optimization_notes_${pdfId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const currentPageProgress = pageProgress.find((p) => p.page === currentPage);
  const completedPages = pageProgress.filter((p) => p.status === "done").length;

  return (
    <div className="flex flex-col h-full bg-background relative" dir="rtl">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between p-2 border-b bg-card gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <Button variant={tool === "select" ? "default" : "ghost"} size="icon" onClick={() => setTool("select")} title="בחירה">
            <MousePointer className="h-4 w-4" />
          </Button>
          <Button variant={tool === "pen" ? "default" : "ghost"} size="icon" onClick={() => setTool("pen")} title="עט">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant={tool === "marker" ? "default" : "ghost"} size="icon" onClick={() => setTool("marker")} title="מרקר">
            <Highlighter className="h-4 w-4" />
          </Button>
          <Button variant={tool === "rectangle" ? "default" : "ghost"} size="icon" onClick={() => setTool("rectangle")} title="מלבן">
            <Square className="h-4 w-4" />
          </Button>
          <Button variant={tool === "circle" ? "default" : "ghost"} size="icon" onClick={() => setTool("circle")} title="עיגול">
            <Circle className="h-4 w-4" />
          </Button>
          <Button variant={tool === "text" ? "default" : "ghost"} size="icon" onClick={() => setTool("text")} title="טקסט">
            <Type className="h-4 w-4" />
          </Button>
          <Button variant={tool === "checkmark" ? "default" : "ghost"} size="icon" onClick={() => setTool("checkmark")} title="סימון V">
            <Check className="h-4 w-4" />
          </Button>
          <Button variant={tool === "issue" ? "default" : "ghost"} size="icon" onClick={() => setTool("issue")} title="סימון בעיה">
            <X className="h-4 w-4" />
          </Button>
          <Button variant={tool === "eraser" ? "default" : "ghost"} size="icon" onClick={() => setTool("eraser")} title="מחק">
            <Eraser className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          {/* Color Picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" title="צבע">
                <div className="h-5 w-5 rounded-full border-2" style={{ backgroundColor: color }} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" side="bottom">
              <div className="flex gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={cn(
                      "h-6 w-6 rounded-full border-2 transition-transform",
                      color === c ? "scale-125 border-foreground" : "border-transparent hover:scale-110"
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Stroke Width Selector */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" title="עובי קו">
                <Minus className="h-4 w-4" style={{ strokeWidth: strokeWidth / 2 }} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2" side="bottom">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground mb-1 text-center">עובי קו</span>
                <div className="flex gap-1 items-center">
                  {STROKE_WIDTHS.map((w) => (
                    <button
                      key={w}
                      className={cn(
                        "flex items-center justify-center h-8 w-8 rounded border-2 transition-all",
                        strokeWidth === w ? "border-foreground bg-accent" : "border-transparent hover:bg-accent/50"
                      )}
                      onClick={() => setStrokeWidth(w)}
                      title={`${w}px`}
                    >
                      <div 
                        className="rounded-full bg-foreground" 
                        style={{ width: Math.min(w * 1.5, 20), height: Math.min(w * 1.5, 20) }} 
                      />
                    </button>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <div className="w-px h-6 bg-border mx-1" />

          <Button variant="ghost" size="icon" onClick={handleUndo} title="בטל">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleClearPage} title="נקה עמוד">
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleExportReport} title="ייצא דוח">
            <Download className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {pendingSaveCount > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs">שומר...</span>
            </div>
          )}
          {pendingSaveCount === 0 && lastSaved && (
            <div className="flex items-center gap-1 text-green-600">
              <Check className="h-4 w-4" />
              <span className="text-xs">נשמר</span>
            </div>
          )}
          <Button variant="ghost" size="icon" onClick={() => setScale((s) => Math.max(0.5, s - 0.1))} title="הקטן">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" onClick={() => setScale((s) => Math.min(2, s + 0.1))} title="הגדל">
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="p-2 border-b bg-muted/50">
        <div className="flex items-center gap-4">
          <Progress value={numPages > 0 ? (completedPages / numPages) * 100 : 0} className="flex-1 h-2" />
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {completedPages}/{numPages} עמודים הושלמו
          </span>
          <Button
            size="sm"
            variant={currentPageProgress?.status === "done" ? "secondary" : "default"}
            onClick={handleMarkPageDone}
            disabled={currentPageProgress?.status === "done"}
          >
            {currentPageProgress?.status === "done" ? "הושלם" : "סמן כהושלם"}
          </Button>
        </div>
      </div>

      {/* Text Input Dialog */}
      {textPosition && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-card p-4 rounded-lg shadow-lg border">
          <Textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="הקלד הערה..."
            className="min-w-[200px] mb-2"
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAddText}>
              הוסף
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setTextPosition(null)}>
              ביטול
            </Button>
          </div>
        </div>
      )}

      {/* PDF Viewer with Canvas Overlay - add padding-bottom to account for fixed nav */}
      <div className="flex-1 overflow-auto p-4 pb-20">
        <div className="flex items-center justify-center">
          {isLoading && (
            <div className="flex flex-col items-center gap-4">
              <Skeleton className="w-[600px] h-[800px]" />
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          )}

          {pdfUrl && (
            <Document file={pdfUrl} onLoadSuccess={onDocumentLoadSuccess} loading={null}>
              <div className="relative inline-block shadow-lg">
                <Page
                  pageNumber={currentPage}
                  scale={scale}
                  onLoadSuccess={onPageLoadSuccess}
                  loading={<Skeleton className="w-[600px] h-[800px]" />}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                />
                <canvas
                  ref={canvasRef}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  className={cn(
                    "absolute top-0 left-0",
                    tool === "select" ? "pointer-events-none" : "cursor-crosshair"
                  )}
                  style={{ 
                    width: canvasSize.width, 
                    height: canvasSize.height,
                    touchAction: "none",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                  }}
                  onMouseDown={handlePointerDown}
                  onMouseMove={handlePointerMove}
                  onMouseUp={handlePointerUp}
                  onMouseLeave={handlePointerUp}
                  onTouchStart={handlePointerDown}
                  onTouchMove={handlePointerMove}
                  onTouchEnd={handlePointerUp}
                  onTouchCancel={handlePointerUp}
                />
              </div>
            </Document>
          )}
        </div>
      </div>

      {/* Page Navigation - Fixed at bottom for mobile visibility */}
      <div className="sticky bottom-0 left-0 right-0 flex items-center justify-center gap-2 sm:gap-4 p-3 border-t bg-card z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.1)]">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
        >
          <ChevronRight className="h-4 w-4" />
          <span className="hidden sm:inline">הקודם</span>
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm whitespace-nowrap">
            {currentPage} / {numPages || "?"}
          </span>
          {currentPageProgress?.status === "done" && (
            <Badge variant="default" className="bg-primary">
              <Check className="h-3 w-3" />
            </Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
          disabled={currentPage >= numPages}
        >
          <span className="hidden sm:inline">הבא</span>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
