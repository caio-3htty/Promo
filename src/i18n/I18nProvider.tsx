import { useState, type ReactNode } from "react";

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
  const [language, setLanguageState] = useState<AppLanguage>(getInitialLanguage);

  const setLanguage = (lang: AppLanguage) => {
    setLanguageState(lang);
    window.localStorage.setItem(STORAGE_KEY, lang);
  };

  const t = (key: MessageKey) => messages[language][key] ?? messages[defaultLanguage][key] ?? key;

  const value = { language, setLanguage, t };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
