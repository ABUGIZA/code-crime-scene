// Findings engine — orchestration only. Detection / classification / refactor /
// verification live in ./findings/*; the phase helpers behind buildFindings live
// in ./findings/build; this module assembles the prioritized finding list, the
// AI review brief, and the quality warnings.

import type { AiReviewBrief, AnalysisResult, Finding, InspectionItem } from "./types";
import { type T, PRIO_ORDER } from "./findings/shared";
import {
  collectFileFindings,
  securityFindings,
  duplicationFindings,
  unusedImportsFinding,
  appendVerifyCommands,
  applyP1Caps,
  noiseFindings,
} from "./findings/build";
import { qualityGate } from "./findings/verify";

export { verifyFinding, qualityGate } from "./findings/verify";

export function buildFindings(a: AnalysisResult, t: T): Finding[] {
  const out: Finding[] = [];

  collectFileFindings(out, a, t);
  securityFindings(out, a, t);
  duplicationFindings(out, a, t);
  unusedImportsFinding(out, a, t);

  appendVerifyCommands(out, a, t);
  applyP1Caps(out);
  qualityGate(out); // final launch gate (req #8)
  out.sort((x, y) => PRIO_ORDER[x.priority] - PRIO_ORDER[y.priority]);

  noiseFindings(out, a, t);

  return out;
}

export function buildBrief(a: AnalysisResult, findings: Finding[], t: T): AiReviewBrief {
  const actionable = findings.filter((f) => f.category === "actionable");
  const ordered = [...actionable].sort((x, y) => PRIO_ORDER[x.priority] - PRIO_ORDER[y.priority]);
  const top = ordered[0];
  const primaryRisk = top ? t("brief.riskLine", { title: top.title, file: top.file.split(":")[0] }) : t("find.none");

  const inspectionOrder: InspectionItem[] = ordered.slice(0, 8).map((f) => ({
    file: f.file,
    reason: f.title,
    priority: f.priority,
    confidence: f.confidence,
  }));

  // Likely false positives = anything that needs manual verification, or actionable
  // findings backed only by indirect/heuristic evidence.
  const falsePositives = findings
    .filter((f) => f.category === "needs-verification" || (f.category === "actionable" && f.confidence !== "high"))
    .slice(0, 5)
    .map((f) => ({
      file: f.file.split(":")[0],
      why: f.verifyNotes[0] ?? t("brief.fpWhy", { kind: f.title }),
    }));

  const ignoredNoise = (a.ignoredLargest || []).map((fi) => `${fi.path} (${fi.noiseReason ?? "noise"})`);

  const withRefactor = ordered.filter((f) => f.refactor.length > 0);
  const mkPr = (f: Finding | undefined) =>
    f ? { scope: `${f.title} — ${f.file.split(":")[0]}`, files: f.refactor.map((r) => r.path), why: f.why } : null;

  return {
    primaryRisk,
    inspectionOrder,
    falsePositives,
    ignoredNoise,
    pr1: mkPr(withRefactor[0]),
    pr2: mkPr(withRefactor[1]),
  };
}

export function buildQualityWarnings(findings: Finding[], t: T): string[] {
  const actionable = findings.filter((f) => f.category === "actionable");
  const w: string[] = [];
  if (actionable.some((f) => f.confidence !== "high")) w.push(t("qw.heuristic"));
  if (actionable.some((f) => f.refactor.length > 0)) w.push(t("qw.template"));
  if (findings.some((f) => f.category === "needs-verification")) w.push(t("qw.needsVerify"));
  return w;
}
