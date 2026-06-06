import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { useApiKey } from "../lib/useApiKey";
import { ApiKeyField } from "../components/ApiKeyField";
import * as api from "../lib/api";
import { Shield, Languages } from "../components/Icons";

export function Settings() {
  const { hasKey } = useStore();
  const { t, lang, setLang } = useI18n();
  const ctrl = useApiKey();

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("settings.eyebrow")}</div>
          <h1 className="page-title">{t("settings.title")}</h1>
          <div className="page-sub">{t("settings.subtitle")}</div>
        </div>
      </div>

      {/* language */}
      <div className="card setting-block">
        <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Languages size={17} /> {t("settings.lang")}
        </h3>
        <p>{t("settings.langDesc")}</p>
        <div className="lang-toggle">
          <button
            className={`lang-opt ${lang === "en" ? "active" : ""}`}
            onClick={() => setLang("en")}
          >
            English
          </button>
          <button
            className={`lang-opt ${lang === "ar" ? "active" : ""}`}
            onClick={() => setLang("ar")}
          >
            العربية
          </button>
        </div>
      </div>

      {/* AI key */}
      <div className="card setting-block">
        <h3>{t("settings.ai")}</h3>
        <p>{hasKey ? t("settings.aiHasKey") : t("settings.aiNoKey")}</p>

        {hasKey && (
          <div className="row-between" style={{ marginBottom: 16 }}>
            <div className="chip good">
              <span className="dot" /> {t("settings.keyLinked")}
            </div>
            <button className="btn btn-danger" onClick={ctrl.remove}>
              {t("settings.removeKey")}
            </button>
          </div>
        )}

        <label className="field-label">{hasKey ? t("settings.replaceKey") : t("settings.addKey")}</label>
        <ApiKeyField ctrl={ctrl} cta={t("settings.verifySave")} />
      </div>

      {/* storage */}
      <div className="card setting-block">
        <h3>{t("settings.storage")}</h3>
        <p>{t("settings.storageDesc")}</p>
        <div className="kv">
          <span className="k">{t("settings.kvDb")}</span>
          <span className="v">{t("settings.kvDbV")}</span>
        </div>
        <div className="kv">
          <span className="k">{t("settings.kvKey")}</span>
          <span className="v">{t("settings.kvKeyV")}</span>
        </div>
        <div className="kv">
          <span className="k">{t("settings.kvEngine")}</span>
          <span className="v">{api.isTauri ? t("settings.kvEngineNative") : t("settings.kvEnginePreview")}</span>
        </div>
        <div className="kv">
          <span className="k">{t("settings.kvSource")}</span>
          <span className="v">{t("settings.kvSourceV")}</span>
        </div>
      </div>

      <div className="card setting-block">
        <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Shield size={17} /> {t("settings.about")}
        </h3>
        <p style={{ margin: 0 }}>{t("settings.aboutText")}</p>
      </div>
    </div>
  );
}
