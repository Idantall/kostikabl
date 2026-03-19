import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CutlistPdfContextValue {
  pdfUrl: string | null;
  isLoading: boolean;
  error: string | null;
}

const CutlistPdfContext = createContext<CutlistPdfContextValue>({
  pdfUrl: null,
  isLoading: true,
  error: null,
});

export function useCutlistPdf() {
  return useContext(CutlistPdfContext);
}

interface CutlistPdfProviderProps {
  pdfPath: string | null;
  children: ReactNode;
}

/**
 * Provider that loads the PDF signed URL once and shares it across all CutlistPdfPreview components.
 * This prevents multiple signed URL requests for the same PDF.
 */
export function CutlistPdfProvider({ pdfPath, children }: CutlistPdfProviderProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        const { data, error: urlError } = await supabase.storage
          .from("cutlist-pdfs")
          .createSignedUrl(pdfPath, 3600); // 1 hour expiry

        if (urlError) throw urlError;
        if (!data?.signedUrl) throw new Error("No signed URL returned");

        setPdfUrl(data.signedUrl);
      } catch (err) {
        console.error("Error loading PDF:", err);
        setError("לא ניתן לטעון את הקובץ");
      } finally {
        setIsLoading(false);
      }
    };

    loadPdf();
  }, [pdfPath]);

  return (
    <CutlistPdfContext.Provider value={{ pdfUrl, isLoading, error }}>
      {children}
    </CutlistPdfContext.Provider>
  );
}
