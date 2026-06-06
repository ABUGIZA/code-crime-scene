import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { isTauri } from "../lib/api";
import { Fingerprint, Search, Archive, Gear } from "./Icons";

export function Sidebar() {
  const { route, navigate, hasKey } = useStore();
  const { t } = useI18n();

  const investigating = route === "home" || route === "analyzing" || route === "report";

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Fingerprint size={22} />
        </div>
        <div className="brand-name">
          <b>CRIME</b>
          <span>SCENE</span>
        </div>
      </div>

      <div className="brand-tape tape" />

      <nav className="nav">
        <div className="nav-label eyebrow">{t("nav.casework")}</div>
        <div
          className={`nav-item ${investigating ? "active" : ""}`}
          onClick={() => navigate("home")}
        >
          <span className="ico">
            <Search size={18} />
          </span>
          {t("nav.investigate")}
        </div>
        <div
          className={`nav-item ${route === "cases" ? "active" : ""}`}
          onClick={() => navigate("cases")}
        >
          <span className="ico">
            <Archive size={18} />
          </span>
          {t("nav.cases")}
        </div>
        <div
          className={`nav-item ${route === "settings" ? "active" : ""}`}
          onClick={() => navigate("settings")}
        >
          <span className="ico">
            <Gear size={18} />
          </span>
          {t("nav.settings")}
        </div>
      </nav>

      <div className="sidebar-foot">
        <div className="status-row">
          <span className={`led ${hasKey ? "on" : ""}`} />
          {hasKey ? t("status.aiLinked") : t("status.aiOffline")}
        </div>
        <div className="status-row">
          <span className="led on" />
          {t("status.storage")}
        </div>
        <div className="status-row">
          <span className={`led ${isTauri ? "on" : "amber"}`} />
          {isTauri ? t("status.engineNative") : t("status.enginePreview")}
        </div>
      </div>
    </aside>
  );
}
