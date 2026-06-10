// Report-screen actions (AI run, copy fix-prompt, markdown export), extracted
// from Report.tsx so the view stays pure composition.

import { useState } from "react";
import * as api from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { buildAiSummary, buildFixPrompt, buildMarkdownReport } from "../../lib/report";
import { gradeFor } from "../../lib/scoring";
import { useStore } from "../../lib/store";
import { providerInfo } from "../../lib/types";

export function useReportActions() {
  const { current, aiProvider, setAiContent, setNotice } = useStore();
  const { t, lang } = useI18n();
  const [aiLoading, setAiLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function runAi() {
    if (!current) return;
    setAiLoading(true);
    try {
      const provider = aiProvider;
      const model = (await api.getSetting("aiModel:" + provider)) || providerInfo(provider).defaultModel;
      const baseUrl = provider === "custom" ? (await api.getSetting("aiBaseUrl")) || undefined : undefined;
      const text = await api.analyzeWithAi(
        buildAiSummary(current.analysis, current.scores),
        current.reportId,
        lang,
        { model, provider, baseUrl },
      );
      setAiContent(text);
    } catch (e) {
      setNotice(api.errText(e));
    } finally {
      setAiLoading(false);
    }
  }

  async function copyPrompt() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(buildFixPrompt(current.analysis, current.scores, t));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice(t("copy.failed"));
    }
  }

  async function exportReport() {
    if (!current) return;
    try {
      const a = current.analysis;
      const grade = gradeFor(current.scores.projectScore);
      const verdictTitle = t(`verdict.${grade}.title`);
      const md = buildMarkdownReport(a, current.scores, grade, verdictTitle, t, current.aiContent);
      const safe = a.projectName.replace(/[^\w.-]+/g, "_") || "report";
      const path = await api.saveTextFile(`${safe}-crime-scene.md`, md);
      if (path) setNotice(t("export.saved", { path }));
    } catch (e) {
      setNotice(t("export.failed", { e: api.errText(e) }));
    }
  }

  return { aiLoading, copied, runAi, copyPrompt, exportReport };
}
