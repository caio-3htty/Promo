import { createContext } from "react";

import { defaultLanguage, messages, type AppLanguage, type MessageKey } from "./messages";

export type I18nContextType = {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => void;
  t: (key: MessageKey) => string;
};

export const I18nContext = createContext<I18nContextType>({
  language: defaultLanguage,
  setLanguage: () => {},
  t: (key) => messages[defaultLanguage][key],
});
