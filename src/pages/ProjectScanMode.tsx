import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { ArrowRight, Camera, CameraOff, CheckCircle2, AlertTriangle, XCircle, Loader2, Home, Layers } from "lucide-react";
import { BrowserQRCodeReader, IScannerControls } from "@zxing/browser";

// Load issue codes for reporting problems during loading
const LOAD_ISSUE_CODES: Record<string, string> = {
  'LACK_SHUTTER': 'חסר תריס',
  'LACK_WINGS': 'חסר כנפיים',
  'BROKEN_GLASS': 'זכוכית שבורה',
  'ANGLES': 'זוויות',
  'SHUTTER_RAILS': 'מסילות תריס',
};

interface PreviewData {
  success: boolean;
  item?: {
    id: number;
    code: string;
    type: string | null;
    location: string | null;
    motor_side: string | null;
    floor: string | null;
    apartment: string | null;
    loading_status: string | null;
    install_status: string | null;
    required_codes: string[] | null;
  };
  label?: {
    id: number;
    subpart_code: string;
  };
  progress?: {
    scanned: number;
    required: number;
    complete: boolean;
  };
  error?: string;
  message?: string;
  requires_parts_confirmation?: boolean;
}

interface ConfirmResult {
  status: 'ok' | 'duplicate' | 'error';
  message?: string;
  item?: {
    id: number;
    code: string;
  };
  subpart?: string;
  progress?: {
    scanned: number;
    required: number;
  };
  ready?: boolean;
  issues?: {
    saved: boolean;
    issue_codes: string[];
    free_text: string | null;
  };
}

const SUBPART_NAMES: Record<string, string> = {
  '00': 'חלון מושלם',
  '01': 'משקוף',
  '02': 'כנפיים',
  '03': 'תריס גלילה',
  '04': 'מסילות',
  '05': 'ארגז',
  'LOAD': 'פריט שלם',
  'IN': 'התקנה',
};

const STATUS_LABELS: Record<string, string> = {
  'NOT_LOADED': 'לא הועמס',
  'PARTIAL': 'חלקי',
  'LOADED': 'הועמס',
  'NOT_INSTALLED': 'לא הותקן',
  'INSTALLED': 'הותקן',
  'ISSUE': 'בעיה',
};

type ScanState = 'ready' | 'preview' | 'confirming' | 'success' | 'error' | 'permission_denied';

