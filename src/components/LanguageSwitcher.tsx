import { useI18n } from "@/i18n/useI18n";
import type { AppLanguage } from "@/i18n/messages";

const options: Array<{ value: AppLanguage; label: string }> = [
  { value: "pt-BR", label: "PT-BR" },
  { value: "en", label: "EN" },
  { value: "es", label: "ES" },
];

export const LanguageSwitcher = () => {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span>{t("language")}</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as AppLanguage)}
        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
};
