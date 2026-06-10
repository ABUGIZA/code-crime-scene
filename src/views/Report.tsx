import { useMemo } from "react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { buildBrief, buildFindings, buildQualityWarnings } from "../lib/findings";
import { gradeFor, scoreLevel } from "../lib/scoring";
import { providerInfo } from "../lib/types";
import type { AnalysisResult, Scores } from "../lib/types";
import { colVar, fanIn } from "./report/parts";
import { Dashboard, FindingsGroups } from "./report/dashboard";
import { AiBrief, QualityWarnings, AiPanel, EvidenceTables } from "./report/sections";
import { ComplexitySection, GitForensicsSection } from "./report/forensics";
import { useReportActions } from "./report/useReportActions";
import { useTrends } from "./report/useTrends";

export function Report() {
  const { current, hasKey, aiProvider, navigate, analyzePath } = useStore();
  const { t } = useI18n();
  const { aiLoading, copied, runAi, copyPrompt, exportReport } = useReportActions();

  const a: AnalysisResult | null = current?.analysis ?? null;
  const findings = useMemo(() => (a ? buildFindings(a, t) : []), [a, t]);
  const brief = useMemo(() => (a ? buildBrief(a, findings, t) : null), [a, findings, t]);
  const warnings = useMemo(() => (a ? buildQualityWarnings(findings, t) : []), [a, findings, t]);

  const prev = useTrends(a?.projectPath ?? null, current?.reportId ?? null, current?.createdAt ?? 0);

  if (!current || !a) {
    return (
      <div className="content">
        <div className="empty">—</div>
      </div>
    );
  }

  const s: Scores = current.scores;
  const aiContent = current.aiContent;
  const grade = gradeFor(s.projectScore);
  const verdictTitle = t(`verdict.${grade}.title`);
  const overallCol = colVar(scoreLevel(s.projectScore));
  const connected = fanIn(a.dependencies);
  const actionable = findings.filter((f) => f.category === "actionable");
  const needsVerify = findings.filter((f) => f.category === "needs-verification");
  const informational = findings.filter((f) => f.category === "informational");
  const noise = findings.filter((f) => f.category === "noise");

  return (
    <div className="content">
      <Dashboard
        reportId={current.reportId}
        createdAt={current.createdAt}
        a={a}
        s={s}
        prev={prev}
        grade={grade}
        verdictTitle={verdictTitle}
        overallCol={overallCol}
        copied={copied}
        onCopy={copyPrompt}
        onExport={exportReport}
        onCases={() => navigate("cases")}
        onRescan={() => analyzePath(a.projectPath)}
        t={t}
      />
      <FindingsGroups actionable={actionable} needsVerify={needsVerify} informational={informational} t={t} />
      {brief && actionable.length > 0 && <AiBrief brief={brief} t={t} />}
      <QualityWarnings warnings={warnings} t={t} />
      <AiPanel
        hasKey={hasKey}
        aiContent={aiContent}
        aiLoading={aiLoading}
        providerLabel={providerInfo(aiProvider).label}
        onRun={runAi}
        onAddKey={() => navigate("settings")}
        t={t}
      />
      <EvidenceTables a={a} noise={noise} connected={connected} t={t} />
      <ComplexitySection a={a} t={t} />
      {a.gitForensics && <GitForensicsSection g={a.gitForensics} t={t} />}
      <div style={{ height: 30 }} />
    </div>
  );
}
