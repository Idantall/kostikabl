import { useState, useRef, useEffect, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Pencil, 
  Eraser, 
  Undo2, 
  Trash2, 
  Download, 
  Upload,
  MousePointer,
  Circle,
  Square,
  Type,
  Palette
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Tool = 'select' | 'pen' | 'rectangle' | 'circle' | 'text' | 'eraser';
type DrawingElement = {
  id: string;
  type: 'path' | 'rectangle' | 'circle' | 'text';
  points?: { x: number; y: number }[];
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  text?: string;
  color: string;
  strokeWidth: number;
  page: number;
};

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#000000'];

export default function PdfAnnotationTest() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [isLoading, setIsLoading] = useState(false);
  
  // Drawing state
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [elements, setElements] = useState<DrawingElement[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentElement, setCurrentElement] = useState<DrawingElement | null>(null);
  const [textInput, setTextInput] = useState('');
  const [textPosition, setTextPosition] = useState<{ x: number; y: number } | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      setPdfUrl(URL.createObjectURL(file));
      setCurrentPage(1);
      setElements([]);
    }
  };

  // Handle PDF load success
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setIsLoading(false);
  };

  // Handle page render success - resize canvas to match PDF
  const onPageLoadSuccess = (page: any) => {
    const viewport = page.getViewport({ scale });
    setCanvasSize({ width: viewport.width, height: viewport.height });
  };

  // Redraw canvas when elements change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw all elements for current page
    const pageElements = elements.filter(el => el.page === currentPage);
    
    pageElements.forEach(element => {
      ctx.strokeStyle = element.color;
      ctx.fillStyle = element.color;
      ctx.lineWidth = element.strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      switch (element.type) {
        case 'path':
          if (element.points && element.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(element.points[0].x, element.points[0].y);
            element.points.forEach((point, i) => {
              if (i > 0) ctx.lineTo(point.x, point.y);
            });
            ctx.stroke();
          }
          break;
        case 'rectangle':
          if (element.x !== undefined && element.y !== undefined && 
              element.width !== undefined && element.height !== undefined) {
            ctx.strokeRect(element.x, element.y, element.width, element.height);
          }
          break;
        case 'circle':
          if (element.x !== undefined && element.y !== undefined && element.radius !== undefined) {
            ctx.beginPath();
            ctx.arc(element.x, element.y, element.radius, 0, Math.PI * 2);
            ctx.stroke();
          }
          break;
        case 'text':
          if (element.x !== undefined && element.y !== undefined && element.text) {
            ctx.font = `${element.strokeWidth * 6}px Arial`;
            ctx.fillText(element.text, element.x, element.y);
          }
          break;
      }
    });

    // Draw current element being drawn
    if (currentElement) {
      ctx.strokeStyle = currentElement.color;
      ctx.fillStyle = currentElement.color;
      ctx.lineWidth = currentElement.strokeWidth;

      switch (currentElement.type) {
        case 'path':
          if (currentElement.points && currentElement.points.length > 1) {
            ctx.beginPath();
            ctx.moveTo(currentElement.points[0].x, currentElement.points[0].y);
            currentElement.points.forEach((point, i) => {
              if (i > 0) ctx.lineTo(point.x, point.y);
            });
            ctx.stroke();
          }
          break;
        case 'rectangle':
          if (currentElement.x !== undefined && currentElement.y !== undefined &&
              currentElement.width !== undefined && currentElement.height !== undefined) {
            ctx.strokeRect(currentElement.x, currentElement.y, currentElement.width, currentElement.height);
          }
          break;
        case 'circle':
          if (currentElement.x !== undefined && currentElement.y !== undefined && currentElement.radius !== undefined) {
            ctx.beginPath();
            ctx.arc(currentElement.x, currentElement.y, currentElement.radius, 0, Math.PI * 2);
            ctx.stroke();
          }
          break;
      }
    }
  }, [elements, currentElement, currentPage, canvasSize]);

  // Get mouse position relative to canvas
  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'select') return;
    
    const pos = getMousePos(e);
    setIsDrawing(true);

    if (tool === 'text') {
      setTextPosition(pos);
      return;
    }

    if (tool === 'eraser') {
      // Find and remove element at this position
      const pageElements = elements.filter(el => el.page === currentPage);
      const hitElement = pageElements.find(el => {
        if (el.type === 'path' && el.points) {
          return el.points.some(p => 
            Math.abs(p.x - pos.x) < 10 && Math.abs(p.y - pos.y) < 10
          );
        }
        if (el.type === 'rectangle' && el.x !== undefined && el.y !== undefined) {
          return pos.x >= el.x && pos.x <= el.x + (el.width || 0) &&
                 pos.y >= el.y && pos.y <= el.y + (el.height || 0);
        }
        if (el.type === 'circle' && el.x !== undefined && el.y !== undefined && el.radius !== undefined) {
          const dist = Math.sqrt((pos.x - el.x) ** 2 + (pos.y - el.y) ** 2);
          return dist <= el.radius + 5;
        }
        if (el.type === 'text' && el.x !== undefined && el.y !== undefined) {
          return Math.abs(pos.x - el.x) < 50 && Math.abs(pos.y - el.y) < 20;
        }
        return false;
      });
      
      if (hitElement) {
        setElements(prev => prev.filter(el => el.id !== hitElement.id));
      }
      return;
    }

    const newElement: DrawingElement = {
      id: Date.now().toString(),
      type: tool === 'pen' ? 'path' : tool === 'rectangle' ? 'rectangle' : 'circle',
      color,
      strokeWidth,
      page: currentPage,
    };

    if (tool === 'pen') {
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

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentElement) return;
    
    const pos = getMousePos(e);

    if (currentElement.type === 'path') {
      setCurrentElement(prev => prev ? {
        ...prev,
        points: [...(prev.points || []), pos]
      } : null);
    } else if (currentElement.type === 'rectangle') {
      const startX = currentElement.x || 0;
      const startY = currentElement.y || 0;
      setCurrentElement(prev => prev ? {
        ...prev,
        width: pos.x - startX,
        height: pos.y - startY
      } : null);
    } else if (currentElement.type === 'circle') {
      const startX = currentElement.x || 0;
      const startY = currentElement.y || 0;
      const radius = Math.sqrt((pos.x - startX) ** 2 + (pos.y - startY) ** 2);
      setCurrentElement(prev => prev ? {
        ...prev,
        radius
      } : null);
    }
  };

  const handleMouseUp = () => {
    if (currentElement) {
      setElements(prev => [...prev, currentElement]);
      setCurrentElement(null);
    }
    setIsDrawing(false);
  };

  // Add text annotation
  const handleAddText = () => {
    if (!textPosition || !textInput.trim()) return;
    
    const newElement: DrawingElement = {
      id: Date.now().toString(),
      type: 'text',
      x: textPosition.x,
      y: textPosition.y,
      text: textInput,
      color,
      strokeWidth,
      page: currentPage,
    };
    
    setElements(prev => [...prev, newElement]);
    setTextInput('');
    setTextPosition(null);
  };

  // Undo last action
  const handleUndo = () => {
    setElements(prev => prev.slice(0, -1));
  };

  // Clear all annotations for current page
  const handleClearPage = () => {
    setElements(prev => prev.filter(el => el.page !== currentPage));
  };

  // Export annotations as JSON
  const handleExportAnnotations = () => {
    const data = JSON.stringify(elements, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'annotations.json';
    a.click();
  };

  return (
    <div className="min-h-screen bg-background p-4" dir="rtl">
      <div className="max-w-7xl mx-auto">
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              בדיקת ציור על PDF
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              העלה קובץ PDF וצייר עליו הערות. ההערות נשמרות בנפרד מהקובץ.
            </p>
            
            {/* File upload */}
            {!pdfFile && (
              <label className="cursor-pointer">
                <div className="border-2 border-dashed rounded-lg p-12 text-center hover:border-primary transition-colors">
                  <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">העלה קובץ PDF</h3>
                  <p className="text-muted-foreground">לחץ לבחירת קובץ</p>
                </div>
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            )}
          </CardContent>
        </Card>

        {pdfFile && (
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4">
            {/* Toolbar */}
            <Card className="lg:w-16">
              <CardContent className="p-2 flex lg:flex-col gap-1">
                <Button
                  variant={tool === 'select' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => setTool('select')}
                  title="בחירה"
                >
                  <MousePointer className="h-4 w-4" />
                </Button>
                <Button
                  variant={tool === 'pen' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => setTool('pen')}
                  title="עט"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant={tool === 'rectangle' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => setTool('rectangle')}
                  title="מלבן"
                >
                  <Square className="h-4 w-4" />
                </Button>
                <Button
                  variant={tool === 'circle' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => setTool('circle')}
                  title="עיגול"
                >
                  <Circle className="h-4 w-4" />
                </Button>
                <Button
                  variant={tool === 'text' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => setTool('text')}
                  title="טקסט"
                >
                  <Type className="h-4 w-4" />
                </Button>
                <Button
                  variant={tool === 'eraser' ? 'default' : 'ghost'}
                  size="icon"
                  onClick={() => setTool('eraser')}
                  title="מחק"
                >
                  <Eraser className="h-4 w-4" />
                </Button>
                
                <div className="border-t my-1" />
                
                {/* Color picker */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" title="צבע">
                      <div 
                        className="h-5 w-5 rounded-full border-2"
                        style={{ backgroundColor: color }}
                      />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-2" side="left">
                    <div className="flex gap-1">
                      {COLORS.map(c => (
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

                <div className="border-t my-1" />

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleUndo}
                  disabled={elements.length === 0}
                  title="בטל"
                >
                  <Undo2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearPage}
                  title="נקה עמוד"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleExportAnnotations}
                  title="ייצא הערות"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>

            {/* PDF Viewer with Canvas Overlay */}
            <Card>
              <CardContent className="p-4">
                {/* Page Navigation */}
                <div className="flex items-center justify-center gap-4 mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                  >
                    הקודם
                  </Button>
                  <span className="text-sm">
                    עמוד {currentPage} מתוך {numPages || '?'}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
                    disabled={currentPage >= numPages}
                  >
                    הבא
                  </Button>
                  <div className="border-r h-6 mx-2" />
                  <span className="text-sm text-muted-foreground">
                    הערות בעמוד: {elements.filter(e => e.page === currentPage).length}
                  </span>
                </div>

                {/* PDF + Canvas Container */}
                <div 
                  ref={containerRef}
                  className="relative flex justify-center bg-muted/30 rounded-lg overflow-auto"
                >
                  {pdfUrl && (
                    <>
                      <Document
                        file={pdfUrl}
                        onLoadSuccess={onDocumentLoadSuccess}
                        loading={<Skeleton className="w-[600px] h-[800px]" />}
                      >
                        <Page
                          pageNumber={currentPage}
                          scale={scale}
                          onLoadSuccess={onPageLoadSuccess}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                        />
                      </Document>
                      
                      {/* Canvas Overlay */}
                      <canvas
                        ref={canvasRef}
                        width={canvasSize.width}
                        height={canvasSize.height}
                        className={cn(
                          "absolute top-0 left-1/2 -translate-x-1/2",
                          tool === 'select' ? 'cursor-default' : 
                          tool === 'eraser' ? 'cursor-crosshair' : 'cursor-crosshair'
                        )}
                        style={{ 
                          width: canvasSize.width, 
                          height: canvasSize.height,
                          pointerEvents: tool === 'select' ? 'none' : 'auto'
                        }}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                      />
                    </>
                  )}
                </div>

                {/* Text input dialog */}
                {textPosition && (
                  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <Card className="w-96">
                      <CardHeader>
                        <CardTitle>הוסף הערת טקסט</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <Textarea
                          value={textInput}
                          onChange={e => setTextInput(e.target.value)}
                          placeholder="הקלד את ההערה..."
                          className="min-h-[100px]"
                          autoFocus
                        />
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" onClick={() => setTextPosition(null)}>
                            ביטול
                          </Button>
                          <Button onClick={handleAddText}>
                            הוסף
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Scale controls */}
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
                  >
                    -
                  </Button>
                  <span className="text-sm min-w-[60px] text-center">
                    {Math.round(scale * 100)}%
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setScale(s => Math.min(2, s + 0.1))}
                  >
                    +
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Annotations summary */}
        {elements.length > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">סיכום הערות ({elements.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {Array.from(new Set(elements.map(e => e.page))).sort((a, b) => a - b).map(page => (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                  >
                    עמוד {page} ({elements.filter(e => e.page === page).length})
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
