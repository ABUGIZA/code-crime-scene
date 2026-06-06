import { useEffect, useState, type MouseEvent } from "react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import * as api from "../lib/api";
import type { ReportSummary } from "../lib/types";
import { scoreLevel } from "../lib/scoring";
import { caseNumber, timeAgo } from "../lib/format";
import { Archive, Sparkles, Trash } from "../components/Icons";

export function Cases() {
  const { openReport, navigate, setNotice } = useStore();
  const { t } = useI18n();
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setReports(await api.listReports());
    } catch (e) {
      setNotice(api.errText(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id: number, e: MouseEvent) {
    e.stopPropagation();
    try {
      await api.deleteReport(id);
      setReports((r) => r.filter((x) => x.id !== id));
    } catch (err) {
      setNotice(api.errText(err));
    }
  }

  return (
    <div className="content">
      <div className="page-head">
        <div>
          <div className="eyebrow">{t("cases.eyebrow")}</div>
          <h1 className="page-title">{t("cases.title")}</h1>
          <div className="page-sub">{t("cases.subtitle")}</div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate("home")}>
          {t("cases.new")}
        </button>
      </div>

      {loading ? (
        <div className="empty">
          <span className="spinner" style={{ color: "var(--amber)" }} /> {t("cases.loading")}
        </div>
      ) : reports.length === 0 ? (
        <div className="empty">
          <div className="disc">
            <Archive size={24} />
          </div>
          {t("cases.empty")}
        </div>
      ) : (
        reports.map((r) => {
          const lvl = scoreLevel(r.overallScore);
          return (
            <div key={r.id} className="recent-item" onClick={() => openReport(r.id)}>
              <span className={`chip ${lvl}`} style={{ fontFamily: "var(--font-display)", fontSize: 15, padding: "6px 12px" }}>
                {r.grade}
              </span>
              <div className="meta">
                <div className="name">{r.projectName}</div>
                <div className="path" dir="ltr">
                  {caseNumber(r.id, r.createdAt)} · {r.projectPath}
                </div>
              </div>
              {r.hasAi && (
                <span className="chip">
                  <Sparkles size={12} /> AI
                </span>
              )}
              <div className="num muted" style={{ fontSize: 12, width: 70, textAlign: "right" }}>
                {timeAgo(r.createdAt)}
              </div>
              <div className="num" style={{ width: 48, textAlign: "right", color: "var(--ink)", fontFamily: "var(--font-display)", fontSize: 18 }}>
                {r.overallScore}
              </div>
              <button className="btn btn-ghost" onClick={(e) => remove(r.id, e)} title={t("cases.delete")}>
                <Trash size={15} />
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}
