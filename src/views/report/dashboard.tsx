// Top of the report: case header + actions + the five scores + quick stats,
// plus the grouped findings (actionable / needs-verification / observations).

import { FileIcon, Alert } from "../../components/Icons";
import { FindingCard, Section, type Tr } from "./parts";
import { CaseHeader, ReportActions, VerdictBlock, MetricCards, StatsStrip, SecurityNote } from "./dashboard-parts";
import type { AnalysisResult, Finding, Scores } from "../../lib/types";

interface DashboardProps {
  reportId: number | null;
  createdAt: number;
  a: AnalysisResult;
  s: Scores;
  prev?: Scores | null; // scores of the previous report of the same project
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
  const { a, s, prev, grade, verdictTitle, overallCol, copied, t } = p;
  const trendLabel = t("trend.vsPrev");
  return (
    <>
      <CaseHeader a={a} reportId={p.reportId} createdAt={p.createdAt} grade={grade} verdictTitle={verdictTitle} overallCol={overallCol} t={t} />

      <div className="tape" style={{ marginTop: 20 }} />

      <ReportActions copied={copied} onCopy={p.onCopy} onExport={p.onExport} onCases={p.onCases} onRescan={p.onRescan} t={t} />

      <VerdictBlock s={s} prev={prev} grade={grade} verdictTitle={verdictTitle} overallCol={overallCol} trendLabel={trendLabel} t={t} />

      <MetricCards s={s} prev={prev} trendLabel={trendLabel} t={t} />

      <StatsStrip a={a} t={t} />

      <SecurityNote a={a} t={t} />
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
