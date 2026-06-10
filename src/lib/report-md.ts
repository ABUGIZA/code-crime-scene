// Markdown export — small pure section builders, composed by
// buildMarkdownReport (in ./report.ts). Each builder returns the exact lines
// (including trailing blank separators) the section contributes.

import { formatDate, formatNumber } from "./format";
import type { AiReviewBrief, AnalysisResult, Finding, GitForensics, Scores } from "./types";

export type T = (key: string, vars?: Record<string, string | number>) => string;

export function mdTable(headers: string[], rows: (string | number)[][]): string {
  const head = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return `${head}\n${sep}\n${body}`;
}

export function rationaleLine(f: Finding, t: T): string {
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

// --- sections ----------------------------------------------------------------

export function mdHeader(a: AnalysisResult, scores: Scores, grade: string, verdictTitle: string): string[] {
  return [
    `# Code Crime Scene — ${a.projectName}`,
    "",
    `> ${formatDate(a.generatedAt)} · Grade **${grade}** (${verdictTitle}) · **${scores.projectScore}/100**`,
    `> \`${a.projectPath}\``,
    "",
  ];
}

export function mdScores(scores: Scores): string[] {
  return [
    "## Scores",
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
    "",
  ];
}

export function mdOverview(a: AnalysisResult): string[] {
  return [
    "## Overview",
    `- Analyzed files: **${formatNumber(a.analyzedFiles)}** · Ignored noise: **${formatNumber(a.ignoredFiles)}** (${formatNumber(a.ignoredLines)} lines)\n` +
      `- Lines of code: **${formatNumber(a.codeLines)}** · Functions: **${formatNumber(a.totalFunctions)}** · Avg file: **${a.avgFileLines.toFixed(0)}**\n` +
      `- Security (static, limited): **${a.securityHigh}** high / **${a.securityMedium}** medium / **${a.securityLow}** low — _not a security audit_`,
    "",
  ];
}

export function mdFindings(findings: Finding[], t: T): string[] {
  const actionable = findings.filter((f) => f.category === "actionable");
  const needsVerify = findings.filter((f) => f.category === "needs-verification");
  const informational = findings.filter((f) => f.category === "informational");
  const noise = findings.filter((f) => f.category === "noise");

  const out: string[] = [];
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
  return out;
}

// --- v2 evidence sections (mirror the UI; only when the data is present) ---

export function mdComplexity(a: AnalysisResult, t: T): string[] {
  if (a.complexFunctions === undefined) return [];
  const out: string[] = [];
  out.push(`## ${t("sec.interrogation")}`);
  out.push(
    `_avg CC **${a.avgComplexity?.toFixed(1) ?? "—"}** · max CC **${a.maxComplexity ?? "—"}** · ` +
      `**${a.highComplexityFunctions ?? 0}** functions over CC 10_`,
  );
  out.push("");
  if (a.complexFunctions.length === 0) {
    out.push(`_${t("sec.interrogation.clean")}_`);
  } else {
    out.push(
      mdTable(
        [t("th.file"), t("th.function"), t("th.cc"), t("th.length")],
        a.complexFunctions.slice(0, 15).map((f) => [`\`${f.file}:${f.startLine}\``, `\`${f.name}\``, f.complexity, f.length]),
      ),
    );
  }
  out.push("");
  return out;
}

export function mdCycles(a: AnalysisResult, t: T): string[] {
  if (a.cycleCount === undefined) return [];
  const out: string[] = [];
  out.push(`## ${t("sec.cycles")}`);
  if (a.cycleCount === 0 || !a.cycles?.length) {
    out.push(`_${t("sec.cycles.none")}_`);
  } else {
    out.push(`_${t("sec.cycles.count", { n: a.cycleCount })}_`);
    out.push("");
    a.cycles.slice(0, 6).forEach((c) => out.push(`- \`${[...c, c[0]].join(" → ")}\``));
  }
  out.push("");
  return out;
}

export function mdGitForensics(g: GitForensics | undefined, t: T): string[] {
  if (!g) return [];
  const out: string[] = [];
  out.push(`## ${t("sec.rapsheet")}`);
  if (!g.available) {
    out.push(`_${t("sec.rapsheet.unavailable", { reason: g.reason ?? "—" })}_`);
  } else {
    out.push(`_${t("sec.rapsheet.count", { c: formatNumber(g.commitsAnalyzed), a: g.authorsTotal })}_`);
    if (g.hotspots.length) {
      out.push("");
      out.push(`**${t("sec.rapsheet.hotspots")}**`);
      out.push("");
      out.push(
        mdTable(
          [t("th.file"), t("th.commits"), t("th.churn"), t("th.heat")],
          g.hotspots.slice(0, 10).map((h) => [`\`${h.path}\``, h.commits, formatNumber(h.churn), h.score.toFixed(2)]),
        ),
      );
    }
    if (g.coChanges.length) {
      out.push("");
      out.push(`**${t("sec.rapsheet.pairs")}**`);
      out.push("");
      out.push(
        mdTable(
          [t("th.pair"), t("th.together")],
          g.coChanges.slice(0, 8).map((p) => [`\`${p.a}\` ↔ \`${p.b}\``, `${p.count}×`]),
        ),
      );
    }
    if (g.busFactor.length) {
      out.push("");
      out.push(`**${t("sec.rapsheet.bus")}**`);
      out.push("");
      out.push(
        mdTable(
          [t("th.file"), t("th.topAuthor"), t("th.share")],
          g.busFactor.slice(0, 5).map((b) => [`\`${b.path}\``, b.topAuthor, `${Math.round(b.share * 100)}%`]),
        ),
      );
    }
  }
  out.push("");
  return out;
}

export function mdBrief(brief: AiReviewBrief): string[] {
  const out: string[] = [];
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
  return out;
}

export function mdWarnings(warnings: string[]): string[] {
  if (!warnings.length) return [];
  return ["## Quality warnings", ...warnings.map((w) => `- ${w}`), ""];
}

export function mdAiContent(aiContent?: string | null): string[] {
  if (!aiContent) return [];
  return ["## Detective's Report (AI)", "", aiContent, ""];
}

export function mdFooter(): string[] {
  return ["---", "_Generated by Code Crime Scene — offline-first forensic code analysis._"];
}
