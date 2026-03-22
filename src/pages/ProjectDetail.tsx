import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Building, Building2, Home, Package, Tag, Truck, Wrench, Clock, Download, Loader2, AlertTriangle, List, ScanLine, Ruler, PlayCircle, FileSpreadsheet, FileText, Scissors } from "lucide-react";
import { ProductionFilePdfViewer } from "@/components/project/ProductionFilePdfViewer";
import { MeasurementFileViewer } from "@/components/project/MeasurementFileViewer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, BarChart3 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RtlTable } from "@/components/RtlTable";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { LoadIssueViewer, LOAD_ISSUE_CODES } from "@/components/LoadIssueViewer";
import { InstallIssueViewer, INSTALL_ISSUE_CODES } from "@/components/InstallIssueViewer";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExcelViewer } from "@/components/ExcelViewer";
import { MeasurementDataViewer } from "@/components/MeasurementDataViewer";
import { ProjectStatusActions } from "@/components/project/ProjectStatusActions";
import { OptimizationPdfUpload } from "@/components/optimization/OptimizationPdfUpload";
import { ManufacturingTab } from "@/components/project/ManufacturingTab";
import { useBuildingFatherProject } from "@/hooks/useFatherProjectData";

// Helper component to fetch and display install issue
const InstallIssueViewerWithFetch = ({ 
  itemId, 
  itemCode, 
  showClearButton, 
  onClear 
}: { 
  itemId: number; 
  itemCode: string; 
  showClearButton?: boolean; 
  onClear?: () => void;
}) => {
  const [issue, setIssue] = useState<{ issue_code: string | null; issue_note: string | null } | null>(null);
  
  useEffect(() => {
    const fetchIssue = async () => {
      const { data } = await supabase
        .from('scan_events')
        .select('issue_code, issue_note')
        .eq('item_id', itemId)
        .eq('mode', 'install')
        .eq('installed_status', 'ISSUE')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (data) setIssue(data);
    };
    fetchIssue();
  }, [itemId]);

  if (!issue) {
    return <Badge variant="destructive" className="text-xs">בעיה</Badge>;
  }

  return (
    <InstallIssueViewer
      installIssue={issue}
      itemId={itemId}
      itemCode={itemCode}
      showClearButton={showClearButton}
      onClear={onClear}
    />
  );
};

