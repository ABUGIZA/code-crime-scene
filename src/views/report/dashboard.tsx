// Top of the report: case header + actions + the five scores + quick stats,
// plus the grouped findings (actionable / needs-verification / observations).

import { caseNumber, formatDate, formatNumber } from "../../lib/format";
import { Copy, Check, Download, Stack, Search, Shield, FileIcon, Alert } from "../../components/Icons";
import { Gauge, Metric, FindingCard, Section, sv, type Tr } from "./parts";
import type { AnalysisResult, Finding, Scores } from "../../lib/types";

interface DashboardProps {
  reportId: number | null;
  createdAt: number;
  a: AnalysisResult;
  s: Scores;
  grade: string;
  verdictTitle: string;
  overallCol: string;
  copied: boolean;
  onCopy: () => void;
  onExport: () => void;
  onCases: () => void;
  onRescan: () => void;
  t: Tr;
}

export function Dashboard(p: DashboardProps) {
  const { a, s, grade, verdictTitle, overallCol, copied, t } = p;
  const noSec = a.securityHigh + a.securityMedium + a.securityLow === 0;
  return (
    <>
      <div className="case-head">
        <div>
          <div className="case-id">
            {t("report.case")} {caseNumber(p.reportId ?? 0, p.createdAt)}
          </div>
          <div className="case-name">{a.projectName}</div>
          <div className="case-meta">
            <span className="mi" dir="ltr">{a.projectPath}</span>
            <span className="mi">· {formatDate(p.createdAt)}</span>
            <span className="mi">· {t("find.analyzedOf", { a: a.analyzedFiles, i: a.ignoredFiles })}</span>
          </div>
        </div>
        <div className="stamp" style={sv({ "--col": overallCol })}>
          <div className="g">{grade}</div>
          <div className="t">{verdictTitle}</div>
        </div>
      </div>

      <div className="tape" style={{ marginTop: 20 }} />

      <div className="row-between" style={{ marginTop: 20, flexWrap: "wrap", gap: 10 }}>
        <div className="eyebrow">{t("report.forensic")}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={p.onCopy}>
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? t("report.copied") : t("report.copyPrompt")}
          </button>
          <button className="btn" onClick={p.onExport}>
            <Download size={15} /> {t("report.export")}
          </button>
          <button className="btn btn-ghost" onClick={p.onCases}>
            <Stack size={15} /> {t("report.allCases")}
          </button>
          <button className="btn" onClick={p.onRescan}>
            <Search size={15} /> {t("report.rescan")}
          </button>
        </div>
      </div>

      <div className="verdict-row">
        <div className="card gauge-card ticks">
          <Gauge score={s.projectScore} />
          <div className="eyebrow">{t("report.projectScore")}</div>
        </div>
        <div className="card verdict-body">
          <div className="eyebrow">{t("report.verdictGrade", { g: grade })}</div>
          <div className="verdict-title" style={{ color: overallCol }}>
            {verdictTitle}
          </div>
          <div className="verdict-blurb">{t(`verdict.${grade}.blurb`)}</div>
        </div>
      </div>

      <div className="metrics">
        <Metric name={t("metric.debt")} value={s.technicalDebt} />
        <Metric name={t("metric.arch")} value={s.architectureHealth} />
        <Metric name={t("metric.security")} value={s.securityRisk} />
        <Metric name={t("metric.maintain")} value={s.maintainability} />
      </div>

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
      </div>

      <div className={`sec-note ${noSec ? "" : "warn"}`}>
        <Shield size={14} />
        <span className="mono">
          {t("secx.findings")}: {a.securityHigh} high / {a.securityMedium} medium / {a.securityLow} low · {t("secx.coverage")}
        </span>
        <span className="sec-disclaimer">{t("secx.note")}</span>
      </div>
    </>
  );
}

export function FindingsGroups({ actionable, needsVerify, informational, t }: { actionable: Finding[]; needsVerify: Finding[]; informational: Finding[]; t: Tr }) {
  return (
    <>
      <Section idx="!" title={t("find.actionable")} count={`${actionable.length}`} icon={<Alert size={14} />}>
        {actionable.length === 0 ? (
          <div className="card card-pad muted">{t("find.none")}</div>
        ) : (
          actionable.map((f) => <FindingCard key={f.id} f={f} t={t} />)
        )}
      </Section>

      {needsVerify.length > 0 && (
        <Section idx="?" title={t("find.needsVerify")} count={`${needsVerify.length}`} icon={<Alert size={14} />}>
          <div className="card card-pad muted" style={{ marginBottom: 10 }}>{t("find.needsVerifyNote")}</div>
          {needsVerify.map((f) => <FindingCard key={f.id} f={f} t={t} />)}
        </Section>
      )}

      {informational.length > 0 && (
        <Section idx="i" title={t("find.informational")} count={`${informational.length}`} icon={<FileIcon size={14} />}>
          <div className="card card-pad muted" style={{ marginBottom: 10 }}>{t("find.informationalNote")}</div>
          <div className="card">
            <table className="etable">
              <tbody>
                {informational.map((f) => (
                  <tr key={f.id}>
                    <td><span className="path" dir="ltr">{f.file}</span></td>
                    <td><span className="lang-tag">{f.title}</span></td>
                    <td className="num">{f.rationale.score}/100</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </>
  );
}
