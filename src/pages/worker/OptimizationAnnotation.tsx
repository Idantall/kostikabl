import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import { OptimizationPdfViewer } from "@/components/optimization/OptimizationPdfViewer";

interface PdfUpload {
  id: string;
  project_id: number;
  file_name: string;
  file_path: string;
  page_count: number;
  status: string;
}

export default function OptimizationAnnotation() {
  const { pdfId } = useParams<{ pdfId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pdfData, setPdfData] = useState<PdfUpload | null>(null);
  const [projectName, setProjectName] = useState<string>("");

  useEffect(() => {
    const fetchPdfData = async () => {
      if (!pdfId) {
        navigate("/worker");
        return;
      }

      // Check auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/login");
        return;
      }

      // Fetch PDF data
      const { data: pdf, error } = await supabase
        .from("optimization_pdf_uploads")
        .select("*")
        .eq("id", pdfId)
        .single();

      if (error || !pdf) {
        console.error("Error fetching PDF:", error);
        navigate("/worker");
        return;
      }

      setPdfData(pdf as PdfUpload);

      // Fetch project name
      const { data: project } = await supabase
        .from("projects")
        .select("name")
        .eq("id", pdf.project_id)
        .single();

      if (project) {
        setProjectName(project.name);
      }

      setLoading(false);
    };

    fetchPdfData();
  }, [pdfId, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!pdfData) {
    return null;
  }

  return (
    <div className="flex flex-col h-screen" dir="rtl">
      {/* Header */}
      <header className="flex items-center justify-between p-3 border-b bg-card">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-semibold text-lg truncate max-w-[200px] md:max-w-none">
              {pdfData.file_name}
            </h1>
            <p className="text-sm text-muted-foreground">{projectName}</p>
          </div>
        </div>
      </header>

      {/* PDF Viewer */}
      <div className="flex-1 overflow-hidden">
        <OptimizationPdfViewer pdfId={pdfData.id} pdfPath={pdfData.file_path} />
      </div>
    </div>
  );
}
