// Report layer — compact AI summary, a trust-grade copy-paste "fix prompt", and
// a full Markdown export. Findings carry priority + confidence + evidence type,
// plus an AI_REVIEW_BRIEF and (when relevant) QUALITY_WARNINGS.

import { buildBrief, buildFindings, buildQualityWarnings } from "./findings";
import {
  type T,
  mdAiContent,
  mdBrief,
  mdComplexity,
  mdCycles,
  mdFindings,
  mdFooter,
  mdGitForensics,
  mdHeader,
  mdOverview,
  mdScores,
  mdWarnings,
  rationaleLine,
} from "./report-md";
import type { AiReviewBrief, AnalysisResult, Finding, Scores } from "./types";

export function buildAiSummary(a: AnalysisResult, scores: Scores): string {
  const lines: string[] = [];
  lines.push(`PROJECT: ${a.projectName}`);
  lines.push(
    `SCORES (0-100, higher=better): overall=${scores.projectScore}, ` +
      `maintainability=${scores.maintainability}, technicalDebt=${scores.technicalDebt}, ` +
      `architecture=${scores.architectureHealth}, security=${scores.securityRisk}`,
  );
  lines.push(
    `SIZE: analyzed=${a.analyzedFiles}, ignored=${a.ignoredFiles}, codeLines=${a.codeLines}, ` +
      `functions=${a.totalFunctions}, avgFileLines=${a.avgFileLines.toFixed(0)}, maxFanIn=${a.maxFanIn}`,
  );
  lines.push(`SECURITY (static, limited): high=${a.securityHigh}, medium=${a.securityMedium}, low=${a.securityLow}`);
  if (a.largestFiles.length) {
    lines.push("LARGEST ANALYZED FILES:");
    a.largestFiles.slice(0, 6).forEach((f) => lines.push(`  - ${f.path} (${f.lines} lines, ${f.runtime}/${f.fileType})`));
  }

  // --- v2 evidence (every field optional — old reports omit these lines) ----
  if (a.avgComplexity !== undefined || a.maxComplexity !== undefined || a.highComplexityFunctions !== undefined) {
    lines.push(
      `COMPLEXITY: avgCC=${a.avgComplexity?.toFixed(1) ?? "?"}, maxCC=${a.maxComplexity ?? "?"}, ` +
        `functionsOverCC10=${a.highComplexityFunctions ?? "?"}`,
    );
  }
  if (a.complexFunctions?.length) {
    lines.push("MOST COMPLEX FUNCTIONS:");
    a.complexFunctions.slice(0, 5).forEach((f) => lines.push(`  - ${f.file}:${f.startLine} ${f.name} (CC ${f.complexity}, ${f.length} lines)`));
  }
  if (a.cycleCount !== undefined) {
    lines.push(`DEPENDENCY CYCLES: ${a.cycleCount}`);
    (a.cycles ?? []).slice(0, 3).forEach((c) => lines.push(`  - ${[...c, c[0]].join(" -> ")}`));
  }
  const g = a.gitForensics;
  if (g?.available) {
    lines.push(`GIT HISTORY: commitsAnalyzed=${g.commitsAnalyzed}, authors=${g.authorsTotal}`);
    if (g.hotspots.length) {
      lines.push("GIT HOTSPOTS (most re-touched files):");
      g.hotspots.slice(0, 5).forEach((h) => lines.push(`  - ${h.path} (${h.commits} commits, churn ${h.churn})`));
    }
    if (g.coChanges.length) {
      lines.push("CO-CHANGED PAIRS:");
      g.coChanges.slice(0, 3).forEach((p) => lines.push(`  - ${p.a} <-> ${p.b} (${p.count}x)`));
    }
    if (g.busFactor.length) {
      lines.push("BUS FACTOR (single-author files):");
      g.busFactor.slice(0, 3).forEach((b) => lines.push(`  - ${b.path} (${b.topAuthor} ${Math.round(b.share * 100)}% of ${b.commits} commits)`));
    }
  }
  return lines.join("\n");
}

function findingBlock(f: Finding, t: T): string[] {
  const lines: string[] = [];
  lines.push(`[${f.priority}][confidence: ${f.confidence}] ${f.title}: ${f.file}  (${f.runtime})`);
  lines.push(`  ${rationaleLine(f, t)}`);
  if (f.evidence.length) {
    lines.push(`  ${t("find.evidence")}:`);
    f.evidence.forEach((e) => lines.push(`    - ${e}`));
  }
  if (f.why) lines.push(`  ${t("find.why")}: ${f.why}`);
  if (f.nextStep) lines.push(`  ${t("find.next")}: ${f.nextStep}`);
  if (f.refactor.length) {
    lines.push(`  ${t("find.refactor")}:`);
    f.refactor.forEach((r) => lines.push(`    - ${r.path} — ${r.note}`));
  }
  if (f.prSlices.length) {
    lines.push(`  ${t("find.prs")}:`);
    f.prSlices.forEach((p, i) => lines.push(`    PR${i + 1}: ${p}`));
  }
  lines.push("");
  return lines;
}

