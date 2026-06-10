import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { useApiKey } from "../lib/useApiKey";
import { ApiKeyField } from "../components/ApiKeyField";
import { AI_PROVIDERS, providerInfo } from "../lib/types";
import { Key } from "../components/Icons";
import { BrandMark } from "../components/BrandMark";

export function Onboarding() {
  const { completeOnboarding, aiProvider, setAiProvider } = useStore();
  const { t } = useI18n();

  const info = providerInfo(aiProvider);
  const pname = t(`provider.${aiProvider}`);
  const ctrl = useApiKey(aiProvider, info.hasBaseUrl ? "http://localhost:11434/v1" : undefined);

  return (
    <div className="center-stage">
      <div className="onb">
        <div className="onb-emblem">
          <BrandMark size={30} />
        </div>
        <h1>Code Crime Scene</h1>
        <p className="lede">{t("onb.lede")}</p>

        <div className="card card-pad">
          <label className="field-label">{t("settings.provider")}</label>
          <div className="lang-toggle" style={{ flexWrap: "wrap", marginBottom: 16 }}>
            {AI_PROVIDERS.map((p) => (
              <button
                key={p.id}
                className={`lang-opt ${aiProvider === p.id ? "active" : ""}`}
                style={{ padding: "7px 12px", fontSize: 13 }}
                onClick={() => setAiProvider(p.id)}
              >
                {t(`provider.${p.id}`)}
              </button>
            ))}
          </div>

          <label className="field-label">
            <Key size={12} style={{ verticalAlign: "-2px", marginInlineEnd: 6 }} />
            {t("onb.keyLabel", { provider: pname })}
          </label>
          <ApiKeyField
            ctrl={ctrl}
            cta={t("onb.verify")}
            placeholder={info.keyHint}
            allowEmpty={!info.needsKey}
          />
          <p className="hint">{aiProvider === "custom" ? t("settings.customHint") : t("onb.hint", { provider: pname })}</p>
        </div>

        <div className="row-between" style={{ marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={completeOnboarding}>
            {t("onb.skip")}
          </button>
          <button
            className="btn btn-primary btn-lg"
            onClick={completeOnboarding}
            disabled={ctrl.status !== "ok"}
          >
            {t("onb.enter")}
          </button>
        </div>
      </div>
    </div>
  );
}
