import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import * as api from "../lib/api";
import { buildAiSummary, buildFixPrompt, buildMarkdownReport } from "../lib/report";
import { buildBrief, buildFindings, buildQualityWarnings } from "../lib/findings";
import { gradeFor, scoreLevel } from "../lib/scoring";
import type { AnalysisResult, Scores } from "../lib/types";
import { colVar, fanIn } from "./report/parts";
import { Dashboard, FindingsGroups } from "./report/dashboard";
import { AiBrief, QualityWarnings, AiPanel, EvidenceTables } from "./report/sections";

export function Report() {
  const { current, hasKey, navigate, setAiContent, setNotice, analyzePath } = useStore();
  const { t, lang } = useI18n();
  const [aiLoading, setAiLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const a: AnalysisResult | null = current?.analysis ?? null;
  const findings = useMemo(() => (a ? buildFindings(a, t) : []), [a, t]);
  const brief = useMemo(() => (a ? buildBrief(a, findings, t) : null), [a, findings, t]);
  const warnings = useMemo(() => (a ? buildQualityWarnings(findings, t) : []), [a, findings, t]);

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

  async function runAi() {
    if (!current) return;
    setAiLoading(true);
    try {
      const text = await api.analyzeWithAi(buildAiSummary(current.analysis, current.scores), current.reportId, lang);
      setAiContent(text);
    } catch (e) {
      setNotice(api.errText(e));
    } finally {
      setAiLoading(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(buildFixPrompt(a!, s, t));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice(t("copy.failed"));
    }
  }

  async function exportReport() {
    try {
      const md = buildMarkdownReport(a!, s, grade, verdictTitle, t, aiContent);
      const safe = a!.projectName.replace(/[^\w.-]+/g, "_") || "report";
      const path = await api.saveTextFile(`${safe}-crime-scene.md`, md);
      if (path) setNotice(t("export.saved", { path }));
    } catch (e) {
      setNotice(t("export.failed", { e: api.errText(e) }));
    }
  }

  return (
    <div className="content">
      <Dashboard
        reportId={current.reportId}
        createdAt={current.createdAt}
        a={a}
        s={s}
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
        onRun={runAi}
        onAddKey={() => navigate("settings")}
        t={t}
      />
      <EvidenceTables a={a} noise={noise} connected={connected} t={t} />
      <div style={{ height: 30 }} />
    </div>
  );
}
