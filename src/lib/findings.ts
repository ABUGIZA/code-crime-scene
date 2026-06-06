// Findings engine — orchestration only. Detection / classification / refactor /
// verification live in ./findings/*; this module assembles the prioritized
// finding list, the AI review brief, and the quality warnings.

import type { AiReviewBrief, AnalysisResult, FileInfo, Finding, InspectionItem, Priority, RiskRationale } from "./types";
import { type T, PRIO_ORDER, SCORE_FLOOR, threshold, directResp, indirectResp, evidenceFor } from "./findings/shared";
import { classify } from "./findings/classify";
import { refactorFor, prSlicesFor } from "./findings/refactor";
import { verifyFinding, qualityGate } from "./findings/verify";

export { verifyFinding, qualityGate } from "./findings/verify";

function rat(score: number, opts: Partial<RiskRationale> = {}): RiskRationale {
  return {
    score,
    blastRadius: opts.blastRadius ?? "low",
    directIO: opts.directIO ?? false,
    stateMachine: opts.stateMachine ?? false,
    confidence: opts.confidence ?? "high",
  };
}

function fileFinding(t: T, fi: FileInfo): Finding {
  const c = classify(fi, t);
  const file = fi.componentLine > 0 ? `${fi.path}:${fi.componentLine}` : fi.path;
  const f: Finding = {
    id: `${c.kind}:${fi.path}`,
    priority: c.priority,
    confidence: c.confidence,
    category: "actionable",
    kind: c.kind,
    title: t(`ftitle.${c.kind}`),
    file,
    line: fi.componentLine,
    symbol: fi.componentName,
    runtime: fi.runtime,
    evidence: evidenceFor(fi, t),
    why: c.why,
    nextStep: c.next,
    refactor: refactorFor(t, fi),
    rationale: c.rationale,
    prSlices: prSlicesFor(t, fi, c.kind),
    verifyNotes: [],
  };
  verifyFinding(f, fi, t);
  // A genuinely low-risk file is an observation, not an action item (req #4).
  if (f.category === "actionable" && f.rationale.score < SCORE_FLOOR) {
    f.category = "informational";
  }
  return f;
}

function isCandidate(fi: FileInfo): boolean {
  if (fi.noise) return false;
  const th = threshold(fi.fileType);
  return (
    fi.lines > th ||
    directResp(fi).length >= 2 ||
    fi.longestFunction > 130 ||
    (["react_root", "react_feature", "react_dialog", "react_icon"].includes(fi.fileType) && fi.lines > th - 50)
  );
}

function severity(fi: FileInfo): number {
  return (
    fi.lines +
    fi.longestFunction * 2 +
    directResp(fi).length * 200 +
    indirectResp(fi).length * 40 +
    (fi.fanIn ?? 0) * 10
  );
}

function capP1(out: Finding[]): void {
  const actionable = out.filter((f) => f.category === "actionable");
  const p1 = actionable.filter((f) => f.priority === "P1" && f.kind !== "security");
  const allowed = Math.max(2, Math.ceil(actionable.length * 0.3));
  if (p1.length <= allowed) return;
  p1.sort((x, y) => (x.confidence === "high" ? 0 : 1) - (y.confidence === "high" ? 0 : 1));
  for (let i = allowed; i < p1.length; i++) p1[i].priority = "P2";
}


export function buildFindings(a: AnalysisResult, t: T): Finding[] {
  const out: Finding[] = [];

  const candidates = (a.allFiles || []).filter(isCandidate).sort((x, y) => severity(y) - severity(x));
  for (const fi of candidates.slice(0, 14)) out.push(fileFinding(t, fi));

  for (const sct of a.securityFindings.slice(0, 8)) {
    const priority: Priority = sct.severity === "high" ? "P0" : sct.severity === "medium" ? "P1" : "P2";
    const score = sct.severity === "high" ? 90 : sct.severity === "medium" ? 60 : 40;
    out.push({
      id: `security:${sct.file}:${sct.line}`,
      priority,
      confidence: "high",
      category: "actionable",
      kind: "security",
      title: t("ftitle.security"),
      file: `${sct.file}:${sct.line}`,
      line: sct.line,
      symbol: "",
      runtime: "shared",
      evidence: [sct.kind, sct.snippet],
      why: t("why.security"),
      nextStep: t("next.rotate"),
      refactor: [],
      rationale: rat(score, { confidence: "high" }),
      prSlices: [],
      verifyNotes: [],
    });
  }

  // Collapse duplicate blocks that span the SAME set of files into one finding —
  // otherwise two generated schemas sharing N windows show up as N identical rows.
  const seenDupSets = new Set<string>();
  for (const d of a.duplication) {
    const key = [...d.files].sort().join("|");
    if (seenDupSets.has(key)) continue;
    seenDupSets.add(key);
    out.push({
      id: `dup:${d.fingerprint}`,
      priority: "P2",
      confidence: "high",
      category: "actionable",
      kind: "duplication",
      title: t("ftitle.duplication"),
      file: d.files[0] ?? "",
      line: 0,
      symbol: "",
      runtime: "shared",
      evidence: [`${d.occurrences}× · ${d.lineCount} ${t("th.lines")}`, d.files.join(", ")],
      why: t("why.duplication", { n: d.files.length }),
      nextStep: t("next.dedupe"),
      refactor: [],
      rationale: rat(50, { blastRadius: d.files.length >= 3 ? "medium" : "low" }),
      prSlices: [],
      verifyNotes: [],
    });
    if (seenDupSets.size >= 4) break;
  }

  if (a.totalUnusedImports > 0) {
    out.push({
      id: "unused:all",
      priority: "P3",
      confidence: "high",
      category: "actionable",
      kind: "unused",
      title: t("ftitle.unused"),
      file: a.unusedImports[0]?.file ?? "",
      line: a.unusedImports[0]?.line ?? 0,
      symbol: "",
      runtime: "shared",
      evidence: [t("sec.ghosts.count", { n: a.totalUnusedImports })],
      why: t("why.unused"),
      nextStep: t("next.lint"),
      refactor: [],
      rationale: rat(20),
      prSlices: [],
      verifyNotes: [],
    });
  }

  // Attach the project's verification commands to every PR plan (req #3).
  const verify = a.verifyCommands && a.verifyCommands.length ? t("pr.verify", { cmds: a.verifyCommands.join(" && ") }) : "";
  if (verify) for (const f of out) if (f.prSlices.length) f.prSlices.push(verify);

  // A P1 must be backed by high confidence (direct evidence). Security keeps its band.
  for (const f of out) {
    if (f.priority === "P1" && f.confidence !== "high" && f.kind !== "security") f.priority = "P2";
  }
  capP1(out);
  qualityGate(out); // final launch gate (req #8)
  out.sort((x, y) => PRIO_ORDER[x.priority] - PRIO_ORDER[y.priority]);

  for (const fi of a.ignoredLargest || []) {
    out.push({
      id: `noise:${fi.path}`,
      priority: "P3",
      confidence: "high",
      category: "noise",
      kind: "noise",
      title: t("ftitle.noise"),
      file: fi.path,
      line: 0,
      symbol: "",
      runtime: "shared",
      evidence: [`${fi.lines} ${t("th.lines")}`, fi.noiseReason ?? "noise"],
      why: t("find.noiseNote"),
      nextStep: "",
      refactor: [],
      rationale: rat(0),
      prSlices: [],
      verifyNotes: [],
    });
  }

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

