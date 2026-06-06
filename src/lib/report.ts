// Report layer — compact AI summary, a trust-grade copy-paste "fix prompt", and
// a full Markdown export. Findings carry priority + confidence + evidence type,
// plus an AI_REVIEW_BRIEF and (when relevant) QUALITY_WARNINGS.

import { buildBrief, buildFindings, buildQualityWarnings } from "./findings";
import { formatDate, formatNumber } from "./format";
import type { AiReviewBrief, AnalysisResult, Finding, Scores } from "./types";

type T = (key: string, vars?: Record<string, string | number>) => string;

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
  return lines.join("\n");
}

function rationaleLine(f: Finding, t: T): string {
  const r = f.rationale;
  const yn = (b: boolean) => (b ? t("val.yes") : t("val.no"));
  return (
    `${t("find.priorityRationale")}: ${t("rat.score")}=${r.score}/100 · ` +
    `${t("rat.blast")}: ${t(`val.${r.blastRadius}`)} · ` +
    `${t("rat.directIO")}: ${yn(r.directIO)} · ` +
    `${t("rat.stateMachine")}: ${yn(r.stateMachine)} · ` +
    `${t("rat.confidence")}: ${t(`val.${r.confidence}`)}`
  );
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
    warningsText(warnings, t),
  ].join("\n");
}

function mdTable(headers: string[], rows: (string | number)[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
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
  const actionable = findings.filter((f) => f.category === "actionable");
  const needsVerify = findings.filter((f) => f.category === "needs-verification");
  const informational = findings.filter((f) => f.category === "informational");
  const noise = findings.filter((f) => f.category === "noise");

  const out: string[] = [];
  out.push(`# Code Crime Scene — ${a.projectName}`);
  out.push("");
  out.push(`> ${formatDate(a.generatedAt)} · Grade **${grade}** (${verdictTitle}) · **${scores.projectScore}/100**`);
  out.push(`> \`${a.projectPath}\``);
  out.push("");
  out.push("## Scores");
  out.push(
    mdTable(
      ["Metric", "Score"],
      [
        ["Project Score", scores.projectScore],
        ["Technical Debt", scores.technicalDebt],
        ["Architecture Health", scores.architectureHealth],
        ["Security Risk", scores.securityRisk],
        ["Maintainability", scores.maintainability],
      ],
    ),
  );
  out.push("");
  out.push("## Overview");
  out.push(
    `- Analyzed files: **${formatNumber(a.analyzedFiles)}** · Ignored noise: **${formatNumber(a.ignoredFiles)}** (${formatNumber(a.ignoredLines)} lines)\n` +
      `- Lines of code: **${formatNumber(a.codeLines)}** · Functions: **${formatNumber(a.totalFunctions)}** · Avg file: **${a.avgFileLines.toFixed(0)}**\n` +
      `- Security (static, limited): **${a.securityHigh}** high / **${a.securityMedium}** medium / **${a.securityLow}** low — _not a security audit_`,
  );
  out.push("");

  out.push("## Actionable Findings");
  if (!actionable.length) out.push("_None — clean._");
  for (const f of actionable) {
    out.push(`### [${f.priority}][confidence: ${f.confidence}] ${f.title} — \`${f.file}\` _(${f.runtime})_`);
    out.push(`_${rationaleLine(f, t)}_`);
    if (f.evidence.length) {
      out.push(`**${t("find.evidence")}:**`);
      f.evidence.forEach((e) => out.push(`- ${e}`));
    }
    if (f.why) out.push(`**${t("find.why")}:** ${f.why}`);
    if (f.nextStep) out.push(`**${t("find.next")}:** ${f.nextStep}`);
    if (f.refactor.length) {
      out.push(`**${t("find.refactor")}:**`);
      f.refactor.forEach((r) => out.push(`- \`${r.path}\` — ${r.note}`));
    }
    if (f.prSlices.length) {
      out.push(`**${t("find.prs")}:**`);
      f.prSlices.forEach((p, i) => out.push(`${i + 1}. ${p}`));
    }
    out.push("");
  }

  if (needsVerify.length) {
    out.push(`## ${t("find.needsVerify")}`);
    out.push(`_${t("find.needsVerifyNote")}_`);
    for (const f of needsVerify) {
      out.push(`### [${f.priority}] ${f.title} — \`${f.file}\` _(${f.runtime})_`);
      f.verifyNotes.forEach((n) => out.push(`- ⚠ ${n}`));
    }
    out.push("");
  }

  if (informational.length) {
    out.push(`## ${t("find.informational")}`);
    out.push(`_${t("find.informationalNote")}_`);
    informational.forEach((f) => out.push(`- \`${f.file}\` — ${f.title} (riskScore ${f.rationale.score}/100)`));
    out.push("");
  }

  if (noise.length) {
    out.push("## Noise / Informational");
    noise.forEach((f) => out.push(`- \`${f.file}\` (${f.evidence[1] ?? "noise"}) — ignored for huge-file & duplication scoring`));
    out.push("");
  }

  out.push("## AI Review Brief");
  out.push(`**Primary risk:** ${brief.primaryRisk}`);
  out.push("");
  out.push("**Inspection order:**");
  brief.inspectionOrder.forEach((it, i) => out.push(`${i + 1}. \`${it.file}\` — ${it.reason} — ${it.priority} — ${it.confidence}`));
  if (brief.falsePositives.length) {
    out.push("");
    out.push("**Likely false positives — verify manually:**");
    brief.falsePositives.forEach((fp) => out.push(`- \`${fp.file}\` — ${fp.why}`));
  }
  out.push("");

  if (warnings.length) {
    out.push("## Quality warnings");
    warnings.forEach((w) => out.push(`- ${w}`));
    out.push("");
  }

  if (aiContent) {
    out.push("## Detective's Report (AI)");
    out.push("");
    out.push(aiContent);
    out.push("");
  }

  out.push("---");
  out.push("_Generated by Code Crime Scene — offline-first forensic code analysis._");
  return out.join("\n");
}
