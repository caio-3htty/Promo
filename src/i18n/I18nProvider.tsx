import { useEffect, useState, type ReactNode } from "react";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { defaultLanguage, messages, type AppLanguage, type MessageKey } from "./messages";
import { I18nContext } from "./context";

const STORAGE_KEY = "prumo-language";

const getInitialLanguage = (): AppLanguage => {
  const value = window.localStorage.getItem(STORAGE_KEY);
  if (value === "pt-BR" || value === "en" || value === "es") {
    return value;
  }
  return defaultLanguage;
};

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const { user, preferredLanguage, loadingAccess } = useAuth();
  const [language, setLanguageState] = useState<AppLanguage>(getInitialLanguage);

  useEffect(() => {
    if (!user || loadingAccess) {
      return;
    }

    if (preferredLanguage !== language) {
      setLanguageState(preferredLanguage);
      window.localStorage.setItem(STORAGE_KEY, preferredLanguage);
    }
  }, [user, preferredLanguage, loadingAccess, language]);

  const setLanguage = (lang: AppLanguage) => {
    setLanguageState(lang);
    window.localStorage.setItem(STORAGE_KEY, lang);

    if (!user) {
      return;
    }

    void supabase
      .from("profiles")
      .update({ preferred_language: lang })
      .eq("user_id", user.id);
  };

  const t = (key: MessageKey) => messages[language][key] ?? messages[defaultLanguage][key] ?? key;

  const value = { language, setLanguage, t };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
