import { useI18n } from "../lib/i18n";
import { LanguageSection, AiProviderSection, StorageSection, AboutSection } from "./settings/parts";

export function Settings() {
  const { t } = useI18n();

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("settings.eyebrow")}</div>
          <h1 className="page-title">{t("settings.title")}</h1>
          <div className="page-sub">{t("settings.subtitle")}</div>
        </div>
      </div>

      <LanguageSection />
      <AiProviderSection />
      <StorageSection />
      <AboutSection />
    </div>
  );
}
