import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { CutlistLanguage } from "@/lib/cutlistTranslations";
import { getTranslation, formatTranslation, TranslationKey } from "@/lib/cutlistTranslations";

interface CutlistLanguageContextType {
  language: CutlistLanguage;
  setLanguage: (lang: CutlistLanguage) => void;
  t: (key: TranslationKey) => string;
  tf: (key: TranslationKey, params: Record<string, string | number>) => string;
  isRtl: boolean;
}

const CutlistLanguageContext = createContext<CutlistLanguageContextType | undefined>(undefined);

const STORAGE_KEY = "cutlist-language";

export function CutlistLanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<CutlistLanguage>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "th" || stored === "he") {
        return stored;
      }
    }
    return "he";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  const setLanguage = (lang: CutlistLanguage) => {
    setLanguageState(lang);
  };

  const t = (key: TranslationKey) => getTranslation(language, key);
  const tf = (key: TranslationKey, params: Record<string, string | number>) => formatTranslation(language, key, params);
  const isRtl = language === "he";

  return (
    <CutlistLanguageContext.Provider value={{ language, setLanguage, t, tf, isRtl }}>
      {children}
    </CutlistLanguageContext.Provider>
  );
}

export function useCutlistLanguage() {
  const context = useContext(CutlistLanguageContext);
  if (!context) {
    throw new Error("useCutlistLanguage must be used within CutlistLanguageProvider");
  }
  return context;
}
