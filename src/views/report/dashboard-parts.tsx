// Presentational subcomponents composed by <Dashboard> (dashboard.tsx).
// Each renders a cohesive block of the report header; extracted verbatim so the
// rendered DOM, classNames, and i18n keys stay identical.

import { caseNumber, formatDate, formatNumber } from "../../lib/format";
import { Copy, Check, Download, Stack, Search, Shield } from "../../components/Icons";
import { Gauge, Metric, Delta, sv, type Tr } from "./parts";
import type { AnalysisResult, Scores } from "../../lib/types";

export function CaseHeader({
  a,
  reportId,
  createdAt,
  grade,
  verdictTitle,
  overallCol,
  t,
}: {
  a: AnalysisResult;
  reportId: number | null;
  createdAt: number;
  grade: string;
  verdictTitle: string;
  overallCol: string;
  t: Tr;
}) {
  return (
    <div className="case-head">
      <div>
        <div className="case-id">
          {t("report.case")} {caseNumber(reportId ?? 0, createdAt)}
        </div>
        <div className="case-name">{a.projectName}</div>
        <div className="case-meta">
          <span className="mi" dir="ltr">{a.projectPath}</span>
          <span className="mi">· {formatDate(createdAt)}</span>
          <span className="mi">· {t("find.analyzedOf", { a: a.analyzedFiles, i: a.ignoredFiles })}</span>
        </div>
      </div>
      <div className="stamp" style={sv({ "--col": overallCol })}>
        <div className="g">{grade}</div>
        <div className="t">{verdictTitle}</div>
      </div>
    </div>
  );
}

export function ReportActions({
  copied,
  onCopy,
  onExport,
  onCases,
  onRescan,
  t,
}: {
  copied: boolean;
  onCopy: () => void;
  onExport: () => void;
  onCases: () => void;
  onRescan: () => void;
  t: Tr;
}) {
  return (
    <div className="row-between" style={{ marginTop: 20, flexWrap: "wrap", gap: 10 }}>
      <div className="eyebrow">{t("report.forensic")}</div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn" onClick={onCopy}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? t("report.copied") : t("report.copyPrompt")}
        </button>
        <button className="btn" onClick={onExport}>
          <Download size={15} /> {t("report.export")}
        </button>
        <button className="btn btn-ghost" onClick={onCases}>
          <Stack size={15} /> {t("report.allCases")}
        </button>
        <button className="btn" onClick={onRescan}>
          <Search size={15} /> {t("report.rescan")}
        </button>
      </div>
    </div>
  );
}

export function VerdictBlock({
  s,
  prev,
  grade,
  verdictTitle,
  overallCol,
  trendLabel,
  t,
}: {
  s: Scores;
  prev?: Scores | null;
  grade: string;
  verdictTitle: string;
  overallCol: string;
  trendLabel: string;
  t: Tr;
}) {
  return (
    <div className="verdict-row">
      <div className="card gauge-card ticks">
        <Gauge score={s.projectScore} />
        <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          {t("report.projectScore")}
          {prev && <Delta d={s.projectScore - prev.projectScore} label={trendLabel} />}
        </div>
      </div>
      <div className="card verdict-body">
        <div className="eyebrow">{t("report.verdictGrade", { g: grade })}</div>
        <div className="verdict-title" style={{ color: overallCol }}>
          {verdictTitle}
        </div>
        <div className="verdict-blurb">{t(`verdict.${grade}.blurb`)}</div>
      </div>
    </div>
  );
}

export function MetricCards({
  s,
  prev,
  trendLabel,
  t,
}: {
  s: Scores;
  prev?: Scores | null;
  trendLabel: string;
  t: Tr;
}) {
  const dOf = (cur: number, old?: number) => (prev && old !== undefined ? cur - old : undefined);
  return (
    <div className="metrics">
      <Metric name={t("metric.debt")} value={s.technicalDebt} delta={dOf(s.technicalDebt, prev?.technicalDebt)} deltaLabel={trendLabel} />
      <Metric name={t("metric.arch")} value={s.architectureHealth} delta={dOf(s.architectureHealth, prev?.architectureHealth)} deltaLabel={trendLabel} />
      <Metric name={t("metric.security")} value={s.securityRisk} delta={dOf(s.securityRisk, prev?.securityRisk)} deltaLabel={trendLabel} />
      <Metric name={t("metric.maintain")} value={s.maintainability} delta={dOf(s.maintainability, prev?.maintainability)} deltaLabel={trendLabel} />
    </div>
  );
}

export function StatsStrip({ a, t }: { a: AnalysisResult; t: Tr }) {
  return (
    <div className="stats-strip">
      <div className="stat-tile">
        <div className="v">{formatNumber(a.analyzedFiles)}</div>
        <div className="l">{t("stat.analyzed")}</div>
      </div>
      <div className="stat-tile">
        <div className="v">{formatNumber(a.ignoredFiles)}</div>
        <div className="l">{t("stat.ignored")}</div>
      </div>
      <div className="stat-tile">
        <div className="v">{formatNumber(a.codeLines)}</div>
        <div className="l">{t("stat.loc")}</div>
      </div>
      <div className="stat-tile">
        <div className="v">{formatNumber(a.totalFunctions)}</div>
        <div className="l">{t("stat.functions")}</div>
      </div>
      <div className="stat-tile">
        <div className="v">{(a.duplicateLineRatio * 100).toFixed(1)}%</div>
        <div className="l">{t("stat.duplication")}</div>
      </div>
      {a.avgComplexity !== undefined && (
        <div className="stat-tile">
          <div className="v">{a.avgComplexity.toFixed(1)}</div>
          <div className="l">{t("stat.avgCC")}</div>
        </div>
      )}
      {a.highComplexityFunctions !== undefined && (
        <div className="stat-tile">
          <div className="v">{formatNumber(a.highComplexityFunctions)}</div>
          <div className="l">{t("stat.highCC")}</div>
        </div>
      )}
      {a.cycleCount !== undefined && (
        <div className="stat-tile">
          <div className="v">{formatNumber(a.cycleCount)}</div>
          <div className="l">{t("stat.cycles")}</div>
        </div>
      )}
      {a.gitForensics?.available && (
        <div className="stat-tile">
          <div className="v">{formatNumber(a.gitForensics.hotspots.length)}</div>
          <div className="l">{t("stat.hotspots")}</div>
        </div>
      )}
    </div>
  );
}

export function SecurityNote({ a, t }: { a: AnalysisResult; t: Tr }) {
  const noSec = a.securityHigh + a.securityMedium + a.securityLow === 0;
  return (
    <div className={`sec-note ${noSec ? "" : "warn"}`}>
      <Shield size={14} />
      <span className="mono">
        {t("secx.findings")}: {a.securityHigh} high / {a.securityMedium} medium / {a.securityLow} low · {t("secx.coverage")}
      </span>
      <span className="sec-disclaimer">{t("secx.note")}</span>
    </div>
  );
}