const ProjectScanMode = () => {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const source = (searchParams.get('source') as 'load' | 'install') || 'load';

  const [scanState, setScanState] = useState<ScanState>('ready');
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [lastScannedCode, setLastScannedCode] = useState<string>('');
  const lastScanTimeRef = useRef<number>(0);
  
  // Selected parts for Door/Monoblock manual confirmation
  const [selectedParts, setSelectedParts] = useState<string[]>([]);
  
  // Load issue states
  const [selectedLoadIssues, setSelectedLoadIssues] = useState<string[]>([]);
  const [loadIssueFreeText, setLoadIssueFreeText] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const codeReaderRef = useRef<BrowserQRCodeReader | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [projectName, setProjectName] = useState<string>('');
  
  // Check if parts confirmation is required
  const requiresPartsConfirmation = previewData?.requires_parts_confirmation ?? false;
  const availableParts = previewData?.item?.required_codes ?? [];
  
  // Toggle load issue selection
  const toggleLoadIssue = (code: string) => {
    setSelectedLoadIssues(prev => 
      prev.includes(code) 
        ? prev.filter(c => c !== code)
        : [...prev, code]
    );
  };

  // Parse QR URL to extract slug and token (robust: handles full URLs, hash routes, relative paths)
  const parseQRUrl = useCallback((rawText: string): { slug: string; token: string } | null => {
    const qrText = rawText.trim();
    console.log('[parseQRUrl] Input:', qrText);

    const extractFromUrl = (url: URL): { slug: string; token: string } | null => {
      // Match /s/<slug>, /public-scan/<slug>, /scan/<slug>
      const slugMatch =
        url.pathname.match(/\/s\/([^/?#]+)/) ||
        url.pathname.match(/\/public-scan\/([^/?#]+)/) ||
        url.pathname.match(/\/scan\/([^/?#]+)/);

      const slug = slugMatch?.[1] ?? null;
      const token = url.searchParams.get('t') || url.searchParams.get('token');

      if (slug && token) {
        console.log('[parseQRUrl] Extracted from URL:', { slug, token: token.slice(0, 8) + '...' });
        return { slug, token };
      }
      return null;
    };

    try {
      // 1) Absolute URL
      if (/^https?:\/\//i.test(qrText)) {
        const url = new URL(qrText);

        // Normal path parsing
        const fromPath = extractFromUrl(url);
        if (fromPath) return fromPath;

        // Hash router parsing: https://host/#/s/<slug>?t=...
        const hash = url.hash?.replace(/^#/, '');
        if (hash) {
          const hashUrl = new URL(
            hash.startsWith('/') ? `${url.origin}${hash}` : `${url.origin}/${hash}`
          );
          const fromHash = extractFromUrl(hashUrl);
          if (fromHash) return fromHash;
        }
      } else if (qrText.startsWith('/')) {
        // 2) Relative URL: /s/<slug>?t=...
        const url = new URL(qrText, window.location.origin);
        const fromRel = extractFromUrl(url);
        if (fromRel) return fromRel;
      } else if (/^[\w.-]+\.[a-z]{2,}/i.test(qrText)) {
        // 3) Domain without protocol: example.com/s/<slug>?t=...
        const url = new URL(`https://${qrText}`);
        const fromDomain = extractFromUrl(url);
        if (fromDomain) return fromDomain;
      }
    } catch (e) {
      console.log('[parseQRUrl] URL parsing failed, trying manual extraction');
    }

    // 4) Manual parsing: ".../s/<slug>?t=...&s=load" OR "<slug>?t=..."
    const sIndex = qrText.toLowerCase().lastIndexOf('/s/');
    const possible = sIndex !== -1 ? qrText.slice(sIndex + 3) : qrText;

    const [pathPart, queryPart = ''] = possible.split('?');
    const slug = pathPart.replace(/^\/?s\//i, '').trim();
    if (!slug) {
      console.log('[parseQRUrl] No slug found');
      return null;
    }

    const params = new URLSearchParams(queryPart);
    const token = params.get('t') || params.get('token');
    if (token) {
      console.log('[parseQRUrl] Manual extraction:', { slug, token: token.slice(0, 8) + '...' });
      return { slug, token };
    }

    console.log('[parseQRUrl] No token found');
    return null;
  }, []);

  // Fetch preview data
  const fetchPreview = useCallback(async (slug: string, token: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        return { success: false, error: 'unauthorized', message: 'יש להתחבר מחדש' } as PreviewData;
      }

      const response = await supabase.functions.invoke('scan-preview-internal', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: {
          project_id: parseInt(projectId!),
          slug,
          token,
          source,
        },
      });

      // supabase.functions.invoke returns { data, error }
      // error is set when the function returns a non-2xx status
      if (response.error) {
        // Try to extract the actual error message from the response data
        const errorBody = response.data;
        const msg = errorBody?.message || response.error.message || 'שגיאה בשליפת פרטים';
        console.error('Preview error:', msg, errorBody);
        return { success: false, error: 'api_error', message: msg } as PreviewData;
      }

      return response.data as PreviewData;
    } catch (err) {
      console.error('Preview exception:', err);
      return { success: false, error: 'network_error', message: 'Network error' } as PreviewData;
    }
  }, [projectId, source]);


  // Confirm scan
  const confirmScan = useCallback(async (slug: string, token: string, presentCodes?: string[], loadIssues?: { issue_codes: string[]; free_text?: string }) => {
    setScanState('confirming');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        setErrorMessage('יש להתחבר מחדש');
        setScanState('error');
        toast.error('יש להתחבר מחדש', { duration: 3000 });
        return;
      }

      const response = await supabase.functions.invoke('scan-confirm-internal', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: {
          project_id: parseInt(projectId!),
          slug,
          token,
          source,
          present_codes: presentCodes,
          load_issues: loadIssues,
        },
      });

      if (response.error) {
        const errorBody = response.data;
        const msg = errorBody?.message || response.error.message || 'שגיאה באישור סריקה';
        console.error('Confirm error:', msg, errorBody);
        setErrorMessage(msg);
        setScanState('error');
        toast.error(msg, { duration: 3000 });
        return;
      }

      const result = response.data as ConfirmResult;
      setConfirmResult(result);

      if (result.status === 'ok') {
        const hasIssues = result.issues?.saved;
        toast.success(hasIssues ? 'נסרק עם דיווח!' : 'נסרק בהצלחה!', { duration: 1500 });
        setScanState('success');
      } else if (result.status === 'duplicate') {
        toast.info('כבר נסרק קודם', { duration: 1500 });
        setScanState('success');
      } else {
        setErrorMessage(result.message || 'Unknown error');
        setScanState('error');
        toast.error(result.message || 'שגיאה', { duration: 3000 });
      }

      // Return to scanning after brief feedback
      setTimeout(() => {
        setScanState('ready');
        setPreviewData(null);
        setConfirmResult(null);
        setSelectedParts([]);
        setSelectedLoadIssues([]);
        setLoadIssueFreeText('');
        resumeScanning();
      }, 1500);
    } catch (err) {
      console.error('Confirm exception:', err);
      setErrorMessage('Network error');
      setScanState('error');
      toast.error('שגיאת רשת', { duration: 3000 });
    }
  }, [projectId, source]);


  // Handle QR code detection
  const handleQRDetected = useCallback(async (rawText: string) => {
    const qrText = rawText.trim();
    const now = Date.now();

    // Throttle: ignore same code within 2 seconds
    if (qrText === lastScannedCode && now - lastScanTimeRef.current < 2000) {
      return;
    }

    // Ignore if already in preview/confirming state
    if (scanState !== 'ready') {
      return;
    }

    console.log('[scan] Detected QR text:', qrText);

    setLastScannedCode(qrText);
    lastScanTimeRef.current = now;

    // Pause scanning
    pauseScanning();

    const parsed = parseQRUrl(qrText);
    if (!parsed) {
      const msg = 'QR לא תקין';
      setErrorMessage(msg);
      setScanState('error');
      toast.error(msg, { duration: 2500 });
      setTimeout(() => {
        setScanState('ready');
        setErrorMessage('');
        resumeScanning();
      }, 2500);
      return;
    }

    setScanState('preview');

    // Fetch preview data
    const preview = await fetchPreview(parsed.slug, parsed.token);

    if (!preview.success) {
      const msg = preview.message || 'Invalid QR';
      setErrorMessage(msg);
      setScanState('error');
      toast.error(msg, { duration: 3000 });
      setTimeout(() => {
        setScanState('ready');
        setErrorMessage('');
        resumeScanning();
      }, 3000);
      return;
    }

    setPreviewData({ ...preview, _parsed: parsed } as any);
  }, [scanState, lastScannedCode, parseQRUrl, fetchPreview]);


  // Pause scanning
  const pauseScanning = useCallback(() => {
    // Video keeps playing but we stop processing
  }, []);

  // Resume scanning
  const resumeScanning = useCallback(() => {
    setLastScannedCode('');
  }, []);

  // Initialize camera
  const initCamera = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      const codeReader = new BrowserQRCodeReader();
      codeReaderRef.current = codeReader;

      const controls = await codeReader.decodeFromVideoDevice(
        undefined, // Use default (prefer rear camera)
        videoRef.current,
        (result, error) => {
          if (result) {
            handleQRDetected(result.getText());
          }
          // Ignore decode errors (normal when no QR in view)
        }
      );

      controlsRef.current = controls;
      setCameraActive(true);
    } catch (err: any) {
      console.error('Camera init error:', err);
      if (err.name === 'NotAllowedError' || err.message?.includes('Permission')) {
        setScanState('permission_denied');
      } else {
        setErrorMessage('Failed to access camera');
        setScanState('error');
      }
    }
  }, [handleQRDetected]);

  // Cleanup camera
  const cleanupCamera = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    codeReaderRef.current = null;
    setCameraActive(false);
  }, []);

  // Fetch project name
  useEffect(() => {
    const fetchProject = async () => {
      if (!projectId) return;
      const { data } = await supabase
        .from('projects')
        .select('name')
        .eq('id', parseInt(projectId))
        .single();
      if (data) setProjectName(data.name);
    };
    fetchProject();
  }, [projectId]);

  // Initialize camera on mount
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate('/login');
        return;
      }
      initCamera();
    };
    checkAuth();

    return () => {
      cleanupCamera();
    };
  }, [navigate, initCamera, cleanupCamera]);

  // Handle confirm button
  const handleConfirm = () => {
    const parsed = (previewData as any)?._parsed;
    if (parsed) {
      // Pass selected parts for Door/Monoblock, undefined for others
      const presentCodes = requiresPartsConfirmation ? selectedParts : undefined;
      
      // Build load issues if any are selected or text provided
      const loadIssues = (source === 'load' && (selectedLoadIssues.length > 0 || loadIssueFreeText.trim()))
        ? {
            issue_codes: selectedLoadIssues,
            free_text: loadIssueFreeText.trim() || undefined,
          }
        : undefined;
      
      confirmScan(parsed.slug, parsed.token, presentCodes, loadIssues);
    }
  };

  // Handle cancel preview
  const handleCancelPreview = () => {
    setScanState('ready');
    setPreviewData(null);
    setSelectedParts([]);
    setSelectedLoadIssues([]);
    setLoadIssueFreeText('');
    resumeScanning();
  };
  
  // Toggle part selection
  const togglePart = (code: string) => {
    setSelectedParts(prev => 
      prev.includes(code) 
        ? prev.filter(c => c !== code) 
        : [...prev, code]
    );
  };
  
  // Check if confirm button should be enabled
  const canConfirm = !requiresPartsConfirmation || selectedParts.length > 0;

  // Handle finish
  const handleFinish = () => {
    cleanupCamera();
    navigate(`/projects/${projectId}`);
  };

  // Permission denied screen
  if (scanState === 'permission_denied') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center flex items-center justify-center gap-2">
              <CameraOff className="h-6 w-6 text-destructive" />
              אין גישה למצלמה
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-muted-foreground">
              יש לאשר גישה למצלמה כדי לסרוק קודי QR
            </p>
            <Button onClick={() => navigate(`/projects/${projectId}`)}>
              חזרה לפרויקט
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-black" dir="rtl">
      {/* Header */}
      <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-3 flex items-center justify-between border-b">
        <Button variant="ghost" size="sm" onClick={handleFinish}>
          <ArrowRight className="h-4 w-4 ml-1" />
          סיום
        </Button>
        <div className="text-center flex-1">
          <h1 className="text-sm font-semibold">מצב סריקה — {source === 'load' ? 'העמסה' : 'התקנה'}</h1>
          <p className="text-xs text-muted-foreground truncate">{projectName}</p>
        </div>
        <div className="w-16" /> {/* Spacer for centering */}
      </div>

      {/* Camera view */}
      <div className="flex-1 relative">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />

        {/* Scanning overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Corner guides */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-64 h-64 relative">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
            </div>
          </div>
        </div>

        {/* Status indicator */}
        <div className="absolute bottom-4 left-0 right-0 flex justify-center">
          <div className={`px-4 py-2 rounded-full text-sm font-medium backdrop-blur ${
            scanState === 'ready' ? 'bg-primary/80 text-primary-foreground' :
            scanState === 'confirming' ? 'bg-amber-500/80 text-white' :
            scanState === 'success' ? 'bg-green-500/80 text-white' :
            scanState === 'error' ? 'bg-destructive/80 text-destructive-foreground' :
            'bg-muted/80 text-foreground'
          }`}>
            {scanState === 'ready' && (
              <span className="flex items-center gap-2">
                <Camera className="h-4 w-4" />
                מוכן לסריקה
              </span>
            )}
            {scanState === 'preview' && 'בודק...'}
            {scanState === 'confirming' && (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                מאשר...
              </span>
            )}
            {scanState === 'success' && (
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                נסרק!
              </span>
            )}
            {scanState === 'error' && (
              <span className="flex items-center gap-2">
                <XCircle className="h-4 w-4" />
                {errorMessage || 'שגיאה'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Preview Sheet */}
      <Sheet open={scanState === 'preview' && !!previewData?.success} onOpenChange={(open) => !open && handleCancelPreview()}>
        <SheetContent side="bottom" className="h-[85vh] flex flex-col p-0" dir="rtl">
          <SheetHeader className="px-4 pt-4 pb-2 border-b shrink-0">
            <SheetTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              פרטי פריט
            </SheetTitle>
          </SheetHeader>
          
          {previewData?.item && (
            <>
              {/* Scrollable content */}
              <ScrollArea className="flex-1 px-4">
                <div className="space-y-4 py-4">
                  {/* Item details */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground">קוד פריט</p>
                      <p className="font-semibold">{previewData.item.code}</p>
                    </div>
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground">חלק</p>
                      <p className="font-semibold">
                        {SUBPART_NAMES[previewData.label?.subpart_code || ''] || previewData.label?.subpart_code}
                      </p>
                    </div>
                    {previewData.item.floor && (
                      <div className="bg-muted/50 p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground">קומה</p>
                        <p className="font-semibold">{previewData.item.floor}</p>
                      </div>
                    )}
                    {previewData.item.apartment && (
                      <div className="bg-muted/50 p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground">דירה</p>
                        <p className="font-semibold">{previewData.item.apartment}</p>
                      </div>
                    )}
                    {previewData.item.location && (
                      <div className="bg-muted/50 p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground">מיקום</p>
                        <p className="font-semibold">{previewData.item.location}</p>
                      </div>
                    )}
                    {previewData.item.motor_side && (
                      <div className="bg-muted/50 p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground">צד מנוע</p>
                        <p className="font-semibold">{previewData.item.motor_side}</p>
                      </div>
                    )}
                  </div>

                  {/* Parts Selection for Door/Monoblock */}
                  {requiresPartsConfirmation && availableParts.length > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 rounded-lg">
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">
                        בחר את החלקים הקיימים:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {availableParts.map((code) => (
                          <button
                            key={code}
                            onClick={() => togglePart(code)}
                            className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                              selectedParts.includes(code)
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-muted-foreground/30 bg-background hover:border-primary/50'
                            }`}
                          >
                            {SUBPART_NAMES[code] || code}
                          </button>
                        ))}
                      </div>
                      {selectedParts.length === 0 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                          יש לבחור לפחות חלק אחד כדי לאשר
                        </p>
                      )}
                    </div>
                  )}

                  {/* Progress */}
                  {previewData.progress && (
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">התקדמות {source === 'load' ? 'העמסה' : 'התקנה'}</p>
                      <p className="font-semibold">
                        {previewData.progress.scanned} / {previewData.progress.required}
                        {previewData.progress.complete && (
                          <span className="text-green-600 mr-2">✓ הושלם</span>
                        )}
                      </p>
                    </div>
                  )}

                  {/* Current status */}
                  {source === 'load' && previewData.item.loading_status && (
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <p className="text-xs text-muted-foreground">סטטוס נוכחי</p>
                      <p className="font-semibold">{STATUS_LABELS[previewData.item.loading_status] || previewData.item.loading_status}</p>
                    </div>
                  )}

                  {/* Load Issue Reporting - only for load mode */}
                  {source === 'load' && (
                    <div className="space-y-3">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                        דיווח תקלה (אופציונלי)
                      </Label>
                      <div className="space-y-2 bg-muted/50 p-3 rounded-lg">
                        {Object.entries(LOAD_ISSUE_CODES).map(([code, label]) => (
                          <div key={code} className="flex items-center space-x-2 space-x-reverse">
                            <Checkbox
                              id={`load-issue-${code}`}
                              checked={selectedLoadIssues.includes(code)}
                              onCheckedChange={() => toggleLoadIssue(code)}
                            />
                            <Label 
                              htmlFor={`load-issue-${code}`} 
                              className="cursor-pointer font-normal text-sm"
                            >
                              {label}
                            </Label>
                          </div>
                        ))}
                      </div>
                      <Textarea
                        placeholder="הערה חופשית..."
                        value={loadIssueFreeText}
                        onChange={(e) => setLoadIssueFreeText(e.target.value)}
                        className="text-right text-sm"
                        dir="rtl"
                        maxLength={1000}
                        rows={2}
                      />
                    </div>
                  )}
                </div>
              </ScrollArea>

              {/* Sticky action buttons */}
              <div className="shrink-0 border-t bg-background p-4">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleCancelPreview} className="flex-1">
                    ביטול
                  </Button>
                  <Button 
                    onClick={handleConfirm} 
                    className="flex-1"
                    disabled={!canConfirm}
                  >
                    <CheckCircle2 className="h-4 w-4 ml-2" />
                    {selectedLoadIssues.length > 0 || loadIssueFreeText.trim() ? 'אישור עם דיווח' : 'אישור סריקה'}
                    {requiresPartsConfirmation && selectedParts.length > 0 && (
                      <span className="mr-1">({selectedParts.length})</span>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ProjectScanMode;