const ProjectDetail = () => {
  const navigate = useNavigate();
  const {
    id
  } = useParams();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [floors, setFloors] = useState<any[]>([]);
  const [apartments, setApartments] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [currentItemsPage, setCurrentItemsPage] = useState(1);
  const itemsPerPage = 50;
  const [expandedApartments, setExpandedApartments] = useState<Set<number>>(new Set());
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [loadingStatusFilter, setLoadingStatusFilter] = useState<string>('all');
  const [installStatusFilter, setInstallStatusFilter] = useState<string>('all');
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [loadIssuesMap, setLoadIssuesMap] = useState<Map<number, any>>(new Map());
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [packedSectionsCount, setPackedSectionsCount] = useState(0);
  const [totalSectionsCount, setTotalSectionsCount] = useState(0);
  const [downloadingMeasurementExcel, setDownloadingMeasurementExcel] = useState(false);
  
  const projectIdNum = id ? parseInt(id) : undefined;
  const { data: fatherInfo } = useBuildingFatherProject(projectIdNum);
  
  // Fetch batch projects (running projects exported from this measurement project)
  const { data: batchProjects } = useQuery({
    queryKey: ["project-batches", projectIdNum],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, production_batch_label, created_at, status")
        .eq("source_measurement_project_id", projectIdNum!)
        .in("status", ["active", "purchasing"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!projectIdNum,
  });
  // Debounce ref for realtime updates
  const refetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchRef = useRef<number>(0);
  const DEBOUNCE_MS = 800; // Wait 800ms before refetching after realtime events
  useEffect(() => {
    const checkUser = async () => {
      const {
        data: {
          session
        }
      } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
      } else {
        if (id) {
          await fetchProjectData(parseInt(id));
          setupRealtimeSubscriptions(parseInt(id));
        }
        setLoading(false);
      }
    };
    checkUser();
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/login");
      }
    });
    return () => {
      subscription.unsubscribe();
      // Clean up realtime subscriptions
      if (id) {
        supabase.removeChannel(supabase.channel(`project:${id}`));
      }
      // Clean up debounce timeout
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
      }
    };
  }, [navigate, id]);
  const [downloadingLoadReport, setDownloadingLoadReport] = useState(false);
  const [downloadingInstallReport, setDownloadingInstallReport] = useState(false);
  const downloadFullActivityLog = async () => {
    if (!id) return;
    setDownloadingReport(true);
    try {
      const {
        data: allEvents,
        error
      } = await supabase.from('scan_events').select('*').eq('project_id', parseInt(id)).order('created_at', {
        ascending: false
      });
      if (error) throw error;
      if (!allEvents || allEvents.length === 0) {
        toast.error('אין פעילות לדיווח');
        return;
      }
      const eventsWithItems = await Promise.all(allEvents.map(async (event: any) => {
        const {
          data: item
        } = await supabase.from('items').select('item_code').eq('id', event.item_id).single();
        return {
          ...event,
          item_code: item?.item_code || ''
        };
      }));
      const issueCodeMap: Record<string, string> = {
        'GLASS_BROKEN': 'זכוכית שבורה',
        'MOTOR_FAULT': 'תקלה במנוע',
        'SHUTTER_DAMAGED': 'תריס פגום',
        'RAILS_MISSING': 'מסילות חסרות',
        'ANGLES_MISSING': 'זוויות חסרות',
        'BOX_SILL_MISSING': 'ארגז/אדן חסר'
      };
      const BOM = '\uFEFF';
      const headers = ['תאריך', 'שעה', 'מצב', 'קוד פריט', 'חלק', 'סטטוס', 'בעיה', 'הערות', 'מבצע'];
      let csv = BOM + headers.join(',') + '\n';
      eventsWithItems.forEach((event: any) => {
        const date = new Date(event.created_at);
        const modeText = event.mode === 'loading' ? 'העמסה' : 'התקנה';
        const statusText = event.mode === 'loading' ? event.loading_mark ? 'הועמס' : '' : event.installed_status === 'INSTALLED' ? 'הותקן' : event.installed_status === 'PARTIAL' ? 'חלקי' : event.installed_status === 'ISSUE' ? 'בעיה' : '';
        const issueText = event.issue_code ? issueCodeMap[event.issue_code] || event.issue_code : '-';
        const issueNote = event.issue_note || '-';
        const row = [`"${date.toLocaleDateString('he-IL')}"`, `"${date.toLocaleTimeString('he-IL')}"`, `"${modeText}"`, `"${event.item_code}"`, `"${event.subpart_code}"`, `"${statusText}"`, `"${issueText}"`, `"${issueNote.replace(/"/g, '""')}"`, `"${event.actor_email || '-'}"`];
        csv += row.join(',') + '\n';
      });
      const blob = new Blob([csv], {
        type: 'text/csv;charset=utf-8;'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `רישום_פעילות_מלא_${project?.name || 'פרויקט'}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('רישום הפעילות הורד בהצלחה');
    } catch (error) {
      console.error('Error downloading activity log:', error);
      toast.error('שגיאה בהורדת רישום הפעילות');
    } finally {
      setDownloadingReport(false);
    }
  };
  const downloadLoadReport = async (filter: 'all' | 'issues' | 'loaded' | 'not_loaded' = 'all') => {
    if (!id) return;
    setDownloadingLoadReport(true);
    try {
      const {
        data: allItems,
        error: itemsError
      } = await supabase.from('items').select(`
          id,
          item_code,
          item_type,
          location,
          opening_no,
          loading_status_cached,
          required_codes,
          floors(floor_code),
          apartments(apt_number)
        `).eq('project_id', parseInt(id)).order('id');
      if (itemsError) throw itemsError;
      if (!allItems || allItems.length === 0) {
        toast.error('לא נמצאו פריטים לדיווח');
        return;
      }
      const {
        data: loadScans,
        error: loadError
      } = await supabase.from('scans').select('item_id, subpart_code, scanned_at').in('item_id', allItems.map(i => i.id)).eq('source', 'load').order('scanned_at', {
        ascending: false
      });
      if (loadError) throw loadError;
      
      // Fetch load issues
      const {
        data: loadIssues,
        error: issuesError
      } = await supabase.from('load_issues').select('item_id, issue_codes, free_text, created_at').in('item_id', allItems.map(i => i.id)).order('created_at', { ascending: false });
      if (issuesError) throw issuesError;
      
      const loadScanMap = new Map<number, any[]>();
      (loadScans || []).forEach((s: any) => {
        if (!loadScanMap.has(s.item_id)) loadScanMap.set(s.item_id, []);
        loadScanMap.get(s.item_id)!.push(s);
      });
      
      // Build load issues map (latest per item)
      const loadIssueMap = new Map<number, any>();
      (loadIssues || []).forEach((issue: any) => {
        if (!loadIssueMap.has(issue.item_id)) {
          loadIssueMap.set(issue.item_id, issue);
        }
      });
      
      const MULTI_LABEL_TYPES = ['דלת', 'דלת מונובלוק'];
      const BOM = '\uFEFF';
      const headers = ['מס\' פרט', 'קומה', 'דירה', 'מיקום', 'חלקים נדרשים', 'חלקים נסרקו', 'סטטוס העמסה', 'תאריך העמסה אחרון', 'קוד בעיה', 'הערות בעיה'];
      let csv = BOM + headers.join(',') + '\n';
      let filteredCount = 0;
      
      allItems.forEach((item: any) => {
        const loadScansForItem = loadScanMap.get(item.id) || [];
        const loadIssue = loadIssueMap.get(item.id);
        const hasIssue = !!loadIssue;
        const isLoaded = item.loading_status_cached === 'LOADED';
        
        // Apply filters
        if (filter === 'issues' && !hasIssue) return;
        if (filter === 'loaded' && (!isLoaded || hasIssue)) return;
        if (filter === 'not_loaded' && isLoaded) return;
        if (filter === 'all' && loadScansForItem.length === 0 && !hasIssue) return;
        
        filteredCount++;
        const floor = item.floors?.floor_code || '-';
        const apt = item.apartments?.apt_number || '-';
        const location = item.location || item.opening_no || '-';
        
        // Single-label items have required = 1
        const isSingleLabel = !MULTI_LABEL_TYPES.includes(item.item_type || '');
        const requiredCodes = item.required_codes || [];
        const requiredCount = isSingleLabel ? 1 : requiredCodes.length;
        const scannedCodes = new Set(loadScansForItem.map((s: any) => s.subpart_code));
        const loadScannedCount = isSingleLabel 
          ? (loadScansForItem.length > 0 ? 1 : 0)
          : requiredCodes.filter((c: string) => scannedCodes.has(c)).length;
        
        const loadStatus = isLoaded 
          ? (hasIssue ? 'הועמס — בעיה' : 'הועמס') 
          : 'לא הועמס';
        const lastLoadScan = loadScansForItem[0]?.scanned_at ? new Date(loadScansForItem[0].scanned_at).toLocaleString('he-IL') : '-';
        const issueCodes = loadIssue?.issue_codes?.map((c: string) => LOAD_ISSUE_CODES[c] || c).join('; ') || '-';
        const issueFreeText = loadIssue?.free_text || '-';
        const row = [`"${item.item_code}"`, `"${floor}"`, `"${apt}"`, `"${location}"`, `"${isSingleLabel ? '1' : requiredCodes.join(', ')}"`, `"${loadScannedCount}/${requiredCount}"`, `"${loadStatus}"`, `"${lastLoadScan}"`, `"${issueCodes}"`, `"${issueFreeText.replace(/"/g, '""')}"`];
        csv += row.join(',') + '\n';
      });
      
      if (filteredCount === 0) {
        toast.error('לא נמצאו פריטים מתאימים לסינון שנבחר');
        return;
      }
      
      const blob = new Blob([csv], {
        type: 'text/csv;charset=utf-8;'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filterLabel = filter === 'issues' ? '_בעיות' : filter === 'loaded' ? '_הועמס' : filter === 'not_loaded' ? '_לא_הועמס' : '';
      link.download = `דוח_העמסה${filterLabel}_${project?.name || 'פרויקט'}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('דוח העמסה הורד בהצלחה');
    } catch (error) {
      console.error('Error downloading load report:', error);
      toast.error('שגיאה בהורדת דוח העמסה');
    } finally {
      setDownloadingLoadReport(false);
    }
  };
  const downloadInstallReport = async (filter: 'all' | 'issues' | 'installed' | 'not_installed' = 'all') => {
    if (!id) return;
    setDownloadingInstallReport(true);
    try {
      const {
        data: allItems,
        error: itemsError
      } = await supabase.from('items').select(`
          id,
          item_code,
          location,
          opening_no,
          install_status_cached,
          floors(floor_code),
          apartments(apt_number)
        `).eq('project_id', parseInt(id)).order('id');
      if (itemsError) throw itemsError;
      if (!allItems || allItems.length === 0) {
        toast.error('לא נמצאו פריטים לדיווח');
        return;
      }
      const {
        data: installScans,
        error: installError
      } = await supabase.from('scans').select('item_id, subpart_code, scanned_at').in('item_id', allItems.map(i => i.id)).eq('source', 'install').order('scanned_at', {
        ascending: false
      });
      const {
        data: issueEvents,
        error: issueError
      } = await supabase.from('scan_events').select('item_id, issue_code, issue_note').eq('project_id', parseInt(id)).eq('mode', 'install').eq('installed_status', 'ISSUE');
      if (installError) throw installError;
      if (issueError) throw issueError;
      const installScanMap = new Map<number, any>();
      (installScans || []).forEach((s: any) => {
        if (!installScanMap.has(s.item_id)) {
          installScanMap.set(s.item_id, s);
        }
      });
      const issueMap = new Map<number, any>();
      (issueEvents || []).forEach((e: any) => {
        issueMap.set(e.item_id, e);
      });
      const issueCodeMap: Record<string, string> = {
        'GLASS_BROKEN': 'זכוכית שבורה',
        'MOTOR_FAULT': 'תקלה במנוע',
        'SHUTTER_DAMAGED': 'תריס פגום',
        'RAILS_MISSING': 'מסילות חסרות',
        'ANGLES_MISSING': 'זוויות חסרות',
        'BOX_SILL_MISSING': 'ארגז/אדן חסר'
      };
      const BOM = '\uFEFF';
      const headers = ['מס\' פרט', 'קומה', 'דירה', 'מיקום', 'סטטוס התקנה', 'תאריך התקנה', 'בעיה', 'הערות בעיה'];
      let csv = BOM + headers.join(',') + '\n';
      let filteredCount = 0;
      allItems.forEach((item: any) => {
        const installScan = installScanMap.get(item.id);
        if (!installScan) return;
        
        // Apply filters
        if (filter === 'issues' && item.install_status_cached !== 'ISSUE') return;
        if (filter === 'installed' && item.install_status_cached !== 'INSTALLED') return;
        if (filter === 'not_installed' && item.install_status_cached === 'INSTALLED') return;
        
        filteredCount++;
        const floor = item.floors?.floor_code || '-';
        const apt = item.apartments?.apt_number || '-';
        const location = item.location || item.opening_no || '-';
        const installStatus = item.install_status_cached === 'INSTALLED' ? 'הותקן' : item.install_status_cached === 'ISSUE' ? 'בעיה' : 'לא הותקן';
        const installDate = installScan?.scanned_at ? new Date(installScan.scanned_at).toLocaleString('he-IL') : '-';
        const issue = issueMap.get(item.id);
        const issueText = issue ? issueCodeMap[issue.issue_code] || issue.issue_code : '-';
        const issueNote = issue?.issue_note || '-';
        const row = [`"${item.item_code}"`, `"${floor}"`, `"${apt}"`, `"${location}"`, `"${installStatus}"`, `"${installDate}"`, `"${issueText}"`, `"${issueNote.replace(/"/g, '""')}"`];
        csv += row.join(',') + '\n';
      });
      
      if (filteredCount === 0) {
        toast.error('לא נמצאו פריטים מתאימים לסינון שנבחר');
        return;
      }
      
      const blob = new Blob([csv], {
        type: 'text/csv;charset=utf-8;'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const filterLabel = filter === 'issues' ? '_בעיות' : filter === 'installed' ? '_הותקן' : filter === 'not_installed' ? '_לא_הותקן' : '';
      link.download = `דוח_התקנה${filterLabel}_${project?.name || 'פרויקט'}_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('דוח התקנה הורד בהצלחה');
    } catch (error) {
      console.error('Error downloading install report:', error);
      toast.error('שגיאה בהורדת דוח התקנה');
    } finally {
      setDownloadingInstallReport(false);
    }
  };
  const fetchProjectData = async (projectId: number) => {
    try {
      // Fetch project details
      const {
        data: projectData
      } = await supabase.from('projects').select('*').eq('id', projectId).single();
      setProject(projectData);

      // Fetch floors with totals
      const {
        data: floorsData
      } = await supabase.from('v_floor_totals').select('*').eq('project_id', projectId).order('floor_code');
      setFloors(floorsData || []);

      // Fetch apartments with totals
      const {
        data: apartmentsData
      } = await supabase.from('v_apartment_totals').select('*').eq('project_id', projectId).order('floor_id, apt_number');
      setApartments(apartmentsData || []);

      // Fetch items with ALL statuses and required_codes
      const {
        data: rawItemsData
      } = await supabase.from('items').select('id, item_code, item_type, location, project_id, floor_id, apt_id, status_cached, loading_status_cached, install_status_cached, required_codes, purchasing_status').eq('project_id', projectId).order('id');

      const itemIds = rawItemsData?.map((i: any) => i.id) || [];
      const MULTI_LABEL_TYPES = ['דלת', 'דלת מונובלוק'];

      // OPTIMIZATION: Batch fetch all scan counts in 2 queries instead of N*2 queries
      // This reduces ~1000 queries to just 2 for a 500-item project
      let loadCountMap = new Map<number, number>();
      let installCountMap = new Map<number, number>();
      
      if (itemIds.length > 0) {
        // Fetch all load scans grouped by item_id
        const { data: loadScans } = await supabase
          .from('scans')
          .select('item_id')
          .in('item_id', itemIds)
          .eq('source', 'load');
        
        // Fetch all install scans grouped by item_id
        const { data: installScans } = await supabase
          .from('scans')
          .select('item_id')
          .in('item_id', itemIds)
          .eq('source', 'install');
        
        // Build count maps
        (loadScans || []).forEach((scan: any) => {
          loadCountMap.set(scan.item_id, (loadCountMap.get(scan.item_id) || 0) + 1);
        });
        (installScans || []).forEach((scan: any) => {
          installCountMap.set(scan.item_id, (installCountMap.get(scan.item_id) || 0) + 1);
        });
      }

      // Map items with counts from our batch queries
      const itemsWithCounts = (rawItemsData || []).map((item: any) => {
        const isSingleLabel = !MULTI_LABEL_TYPES.includes(item.item_type || '');
        const loadingRequiredCount = isSingleLabel ? 1 : (item.required_codes || []).length;
        const loadingCount = loadCountMap.get(item.id) || 0;
        const installCount = installCountMap.get(item.id) || 0;
        
        return {
          ...item,
          loading_scanned_parts: Math.min(loadingCount, loadingRequiredCount),
          install_scanned_parts: installCount,
          required_count: loadingRequiredCount
        };
      });
      setItems(itemsWithCounts);

      // Fetch load issues for all items (already batched)
      if (itemIds.length > 0) {
        const { data: loadIssues } = await supabase
          .from('load_issues')
          .select('id, item_id, issue_codes, free_text, created_at')
          .in('item_id', itemIds)
          .order('created_at', { ascending: false });
        
        // Build map (latest issue per item)
        const issueMap = new Map<number, any>();
        (loadIssues || []).forEach((issue: any) => {
          if (!issueMap.has(issue.item_id)) {
            issueMap.set(issue.item_id, issue);
          }
        });
        setLoadIssuesMap(issueMap);
      }

      // OPTIMIZATION: Fetch recent scan events with item codes in a single query using join
      try {
        const { data: eventsData } = await supabase
          .from('scan_events')
          .select('*, items!inner(item_code)')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .limit(20);
        
        if (eventsData) {
          const eventsWithItems = eventsData.map((event: any) => ({
            ...event,
            item_code: event.items?.item_code || ''
          }));
          setRecentEvents(eventsWithItems);
        }
      } catch (e) {
        console.log('Could not fetch scan events:', e);
        setRecentEvents([]);
      }

      // Fetch packed sections count from cutlist
      try {
        // Find cutlist uploads linked to this project (by project name)
        const projectName = projectData?.name;
        if (projectName) {
          const { data: uploads } = await supabase
            .from('cutlist_uploads')
            .select('id')
            .eq('project_name', projectName);
          
          if (uploads && uploads.length > 0) {
            const uploadIds = uploads.map((u: any) => u.id);
            const { count: totalCount } = await supabase
              .from('cutlist_sections')
              .select('id', { count: 'exact', head: true })
              .in('upload_id', uploadIds);
            
            const { count: packedCount } = await supabase
              .from('cutlist_sections')
              .select('id', { count: 'exact', head: true })
              .in('upload_id', uploadIds)
              .eq('status', 'packed');
            
            setTotalSectionsCount(totalCount || 0);
            setPackedSectionsCount(packedCount || 0);
          }
        }
      } catch (e) {
        console.log('Could not fetch packed sections:', e);
      }
    } catch (error) {
      console.error('Error fetching project data:', error);
      toast.error('שגיאה בטעינת נתוני הפרויקט');
    }
  };

  // Debounced refetch to prevent flooding during rapid scans
  const debouncedRefetch = useCallback((projectId: number, showToast?: { type: 'success' | 'info'; message: string }) => {
    // Show toast immediately (user feedback)
    if (showToast) {
      if (showToast.type === 'success') {
        toast.success(showToast.message);
      } else {
        toast.info(showToast.message);
      }
    }
    
    // Clear any pending refetch
    if (refetchTimeoutRef.current) {
      clearTimeout(refetchTimeoutRef.current);
    }
    
    // Schedule debounced refetch
    refetchTimeoutRef.current = setTimeout(() => {
      const now = Date.now();
      // Additional check: don't refetch if we just fetched recently
      if (now - lastFetchRef.current >= DEBOUNCE_MS) {
        lastFetchRef.current = now;
        fetchProjectData(projectId);
      }
    }, DEBOUNCE_MS);
  }, []);

  const setupRealtimeSubscriptions = (projectId: number) => {
    // Subscribe to postgres changes on items and scans tables
    const itemsChannel = supabase.channel('schema-db-changes').on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'items',
      filter: `project_id=eq.${projectId}`
    }, payload => {
      console.log('Item change detected:', payload);
      debouncedRefetch(projectId, { type: 'info', message: 'עדכון פריט במערכת' });
    }).on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'scans'
    }, payload => {
      console.log('New scan detected:', payload);
      debouncedRefetch(projectId, { type: 'success', message: 'סריקה חדשה נוספה' });
    }).subscribe();

    // Subscribe to broadcast messages from edge functions
    const broadcastChannel = supabase.channel(`project:${projectId}`).on('broadcast', {
      event: 'scan.created'
    }, payload => {
      console.log('Scan created broadcast:', payload);
      const mode = payload.payload.mode;
      const modeText = mode === 'loading' ? 'העמסה' : mode === 'install' ? 'התקנה' : 'סריקה';
      debouncedRefetch(projectId, { type: 'success', message: `${modeText}: פריט ${payload.payload.item_id}` });
    }).on('broadcast', {
      event: 'item.status_changed'
    }, payload => {
      console.log('Item status changed:', payload);
      const { item_code, new_status } = payload.payload;
      const statusText = new_status === 'READY' ? 'מוכן' : new_status === 'PARTIAL' ? 'חלקי' : 'לא נסרק';
      debouncedRefetch(projectId, { type: 'info', message: `סטטוס פריט ${item_code} עודכן: ${statusText}` });
    }).on('broadcast', {
      event: 'item.loading_status_changed'
    }, payload => {
      console.log('Loading status changed:', payload);
      const { item_code, loading_status } = payload.payload;
      const statusMap: any = { 'NOT_LOADED': 'לא הועמס', 'LOADED': 'הועמס' };
      debouncedRefetch(projectId, { type: 'info', message: `העמסה - ${item_code}: ${statusMap[loading_status] || loading_status}` });
    }).on('broadcast', {
      event: 'load.progress'
    }, payload => {
      console.log('Load progress:', payload);
      // No toast for progress - just debounced refetch
      debouncedRefetch(projectId);
    }).on('broadcast', {
      event: 'load.ready'
    }, payload => {
      console.log('Load ready:', payload);
      const { item_code } = payload.payload;
      debouncedRefetch(projectId, { type: 'success', message: `פריט ${item_code} הועמס במלואו` });
    }).on('broadcast', {
      event: 'item.install_status_changed'
    }, payload => {
      console.log('Install status changed:', payload);
      const { item_code, install_status } = payload.payload;
      const statusMap: any = { 'NOT_INSTALLED': 'לא הותקן', 'PARTIAL': 'חלקי', 'INSTALLED': 'הותקן', 'ISSUE': 'בעיה' };
      debouncedRefetch(projectId, { type: 'info', message: `התקנה - ${item_code}: ${statusMap[install_status] || install_status}` });
    }).subscribe();
  };

  const handleFinalizeMeasurement = async () => {
    if (!id) return;
    setFinalizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('measurement-finalize', {
        body: { project_id: parseInt(id) }
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      toast.success(`הפרויקט הופעל בהצלחה! נוצרו ${data.floorsCreated} קומות, ${data.apartmentsCreated} דירות, ${data.itemsCreated} פריטים`);
      setShowFinalizeDialog(false);
      // Refresh project data
      await fetchProjectData(parseInt(id));
    } catch (error: any) {
      console.error('Finalize error:', error);
      toast.error(`שגיאה בהפעלת הפרויקט: ${error.message}`);
    } finally {
      setFinalizing(false);
    }
  };

  const isMeasurementMode = project?.status === 'measurement';

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
      </div>;
  }

  // Pre-contract and blind jambs share same planning UI
  if (project?.status === 'pre_contract' || project?.status === 'blind_jambs') {
    const statusLabel = project.status === 'pre_contract' ? 'טרום חוזה' : 'משקופים';
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted" dir="rtl">
        <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-3">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div className="flex items-center gap-4">
                <Link to="/projects">
                  <Button variant="ghost" size="sm">
                    <ArrowRight className="h-4 w-4 ml-2" />
                    חזרה לפרויקטים
                  </Button>
                </Link>
                <h1 className="text-2xl font-bold text-primary">פרטי פרויקט</h1>
              </div>
              <div className="flex items-center gap-2">
                <Link to={`/projects/${id}/measurement`}>
                  <Button variant="outline" size="sm">
                    <Ruler className="h-4 w-4 ml-2" />
                    צפייה/עריכת נתונים
                  </Button>
                </Link>
                <Link to={`/projects/${id}/items-summary`}>
                  <Button variant="outline" size="sm">
                    <List className="h-4 w-4 ml-2" />
                    סיכום פריטים
                  </Button>
                </Link>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={downloadingMeasurementExcel}
                  onClick={async () => {
                    if (!project || !id) return;
                    setDownloadingMeasurementExcel(true);
                    try {
                      const { data: rows, error } = await supabase
                        .from('measurement_rows')
                        .select('*')
                        .eq('project_id', parseInt(id))
                        .order('floor_label', { ascending: true })
                        .order('apartment_label', { ascending: true })
                        .order('opening_no', { ascending: true });
                      if (error) throw error;
                      if (!rows || rows.length === 0) {
                        toast.error('אין נתוני מדידה לייצוא');
                        return;
                      }
                      const { exportMeasurementToExcel } = await import('@/lib/measurementExcelExport');
                       await exportMeasurementToExcel({
                        rows,
                        project: {
                          name: project.name,
                          building_code: project.building_code,
                          measurement_rule: project.measurement_rule,
                        },
                        projectStatus: project.status,
                      });
                      toast.success('הקובץ הורד בהצלחה');
                    } catch (err) {
                      console.error('Export error:', err);
                      toast.error('שגיאה בייצוא דפי מדידה');
                    } finally {
                      setDownloadingMeasurementExcel(false);
                    }
                  }}
                >
                  {downloadingMeasurementExcel ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Download className="h-4 w-4 ml-2" />}
                  דפי מדידה
                </Button>
              </div>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8">
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-3xl flex items-center gap-3">
                {project?.name || `פרויקט #${id}`}
                <Badge variant={project.status === 'pre_contract' ? 'default' : 'secondary'} className="text-sm">{statusLabel}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {fatherInfo && (
                <Link to={`/father-projects/${fatherInfo.id}`} className="inline-flex items-center gap-1.5 mb-2">
                  <Badge variant="outline" className="gap-1 text-xs cursor-pointer hover:bg-muted">
                    <Building2 className="h-3 w-3" />
                    {fatherInfo.name} — בניין {fatherInfo.building_number}
                  </Badge>
                </Link>
              )}
              <p className="text-muted-foreground">
                {project?.building_code && `קוד בניין: ${project.building_code} | `}
                {floors.length} קומות | {apartments.length} דירות | {items.length} פריטים
              </p>
            </CardContent>
          </Card>

          {/* Batches Section */}
          {batchProjects && batchProjects.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Truck className="h-5 w-5" />
                  אצוות ייצור ({batchProjects.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {batchProjects.map((batch) => (
                  <Link
                    key={batch.id}
                    to={`/projects/${batch.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <span className="font-medium text-sm">
                      {batch.production_batch_label || batch.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(batch.created_at).toLocaleDateString("he-IL")}
                    </span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          <ProjectStatusActions 
            project={project} 
            onStatusChange={() => id && fetchProjectData(parseInt(id))} 
          />

          <Tabs defaultValue="dashboard" className="w-full mt-6">
            <TabsList className="flex flex-wrap w-full h-auto p-1 gap-1">
              <TabsTrigger value="dashboard" className="flex-1 min-w-[calc(50%-0.25rem)] md:min-w-0 text-xs md:text-sm py-2">
                <BarChart3 className="h-4 w-4 ml-1" />
                סיכום
              </TabsTrigger>
              <TabsTrigger value="floors" className="flex-1 min-w-[calc(50%-0.25rem)] md:min-w-0 text-xs md:text-sm py-2">
                <Building className="h-4 w-4 ml-1" />
                קומות
              </TabsTrigger>
              <TabsTrigger value="apartments" className="flex-1 min-w-[calc(50%-0.25rem)] md:min-w-0 text-xs md:text-sm py-2">
                <Home className="h-4 w-4 ml-1" />
                דירות
              </TabsTrigger>
              <TabsTrigger value="items" className="flex-1 min-w-[calc(50%-0.25rem)] md:min-w-0 text-xs md:text-sm py-2">
                <Package className="h-4 w-4 ml-1" />
                פריטים
              </TabsTrigger>
            </TabsList>

            {/* Dashboard/Summary Tab */}
            <TabsContent value="dashboard" className="space-y-6 mt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">קומות</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Building className="h-5 w-5 text-primary" />
                      <span className="text-2xl font-bold">{floors.length}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">דירות</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Home className="h-5 w-5 text-primary" />
                      <span className="text-2xl font-bold">{apartments.length}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">פריטים</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-primary" />
                      <span className="text-2xl font-bold">{items.length}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">תאריך יצירה</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm font-medium">{new Date(project?.created_at).toLocaleDateString('he-IL')}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>מידע על הפרויקט</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-sm text-muted-foreground">שם הפרויקט</p>
                      <p className="font-medium">{project?.name}</p>
                    </div>
                    {project?.building_code && (
                      <div>
                        <p className="text-sm text-muted-foreground">קוד בניין</p>
                        <p className="font-medium">{project.building_code}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-sm text-muted-foreground">סטטוס</p>
                      <p className="font-medium">{statusLabel}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">תאריך יצירה</p>
                      <p className="font-medium">{new Date(project?.created_at).toLocaleDateString('he-IL')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Floors Tab */}
            <TabsContent value="floors" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>קומות בפרויקט</CardTitle>
                </CardHeader>
                <CardContent>
                  {floors.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין קומות בפרויקט</p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {floors.map((floor: any) => {
                        const floorApartments = apartments.filter((apt: any) => apt.floor_id === floor.floor_id);
                        const floorItems = items.filter((item: any) => item.floor_id === floor.floor_id);
                        return (
                          <Card key={floor.floor_id} className="border">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-lg flex items-center gap-2">
                                <Building className="h-4 w-4" />
                                קומה {floor.floor_code}
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="flex gap-4 text-sm text-muted-foreground">
                                <span>{floorApartments.length} דירות</span>
                                <span>{floorItems.length} פריטים</span>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Apartments Tab */}
            <TabsContent value="apartments" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>דירות בפרויקט</CardTitle>
                </CardHeader>
                <CardContent>
                  {apartments.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין דירות בפרויקט</p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {apartments.map((apt: any) => {
                        const floor = floors.find((f: any) => f.floor_id === apt.floor_id);
                        const aptItems = items.filter((item: any) => item.apt_id === apt.apartment_id);
                        return (
                          <Card key={apt.apartment_id} className="border">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-lg flex items-center gap-2">
                                <Home className="h-4 w-4" />
                                דירה {apt.apt_number}
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="flex gap-4 text-sm text-muted-foreground">
                                <span>קומה {floor?.floor_code || '-'}</span>
                                <span>{aptItems.length} פריטים</span>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Items Tab */}
            <TabsContent value="items" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>פריטים בפרויקט</CardTitle>
                </CardHeader>
                <CardContent>
                  {items.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">אין פריטים בפרויקט</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <RtlTable
                        columns={[
                          { key: 'item_code', width: 100 },
                          { key: 'item_type', width: 100 },
                          { key: 'floor', width: 80 },
                          { key: 'apartment', width: 80 },
                          { key: 'location', width: 120 },
                          { key: 'dimensions', width: 100 },
                        ]}
                      >
                        <thead>
                          <tr className="border-b">
                            <th className="p-2 text-right font-medium">קוד פריט</th>
                            <th className="p-2 text-right font-medium">סוג</th>
                            <th className="p-2 text-right font-medium">קומה</th>
                            <th className="p-2 text-right font-medium">דירה</th>
                            <th className="p-2 text-right font-medium">מיקום</th>
                            <th className="p-2 text-right font-medium">מידות</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.slice((currentItemsPage - 1) * itemsPerPage, currentItemsPage * itemsPerPage).map((item: any) => (
                            <tr key={item.id} className="border-b hover:bg-muted/50">
                              <td className="p-2">{item.item_code}</td>
                              <td className="p-2">{item.item_type || '-'}</td>
                              <td className="p-2">{item.floors?.floor_code || '-'}</td>
                              <td className="p-2">{item.apartments?.apt_number || '-'}</td>
                              <td className="p-2">{item.location || item.opening_no || '-'}</td>
                              <td className="p-2">
                                {item.width && item.height ? `${item.width}×${item.height}` : item.width || item.height || '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </RtlTable>
                      
                      {items.length > itemsPerPage && (
                        <div className="mt-4">
                          <Pagination>
                            <PaginationContent>
                              <PaginationItem>
                                <PaginationPrevious 
                                  onClick={() => setCurrentItemsPage(p => Math.max(1, p - 1))}
                                  className={currentItemsPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                />
                              </PaginationItem>
                              <PaginationItem>
                                <span className="px-4 text-sm">
                                  עמוד {currentItemsPage} מתוך {Math.ceil(items.length / itemsPerPage)}
                                </span>
                              </PaginationItem>
                              <PaginationItem>
                                <PaginationNext 
                                  onClick={() => setCurrentItemsPage(p => Math.min(Math.ceil(items.length / itemsPerPage), p + 1))}
                                  className={currentItemsPage >= Math.ceil(items.length / itemsPerPage) ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                />
                              </PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    );
  }

  // Measurement mode UI
  if (isMeasurementMode) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted" dir="rtl">
        <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link to="/projects">
                  <Button variant="ghost" size="sm">
                    <ArrowRight className="h-4 w-4 ml-2" />
                    חזרה לפרויקטים
                  </Button>
                </Link>
                <h1 className="text-2xl font-bold text-primary">פרטי פרויקט</h1>
              </div>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8">
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-3xl flex items-center gap-3">
                {project?.name || `פרויקט #${id}`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                פרויקט זה נמצא במצב מדידות. ניתן לערוך את נתוני המדידה ולשלוח קומות לייצור.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link to={`/projects/${id}/measurement`}>
                  <Button size="lg" className="w-full sm:w-auto">
                    <Ruler className="h-5 w-5 ml-2" />
                    מצב מדידה
                  </Button>
                </Link>
                <Link to={`/projects/${id}/items-summary`}>
                  <Button variant="outline" size="lg" className="w-full sm:w-auto">
                    <List className="h-5 w-5 ml-2" />
                    סיכום פריטים
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          <ProjectStatusActions 
            project={project} 
            onStatusChange={() => id && fetchProjectData(parseInt(id))} 
          />

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>מידע על הפרויקט</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">שם הפרויקט</p>
                  <p className="font-medium">{project?.name}</p>
                </div>
                {project?.building_code && (
                  <div>
                    <p className="text-sm text-muted-foreground">קוד בניין</p>
                    <p className="font-medium">{project.building_code}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-muted-foreground">תאריך יצירה</p>
                  <p className="font-medium">{new Date(project?.created_at).toLocaleDateString('he-IL')}</p>
                </div>
                {project?.measurement_rule && (
                  <div>
                    <p className="text-sm text-muted-foreground">כלל מדידה</p>
                    <p className="font-medium">
                      {project.measurement_rule === 'baranovitz' ? 'ברנוביץ' : 'קונבנציונלי'}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Purchasing project dashboard
  if (project?.status === 'purchasing') {
    const purchasingStatusLabels: Record<string, string> = {
      'not_ordered': 'לא הוזמן',
      'ordered': 'הוזמן',
      'arrived': 'הגיע',
      'installed': 'הותקן',
    };
    const purchasingStatusVariants: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
      'not_ordered': 'outline',
      'ordered': 'secondary',
      'arrived': 'default',
      'installed': 'default',
    };

    const orderedItems = items.filter(i => (i as any).purchasing_status === 'ordered').length;
    const arrivedItems = items.filter(i => (i as any).purchasing_status === 'arrived').length;
    const installedItems = items.filter(i => (i as any).purchasing_status === 'installed').length;
    const notOrderedItems = items.filter(i => !(i as any).purchasing_status || (i as any).purchasing_status === 'not_ordered').length;

    const handlePurchasingStatusChange = async (itemId: number, newStatus: string) => {
      try {
        const { error } = await supabase
          .from('items')
          .update({ purchasing_status: newStatus })
          .eq('id', itemId);
        if (error) throw error;
        // Refresh data
        if (id) await fetchProjectData(parseInt(id));
        toast.success('סטטוס עודכן');
      } catch (error: any) {
        toast.error(`שגיאה בעדכון: ${error.message}`);
      }
    };

    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted" dir="rtl">
        <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
          <div className="container mx-auto px-4 py-3">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div className="flex items-center gap-4">
                <Link to="/projects">
                  <Button variant="ghost" size="sm">
                    <ArrowRight className="h-4 w-4 ml-2" />
                    חזרה לפרויקטים
                  </Button>
                </Link>
                <h1 className="text-2xl font-bold text-primary">פרויקט רכש</h1>
              </div>
              <div className="flex items-center gap-2">
                <Link to={`/projects/${id}/measurement`}>
                  <Button variant="outline" size="sm">
                    <Ruler className="h-4 w-4 ml-2" />
                    צפייה/עריכת נתונים
                  </Button>
                </Link>
                <Link to={`/projects/${id}/items-summary`}>
                  <Button variant="outline" size="sm">
                    <List className="h-4 w-4 ml-2" />
                    סיכום פריטים
                  </Button>
                </Link>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={downloadingMeasurementExcel}
                  onClick={async () => {
                    if (!project || !id) return;
                    setDownloadingMeasurementExcel(true);
                    try {
                      const { data: rows, error } = await supabase
                        .from('measurement_rows')
                        .select('*')
                        .eq('project_id', parseInt(id))
                        .order('floor_label', { ascending: true })
                        .order('apartment_label', { ascending: true })
                        .order('opening_no', { ascending: true });
                      if (error) throw error;
                      if (!rows || rows.length === 0) {
                        toast.error('אין נתוני מדידה לייצוא');
                        return;
                      }
                      const { exportMeasurementToExcel } = await import('@/lib/measurementExcelExport');
                      await exportMeasurementToExcel({
                        rows,
                        project: {
                          name: project.name,
                          building_code: project.building_code,
                          measurement_rule: project.measurement_rule,
                        },
                      });
                      toast.success('הקובץ הורד בהצלחה');
                    } catch (err) {
                      console.error('Export error:', err);
                      toast.error('שגיאה בייצוא דפי מדידה');
                    } finally {
                      setDownloadingMeasurementExcel(false);
                    }
                  }}
                >
                  {downloadingMeasurementExcel ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Download className="h-4 w-4 ml-2" />}
                  דפי מדידה
                </Button>
              </div>
            </div>
          </div>
        </nav>

        <main className="container mx-auto px-4 py-8">
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-3xl flex items-center gap-3">
                {project?.name || `פרויקט #${id}`}
                <Badge className="text-sm bg-orange-100 text-orange-800 border-orange-300">רכש</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {fatherInfo && (
                <Link to={`/father-projects/${fatherInfo.id}`} className="inline-flex items-center gap-1.5 mb-2">
                  <Badge variant="outline" className="gap-1 text-xs cursor-pointer hover:bg-muted">
                    <Building2 className="h-3 w-3" />
                    {fatherInfo.name} — בניין {fatherInfo.building_number}
                  </Badge>
                </Link>
              )}
              <p className="text-muted-foreground">
                {project?.building_code && `קוד בניין: ${project.building_code} | `}
                {floors.length} קומות | {apartments.length} דירות | {items.length} פריטים
              </p>
            </CardContent>
          </Card>

          <ProjectStatusActions 
            project={project} 
            onStatusChange={() => id && fetchProjectData(parseInt(id))} 
          />

          <Tabs defaultValue="dashboard" className="w-full mt-6">
            <TabsList className="flex flex-wrap w-full h-auto p-1 gap-1">
              <TabsTrigger value="dashboard" className="flex-1 min-w-[calc(50%-0.25rem)] md:min-w-0 text-xs md:text-sm py-2">
                <BarChart3 className="h-4 w-4 ml-1" />
                סיכום
              </TabsTrigger>
              <TabsTrigger value="floors" className="flex-1 min-w-[calc(50%-0.25rem)] md:min-w-0 text-xs md:text-sm py-2">
                <Building className="h-4 w-4 ml-1" />
                קומות
              </TabsTrigger>
              <TabsTrigger value="apartments" className="flex-1 min-w-[calc(50%-0.25rem)] md:min-w-0 text-xs md:text-sm py-2">
                <Home className="h-4 w-4 ml-1" />
                דירות
              </TabsTrigger>
              <TabsTrigger value="items" className="flex-1 min-w-[calc(50%-0.25rem)] md:min-w-0 text-xs md:text-sm py-2">
                <Package className="h-4 w-4 ml-1" />
                פריטים
              </TabsTrigger>
            </TabsList>

            {/* Dashboard/Summary Tab */}
            <TabsContent value="dashboard" className="space-y-6 mt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">לא הוזמן</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Clock className="h-5 w-5 text-muted-foreground" />
                      <span className="text-2xl font-bold">{notOrderedItems}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">הוזמן</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-amber-500" />
                      <span className="text-2xl font-bold">{orderedItems}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">הגיע</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5 text-blue-500" />
                      <span className="text-2xl font-bold">{arrivedItems}</span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">הותקן</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Wrench className="h-5 w-5 text-green-500" />
                      <span className="text-2xl font-bold">{installedItems}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Progress bar */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">התקדמות רכש</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Progress value={items.length > 0 ? Math.round((installedItems / items.length) * 100) : 0} className="flex-1" />
                    <span className="text-lg font-bold min-w-[3rem] text-left">
                      {items.length > 0 ? Math.round((installedItems / items.length) * 100) : 0}%
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {installedItems} מתוך {items.length} פריטים הותקנו
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Floors Tab */}
            <TabsContent value="floors" className="mt-6">
              {floors.length === 0 ? (
                <div className="text-center py-12 bg-card rounded-lg border">
                  <Building className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">אין קומות</h3>
                </div>
              ) : (
                <div className="grid gap-4">
                  {floors.map(floor => (
                    <Card key={floor.floor_id}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <h3 className="text-lg font-semibold">קומה {floor.floor_code}</h3>
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="outline">{floor.total_items || 0} פריטים</Badge>
                            <Badge variant="secondary">{floor.total_apartments || 0} דירות</Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Apartments Tab */}
            <TabsContent value="apartments" className="mt-6">
              {apartments.length === 0 ? (
                <div className="text-center py-12 bg-card rounded-lg border">
                  <Home className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">אין דירות</h3>
                </div>
              ) : (
                <div className="space-y-4">
                  {apartments.map(apt => {
                    const isExpanded = expandedApartments.has(apt.apartment_id);
                    const aptItems = items.filter(item => item.apt_id === apt.apartment_id);
                    return (
                      <Card key={apt.apartment_id}>
                        <CardContent className="p-0">
                          <Collapsible open={isExpanded} onOpenChange={open => {
                            const newExpanded = new Set(expandedApartments);
                            if (open) newExpanded.add(apt.apartment_id);
                            else newExpanded.delete(apt.apartment_id);
                            setExpandedApartments(newExpanded);
                          }}>
                            <CollapsibleTrigger className="w-full">
                              <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                                <div className="flex items-center gap-2">
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  <span className="font-semibold text-lg">דירה {apt.apt_number}</span>
                                </div>
                                <Badge variant="outline">{apt.total_items || 0} פריטים</Badge>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="border-t bg-muted/30">
                                {aptItems.length === 0 ? (
                                  <div className="p-8 text-center">
                                    <p className="text-sm text-muted-foreground">אין פריטים בדירה זו</p>
                                  </div>
                                ) : (
                                  <RtlTable columns={[
                                    { key: "item_code", width: "30%", align: "right" },
                                    { key: "location", width: "25%", align: "right" },
                                    { key: "purchasing_status", width: "25%", align: "center" },
                                    { key: "actions", width: "20%", align: "center" },
                                  ]} className="bg-muted/30">
                                    <thead>
                                      <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:whitespace-nowrap [&>th]:font-medium text-muted-foreground border-b">
                                        <th className="text-right">קוד פריט</th>
                                        <th className="text-right">מיקום</th>
                                        <th className="text-center">סטטוס רכש</th>
                                        <th className="text-center">עדכון</th>
                                      </tr>
                                    </thead>
                                    <tbody className="[&>tr>td]:px-4 [&>tr>td]:py-3 [&>tr>td]:align-middle">
                                      {aptItems.map(item => {
                                        const pStatus = (item as any).purchasing_status || 'not_ordered';
                                        return (
                                          <tr key={item.id} className="border-b hover:bg-muted/50 transition-colors">
                                            <td className="text-right font-medium">{item.item_code}</td>
                                            <td className="text-right text-muted-foreground text-sm">{item.location || '-'}</td>
                                            <td className="text-center">
                                              <Badge variant={purchasingStatusVariants[pStatus] || 'outline'} className="text-xs">
                                                {purchasingStatusLabels[pStatus] || pStatus}
                                              </Badge>
                                            </td>
                                            <td className="text-center">
                                              <Select value={pStatus} onValueChange={(v) => handlePurchasingStatusChange(item.id, v)}>
                                                <SelectTrigger className="h-8 text-xs w-24">
                                                  <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                  <SelectItem value="not_ordered">לא הוזמן</SelectItem>
                                                  <SelectItem value="ordered">הוזמן</SelectItem>
                                                  <SelectItem value="arrived">הגיע</SelectItem>
                                                  <SelectItem value="installed">הותקן</SelectItem>
                                                </SelectContent>
                                              </Select>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </RtlTable>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Items Tab */}
            <TabsContent value="items" className="mt-6">
              {items.length === 0 ? (
                <div className="text-center py-12 bg-card rounded-lg border">
                  <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">אין פריטים</h3>
                </div>
              ) : (
                <Card>
                  <CardContent className="pt-6">
                    <RtlTable columns={[
                      { key: "item_code", width: "20%", align: "right" },
                      { key: "floor", width: "15%", align: "right" },
                      { key: "apt", width: "15%", align: "right" },
                      { key: "location", width: "15%", align: "right" },
                      { key: "purchasing_status", width: "15%", align: "center" },
                      { key: "actions", width: "20%", align: "center" },
                    ]} className="bg-card rounded-lg">
                      <thead className="sticky top-0 bg-card z-10">
                        <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:whitespace-nowrap [&>th]:font-medium text-muted-foreground border-b">
                          <th className="text-right">קוד פריט</th>
                          <th className="text-right">קומה</th>
                          <th className="text-right">דירה</th>
                          <th className="text-right">מיקום</th>
                          <th className="text-center">סטטוס רכש</th>
                          <th className="text-center">עדכון</th>
                        </tr>
                      </thead>
                      <tbody className="[&>tr>td]:px-4 [&>tr>td]:py-3 [&>tr>td]:align-middle">
                        {items.slice((currentItemsPage - 1) * itemsPerPage, currentItemsPage * itemsPerPage).map(item => {
                          const pStatus = (item as any).purchasing_status || 'not_ordered';
                          const floor = floors.find(f => f.floor_id === item.floor_id);
                          const apt = apartments.find(a => a.apartment_id === item.apt_id);
                          return (
                            <tr key={item.id} className="border-b hover:bg-muted/50 transition-colors">
                              <td className="text-right font-medium whitespace-nowrap">{item.item_code}</td>
                              <td className="text-right text-muted-foreground text-sm">{floor?.floor_code || '-'}</td>
                              <td className="text-right text-muted-foreground text-sm">{apt?.apt_number || '-'}</td>
                              <td className="text-right text-muted-foreground text-sm">{item.location || '-'}</td>
                              <td className="text-center">
                                <Badge variant={purchasingStatusVariants[pStatus] || 'outline'} className="text-xs">
                                  {purchasingStatusLabels[pStatus] || pStatus}
                                </Badge>
                              </td>
                              <td className="text-center">
                                <Select value={pStatus} onValueChange={(v) => handlePurchasingStatusChange(item.id, v)}>
                                  <SelectTrigger className="h-8 text-xs w-24">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="not_ordered">לא הוזמן</SelectItem>
                                    <SelectItem value="ordered">הוזמן</SelectItem>
                                    <SelectItem value="arrived">הגיע</SelectItem>
                                    <SelectItem value="installed">הותקן</SelectItem>
                                  </SelectContent>
                                </Select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </RtlTable>
                    {items.length > itemsPerPage && (
                      <div className="mt-4 space-y-2">
                        <p className="text-center text-muted-foreground text-sm">
                          מציג {(currentItemsPage - 1) * itemsPerPage + 1}-{Math.min(currentItemsPage * itemsPerPage, items.length)} מתוך {items.length} פריטים
                        </p>
                        <Pagination dir="ltr">
                          <PaginationContent>
                            <PaginationItem>
                              <PaginationPrevious onClick={() => setCurrentItemsPage(p => Math.max(1, p - 1))} />
                            </PaginationItem>
                            {Array.from({ length: Math.ceil(items.length / itemsPerPage) }, (_, i) => i + 1)
                              .filter(p => p === 1 || p === Math.ceil(items.length / itemsPerPage) || Math.abs(p - currentItemsPage) <= 1)
                              .map(p => (
                                <PaginationItem key={p}>
                                  <PaginationLink isActive={p === currentItemsPage} onClick={() => setCurrentItemsPage(p)}>
                                    {p}
                                  </PaginationLink>
                                </PaginationItem>
                              ))}
                            <PaginationItem>
                              <PaginationNext onClick={() => setCurrentItemsPage(p => Math.min(Math.ceil(items.length / itemsPerPage), p + 1))} />
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </main>
      </div>
    );
  }

  return <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 sm:gap-4">
                <Link to="/projects">
                  <Button variant="ghost" size="sm" className="px-2 sm:px-3">
                    <ArrowRight className="h-4 w-4 sm:ml-2" />
                    <span className="hidden sm:inline">חזרה לפרויקטים</span>
                  </Button>
                </Link>
                <h1 className="text-lg sm:text-2xl font-bold text-primary truncate">פרטי פרויקט</h1>
              </div>
              <Link to={`/projects/${id}/scan?source=load`} className="sm:hidden">
                <Button variant="default" size="sm">
                  <ScanLine className="h-4 w-4 ml-1" />
                  סריקה
                </Button>
              </Link>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <Link to={`/projects/${id}/scan?source=load`} className="hidden sm:block">
                <Button variant="default" size="sm">
                  <ScanLine className="h-4 w-4 ml-2" />
                  מצב סריקה
                </Button>
              </Link>
              <Link to={`/projects/${id}/items-summary`}>
                <Button variant="outline" size="sm" className="whitespace-nowrap">
                  <List className="h-4 w-4 ml-1 sm:ml-2" />
                  <span className="hidden sm:inline">סיכום פריטים</span>
                  <span className="sm:hidden">סיכום</span>
                </Button>
              </Link>
              <Link to={`/labels/${id}`}>
                <Button variant="outline" size="sm" className="whitespace-nowrap">
                  <Tag className="h-4 w-4 ml-1 sm:ml-2" />
                  תוויות
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-3xl flex items-center gap-3">
              {project?.name || `פרויקט #${id}`}
              {project?.source_measurement_project_id && project?.production_batch_label && (
                <Badge variant="secondary" className="text-sm">
                  {project.production_batch_label}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {project?.building_code && `קוד בניין: ${project.building_code} | `}
              {floors.length} קומות | {apartments.length} דירות | {items.length} פריטים
            </p>
            {project?.source_measurement_project_id && (
              <div className="mt-3">
                <Link to={`/projects/${project.source_measurement_project_id}`}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <ArrowRight className="h-4 w-4" />
                    פרויקט מדידות מקורי
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="flex flex-wrap w-full h-auto p-1 gap-1">
            <TabsTrigger value="dashboard" className="flex-1 min-w-[calc(50%-0.25rem)] md:min-w-0 text-xs md:text-sm py-2">
              <BarChart3 className="h-4 w-4 ml-1" />
              סיכום
            </TabsTrigger>
            <TabsTrigger value="floors" className="flex-1 min-w-[calc(50%-0.25rem)] md:min-w-0 text-xs md:text-sm py-2">
              <Building className="h-4 w-4 ml-1" />
              קומות
            </TabsTrigger>
            <TabsTrigger value="apartments" className="flex-1 min-w-[calc(50%-0.25rem)] md:min-w-0 text-xs md:text-sm py-2">
              <Home className="h-4 w-4 ml-1" />
              דירות
            </TabsTrigger>
            <TabsTrigger value="items" className="flex-1 min-w-[calc(50%-0.25rem)] md:min-w-0 text-xs md:text-sm py-2">
              <Package className="h-4 w-4 ml-1" />
              פריטים
            </TabsTrigger>
            <TabsTrigger value="excel-sheets" className="flex-1 min-w-[calc(50%-0.25rem)] md:min-w-0 text-xs md:text-sm py-2">
              <FileSpreadsheet className="h-4 w-4 ml-1" />
              דפי מדידה
            </TabsTrigger>
            <TabsTrigger value="production-file" className="flex-1 min-w-[calc(50%-0.25rem)] md:min-w-0 text-xs md:text-sm py-2">
              <FileText className="h-4 w-4 ml-1" />
              תיק יצור
            </TabsTrigger>
            <TabsTrigger value="optimization" className="flex-1 min-w-[calc(50%-0.25rem)] md:min-w-0 text-xs md:text-sm py-2">
              <Scissors className="h-4 w-4 ml-1" />
              אופטימיזציה
            </TabsTrigger>
            <TabsTrigger value="manufacturing" className="flex-1 min-w-[calc(50%-0.25rem)] md:min-w-0 text-xs md:text-sm py-2">
              <BarChart3 className="h-4 w-4 ml-1" />
              ייצור
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="mt-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">סה"כ פריטים</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-primary">{items.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">פריטים מוכנים</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-green-600">
                    {items.filter(i => i.status_cached === 'READY').length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    נארז — מוכן להעמסה
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-blue-600">
                    {packedSectionsCount}
                  </div>
                  {totalSectionsCount > 0 && (
                    <p className="text-sm text-muted-foreground mt-1">מתוך {totalSectionsCount} פריטי ייצור</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    הועמסו — OK
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-green-600">
                    {items.filter(i => i.loading_status_cached === 'LOADED' && !loadIssuesMap.has(i.id)).length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    הועמסו — בעיה
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-amber-600">
                    {items.filter(i => i.loading_status_cached === 'LOADED' && loadIssuesMap.has(i.id)).length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Wrench className="h-5 w-5" />
                    הותקן — OK
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-blue-600">
                    {items.filter(i => i.install_status_cached === 'INSTALLED').length}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    הותקן — בעיה
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-red-600">
                    {items.filter(i => i.install_status_cached === 'ISSUE').length}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5" />
                      התקדמות העמסה
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" disabled={downloadingLoadReport || items.length === 0} className="gap-2">
                          {downloadingLoadReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          הורד דוח
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => downloadLoadReport('all')}>
                          הכל
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => downloadLoadReport('issues')}>
                          בעיות בלבד
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => downloadLoadReport('loaded')}>
                          הועמס בהצלחה
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => downloadLoadReport('not_loaded')}>
                          לא הועמס
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {totalSectionsCount > 0 && (
                    <div>
                      <div className="flex justify-between mb-2 text-sm">
                        <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" /> נארז — מוכן להעמסה</span>
                        <span className="font-medium text-blue-600">
                          {packedSectionsCount} / {totalSectionsCount}
                        </span>
                      </div>
                      <Progress value={totalSectionsCount > 0 ? (packedSectionsCount / totalSectionsCount) * 100 : 0} className="h-2 [&>div]:bg-blue-500" />
                    </div>
                  )}
                  <div>
                    <div className="flex justify-between mb-2 text-sm">
                      <span>הועמסו — OK</span>
                      <span className="font-medium text-green-600">
                        {items.filter(i => i.loading_status_cached === 'LOADED' && !loadIssuesMap.has(i.id)).length} / {items.length}
                      </span>
                    </div>
                    <Progress value={items.length > 0 ? items.filter(i => i.loading_status_cached === 'LOADED' && !loadIssuesMap.has(i.id)).length / items.length * 100 : 0} className="h-2 [&>div]:bg-green-500" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-2 text-sm">
                      <span>הועמסו — בעיה</span>
                      <span className="font-medium text-amber-600">
                        {items.filter(i => i.loading_status_cached === 'LOADED' && loadIssuesMap.has(i.id)).length} / {items.length}
                      </span>
                    </div>
                    <Progress value={items.length > 0 ? items.filter(i => i.loading_status_cached === 'LOADED' && loadIssuesMap.has(i.id)).length / items.length * 100 : 0} className="h-2 [&>div]:bg-amber-500" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-2 text-sm">
                      <span>לא הועמסו</span>
                      <span className="font-medium text-gray-600">
                        {items.filter(i => i.loading_status_cached === 'NOT_LOADED').length} / {items.length}
                      </span>
                    </div>
                    <Progress value={items.length > 0 ? items.filter(i => i.loading_status_cached === 'NOT_LOADED').length / items.length * 100 : 0} className="h-2 [&>div]:bg-gray-400" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-5 w-5" />
                      התקדמות התקנה
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" disabled={downloadingInstallReport || items.length === 0} className="gap-2">
                          {downloadingInstallReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                          הורד דוח
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => downloadInstallReport('all')}>
                          הכל
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => downloadInstallReport('issues')}>
                          בעיות בלבד
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => downloadInstallReport('installed')}>
                          הותקן בהצלחה
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => downloadInstallReport('not_installed')}>
                          לא הותקן
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2 text-sm">
                      <span>הותקן — OK</span>
                      <span className="font-medium text-green-600">
                        {items.filter(i => i.install_status_cached === 'INSTALLED').length} / {items.length}
                      </span>
                    </div>
                    <Progress value={items.length > 0 ? items.filter(i => i.install_status_cached === 'INSTALLED').length / items.length * 100 : 0} className="h-2 [&>div]:bg-green-500" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-2 text-sm">
                      <span>הותקן — בעיה</span>
                      <span className="font-medium text-red-600">
                        {items.filter(i => i.install_status_cached === 'ISSUE').length} / {items.length}
                      </span>
                    </div>
                    <Progress value={items.length > 0 ? items.filter(i => i.install_status_cached === 'ISSUE').length / items.length * 100 : 0} className="h-2 [&>div]:bg-red-500" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-2 text-sm">
                      <span>חלקי</span>
                      <span className="font-medium text-amber-600">
                        {items.filter(i => i.install_status_cached === 'PARTIAL').length} / {items.length}
                      </span>
                    </div>
                    <Progress value={items.length > 0 ? items.filter(i => i.install_status_cached === 'PARTIAL').length / items.length * 100 : 0} className="h-2 [&>div]:bg-amber-500" />
                  </div>
                  <div>
                    <div className="flex justify-between mb-2 text-sm">
                      <span>לא הותקן</span>
                      <span className="font-medium text-gray-600">
                        {items.filter(i => i.install_status_cached === 'NOT_INSTALLED').length} / {items.length}
                      </span>
                    </div>
                    <Progress value={items.length > 0 ? items.filter(i => i.install_status_cached === 'NOT_INSTALLED').length / items.length * 100 : 0} className="h-2 [&>div]:bg-gray-400" />
                  </div>
                </CardContent>
              </Card>
            </div>

              <Card className="mb-6">
              <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  פעילות אחרונה
                </div>
                  <Button variant="outline" size="sm" onClick={downloadFullActivityLog} disabled={downloadingReport || recentEvents.length === 0} className="gap-2">
                    {downloadingReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    הורד רישום מלא
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentEvents.length === 0 ? <p className="text-center text-muted-foreground py-4">אין פעילות אחרונה</p> : <div className="space-y-2">
                    {recentEvents.slice(0, 4).map(event => {
                  const modeText = event.mode === 'loading' ? 'העמסה' : 'התקנה';
                  const statusText = event.mode === 'loading' ? event.loading_mark ? 'הועמס' : '' : event.installed_status === 'INSTALLED' ? 'הותקן' : event.installed_status === 'PARTIAL' ? 'חלקי' : event.installed_status === 'ISSUE' ? 'בעיה' : '';
                  return <div key={event.id} className="flex items-center justify-between p-2 border rounded-lg hover:bg-muted/50 transition-colors">
                          <div className="flex items-center gap-3">
                            {event.mode === 'loading' ? <Truck className="h-4 w-4 text-green-600" /> : <Wrench className="h-4 w-4 text-blue-600" />}
                            <div>
                              <p className="text-sm font-medium">
                                {modeText}: {event.item_code} ({event.subpart_code})
                              </p>
                              {statusText && <p className="text-xs text-muted-foreground">{statusText}</p>}
                              {event.issue_code && <Badge variant="destructive" className="text-xs mt-1">
                                  {event.issue_code}
                                </Badge>}
                            </div>
                          </div>
                          <div className="text-left">
                            <p className="text-xs text-muted-foreground">
                              {new Date(event.created_at).toLocaleString('he-IL')}
                            </p>
                            {event.actor_email && <p className="text-xs text-muted-foreground">{event.actor_email}</p>}
                          </div>
                        </div>;
                })}
                  </div>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>התקדמות לפי קומות</CardTitle>
              </CardHeader>
              <CardContent>
                <RtlTable columns={[{
                key: "floor",
                width: 140,
                align: "right"
              }, {
                key: "progress",
                width: 200,
                align: "center"
              }, {
                key: "ready",
                width: 110,
                align: "center"
              }, {
                key: "partial",
                width: 110,
                align: "center"
              }, {
                key: "none",
                width: 130,
                align: "center"
              }]} className="bg-white rounded-lg">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:whitespace-nowrap [&>th]:font-medium text-muted-foreground border-b">
                      <th className="text-right">קומה</th>
                      <th className="text-center">התקדמות</th>
                      <th className="text-center">מוכן</th>
                      <th className="text-center">חלקי</th>
                      <th className="text-center">לא נסרק</th>
                    </tr>
                  </thead>
                  <tbody className="[&>tr>td]:px-4 [&>tr>td]:py-3 [&>tr>td]:align-middle">
                    {floors.map(floor => <tr key={floor.floor_id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="text-right font-medium whitespace-nowrap">
                          {floor.floor_code === '0' ? 'קרקע' : `קומה ${floor.floor_code}`}
                        </td>
                        <td>
                          <div className="w-full flex items-center gap-2 justify-center">
                            <Progress value={floor.total_items > 0 ? (floor.ready_items || 0) / floor.total_items * 100 : 0} className="w-24 h-2" />
                            <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[3ch]">
                              {floor.total_items > 0 ? Math.round((floor.ready_items || 0) / floor.total_items * 100) : 0}%
                            </span>
                          </div>
                        </td>
                        <td className="text-center">
                          <Badge variant="default" className="text-xs">{floor.ready_items || 0}</Badge>
                        </td>
                        <td className="text-center">
                          <Badge variant="secondary" className="text-xs">{floor.partial_items || 0}</Badge>
                        </td>
                        <td className="text-center">
                          <Badge variant="outline" className="text-xs">{floor.not_scanned_items || 0}</Badge>
                        </td>
                      </tr>)}
                  </tbody>
                </RtlTable>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="floors" className="mt-6">
            {floors.length === 0 ? <div className="text-center py-12 bg-card rounded-lg border">
                <Building className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">אין עדיין קומות</h3>
                <p className="text-muted-foreground">ייבא קובץ Excel להוספת נתונים</p>
              </div> : <Card>
                <CardContent className="pt-6">
                  <RtlTable columns={[{
                key: "floor",
                width: 140,
                align: "right"
              }, {
                key: "apts",
                width: 100,
                align: "center"
              }, {
                key: "items",
                width: 120,
                align: "center"
              }, {
                key: "load",
                width: 220,
                align: "center"
              }, {
                key: "install",
                width: 220,
                align: "center"
              }, {
                key: "ready",
                width: 110,
                align: "center"
              }, {
                key: "partial",
                width: 110,
                align: "center"
              }, {
                key: "none",
                width: 130,
                align: "center"
              }]} className="bg-white rounded-lg">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:whitespace-nowrap [&>th]:font-medium text-muted-foreground border-b">
                        <th className="text-right">קומה</th>
                        <th className="text-center">דירות</th>
                        <th className="text-center">פריטים</th>
                        <th className="text-center">
                          <Truck className="h-4 w-4 inline ml-1" />
                          העמסה
                        </th>
                        <th className="text-center">
                          <Wrench className="h-4 w-4 inline ml-1" />
                          התקנה
                        </th>
                        <th className="text-center">מוכן</th>
                        <th className="text-center">חלקי</th>
                        <th className="text-center">לא נסרק</th>
                      </tr>
                    </thead>
                    <tbody className="[&>tr>td]:px-4 [&>tr>td]:py-3 [&>tr>td]:align-middle">
                      {floors.map(floor => {
                    const floorItems = items.filter(i => i.floor_id === floor.floor_id);
                    const loadedCount = floorItems.filter(i => i.loading_status_cached === 'LOADED').length;
                    const installedCount = floorItems.filter(i => i.install_status_cached === 'INSTALLED').length;
                    return <tr key={floor.floor_id} className="border-b hover:bg-muted/50 transition-colors">
                            <td className="text-right font-medium whitespace-nowrap">
                              {floor.floor_code === '0' ? 'קרקע' : `קומה ${floor.floor_code}`}
                            </td>
                            <td className="text-center whitespace-nowrap">{floor.total_apartments || 0}</td>
                            <td className="text-center whitespace-nowrap">{floor.total_items || 0}</td>
                            <td>
                              <div className="w-full flex items-center gap-2 justify-center">
                                <Progress value={floorItems.length > 0 ? loadedCount / floorItems.length * 100 : 0} className="w-20 h-2 [&>div]:bg-green-500" />
                                <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[4ch]">{loadedCount}/{floorItems.length}</span>
                              </div>
                            </td>
                            <td>
                              <div className="w-full flex items-center gap-2 justify-center">
                                <Progress value={floorItems.length > 0 ? installedCount / floorItems.length * 100 : 0} className="w-20 h-2 [&>div]:bg-blue-500" />
                                <span className="text-xs text-muted-foreground whitespace-nowrap min-w-[4ch]">{installedCount}/{floorItems.length}</span>
                              </div>
                            </td>
                            <td className="text-center">
                              <Badge variant="default" className="text-xs">{floor.ready_items || 0}</Badge>
                            </td>
                            <td className="text-center">
                              <Badge variant="secondary" className="text-xs">{floor.partial_items || 0}</Badge>
                            </td>
                            <td className="text-center">
                              <Badge variant="outline" className="text-xs">{floor.not_scanned_items || 0}</Badge>
                            </td>
                          </tr>;
                  })}
                    </tbody>
                  </RtlTable>
                </CardContent>
              </Card>}
          </TabsContent>

          <TabsContent value="apartments" className="mt-6">
            {apartments.length === 0 ? <div className="text-center py-12 bg-card rounded-lg border">
                <Home className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">אין עדיין דירות</h3>
                <p className="text-muted-foreground">ייבא קובץ Excel להוספת נתונים</p>
              </div> : <div className="space-y-4">
                {apartments.map(apt => {
              const isExpanded = expandedApartments.has(apt.apartment_id);
              const aptItems = items.filter(item => item.apt_id === apt.apartment_id);
              return <Card key={apt.apartment_id}>
                      <CardContent className="p-0">
                        <Collapsible open={isExpanded} onOpenChange={open => {
                    const newExpanded = new Set(expandedApartments);
                    if (open) {
                      newExpanded.add(apt.apartment_id);
                    } else {
                      newExpanded.delete(apt.apartment_id);
                    }
                    setExpandedApartments(newExpanded);
                  }}>
                          <CollapsibleTrigger className="w-full">
                            <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                              <div className="flex items-center gap-2">
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                <span className="font-semibold text-lg">דירה {apt.apt_number}</span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="text-muted-foreground">סה"כ:</span>
                                  <span className="font-medium">{apt.total_items || 0}</span>
                                </div>
                                <Badge variant="default" className="text-xs">{apt.ready_items || 0} מוכן</Badge>
                                <Badge variant="secondary" className="text-xs">{apt.partial_items || 0} חלקי</Badge>
                                <Badge className="text-xs bg-green-600">
                                  <Truck className="h-3 w-3 ml-1" />
                                  {aptItems.filter(i => i.loading_status_cached === 'LOADED').length} הועמס
                                </Badge>
                                <Badge className="text-xs bg-blue-600">
                                  <Wrench className="h-3 w-3 ml-1" />
                                  {aptItems.filter(i => i.install_status_cached === 'INSTALLED').length} הותקן
                                </Badge>
                                {aptItems.filter(i => i.install_status_cached === 'ISSUE').length > 0 && <Badge variant="destructive" className="text-xs">
                                    {aptItems.filter(i => i.install_status_cached === 'ISSUE').length} בעיות
                                  </Badge>}
                                <Badge variant="outline" className="text-xs">{apt.not_scanned_items || 0} לא נסרק</Badge>
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <div className="border-t bg-muted/30">
                              {aptItems.length === 0 ? <div className="p-8 text-center">
                                  <p className="text-sm text-muted-foreground">אין פריטים בדירה זו</p>
                                </div> : <RtlTable columns={[{
                          key: "item_code",
                          width: "25%",
                          align: "right"
                        }, {
                          key: "location",
                          width: "20%",
                          align: "right"
                        }, {
                          key: "loading_status",
                          width: "20%",
                          align: "center"
                        }, {
                          key: "install_status",
                          width: "20%",
                          align: "center"
                        }, {
                          key: "loading_parts",
                          width: "15%",
                          align: "center"
                        }]} className="bg-muted/30">
                                  <thead>
                                    <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:whitespace-nowrap [&>th]:font-medium text-muted-foreground border-b">
                                       <th className="text-right">קוד פריט</th>
                                       <th className="text-right">מיקום</th>
                                       <th className="text-center">העמסה</th>
                                       <th className="text-center">התקנה</th>
                                       <th className="text-center">חלקים</th>
                                    </tr>
                                  </thead>
                                  <tbody className="[&>tr>td]:px-4 [&>tr>td]:py-3 [&>tr>td]:align-middle">
                                    {aptItems.map(item => {
                                      const loadIssue = loadIssuesMap.get(item.id);
                                      const hasLoadIssue = !!loadIssue;
                                      return <tr key={item.id} className="border-b hover:bg-muted/50 transition-colors">
                                        <td className="text-right font-medium">{item.item_code}</td>
                                        <td className="text-right text-muted-foreground text-sm">{item.location || '-'}</td>
                                        <td className="text-center">
                                          {item.loading_status_cached === 'LOADED' && hasLoadIssue ? (
                                            <LoadIssueViewer 
                                              loadIssue={loadIssue} 
                                              itemCode={item.item_code} 
                                              variant="badge" 
                                              showClearButton={true}
                                              onClear={() => {
                                                if (id) fetchProjectData(parseInt(id));
                                              }}
                                            />
                                          ) : (
                                            <Badge 
                                              variant={item.loading_status_cached === 'LOADED' ? 'default' : 'outline'} 
                                              className="text-xs"
                                            >
                                              {item.loading_status_cached === 'LOADED' ? 'הועמס' : 'לא הועמס'}
                                            </Badge>
                                          )}
                                        </td>
                                         <td className="text-center">
                                           {item.install_status_cached === 'ISSUE' ? (
                                             <InstallIssueViewerWithFetch 
                                               itemId={item.id}
                                               itemCode={item.item_code}
                                               showClearButton={true}
                                               onClear={() => {
                                                 if (id) fetchProjectData(parseInt(id));
                                               }}
                                             />
                                           ) : (
                                             <Badge 
                                               variant={item.install_status_cached === 'INSTALLED' ? 'default' : item.install_status_cached === 'PARTIAL' ? 'secondary' : 'outline'} 
                                               className="text-xs"
                                             >
                                               {item.install_status_cached === 'INSTALLED' ? 'הותקן' : item.install_status_cached === 'PARTIAL' ? 'חלקי' : 'לא הותקן'}
                                             </Badge>
                                           )}
                                         </td>
                                         <td className="text-center whitespace-nowrap">{item.loading_scanned_parts || 0}/{item.required_count || 1}</td>
                                      </tr>
                                    })}
                                  </tbody>
                                </RtlTable>}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      </CardContent>
                    </Card>;
            })}
              </div>}
          </TabsContent>

          <TabsContent value="items" className="mt-6">
            {items.length === 0 ? <div className="text-center py-12 bg-card rounded-lg border">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">אין עדיין פריטים</h3>
                <p className="text-muted-foreground">ייבא קובץ Excel להוספת נתונים</p>
              </div> : <Card>
                <CardContent className="pt-6">
                  {/* Filters */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="space-y-2">
                      <Label>סינון לפי העמסה</Label>
                      <Select value={loadingStatusFilter} onValueChange={setLoadingStatusFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="הכל" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">הכל</SelectItem>
                          <SelectItem value="NOT_LOADED">לא הועמס</SelectItem>
                          <SelectItem value="LOADED">הועמס — הכל</SelectItem>
                          <SelectItem value="LOADED_OK">הועמס — OK</SelectItem>
                          <SelectItem value="LOADED_ISSUE">הועמס — בעיה</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>סינון לפי התקנה</Label>
                      <Select value={installStatusFilter} onValueChange={setInstallStatusFilter}>
                        <SelectTrigger>
                          <SelectValue placeholder="הכל" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">הכל</SelectItem>
                          <SelectItem value="NOT_INSTALLED">לא הותקן</SelectItem>
                          <SelectItem value="PARTIAL">חלקי</SelectItem>
                          <SelectItem value="INSTALLED">הותקן</SelectItem>
                          <SelectItem value="ISSUE">בעיה</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <RtlTable columns={[{
                key: "item_code",
                width: "20%",
                align: "right"
              }, {
                key: "location",
                width: "20%",
                align: "right"
              }, {
                key: "loading",
                width: "20%",
                align: "center"
              }, {
                key: "install",
                width: "20%",
                align: "center"
              }, {
                key: "loading_parts",
                width: "20%",
                align: "center"
              }]} className="bg-white rounded-lg">
                    <thead className="sticky top-0 bg-white z-10">
                      <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:whitespace-nowrap [&>th]:font-medium text-muted-foreground border-b">
                         <th className="text-right">קוד פריט</th>
                         <th className="text-right">מיקום</th>
                         <th className="text-center">
                           <Truck className="h-4 w-4 inline ml-1" />
                           העמסה
                         </th>
                         <th className="text-center">
                           <Wrench className="h-4 w-4 inline ml-1" />
                           התקנה
                         </th>
                         <th className="text-center">חלקים</th>
                      </tr>
                    </thead>
                    <tbody className="[&>tr>td]:px-4 [&>tr>td]:py-3 [&>tr>td]:align-middle">
                      {items.filter(item => {
                    const hasIssue = loadIssuesMap.has(item.id);
                    if (loadingStatusFilter === 'NOT_LOADED' && item.loading_status_cached !== 'NOT_LOADED') return false;
                    if (loadingStatusFilter === 'LOADED' && item.loading_status_cached !== 'LOADED') return false;
                    if (loadingStatusFilter === 'LOADED_OK' && (item.loading_status_cached !== 'LOADED' || hasIssue)) return false;
                    if (loadingStatusFilter === 'LOADED_ISSUE' && (item.loading_status_cached !== 'LOADED' || !hasIssue)) return false;
                    if (installStatusFilter !== 'all' && item.install_status_cached !== installStatusFilter) return false;
                    return true;
                  }).slice((currentItemsPage - 1) * itemsPerPage, currentItemsPage * itemsPerPage).map(item => {
                    const loadIssue = loadIssuesMap.get(item.id);
                    const hasLoadIssue = !!loadIssue;
                    
                    const getLoadingBadgeWithIssue = (status: string) => {
                      if (status === 'LOADED' && hasLoadIssue) {
                        return (
                          <LoadIssueViewer 
                            loadIssue={loadIssue} 
                            itemCode={item.item_code} 
                            variant="badge" 
                            showClearButton={true}
                            onClear={() => {
                              if (id) fetchProjectData(parseInt(id));
                            }}
                          />
                        );
                      }
                      const variants: any = {
                        'LOADED': 'default',
                        'NOT_LOADED': 'outline'
                      };
                      const labels: any = {
                        'LOADED': 'הועמס',
                        'NOT_LOADED': 'לא הועמס'
                      };
                      return <Badge variant={variants[status]} className="text-xs">{labels[status] || status}</Badge>;
                    };
                    const getInstallBadge = (status: string) => {
                      if (status === 'ISSUE') {
                        return (
                          <InstallIssueViewerWithFetch
                            itemId={item.id}
                            itemCode={item.item_code}
                            showClearButton={true}
                            onClear={() => {
                              if (id) fetchProjectData(parseInt(id));
                            }}
                          />
                        );
                      }
                      const variants: any = {
                        'INSTALLED': 'default',
                        'PARTIAL': 'secondary',
                        'NOT_INSTALLED': 'outline'
                      };
                      const labels: any = {
                        'INSTALLED': 'הותקן',
                        'PARTIAL': 'חלקי',
                        'NOT_INSTALLED': 'לא הותקן'
                      };
                      return <Badge variant={variants[status]} className="text-xs">{labels[status] || status}</Badge>;
                    };
                    return <tr key={item.id} className="border-b hover:bg-muted/50 transition-colors">
                              <td className="text-right font-medium whitespace-nowrap">{item.item_code}</td>
                              <td className="text-right text-muted-foreground text-sm">{item.location || '-'}</td>
                              <td className="text-center">{getLoadingBadgeWithIssue(item.loading_status_cached)}</td>
                              <td className="text-center">{getInstallBadge(item.install_status_cached)}</td>
                              <td className="text-center whitespace-nowrap">{item.loading_scanned_parts || 0}/{item.required_count || 1}</td>
                            </tr>;
                  })}
                    </tbody>
                  </RtlTable>
                  {items.length > itemsPerPage && <div className="mt-4 space-y-2">
                      <p className="text-center text-muted-foreground text-sm">
                        מציג {(currentItemsPage - 1) * itemsPerPage + 1}-{Math.min(currentItemsPage * itemsPerPage, items.length)} מתוך {items.length} פריטים
                      </p>
                      <Pagination dir="ltr">
                        <PaginationContent>
                          <PaginationItem>
                            <PaginationPrevious onClick={() => setCurrentItemsPage(Math.max(1, currentItemsPage - 1))} className={currentItemsPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                          </PaginationItem>
                          {Array.from({
                      length: Math.ceil(items.length / itemsPerPage)
                    }, (_, i) => i + 1).map(page => <PaginationItem key={page}>
                              <PaginationLink onClick={() => setCurrentItemsPage(page)} isActive={currentItemsPage === page} className="cursor-pointer">
                                {page}
                              </PaginationLink>
                            </PaginationItem>)}
                          <PaginationItem>
                            <PaginationNext onClick={() => setCurrentItemsPage(Math.min(Math.ceil(items.length / itemsPerPage), currentItemsPage + 1))} className={currentItemsPage === Math.ceil(items.length / itemsPerPage) ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                          </PaginationItem>
                        </PaginationContent>
                      </Pagination>
                    </div>}
                </CardContent>
              </Card>}
          </TabsContent>

          <TabsContent value="excel-sheets" className="mt-6">
            <MeasurementFileViewer 
              projectId={parseInt(id!)} 
              filePath={project?.source_file_path || null}
              onPathChange={(newPath) => setProject((prev: any) => prev ? { ...prev, source_file_path: newPath } : prev)}
            />
          </TabsContent>

          <TabsContent value="production-file" className="mt-6">
            <ProductionFilePdfViewer 
              projectId={parseInt(id!)}
              projectName={project?.name || ''}
              pdfPath={project?.production_file_path || null}
              onPathChange={(newPath) => setProject((prev: any) => prev ? { ...prev, production_file_path: newPath } : prev)}
            />
          </TabsContent>

          <TabsContent value="optimization" className="mt-6">
            <OptimizationPdfUpload projectId={parseInt(id!)} />
          </TabsContent>

          <TabsContent value="manufacturing" className="mt-6">
            <ManufacturingTab projectId={parseInt(id!)} projectName={project?.name} />
          </TabsContent>
        </Tabs>
      </main>
    </div>;
};
export default ProjectDetail;