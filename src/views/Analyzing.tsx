import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { Fingerprint } from "../components/Icons";

export function Analyzing() {
  const { progress } = useStore();
  const { t } = useI18n();

  const phase = progress?.phase ?? "scanning";
  const processed = progress?.processed ?? 0;
  const message =
    phase === "scanning"
      ? t("analyzing.scanning")
      : phase === "analyzing"
        ? t("analyzing.analyzing")
        : t("analyzing.done");

  return (
    <div className="analyzing">
      <div className="scan">
        <div className="scan-disc">
          <div className="scan-fingerprint">
            <Fingerprint size={56} />
          </div>
        </div>
        <div className="eyebrow">{t("analyzing.eyebrow")}</div>
        <h2>{t("analyzing.title")}</h2>
        <div className="phase">{message}</div>
        <div className="count">{processed > 0 ? t("analyzing.examined", { n: processed }) : " "}</div>
        <div className="scan-track">
          <span />
        </div>
      </div>
    </div>
  );
}
