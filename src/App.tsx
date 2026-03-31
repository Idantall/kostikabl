import { Suspense, lazy, ComponentType } from "react";

// Auto-reload on chunk load failure (stale deploy)
function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((err) => {
      // If chunk fails to load, reload the page once
      const key = 'chunk_reload';
      const last = sessionStorage.getItem(key);
      const now = Date.now();
      if (!last || now - Number(last) > 10000) {
        sessionStorage.setItem(key, String(now));
        window.location.reload();
      }
      throw err;
    })
  );
}
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { RequireAuth } from "./components/RequireAuth";
import { PageLoadingSkeleton } from "@/components/ui/loading-skeleton";

// Lazy load all pages for code splitting
const Login = lazyWithRetry(() => import("./pages/Login"));
const Logout = lazyWithRetry(() => import("./pages/Logout"));
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const Projects = lazyWithRetry(() => import("./pages/Projects"));
const ProjectDetail = lazyWithRetry(() => import("./pages/ProjectDetail"));
const ProjectItemsSummary = lazyWithRetry(() => import("./pages/ProjectItemsSummary"));
const Import = lazyWithRetry(() => import("./pages/Import"));
// ImportMeasurement removed — merged into unified Import page
const MeasurementEditor = lazyWithRetry(() => import("./pages/MeasurementEditor"));
const Labels = lazyWithRetry(() => import("./pages/Labels"));
const PublicScan = lazyWithRetry(() => import("./pages/PublicScan"));
const ProjectScanMode = lazyWithRetry(() => import("./pages/ProjectScanMode"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const UploadFont = lazyWithRetry(() => import("./pages/UploadFont"));
const Cutlist = lazyWithRetry(() => import("./pages/Cutlist"));
const CutlistDetail = lazyWithRetry(() => import("./pages/CutlistDetail"));
const ProjectWizard = lazyWithRetry(() => import("./pages/ProjectWizard"));

// Worker Portal Pages
const WorkerPortal = lazyWithRetry(() => import("./pages/worker/WorkerPortal"));
const WorkerCutlistList = lazyWithRetry(() => import("./pages/worker/WorkerCutlistList"));
const WorkerCutlistDetail = lazyWithRetry(() => import("./pages/worker/WorkerCutlistDetail"));
const OptimizationList = lazyWithRetry(() => import("./pages/worker/OptimizationList"));
const OptimizationDetail = lazyWithRetry(() => import("./pages/worker/OptimizationDetail"));
const OptimizationAnnotation = lazyWithRetry(() => import("./pages/worker/OptimizationAnnotation"));
const PdfAnnotationTest = lazyWithRetry(() => import("./pages/PdfAnnotationTest"));
const AptStickerTest = lazyWithRetry(() => import("./pages/AptStickerTest"));
const ParentProjectDashboard = lazyWithRetry(() => import("./pages/ParentProjectDashboard"));
const FatherProjects = lazyWithRetry(() => import("./pages/FatherProjects"));
const FatherProjectDashboard = lazyWithRetry(() => import("./pages/FatherProjectDashboard"));
const BuildingDashboard = lazyWithRetry(() => import("./pages/BuildingDashboard"));

// Configure QueryClient with optimized defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache data for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Keep unused data in cache for 10 minutes
      gcTime: 10 * 60 * 1000,
      // Retry failed requests once
      retry: 1,
      // Don't refetch on window focus for most queries
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<PageLoadingSkeleton />}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/logout" element={<Logout />} />
            <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/projects" element={<RequireAuth><Projects /></RequireAuth>} />
            <Route path="/projects/:id" element={<RequireAuth><ProjectDetail /></RequireAuth>} />
            <Route path="/projects/:projectId/items-summary" element={<RequireAuth><ProjectItemsSummary /></RequireAuth>} />
            <Route path="/import" element={<RequireAuth><Import /></RequireAuth>} />
            {/* /import/measurement removed — merged into unified /import */}
            <Route path="/projects/:projectId/measurement" element={<RequireAuth><MeasurementEditor /></RequireAuth>} />
            <Route path="/labels/:projectId" element={<RequireAuth><Labels /></RequireAuth>} />
            <Route path="/projects/:projectId/scan" element={<RequireAuth><ProjectScanMode /></RequireAuth>} />
            <Route path="/admin/upload-font" element={<RequireAuth><UploadFont /></RequireAuth>} />
            <Route path="/cutlist" element={<RequireAuth><Cutlist /></RequireAuth>} />
            <Route path="/cutlist/:uploadId" element={<RequireAuth><CutlistDetail /></RequireAuth>} />
            <Route path="/wizard" element={<RequireAuth><ProjectWizard /></RequireAuth>} />
            {/* Worker Portal Routes */}
            <Route path="/worker" element={<RequireAuth><WorkerPortal /></RequireAuth>} />
            <Route path="/worker/cutlist" element={<RequireAuth><WorkerCutlistList /></RequireAuth>} />
            <Route path="/worker/cutlist/:uploadId" element={<RequireAuth><WorkerCutlistDetail /></RequireAuth>} />
            <Route path="/worker/optimization" element={<RequireAuth><OptimizationList /></RequireAuth>} />
            <Route path="/worker/optimization/:jobId" element={<RequireAuth><OptimizationDetail /></RequireAuth>} />
            <Route path="/worker/optimization-pdf/:pdfId" element={<RequireAuth><OptimizationAnnotation /></RequireAuth>} />
            {/* Parent Project Dashboard */}
            <Route path="/parent-project/:id" element={<RequireAuth><ParentProjectDashboard /></RequireAuth>} />
            {/* Father Projects */}
            <Route path="/father-projects" element={<RequireAuth><FatherProjects /></RequireAuth>} />
            <Route path="/father-projects/:id" element={<RequireAuth><FatherProjectDashboard /></RequireAuth>} />
            <Route path="/father-projects/:fatherId/building/:buildingNum" element={<RequireAuth><BuildingDashboard /></RequireAuth>} />
            {/* Test page for PDF annotation */}
            <Route path="/test/pdf-annotation" element={<RequireAuth><PdfAnnotationTest /></RequireAuth>} />
            <Route path="/test/apt-stickers" element={<RequireAuth><AptStickerTest /></RequireAuth>} />
            {/* Public scan page - no auth required */}
            <Route path="/s/:slug" element={<PublicScan />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
