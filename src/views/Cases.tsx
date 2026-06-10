import { useEffect, useState, type MouseEvent } from "react";
import { useStore } from "../lib/store";
import { useI18n, type Lang } from "../lib/i18n";
import * as api from "../lib/api";
import type { ReportSummary } from "../lib/types";
import { scoreLevel } from "../lib/scoring";
import { caseNumber, timeAgo } from "../lib/format";
import { Sparkles, Trash } from "../components/Icons";
import { ArchiveArt } from "../components/EmptyArt";

type T = (key: string, vars?: Record<string, string | number>) => string;

function CasesHeader({ t, onNew }: { t: T; onNew: () => void }) {
  return (
    <div className="page-head">
      <div>
        <div className="eyebrow">{t("cases.eyebrow")}</div>
        <h1 className="page-title">{t("cases.title")}</h1>
        <div className="page-sub">{t("cases.subtitle")}</div>
      </div>
      <button className="btn btn-primary" onClick={onNew}>
        {t("cases.new")}
      </button>
    </div>
  );
}

function CasesEmpty({ loading, empty, t }: { loading: boolean; empty: boolean; t: T }) {
  if (loading) {
    return (
      <div className="empty">
        <span className="spinner" style={{ color: "var(--amber)" }} /> {t("cases.loading")}
      </div>
    );
  }
  if (empty) {
    return (
      <div className="empty">
        <ArchiveArt />
        {t("cases.empty")}
      </div>
    );
  }
  return null;
}

function CaseRow({
  r,
  lang,
  t,
  onOpen,
  onRemove,
}: {
  r: ReportSummary;
  lang: Lang;
  t: T;
  onOpen: (id: number) => void;
  onRemove: (id: number, e: MouseEvent) => void;
}) {
  const lvl = scoreLevel(r.overallScore);
  return (
    <div className="recent-item" onClick={() => onOpen(r.id)}>
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
        {timeAgo(r.createdAt, lang)}
      </div>
      <div className="num" style={{ width: 48, textAlign: "right", color: "var(--ink)", fontFamily: "var(--font-display)", fontSize: 18 }}>
        {r.overallScore}
      </div>
      <button className="btn btn-ghost" onClick={(e) => onRemove(r.id, e)} title={t("cases.delete")}>
        <Trash size={15} />
      </button>
    </div>
  );
}

export function Cases() {
  const { openReport, navigate, setNotice } = useStore();
  const { t, lang } = useI18n();
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
      <CasesHeader t={t} onNew={() => navigate("home")} />

      {loading || reports.length === 0 ? (
        <CasesEmpty loading={loading} empty={reports.length === 0} t={t} />
      ) : (
        reports.map((r) => (
          <CaseRow key={r.id} r={r} lang={lang} t={t} onOpen={openReport} onRemove={remove} />
        ))
      )}
    </div>
  );
}
