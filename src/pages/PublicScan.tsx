import { useEffect, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, XCircle, Clock, ExternalLink, Loader2, Package, Wrench, AlertTriangle, Home } from "lucide-react";

interface ScanResult {
  success: boolean;
  is_duplicate?: boolean;
  first_scanned_at?: string;
  source?: 'load' | 'install';
  item?: {
    id: number;
    code: string;
  };
  subpart?: {
    code: string;
  };
  progress?: {
    scanned: number;
    required: number;
  };
  ready?: boolean;
  error?: string;
  message?: string;
  issues?: {
    saved: boolean;
    issue_codes: string[];
    free_text: string | null;
  };
}

// Apartment scan types
interface AptItem {
  id: number;
  code: string;
  type: string | null;
  location: string | null;
  openingNo: string | null;
  width: string | null;
  height: string | null;
  installStatus: string | null;
}

interface AptPreviewResult {
  success: boolean;
  mode: 'preview';
  apartment: { id: number; number: string; floor: string };
  items: AptItem[];
}

interface AptConfirmResult {
  success: boolean;
  mode: 'confirm';
  is_duplicate: boolean;
  message: string;
  confirmed: number;
  duplicates: number;
  total: number;
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
  'NOT_SCANNED': 'לא נסרק',
  'PARTIAL': 'נסרק חלקית',
  'READY': 'מוכן',
  'NOT_LOADED': 'לא הועמס',
  'LOADED': 'הועמס',
  'NOT_INSTALLED': 'לא הותקן',
  'INSTALLED': 'הותקן',
  'ISSUE': 'בעיה',
};

const ISSUE_LABELS: Record<string, string> = {
  'GLASS_BROKEN': 'זכוכית שבורה',
  'MOTOR_FAULT': 'מנוע תקול',
  'SHUTTER_DAMAGED': 'תריס פגום',
  'RAILS_MISSING': 'מסילות חסרות',
  'ANGLES_MISSING': 'חוסר זוויות',
  'BOX_SILL_MISSING': 'סרגל ארגז חסר',
};

const LOAD_ISSUE_CODES: Record<string, string> = {
  'LACK_SHUTTER': 'חסר תריס',
  'LACK_WINGS': 'חסר כנפיים',
  'BROKEN_GLASS': 'זכוכית שבורה',
  'ANGLES': 'זוויות',
  'SHUTTER_RAILS': 'מסילות תריס',
};

