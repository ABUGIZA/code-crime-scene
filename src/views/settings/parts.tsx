// Settings page sections — extracted from Settings.tsx, which now only composes
// them. Each section owns its own hooks and state so behavior is unchanged.

import { useEffect, useState } from "react";
import { useStore } from "../../lib/store";
import { useI18n } from "../../lib/i18n";
import { useApiKey } from "../../lib/useApiKey";
import { ApiKeyField } from "../../components/ApiKeyField";
import * as api from "../../lib/api";
import { AI_PROVIDERS, providerInfo } from "../../lib/types";
import { Shield, Languages } from "../../components/Icons";

const DEFAULT_BASE_URL = "http://localhost:11434/v1";

export function LanguageSection() {
  const { t, lang, setLang } = useI18n();
  return (
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
  );
}

export function AiProviderSection() {
  const { hasKey, aiProvider, setAiProvider } = useStore();
  const { t } = useI18n();

  const info = providerInfo(aiProvider);
  const pname = t(`provider.${aiProvider}`);

  const [model, setModel] = useState(info.defaultModel);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const ctrl = useApiKey(aiProvider, info.hasBaseUrl ? baseUrl : undefined);

  // per-provider model, loaded on mount and whenever the provider changes
  useEffect(() => {
    let alive = true;
    const fallback = providerInfo(aiProvider).defaultModel;
    api
      .getSetting("aiModel:" + aiProvider)
      .then((v) => alive && setModel(v && v.trim() ? v : fallback))
      .catch(() => alive && setModel(fallback));
    return () => {
      alive = false;
    };
  }, [aiProvider]);

  // base URL (custom provider only), loaded once
  useEffect(() => {
    api
      .getSetting("aiBaseUrl")
      .then((v) => v && v.trim() && setBaseUrl(v))
      .catch(() => {});
  }, []);

  function onModelChange(v: string) {
    setModel(v);
    api.setSetting("aiModel:" + aiProvider, v).catch(() => {});
  }

  function onBaseUrlChange(v: string) {
    setBaseUrl(v);
    api.setSetting("aiBaseUrl", v).catch(() => {});
  }

  return (
    <div className="card setting-block">
      <h3>{t("settings.ai")}</h3>
      <p>{hasKey ? t("settings.aiHasKey", { provider: pname }) : t("settings.aiNoKey", { provider: pname })}</p>

      <label className="field-label">{t("settings.provider")}</label>
      <div className="lang-toggle" style={{ flexWrap: "wrap" }}>
        {AI_PROVIDERS.map((p) => (
          <button
            key={p.id}
            className={`lang-opt ${aiProvider === p.id ? "active" : ""}`}
            style={{ padding: "8px 14px" }}
            onClick={() => setAiProvider(p.id)}
          >
            {t(`provider.${p.id}`)}
          </button>
        ))}
      </div>

      {hasKey && (
        <div className="row-between" style={{ marginTop: 16 }}>
          <div className="chip good">
            <span className="dot" /> {t("settings.keyLinked", { provider: pname })}
          </div>
          <button className="btn btn-danger" onClick={ctrl.remove}>
            {t("settings.removeKey")}
          </button>
        </div>
      )}

      {aiProvider === "custom" && <p className="hint">{t("settings.customHint")}</p>}

      <label className="field-label" style={{ marginTop: 16 }}>
        {hasKey ? t("settings.replaceKey") : t("settings.addKey")}
      </label>
      <ApiKeyField
        ctrl={ctrl}
        cta={t("settings.verifySave")}
        placeholder={info.keyHint}
        allowEmpty={!info.needsKey}
      />

      <label className="field-label" style={{ marginTop: 16 }}>
        {t("settings.model")}
      </label>
      <input
        className="input"
        value={model}
        placeholder={info.defaultModel}
        spellCheck={false}
        dir="ltr"
        onChange={(e) => onModelChange(e.target.value)}
      />

      {info.hasBaseUrl && (
        <>
          <label className="field-label" style={{ marginTop: 16 }}>
            {t("settings.baseUrl")}
          </label>
          <input
            className="input"
            value={baseUrl}
            placeholder={DEFAULT_BASE_URL}
            spellCheck={false}
            dir="ltr"
            onChange={(e) => onBaseUrlChange(e.target.value)}
          />
        </>
      )}
    </div>
  );
}

export function StorageSection() {
  const { t } = useI18n();
  return (
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
  );
}

export function AboutSection() {
  const { t } = useI18n();
  return (
    <div className="card setting-block">
      <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Shield size={17} /> {t("settings.about")}
      </h3>
      <p style={{ margin: 0 }}>{t("settings.aboutText")}</p>
    </div>
  );
}