function findingsText(findings: Finding[], t: T): string {
  const lines: string[] = [];
  const actionable = findings.filter((f) => f.category === "actionable");
  const needsVerify = findings.filter((f) => f.category === "needs-verification");
  const informational = findings.filter((f) => f.category === "informational");
  const noise = findings.filter((f) => f.category === "noise");

  lines.push("ACTIONABLE FINDINGS:");
  if (!actionable.length) lines.push("  (none)");
  for (const f of actionable) lines.push(...findingBlock(f, t));

  if (needsVerify.length) {
    lines.push(`NEEDS MANUAL VERIFICATION (${t("find.needsVerifyNote")}):`);
    for (const f of needsVerify) {
      lines.push(`[${f.priority}] ${f.title}: ${f.file}  (${f.runtime})`);
      f.verifyNotes.forEach((n) => lines.push(`    ! ${n}`));
    }
    lines.push("");
  }

  if (informational.length) {
    lines.push(`OBSERVATIONS (informational only — not action items):`);
    informational.forEach((f) => lines.push(`  - ${f.file} — ${f.title} (riskScore ${f.rationale.score}/100)`));
    lines.push("");
  }

  if (noise.length) {
    lines.push("NOISE / INFORMATIONAL:");
    noise.forEach((f) => lines.push(`  - ${f.file} (${f.evidence[1] ?? "noise"}) — ${t("find.noiseNote")}`));
    lines.push("");
  }
  return lines.join("\n");
}

function briefText(brief: AiReviewBrief, t: T): string {
  const lines: string[] = ["AI_REVIEW_BRIEF:"];
  lines.push(`  ${t("brief.primaryRisk")}: ${brief.primaryRisk}`);
  lines.push(`  ${t("brief.order")}:`);
  brief.inspectionOrder.forEach((it, i) =>
    lines.push(`    ${i + 1}. ${it.file} — ${it.reason} — ${it.priority} — ${it.confidence}`),
  );
  if (brief.falsePositives.length) {
    lines.push(`  ${t("brief.falsePos")}:`);
    brief.falsePositives.forEach((fp) => lines.push(`    - ${fp.file} — ${fp.why}`));
  }
  lines.push(`  ${t("brief.ignored")}:`);
  brief.ignoredNoise.forEach((n) => lines.push(`    - ${n}`));
  for (const [label, pr] of [
    [t("brief.pr1"), brief.pr1],
    [t("brief.pr2"), brief.pr2],
  ] as const) {
    if (pr) {
      lines.push(`  ${label}:`);
      lines.push(`    ${t("brief.scope")}: ${pr.scope}`);
      lines.push(`    ${t("brief.files")}: ${pr.files.join(", ")}`);
      lines.push(`    ${t("find.why")}: ${pr.why}`);
    }
  }
  return lines.join("\n");
}

function warningsText(warnings: string[], t: T): string {
  if (!warnings.length) return "";
  return `QUALITY_WARNINGS (${t("qw.title")}):\n` + warnings.map((w) => `  - ${w}`).join("\n") + "\n";
}

function complexityEvidenceText(a: AnalysisResult): string {
  if (!a.complexFunctions?.length) return "";
  const lines = ["COMPLEXITY HOTSPOTS (cyclomatic complexity):"];
  a.complexFunctions.slice(0, 5).forEach((f) => lines.push(`  - ${f.file}:${f.startLine} ${f.name} — CC ${f.complexity}, ${f.length} lines`));
  return lines.join("\n") + "\n";
}

export function buildFixPrompt(a: AnalysisResult, scores: Scores, t: T): string {
  const findings = buildFindings(a, t);
  const brief = buildBrief(a, findings, t);
  const warnings = buildQualityWarnings(findings, t);
  return [
    t("copy.intro"),
    "",
    `PROJECT: ${a.projectName} | overall=${scores.projectScore}/100 | analyzed=${a.analyzedFiles} ignored=${a.ignoredFiles}`,
    `SECURITY: ${a.securityHigh} high / ${a.securityMedium} medium / ${a.securityLow} low (static, limited — not an audit)`,
    "",
    findingsText(findings, t),
    briefText(brief, t),
    "",
    complexityEvidenceText(a),
    warningsText(warnings, t),
  ].join("\n");
}

export function buildMarkdownReport(
  a: AnalysisResult,
  scores: Scores,
  grade: string,
  verdictTitle: string,
  t: T,
  aiContent?: string | null,
): string {
  const findings = buildFindings(a, t);
  const brief = buildBrief(a, findings, t);
  const warnings = buildQualityWarnings(findings, t);

  const out: string[] = [
    ...mdHeader(a, scores, grade, verdictTitle),
    ...mdScores(scores),
    ...mdOverview(a),
    ...mdFindings(findings, t),
    ...mdComplexity(a, t),
    ...mdCycles(a, t),
    ...mdGitForensics(a.gitForensics, t),
    ...mdBrief(brief),
    ...mdWarnings(warnings),
    ...mdAiContent(aiContent),
    ...mdFooter(),
  ];
  return out.join("\n");
}