const PublicScan = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(true);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showActionChoice, setShowActionChoice] = useState(false);
  const [showInstallForm, setShowInstallForm] = useState(false);
  const [showLoadIssueForm, setShowLoadIssueForm] = useState(false);
  const [scanMode, setScanMode] = useState<'load' | 'install'>('load');
  const [installStatus, setInstallStatus] = useState<'INSTALLED' | 'PARTIAL' | 'ISSUE'>('INSTALLED');
  const [issueCode, setIssueCode] = useState<string>('');
  const [issueNote, setIssueNote] = useState('');
  const [actorEmail, setActorEmail] = useState('');
  
  const [selectedLoadIssues, setSelectedLoadIssues] = useState<string[]>([]);
  const [loadIssueFreeText, setLoadIssueFreeText] = useState('');

  // Apartment scan state
  const isAptScan = slug?.startsWith('apt-');
  const [aptPreview, setAptPreview] = useState<AptPreviewResult | null>(null);
  const [aptResult, setAptResult] = useState<AptConfirmResult | null>(null);
  const [selectedAptItems, setSelectedAptItems] = useState<number[]>([]);
  const [aptInstallStatus, setAptInstallStatus] = useState<'INSTALLED' | 'PARTIAL' | 'ISSUE'>('INSTALLED');
  const [aptIssueCode, setAptIssueCode] = useState('');
  const [aptIssueNote, setAptIssueNote] = useState('');

  useEffect(() => {
    const token = searchParams.get('t');
    if (!slug || !token) {
      setResult({
        success: false,
        error: 'missing_params',
        message: 'פרמטרים חסרים בקישור',
      });
      setShowPasswordPrompt(false);
      return;
    }
  }, [slug, searchParams]);

  // --- Apartment scan handlers ---
  const handleAptPasswordSubmit = async () => {
    const token = searchParams.get('t');
    if (!slug || !token) return;
    if (!password.trim()) { setPasswordError("אנא הזן סיסמה"); return; }

    setPasswordError("");
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('scan-confirm-apt', {
        body: { slug, token, password, selectedItemIds: [] },
      });

      if (error) {
        setResult({ success: false, error: 'api_error', message: error.message || 'שגיאה' });
        setShowPasswordPrompt(false);
      } else if (data?.mode === 'preview') {
        setAptPreview(data as AptPreviewResult);
        // Select all uninstalled items by default
        const uninstalled = (data.items || [])
          .filter((i: AptItem) => i.installStatus !== 'INSTALLED')
          .map((i: AptItem) => i.id);
        setSelectedAptItems(uninstalled);
        setShowPasswordPrompt(false);
      } else {
        setResult({ success: false, error: 'unexpected', message: 'תגובה לא צפויה' });
        setShowPasswordPrompt(false);
      }
    } catch (e) {
      setResult({ success: false, error: 'network_error', message: 'שגיאת רשת' });
      setShowPasswordPrompt(false);
    } finally {
      setLoading(false);
    }
  };

  const handleAptConfirm = async () => {
    const token = searchParams.get('t');
    if (!slug || !token || selectedAptItems.length === 0) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('scan-confirm-apt', {
        body: {
          slug,
          token,
          password,
          selectedItemIds: selectedAptItems,
          installStatus: aptInstallStatus,
          issueCode: aptInstallStatus === 'ISSUE' ? aptIssueCode : undefined,
          issueNote: aptIssueNote || undefined,
        },
      });

      if (error) {
        setResult({ success: false, error: 'api_error', message: error.message || 'שגיאה' });
      } else {
        setAptResult(data as AptConfirmResult);
      }
    } catch (e) {
      setResult({ success: false, error: 'network_error', message: 'שגיאת רשת' });
    } finally {
      setLoading(false);
    }
  };

  const toggleAptItem = (itemId: number) => {
    setSelectedAptItems(prev =>
      prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]
    );
  };

  const selectAllAptItems = () => {
    if (!aptPreview) return;
    setSelectedAptItems(aptPreview.items.map(i => i.id));
  };

  const deselectAllAptItems = () => {
    setSelectedAptItems([]);
  };

  // --- Regular scan handlers ---
  const handleConfirmScan = async () => {
    const token = searchParams.get('t');
    if (!slug || !token) return;

    if (!password.trim()) {
      setPasswordError("אנא הזן סיסמה");
      return;
    }

    setPasswordError("");
    setLoading(true);
    setShowPasswordPrompt(false);
    setShowActionChoice(true);
    setLoading(false);
  };

  const handleLoadingAction = async () => {
    setScanMode('load');
    setShowActionChoice(false);
    setShowLoadIssueForm(true);
  };

  const handleLoadSubmit = async (withIssues: boolean) => {
    const token = searchParams.get('t');
    if (!slug || !token) return;

    const loadIssues = withIssues && (selectedLoadIssues.length > 0 || loadIssueFreeText.trim())
      ? {
          issue_codes: selectedLoadIssues,
          free_text: loadIssueFreeText.trim() || undefined,
        }
      : undefined;

    await processScan(slug, token, password, 'load', undefined, loadIssues);
  };

  const handleInstallFormOpen = () => {
    setShowActionChoice(false);
    setShowInstallForm(true);
    setScanMode('install');
  };

  const handleInstallSubmit = async () => {
    const token = searchParams.get('t');
    if (!slug || !token) return;

    await processScan(slug, token, password, 'install', {
      installStatus,
      issueCode: installStatus === 'ISSUE' ? issueCode : undefined,
      issueNote: issueNote || undefined,
      actorEmail: actorEmail || undefined,
    });
  };

  const processScan = async (
    slug: string,
    token: string,
    scanPassword: string,
    source: 'load' | 'install',
    extraData?: {
      installStatus?: string;
      issueCode?: string;
      issueNote?: string;
      actorEmail?: string;
    },
    loadIssues?: {
      issue_codes: string[];
      free_text?: string;
    }
  ) => {
    try {
      setLoading(true);

      const { data, error } = await supabase.functions.invoke('scan-confirm', {
        body: {
          slug,
          token,
          password: scanPassword,
          source,
          ...extraData,
          loadIssues,
        },
      });

      if (error) {
        const isInvalidToken = error.message?.includes('invalid') || error.message?.includes('תקפ');
        setResult({
          success: false,
          error: isInvalidToken ? 'invalid_token' : 'api_error',
          message: isInvalidToken 
            ? 'קוד QR לא תקף או פג תוקף. יש ליצור תוויות חדשות.' 
            : error.message || 'שגיאה בסריקה',
        });
        setShowActionChoice(false);
        setShowInstallForm(false);
        setShowLoadIssueForm(false);
      } else {
        setResult(data);
        setShowActionChoice(false);
        setShowInstallForm(false);
        setShowLoadIssueForm(false);
      }
    } catch (error) {
      setResult({
        success: false,
        error: 'network_error',
        message: 'שגיאת רשת - נסה שוב',
      });
      setShowActionChoice(false);
      setShowInstallForm(false);
      setShowLoadIssueForm(false);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('he-IL', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  const toggleLoadIssue = (code: string) => {
    setSelectedLoadIssues(prev => 
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  // =================== APT SCAN: Item selection screen ===================
  if (aptPreview && !aptResult && !result) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted p-4" dir="rtl">
        <Card className="w-full max-w-lg mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Home className="h-5 w-5" />
              דירה {aptPreview.apartment.number}
              {aptPreview.apartment.floor && (
                <span className="text-sm text-muted-foreground font-normal">
                  (קומה {aptPreview.apartment.floor})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                בחר פריטים לאישור התקנה ({selectedAptItems.length}/{aptPreview.items.length})
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAllAptItems}>בחר הכל</Button>
                <Button variant="ghost" size="sm" onClick={deselectAllAptItems}>נקה</Button>
              </div>
            </div>

            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {aptPreview.items.map((item) => {
                const isInstalled = item.installStatus === 'INSTALLED';
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      isInstalled ? 'bg-green-50 border-green-200 opacity-60' : 'bg-card border-border'
                    }`}
                  >
                    <Checkbox
                      checked={selectedAptItems.includes(item.id)}
                      onCheckedChange={() => toggleAptItem(item.id)}
                      disabled={isInstalled}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm">{item.code}</span>
                        {item.type && (
                          <span className="text-xs text-muted-foreground">{item.type}</span>
                        )}
                      </div>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        {item.location && <span>{item.location}</span>}
                        {item.width && item.height && <span>{item.width}×{item.height}</span>}
                      </div>
                    </div>
                    {isInstalled && (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Install status selection */}
            <div className="space-y-3 pt-2 border-t">
              <Label>סטטוס התקנה</Label>
              <RadioGroup value={aptInstallStatus} onValueChange={(v) => setAptInstallStatus(v as any)}>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="INSTALLED" id="apt-installed" />
                  <Label htmlFor="apt-installed" className="cursor-pointer">הותקן</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="PARTIAL" id="apt-partial" />
                  <Label htmlFor="apt-partial" className="cursor-pointer">חלקית</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="ISSUE" id="apt-issue" />
                  <Label htmlFor="apt-issue" className="cursor-pointer">בעיה</Label>
                </div>
              </RadioGroup>
            </div>

            {aptInstallStatus === 'ISSUE' && (
              <div className="space-y-2">
                <Label>סוג הבעיה</Label>
                <Select value={aptIssueCode} onValueChange={setAptIssueCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר סוג בעיה" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ISSUE_LABELS).map(([code, label]) => (
                      <SelectItem key={code} value={code}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>הערות (אופציונלי)</Label>
              <Textarea
                placeholder="הוסף הערות..."
                value={aptIssueNote}
                onChange={(e) => setAptIssueNote(e.target.value)}
                dir="rtl"
              />
            </div>

            <Button
              onClick={handleAptConfirm}
              className="w-full"
              disabled={loading || selectedAptItems.length === 0}
              size="lg"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  מעבד...
                </>
              ) : (
                `אשר התקנה (${selectedAptItems.length} פריטים)`
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // =================== APT SCAN: Confirmation result ===================
  if (aptResult) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className={`flex items-center gap-3 ${aptResult.is_duplicate ? 'text-blue-600' : 'text-green-600'}`}>
              {aptResult.is_duplicate ? <Clock className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
              {aptResult.is_duplicate ? 'כבר אושר בעבר' : 'אושר בהצלחה!'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">פריטים שאושרו</span>
                <span className="font-semibold">{aptResult.confirmed}</span>
              </div>
              {aptResult.duplicates > 0 && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">כבר אושרו קודם</span>
                  <span className="text-sm">{aptResult.duplicates}</span>
                </div>
              )}
            </div>

            <Alert className={aptResult.is_duplicate ? "bg-blue-50 border-blue-200" : "bg-green-50 border-green-200"}>
              <AlertDescription className={aptResult.is_duplicate ? "text-blue-800" : "text-green-800"}>
                {aptResult.message}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  // =================== REGULAR SCAN: Action choice ===================
  if (showActionChoice && !result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">בחר פעולה</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              onClick={handleLoadingAction} 
              className="w-full h-20 text-lg"
              disabled={loading}
              variant="default"
            >
              <Package className="h-6 w-6 ml-2" />
              העמסה
            </Button>
            <Button 
              onClick={handleInstallFormOpen} 
              className="w-full h-20 text-lg"
              disabled={loading}
              variant="secondary"
            >
              <Wrench className="h-6 w-6 ml-2" />
              התקנה
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // =================== REGULAR SCAN: Load issue form ===================
  if (showLoadIssueForm && !result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center flex items-center justify-center gap-2">
              <Package className="h-5 w-5" />
              העמסה
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                דיווח תקלה בהעמסה (אופציונלי)
              </Label>
              <div className="space-y-2 bg-muted/50 p-3 rounded-lg">
                {Object.entries(LOAD_ISSUE_CODES).map(([code, label]) => (
                  <div key={code} className="flex items-center space-x-2 space-x-reverse">
                    <Checkbox
                      id={`load-issue-${code}`}
                      checked={selectedLoadIssues.includes(code)}
                      onCheckedChange={() => toggleLoadIssue(code)}
                    />
                    <Label htmlFor={`load-issue-${code}`} className="cursor-pointer font-normal">
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="load-free-text">הערה חופשית</Label>
              <Textarea
                id="load-free-text"
                placeholder="תאר בקצרה..."
                value={loadIssueFreeText}
                onChange={(e) => setLoadIssueFreeText(e.target.value)}
                className="text-right"
                dir="rtl"
                maxLength={1000}
              />
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={() => {
                  setShowLoadIssueForm(false);
                  setShowActionChoice(true);
                  setSelectedLoadIssues([]);
                  setLoadIssueFreeText('');
                }}
                variant="outline"
                className="flex-1"
                disabled={loading}
              >
                ביטול
              </Button>
              <Button 
                onClick={() => handleLoadSubmit(selectedLoadIssues.length > 0 || loadIssueFreeText.trim().length > 0)}
                className="flex-1"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    סורק...
                  </>
                ) : selectedLoadIssues.length > 0 || loadIssueFreeText.trim() ? (
                  'שמור עם דיווח'
                ) : (
                  'אישור העמסה'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // =================== REGULAR SCAN: Installation form ===================
  if (showInstallForm && !result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">התקנה</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>סטטוס התקנה</Label>
              <RadioGroup value={installStatus} onValueChange={(v) => setInstallStatus(v as any)}>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="INSTALLED" id="installed" />
                  <Label htmlFor="installed" className="cursor-pointer">הותקן</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="PARTIAL" id="partial" />
                  <Label htmlFor="partial" className="cursor-pointer">חלקית</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="ISSUE" id="issue" />
                  <Label htmlFor="issue" className="cursor-pointer">בעיה</Label>
                </div>
              </RadioGroup>
            </div>

            {installStatus === 'ISSUE' && (
              <div className="space-y-2">
                <Label htmlFor="issue-code">סוג הבעיה</Label>
                <Select value={issueCode} onValueChange={setIssueCode}>
                  <SelectTrigger id="issue-code">
                    <SelectValue placeholder="בחר סוג בעיה" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ISSUE_LABELS).map(([code, label]) => (
                      <SelectItem key={code} value={code}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="issue-note">הערות (אופציונלי)</Label>
              <Textarea
                id="issue-note"
                placeholder="הוסף הערות..."
                value={issueNote}
                onChange={(e) => setIssueNote(e.target.value)}
                className="text-right"
                dir="rtl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="actor-email">דוא״ל (אופציונלי)</Label>
              <Input
                id="actor-email"
                type="email"
                placeholder="your@email.com"
                value={actorEmail}
                onChange={(e) => setActorEmail(e.target.value)}
                className="text-right"
                dir="rtl"
              />
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={() => {
                  setShowInstallForm(false);
                  setShowActionChoice(true);
                }}
                variant="outline"
                className="flex-1"
                disabled={loading}
              >
                ביטול
              </Button>
              <Button 
                onClick={handleInstallSubmit}
                className="flex-1"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    שומר...
                  </>
                ) : (
                  'שמור'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // =================== Password prompt ===================
  if (showPasswordPrompt && !result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">
              {isAptScan ? 'אישור התקנה - דירה' : 'אישור סריקה'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scan-password">הזן סיסמה לאישור הסריקה</Label>
              <Input
                id="scan-password"
                type="password"
                placeholder="הזן סיסמה"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    isAptScan ? handleAptPasswordSubmit() : handleConfirmScan();
                  }
                }}
                disabled={loading}
                className="text-right"
                dir="rtl"
              />
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>
            <Button 
              onClick={isAptScan ? handleAptPasswordSubmit : handleConfirmScan} 
              className="w-full" 
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  מאשר...
                </>
              ) : (
                'אשר סריקה'
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted" dir="rtl">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-lg font-semibold">מעבד סריקה...</p>
            <p className="text-sm text-muted-foreground mt-2">אנא המתן</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted" dir="rtl">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <p className="text-lg font-semibold">שגיאה בסריקה</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!result.success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4" dir="rtl">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-destructive">
              <XCircle className="h-6 w-6" />
              סריקה נכשלה
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert variant="destructive">
              <AlertDescription>
                {result.message || 'אירעה שגיאה בעיבוד הסריקה'}
              </AlertDescription>
            </Alert>

            {result.error === 'invalid_token' && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  התווית שסרקת אינה תקפה. קוד ה-QR כנראה מתוויות ישנות.
                </p>
                <p className="text-sm font-semibold text-amber-600">
                  📌 פתרון: צור תוויות חדשות בעמוד "תוויות" והדפס אותן מחדש.
                </p>
              </div>
            )}

            {result.error === 'revoked' && (
              <p className="text-sm text-muted-foreground">
                תווית זו בוטלה ואינה תקפה יותר.
              </p>
            )}

            {result.error === 'expired' && (
              <p className="text-sm text-muted-foreground">
                תוקף התווית פג. אנא צור תווית חדשה.
              </p>
            )}

            <Button asChild className="w-full">
              <Link to="/login">
                <ExternalLink className="h-4 w-4 ml-2" />
                פתח באפליקציה
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success case (regular scan)
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4" dir="rtl">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className={`flex items-center gap-3 ${result.is_duplicate ? 'text-blue-600' : 'text-green-600'}`}>
            {result.is_duplicate ? <Clock className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
            {result.is_duplicate ? 'נסרק בעבר' : 'נסרק בהצלחה!'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">פרט</span>
              <span className="font-semibold">{result.item?.code}</span>
            </div>

            {result.subpart && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">חלק</span>
                <span className="font-semibold">
                  {SUBPART_NAMES[result.subpart.code] || result.subpart.code}
                </span>
              </div>
            )}

            {result.first_scanned_at && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  <Clock className="h-3 w-3 inline ml-1" />
                  {result.is_duplicate ? 'נסרק לראשונה' : 'זמן סריקה'}
                </span>
                <span className="text-sm">{formatDate(result.first_scanned_at)}</span>
              </div>
            )}
          </div>

          {result.progress && (
            <div className="space-y-2">
              <div className="relative pt-1">
                <div className="flex mb-2 items-center justify-between">
                  <span className="text-sm font-semibold text-primary">
                    {result.source === 'load' ? 'התקדמות העמסה' : 'התקדמות התקנה'}
                  </span>
                  <span className="text-sm font-semibold text-primary">
                    {result.progress.scanned} מתוך {result.progress.required}
                  </span>
                </div>
                <div className="overflow-hidden h-2 text-xs flex rounded bg-muted">
                  <div
                    style={{
                      width: `${result.progress.required > 0 ? (result.progress.scanned / result.progress.required) * 100 : 0}%`,
                    }}
                    className={`shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center ${
                      result.source === 'load' ? 'bg-green-500' : 'bg-blue-500'
                    } transition-all duration-500`}
                  />
                </div>
              </div>
            </div>
          )}

          {result.issues?.saved && (
            <Alert className="bg-amber-50 border-amber-200">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                דיווח התקלה נשמר בהצלחה
                {result.issues.issue_codes.length > 0 && (
                  <span className="block text-xs mt-1">
                    {result.issues.issue_codes.map(c => LOAD_ISSUE_CODES[c] || c).join(', ')}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {result.is_duplicate ? (
            <Alert className="bg-blue-50 border-blue-200">
              <Clock className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                נסרק בעבר ({result.source === 'load' ? 'העמסה' : 'התקנה'}) ב-{result.first_scanned_at && formatDate(result.first_scanned_at)}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                נסרק בהצלחה! {result.ready && '✅ הושלם'}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button asChild className="flex-1">
              <Link to={`/projects/${slug?.split('-')[0]}`}>
                <ExternalLink className="h-4 w-4 ml-2" />
                פתח באפליקציה
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PublicScan;
