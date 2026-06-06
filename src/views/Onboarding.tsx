import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { useApiKey } from "../lib/useApiKey";
import { ApiKeyField } from "../components/ApiKeyField";
import { Fingerprint, Key } from "../components/Icons";

export function Onboarding() {
  const { completeOnboarding } = useStore();
  const { t } = useI18n();
  const ctrl = useApiKey();

  return (
    <div className="center-stage">
      <div className="onb">
        <div className="onb-emblem">
          <Fingerprint size={30} />
        </div>
        <h1>Code Crime Scene</h1>
        <p className="lede">{t("onb.lede")}</p>

        <div className="card card-pad">
          <label className="field-label">
            <Key size={12} style={{ verticalAlign: "-2px", marginInlineEnd: 6 }} />
            {t("onb.keyLabel")}
          </label>
          <ApiKeyField ctrl={ctrl} cta={t("onb.verify")} />
          <p className="hint">{t("onb.hint")}</p>
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
